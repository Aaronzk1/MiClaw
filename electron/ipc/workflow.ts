import { logger } from './logger'
import { kvList, kvUpsert, kvGet } from '../storage/db'
import { loadConfig } from './core'

export interface WorkflowNode {
  id: string
  type: 'trigger' | 'agent' | 'tool' | 'condition' | 'output'
  config: Record<string, any>
  next: string[]
}

export interface Workflow {
  id: string
  name: string
  description?: string
  nodes: WorkflowNode[]
  enabled: boolean
  createdAt: string
  lastRun?: string
  runCount?: number
}

export async function executeWorkflow(workflowId: string, input: string): Promise<{
  success: boolean; output: string
  steps: Array<{ nodeId: string; type: string; input: string; output: string; duration: number }>
}> {
  const wf = kvGet('workflows', workflowId) as Workflow | null
  if (!wf) return { success: false, output: 'Workflow not found', steps: [] }

  logger.info('Workflow', `Start: ${wf.name}`, { nodes: wf.nodes.length })
  const steps: Array<{ nodeId: string; type: string; input: string; output: string; duration: number }> = []
  let currentOutput = input
  const visited = new Set<string>()

  let currentNode = wf.nodes.find(n => n.type === 'trigger')
  if (!currentNode) return { success: false, output: 'No trigger node', steps: [] }

  const config = loadConfig()
  const port = config.gateway?.port || 18789

  while (currentNode && !visited.has(currentNode.id)) {
    visited.add(currentNode.id)
    const start = Date.now()
    let nodeOutput = ''

    switch (currentNode.type) {
      case 'trigger': {
        nodeOutput = currentOutput
        break
      }
      case 'agent': {
        const agentId = currentNode.config.agentId
        const agent = kvGet('agents', agentId) as any
        const msgs: any[] = []
        if (agent?.systemPrompt || currentNode.config.systemPrompt) {
          msgs.push({ role: 'system', content: currentNode.config.systemPrompt || agent?.systemPrompt })
        }
        msgs.push({ role: 'user', content: currentOutput })
        try {
          const resp = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: currentNode.config.model || agent?.model || 'openclaw', stream: false, messages: msgs }),
          })
          const data = await resp.json()
          nodeOutput = data.choices?.[0]?.message?.content || ''
        } catch (e: any) {
          nodeOutput = `Agent call failed: ${e.message}`
        }
        break
      }
      case 'tool': {
        const { executeTool } = await import('./tool-executor')
        const result = await executeTool(currentNode.config.toolName, { ...currentNode.config.args, input: currentOutput })
        nodeOutput = result.output || result.error || ''
        break
      }
      case 'condition': {
        const keywords: string[] = currentNode.config.keywords || []
        const matched: boolean = keywords.some((k: string) => currentOutput.includes(k))
        const nextId: string = matched ? currentNode.next[0] : currentNode.next[1]
        currentNode = wf.nodes.find(n => n.id === nextId)
        steps.push({ nodeId: currentNode?.id || 'end', type: 'condition', input: currentOutput, output: `branch: ${matched}`, duration: Date.now() - start })
        continue
      }
      case 'output': {
        nodeOutput = currentNode.config.template?.replace('{input}', currentOutput) || currentOutput
        break
      }
    }

    steps.push({ nodeId: currentNode.id, type: currentNode.type, input: currentOutput, output: nodeOutput, duration: Date.now() - start })
    currentOutput = nodeOutput
    const nextId = currentNode.next[0]
    currentNode = nextId ? wf.nodes.find(n => n.id === nextId) : undefined
  }

  wf.lastRun = new Date().toISOString()
  wf.runCount = (wf.runCount || 0) + 1
  kvUpsert('workflows', workflowId, wf)

  logger.info('Workflow', `Done: ${wf.name}`, { steps: steps.length })
  return { success: true, output: currentOutput, steps }
}

export function listWorkflows(): Workflow[] {
  return kvList('workflows')
}

export function saveWorkflow(wf: Workflow) {
  kvUpsert('workflows', wf.id, wf)
}

export function deleteWorkflow(id: string) {
  const { kvDelete } = require('../storage/db')
  kvDelete('workflows', id)
}

export function getPresetWorkflows(): Workflow[] {
  return [
    {
      id: 'wf-research-report', name: 'Research Report', description: 'Search -> Analyze -> Write report',
      enabled: true, createdAt: new Date().toISOString(),
      nodes: [
        { id: 'trigger', type: 'trigger', config: {}, next: ['search'] },
        { id: 'search', type: 'tool', config: { toolName: 'web_search' }, next: ['analyze'] },
        { id: 'analyze', type: 'agent', config: { agentId: 'analyst', systemPrompt: 'Analyze the search results, extract key information.' }, next: ['write'] },
        { id: 'write', type: 'agent', config: { agentId: 'writer', systemPrompt: 'Based on the analysis, write a structured research report.' }, next: ['output'] },
        { id: 'output', type: 'output', config: { template: '{input}' }, next: [] },
      ],
    },
    {
      id: 'wf-code-review', name: 'Code Review', description: 'Receive code -> Review -> Generate report',
      enabled: true, createdAt: new Date().toISOString(),
      nodes: [
        { id: 'trigger', type: 'trigger', config: {}, next: ['review'] },
        { id: 'review', type: 'agent', config: { agentId: 'coder', systemPrompt: 'Review the following code. Check: 1)Potential bugs 2)Security 3)Performance 4)Style 5)Suggestions.' }, next: ['severity'] },
        { id: 'severity', type: 'condition', config: { keywords: ['critical', 'security', 'high'] }, next: ['alert', 'report'] },
        { id: 'alert', type: 'agent', config: { agentId: 'coder', systemPrompt: 'Critical issue found. Generate urgent fix suggestions.' }, next: ['output'] },
        { id: 'report', type: 'output', config: { template: '{input}' }, next: [] },
        { id: 'output', type: 'output', config: { template: 'URGENT:\n\n{input}' }, next: [] },
      ],
    },
  ]
}