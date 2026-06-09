import { logger } from './logger'
import { kvList, kvUpsert, kvGet } from '../storage/db'
import { loadConfig } from './core'

export interface IntentAnalysis {
  intent: string
  confidence: number
  suggestedAgent: string
  suggestedModel: string
  suggestedTools: string[]
  memoryRelevance: any[]
  needsCodeExec: boolean
  needsWebSearch: boolean
  needsFileAccess: boolean
  complexity: 'simple' | 'medium' | 'complex'
  estimatedTokens: number
}

export function analyzeIntent(message: string, context?: any): IntentAnalysis {
  const lower = message.toLowerCase()
  const agents = kvList('agents')
  const models = kvList('models').filter((m: any) => m.enabled !== false)
  const config = loadConfig()

  // Base intent classification
  const intentRules = [
    { kw: ['write code','implement','create a','\u5199\u4ee3\u7801','\u5b9e\u73b0','\u7f16\u5199','\u5f00\u53d1','debug','\u8c03\u8bd5','refactor','\u91cd\u6784'], agent: 'coder', intent: 'code' },
    { kw: ['analyze','data','csv','excel','\u5206\u6790\u6570\u6360','\u7edf\u8ba1'], agent: 'analyst', intent: 'analyze' },
    { kw: ['search','\u641c\u7d22','\u67e5\u627e','\u67e5\u4e00\u4e0b','find','look up'], agent: 'default', intent: 'search' },
    { kw: ['write article','\u5199\u6587\u7ae0','\u6587\u6848','\u5199\u4f5c','\u5c0f\u8bf4','blog','copywriting'], agent: 'writer', intent: 'write' },
    { kw: ['research','\u8c03\u7814','\u8bba\u6587','report','\u7814\u7a76','study','paper'], agent: 'researcher', intent: 'research' },
  ]

  let bestMatch = { intent: 'chat', confidence: 0.2, agentId: 'default' }
  for (const rule of intentRules) {
    let score = 0
    for (const kw of rule.kw) { if (lower.includes(kw)) score += 0.4 }
    if (score > bestMatch.confidence) {
      bestMatch = { intent: rule.intent, confidence: Math.min(score, 1), agentId: rule.agent }
    }
  }

  const needsCodeExec = /```[\s\S]{20,}```/.test(message)
    || /\b(exec|run|execute|test)\b/i.test(message)
    || /\b(python|javascript|node|bash|powershell)\b/i.test(message)

  const needsWebSearch = /\b(search|find|latest|news|price|\u641c\u7d22|\u6700\u65b0)\b/i.test(message)
    || /https?:\/\//.test(message)

  const needsFileAccess = /\b(read|open|file|folder|csv|excel|pdf|\u8bfb\u53d6|\u6587\u4ef6)\b/i.test(message)

  const memories = kvList('memory')
  const words = lower.split(/\s+/).filter(w => w.length > 2)
  const memoryRelevance = memories
    .filter((m: any) => words.some(w => m.content.toLowerCase().includes(w)))
    .slice(0, 5)

  let complexity: 'simple' | 'medium' | 'complex' = 'simple'
  if (message.length > 500 || needsCodeExec || /\b(analyze|compare|summarize)\b/i.test(lower)) complexity = 'medium'
  if (/\b(workflow|batch|automate|multi-step)\b/i.test(lower)) complexity = 'complex'

  let suggestedModel = config.ai?.model || 'openclaw'
  if (complexity === 'complex') {
    const strong = models.find((m: any) => /opus|gpt-5/i.test(m.id))
    if (strong) suggestedModel = strong.id
  }
  if (bestMatch.intent === 'code') {
    const coder = models.find((m: any) => /coder/i.test(m.id))
    if (coder) suggestedModel = coder.id
  }

  const suggestedTools: string[] = []
  if (needsCodeExec) suggestedTools.push('code_execute')
  if (needsWebSearch) suggestedTools.push('web_search')
  if (needsFileAccess) suggestedTools.push('file_read')

  const estimatedTokens = Math.ceil(message.length / 2)
    + memoryRelevance.reduce((s: number, m: any) => s + Math.ceil(m.content.length / 4), 0)

  const result: IntentAnalysis = {
    intent: bestMatch.intent, confidence: bestMatch.confidence,
    suggestedAgent: bestMatch.agentId, suggestedModel, suggestedTools,
    memoryRelevance, needsCodeExec, needsWebSearch, needsFileAccess,
    complexity, estimatedTokens,
  }

  logger.info('Orchestrator', `Intent: ${result.intent} (${(result.confidence * 100).toFixed(0)}%)`,
    { agent: result.suggestedAgent, model: result.suggestedModel, tools: result.suggestedTools, complexity: result.complexity })

  return result
}

export async function orchestrate(request: {
  message: string; history?: any[]; convId?: string; agentId?: string; modelId?: string
}) {
  const config = loadConfig()
  const port = config.gateway?.port || 18789

  const intent = analyzeIntent(request.message, {
    historyLength: (request.history || []).reduce((s, m) => s + (m.content?.length || 0), 0),
  })

  const agents = kvList('agents')
  const agent = agents.find((a: any) => a.id === request.agentId)
    || agents.find((a: any) => a.id === intent.suggestedAgent)
    || agents[0]

  const model = request.modelId || intent.suggestedModel
  const messages: any[] = []

  if (agent?.systemPrompt) messages.push({ role: 'system', content: agent.systemPrompt })

  if (intent.memoryRelevance.length > 0) {
    const memContext = intent.memoryRelevance.map((m: any) => `- ${m.content}`).join('\n')
    messages.push({ role: 'system', content: `[Hermes Memory]\n${memContext}` })
  }

  messages.push({ role: 'system', content: `[Hermes Router] Intent: ${intent.intent} (${(intent.confidence * 100).toFixed(0)}%), complexity: ${intent.complexity}` })

  if (request.history?.length) messages.push(...request.history.slice(-20))
  messages.push({ role: 'user', content: request.message })

  const tools = buildToolList(intent)

  const body: any = { model, stream: true, messages }
  if (tools.length > 0) body.tools = tools

  logger.info('Orchestrator', `Call OpenClaw`, { model, tools: tools.length, messages: messages.length })
  return { body, intent, agent, model, port }
}

function buildToolList(intent: IntentAnalysis): any[] {
  const tools: any[] = []
  const toolDefs: Record<string, any> = {
    code_execute: {
      type: 'function',
      function: {
        name: 'code_execute',
        description: 'Execute code in sandbox. Supports Python, JavaScript, Shell.',
        parameters: { type: 'object', properties: { language: { type: 'string', enum: ['python', 'javascript', 'shell'] }, code: { type: 'string' } }, required: ['language', 'code'] },
      },
    },
    web_search: {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search the internet for latest information.',
        parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      },
    },
    file_read: {
      type: 'function',
      function: {
        name: 'file_read',
        description: 'Read local file content.',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      },
    },
    file_write: {
      type: 'function',
      function: {
        name: 'file_write',
        description: 'Write content to local file.',
        parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
      },
    },
    memory_save: {
      type: 'function',
      function: {
        name: 'memory_save',
        description: 'Save important information to long-term memory.',
        parameters: { type: 'object', properties: { content: { type: 'string' }, category: { type: 'string', enum: ['user_pref', 'project', 'architecture', 'config', 'general'] } }, required: ['content', 'category'] },
      },
    },
  }

  for (const toolName of intent.suggestedTools) {
    if (toolDefs[toolName]) tools.push(toolDefs[toolName])
  }
  if (!tools.find(t => t.function.name === 'memory_save')) {
    tools.push(toolDefs.memory_save)
  }

  const mcpServers = kvList('mcp').filter((s: any) => s.enabled !== false)
  for (const srv of mcpServers) {
    if (srv.tools?.length) {
      for (const t of srv.tools) {
        tools.push({ type: 'function', function: { name: t.name || t.id, description: t.description || '', parameters: t.parameters || {} } })
      }
    }
  }

  return tools
}