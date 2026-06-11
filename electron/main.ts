import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } from 'electron'
import { join, normalize, resolve } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { exec, execFile } from 'child_process'
import { executeTool, killAllProcesses, isPathAllowed, recordToolCall, validateToolParams, checkOutputQuality, loadToolStats, compressToolResult, getReliableTools, getUnreliableTools, getToolStats, computeResultQuality, recordToolCombination, getReliableCombinations, getSlowTools } from './ipc/tool-executor'
import { buildSystemPrompt, BASE_PROMPT, detectMultiStepTask, extractSteps, startTaskTracking, getTaskProgressHint, clearTaskTracking } from './ipc/orchestrator'
import { initSkillEngine, matchSkills, buildSkillInjection } from './ipc/skill-engine'
import './ipc/builtin-skills'
import { cacheAgents, cacheMemory, cacheProviders, cacheModels, cacheSkills, cacheRag, cacheConfig, invalidate } from './ipc/chat-cache'
import { ToolCallRepair, CircuitBreaker } from './ipc/tool-repair'

// P1-3: Self-healing fallbacks — alternative approaches when a tool fails
const SELF_HEAL_FALLBACKS: Record<string, { name: string; mapArgs: (args: any, err: string) => any }> = {
  ac_terminal: {
    name: 'code_execute',
    mapArgs: (args, _err) => ({ code: args.command || args.cmd || '', language: 'javascript' }),
  },
  ac_read_file: {
    name: 'list_directory',
    mapArgs: (args, _err) => {
      const p = args.path || args.file_path || ''
      const parent = p.replace(/[/\\][^/\\]+$/, '') || '.'
      return { path: parent }
    },
  },
  ac_web_search: {
    name: 'ac_read_url',
    mapArgs: (args, _err) => ({ url: `https://www.baidu.com/s?wd=${encodeURIComponent(args.query || args.q || '')}` }),
  },
  ac_read_url: {
    name: 'ac_web_search',
    mapArgs: (args, _err) => {
      const url = args.url || ''
      const domain = url.replace(/^https?:\/\//, '').split('/')[0]
      return { query: domain }
    },
  },
  code_execute: {
    name: 'ac_terminal',
    mapArgs: (args, _err) => {
      const code = args.code || ''
      const lang = args.language || 'python'
      if (lang === 'javascript' || lang === 'js') {
        return { command: `node -e "${code.replace(/"/g, '\\"').slice(0, 500)}"` }
      }
      return { command: `python -c "${code.replace(/"/g, '\\"').slice(0, 500)}"` }
    },
  },
  ac_write_file: {
    name: 'code_execute',
    mapArgs: (args, _err) => {
      const path = args.path || args.file_path || ''
      const content = args.content || ''
      return { code: `open(r'${path}', 'w', encoding='utf-8').write(${JSON.stringify(content)})`, language: 'python' }
    },
  },
  translate: {
    name: 'code_execute',
    mapArgs: (args, _err) => {
      const text = args.text || ''
      const target = args.target || 'en'
      return { code: `print("Translation to ${target}: ${text.replace(/"/g, '\\"')}")`, language: 'python' }
    },
  },
  ac_data_analyze: {
    name: 'code_execute',
    mapArgs: (args, _err) => ({ code: args.code || '', language: 'python' }),
  },
  ac_chart_generate: {
    name: 'code_execute',
    mapArgs: (args, _err) => ({ code: args.code || '', language: 'python' }),
  },
  ac_baike: {
    name: 'ac_web_search',
    mapArgs: (args, _err) => ({ query: args.query || args.keyword || '' }),
  },
  ac_news: {
    name: 'ac_web_search',
    mapArgs: (args, _err) => ({ query: (args.query || '') + ' 最新新闻' }),
  },
  ac_weather: {
    name: 'ac_web_search',
    mapArgs: (args, _err) => ({ query: `${args.city || ''} 天气预报` }),
  },
  skill_stock_quote: {
    name: 'ac_web_search',
    mapArgs: (args, _err) => ({ query: `${args.symbol || args.code || ''} 股票行情 实时` }),
  },
  ac_verify: {
    name: 'ac_baike',
    mapArgs: (args, _err) => ({ query: args.claim || args.query || '' }),
  },
}

// Tool categories for intelligent fallback routing
const TOOL_CATEGORIES: Record<string, string[]> = {
  search: ['ac_web_search', 'ac_baike', 'ac_news', 'ac_read_url'],
  data: ['skill_data_profile', 'code_execute', 'ac_data_analyze'],
  finance: ['skill_stock_quote', 'skill_stock_kline', 'skill_stock_finance', 'ac_market_overview', 'ac_forex'],
  file: ['ac_read_file', 'ac_write_file', 'list_directory'],
  knowledge: ['ac_baike', 'ac_verify', 'memory_search'],
  life: ['ac_weather', 'ac_hot_search', 'ac_daily_briefing', 'ac_poetry', 'ac_history_today'],
  news: ['ac_news', 'ac_daily_briefing', 'ac_hot_search', 'ac_web_search'],
  verification: ['ac_verify', 'ac_baike', 'ac_web_search'],
  coding: ['ac_terminal', 'code_execute'],
  text: ['skill_summarize', 'skill_word_freq', 'skill_md_format', 'translate'],
}

function findReliableAlternative(failedTool: string): string | null {
  const reliable = new Set(getReliableTools())
  const unreliable = new Set(getUnreliableTools())
  const stats = getToolStats()
  for (const [, tools] of Object.entries(TOOL_CATEGORIES)) {
    if (tools.includes(failedTool)) {
      // Priority 1: known reliable alternative
      for (const alt of tools) {
        if (alt !== failedTool && reliable.has(alt)) return alt
      }
      // Priority 2: untested tool (no stats = neutral, worth trying)
      for (const alt of tools) {
        if (alt !== failedTool && !unreliable.has(alt) && !stats[alt]) return alt
      }
    }
  }
  return null
}
const RETRY_ADJUSTMENTS: Record<string, (args: any, err: string) => any | null> = {
  // File not found → try case-insensitive or with different extension
  ac_read_file: (args, err) => {
    if (/not found|不存在|ENOENT/i.test(err)) {
      const p = args.path || args.file_path || ''
      // Try .txt extension if no extension
      if (p && !p.includes('.')) return { ...args, path: p + '.txt' }
      // Try lowercase
      if (p !== p.toLowerCase()) return { ...args, path: p.toLowerCase() }
    }
    return null
  },
  // Command timeout → try with shorter command or simpler version
  ac_terminal: (args, err) => {
    if (/timeout|timed out|超时/i.test(err)) {
      const cmd = args.command || args.cmd || ''
      // If it's a long pipeline, try just the first command
      if (cmd.includes('|') || cmd.includes('&&')) {
        const first = cmd.split(/\||&&/)[0].trim()
        if (first) return { ...args, command: first }
      }
      // If it's a search/find, add limits
      if (/find|dir|ls|Get-Child/i.test(cmd) && !/-maxdepth|-Limit/i.test(cmd)) {
        return { ...args, command: cmd + ' -Limit 20' }
      }
    }
    return null
  },
  // Search failure → try shorter/simpler query
  ac_web_search: (args, err) => {
    if (/fail|error|超时|timeout/i.test(err)) {
      const q = args.query || args.q || ''
      // Shorten query to first 3 words
      const shorter = q.split(/\s+/).slice(0, 3).join(' ')
      if (shorter && shorter !== q) return { ...args, query: shorter, q: shorter }
    }
    return null
  },
  // Code execution error → try simpler version
  code_execute: (args, err) => {
    if (/syntax|indent|import/i.test(err)) {
      const code = args.code || ''
      // If code is complex, try wrapping in try/except
      if (!code.includes('try')) {
        const lang = args.language || 'javascript'
        if (lang === 'python' || lang === 'py') {
          return { ...args, code: `try:\n${code.split('\n').map((l: string) => '  ' + l).join('\n')}\nexcept Exception as e:\n  print(f'Error: {e}')` }
        }
      }
    }
    return null
  },
}

// Loop escape — detect repeated failures and inject "try different approach" instruction
const recentFailures: Array<{ tool: string; time: number }> = []
const FAILURE_WINDOW = 60000 // 1 minute

function checkForLoop(toolName: string): string | null {
  const now = Date.now()
  // Clean old entries
  while (recentFailures.length > 0 && now - recentFailures[0].time > FAILURE_WINDOW) {
    recentFailures.shift()
  }
  recentFailures.push({ tool: toolName, time: now })

  // Count failures for this tool in the window
  const toolFailures = recentFailures.filter(f => f.tool === toolName).length
  if (toolFailures >= 3) {
    recentFailures.length = 0 // Reset after triggering
    return `[LoopEscape] "${toolName}" has failed ${toolFailures} times in the last minute. STOP trying this tool. Use a completely different approach or inform the user. Do NOT call "${toolName}" again.`
  }
  return null
}
import { selectTools, parseTextToolCalls } from './ipc/tools'
import { learnFromFeedback, selectModel, classifyIntent, logBehavior, getProactiveSuggestions, resetIntentState, loadBehaviorLog, setEmotionalContext, summarizeConversation, detectRepeatedPattern, getContextualGreeting, resetBehaviorMode, getUnifiedResponseGuidance, getExperienceHint, loadPatternCounts, getTopPatterns, queryKnowledgeGraph, analyzeAndOptimize, loadBehaviorMode } from './ipc/feedback'
import { streamChat as llmStreamChat, wrapToolResult, type StreamContext } from './ipc/llm'
import { seedDefaults, migrateFromJSON } from './ipc/seed'
import { connectMcpServer, disconnectMcpServer, callMcpTool, getMcpTools, getMcpStatus } from './ipc/mcp-client'
import { getUnhealthyTools, getToolHealthReport, validateCustomSkill } from './ipc/tool-health'
import { runMemoryMaintenance, smartSaveMemory } from './ipc/memory-manager'
import { safeExec } from './ipc/cron-sandbox'
import { startCronScheduler } from './ipc/cron-scheduler'
import { warmupMirrors } from './ipc/github-mirror'
import { logger } from './ipc/logger'

import { randomUUID } from 'crypto'
import { Agent as UndiciAgent } from 'undici'

// A05: HTTP Keep-Alive agent for LLM API calls
const keepAliveAgent = new UndiciAgent({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 600_000, connections: 2 })
import { initDB, kvList, kvGet, kvUpsert, kvDelete, kvUpsertMany, msgList, msgAdd, msgDeleteByConv, msgCount, msgTokens, gcMsgList, gcMsgAdd, gcMsgBookmark, gcMsgPin, gcMsgBookmarked, gcMsgPinned, gcMsgDeleteByGroup, searchMessages, closeDB, memoryFtsUpsert, memoryFtsDelete, memoryFtsSearch, transaction, getDB } from './storage/db'
import { runMigrations } from './storage/migrations'

const isDev = process.argv.includes('--dev')
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

// Forward main process logs to renderer via logger module
logger.setRendererSend((level: string, ...args: any[]) => {
  try {
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ').slice(0, 500)
    mainWindow?.webContents.send('debug:log', { level, msg })
  } catch {}
})
logger.patchConsole()

// ======== // Init ========
let DATA_DIR = ''
function getDataDir(): string {
  if (!DATA_DIR) { DATA_DIR = join(app.getPath('userData'), 'data'); mkdirSync(DATA_DIR, { recursive: true }) }
  return DATA_DIR
}

let cachedPort: number | null = null

function stripToolCallMarkup(text: string): string {
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
    .replace(/<function=[^>]+>[\s\S]*?<\/function>/g, '')
    .replace(/<invoke\s+name="[^"]+">[\s\S]*?<\/invoke>/g, '')
    .replace(/```(?:json)?\s*\n?\s*\{[\s\S]*?"tool_calls"\s*:\s*\[[\s\S]*?\][\s\S]*?\}\s*\n?\s*```/g, '')
    .trim()
}

function errorResult(e: any): { ok: false; error: string } {
  return { ok: false, error: (e as Error).message }
}

function notifyToolCall(mw: BrowserWindow | null, tc: { id: string; name: string }, status?: 'running' | 'done' | 'error', output?: string, args?: string) {
  const payload: any = { id: tc.id, name: tc.name }
  if (status) payload.status = status
  if (output) payload.output = output
  if (args) payload.args = args
  mw?.webContents.send('chat:toolCall', payload)
}

async function gatewayChat(port: number, model: string, messages: any[], timeout = 30000): Promise<string> {
  const resp = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: false, messages }),
    signal: AbortSignal.timeout(timeout)
  })
  const data = await resp.json()
  return data.choices?.[0]?.message?.content || ''
}

async function gatewayHealth(port: number): Promise<boolean> {
  try { await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) }); return true } catch { return false }
}

function buildGcSystemPrompt(agent: any, basePrompt: string, memberNames: string): string {
  const parts: string[] = [basePrompt]
  if (agent?.identity) {
    let role = `\n## Your current role\nYou are currently acting as: ${agent.identity}.`
    if (agent.expertise) role += `\nYour expertise: ${agent.expertise}`
    parts.push(role)
  }
  parts.push(`\n## Group chat context\nYou are in a group chat with: ${memberNames}.\n- Keep replies concise and relevant.\n- Build on what others said. Don't repeat the same point.\n- If you disagree, say why — constructive debate is good.\n- Address other agents by name when referencing their points.`)
  return parts.join('\n')
}

async function scanGatewayPort(): Promise<number> {
  for (const p of [51345, 18789, 18788]) {
    try {
      const resp = await fetch(`http://127.0.0.1:${p}/health`, { signal: AbortSignal.timeout(1000) })
      if (resp.ok) { cachedPort = p; return p }
    } catch {}
  }
  return 18789
}

function getOpenClawPort(): number {
  if (cachedPort) return cachedPort
  try {
    const ocConfigPath = join(require('os').homedir(), '.openclaw', 'openclaw.json')
    if (existsSync(ocConfigPath)) {
      let raw = readFileSync(ocConfigPath, 'utf8')
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1) // strip BOM
      const oc = JSON.parse(raw)
      if (oc.gateway?.port) { cachedPort = oc.gateway.port; return cachedPort! }
    }
  } catch {}
  return 18789
}

function loadConfig(): any {
  const base = kvGet('config', 'main') || { gateway: { port: 18789, host: '127.0.0.1' }, ai: { provider: 'openclaw', model: 'openclaw', maxTokens: 4096, temperature: 0.7 } }
  const ocPort = getOpenClawPort()
  if (!base.gateway) base.gateway = { port: ocPort, host: '127.0.0.1' }; else base.gateway.port = ocPort
  return base
}

// ======== // Seed ========
function sanitizeSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return { type: 'object', properties: {} }
  const clean: any = { type: schema.type || 'object', properties: schema.properties || {} }
  if (schema.required) clean.required = schema.required
  if (schema.description) clean.description = schema.description
  return clean
}

// ======== // Window ========
function createWindow() {
  const iconPath = join(__dirname, '..', 'public', 'logo.png')
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1024, minHeight: 700,
    frame: true, backgroundColor: '#fafaf8',
    icon: existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    show: true,
    webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false }
  })
  if (isDev) { mainWindow.loadURL('http://localhost:5173'); mainWindow.webContents.openDevTools({ mode: 'detach' }) }
  else mainWindow.loadFile(join(__dirname, '..', 'dist', 'index.html'))
  // Open external links in system browser, not inside the app
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      e.preventDefault()
      shell.openExternal(url)
    }
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.on('closed', () => { mainWindow = null })
}

// ======== // System Tray ========
function createTray() {
  try {
    const iconPath = join(__dirname, '..', 'public', 'logo.png')
    if (!existsSync(iconPath)) return
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    tray = new Tray(icon)
    tray.setToolTip('AaronClaw')
    const contextMenu = Menu.buildFromTemplate([
      { label: '\u663e\u793a\u7a97\u53e3', click: () => { mainWindow?.show(); mainWindow?.focus() } },
      { label: '\u65b0\u5efa\u5bf9\u8bdd', click: () => { mainWindow?.show(); mainWindow?.webContents.send('action:new-conv') } },
      { type: 'separator' },
      { label: '\u9000\u51fa', click: () => { app.quit() } },
    ])
    tray.setContextMenu(contextMenu)
    tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus() })
  } catch (e) { console.error('[Tray] Failed:', (e as Error).message) }
}

// ======== // IPC ========
function setupIPC() {
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => { if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize() })
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('config:get', () => loadConfig())
  ipcMain.handle('config:save', (_, c) => { kvUpsert('config', 'main', c); return true })

  ipcMain.handle('conv:list', () => kvList('conversations').sort((a: any, b: any) => (b.updatedAt || '').localeCompare(a.updatedAt || '')))
  ipcMain.handle('conv:create', (_, title, model, agentId) => {
    const id = randomUUID(); const now = new Date().toISOString()
    kvUpsert('conversations', id, { id, title, model: model || 'openclaw', agentId: agentId || 'default', createdAt: now, updatedAt: now })
    // Human-like: add contextual greeting as first message
    try {
      const greeting = getContextualGreeting()
      if (greeting) msgAdd(id, 'assistant', greeting, 0)
    } catch {}
    return id
  })
  ipcMain.handle('conv:delete', (_, id) => { if (!id) return; kvDelete('conversations', id); msgDeleteByConv(id) })
  ipcMain.handle('conv:messages', (_, cid) => msgList(cid))
  ipcMain.handle('conv:saveMessage', (_, cid, role, content) => { msgAdd(cid, role, content) })

  // CRUD — agents
  ipcMain.handle('agents:list', () => kvList('agents'))
  ipcMain.handle('agents:save', (_, item) => { if (!item?.id) return; kvUpsert('agents', item.id, item) })
  ipcMain.handle('agents:delete', (_, id) => { if (!id) return; kvDelete('agents', id) })
  ipcMain.handle('agents:toggle', (_, id, en) => { const item = kvGet('agents', id); if (item) { item.enabled = en; kvUpsert('agents', id, item) } })

  // CRUD — providers
  ipcMain.handle('providers:list', () => {
    const { safeStorage } = require('electron')
    return kvList('providers').map((p: any) => {
      if (p.apiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
        try { p.apiKey = safeStorage.decryptString(Buffer.from(p.apiKeyEncrypted, 'base64')) } catch {}
      }
      return p
    })
  })
  ipcMain.handle('providers:save', (_, item) => {
    if (!item?.id) return
    if (item.apiKey) {
      try {
        const { safeStorage } = require('electron')
        if (safeStorage.isEncryptionAvailable()) {
          item.apiKeyEncrypted = safeStorage.encryptString(item.apiKey).toString('base64')
        }
      } catch {}
    }
    kvUpsert('providers', item.id, item)
  })
  ipcMain.handle('providers:delete', (_, id) => { if (!id) return; kvDelete('providers', id) })
  ipcMain.handle('providers:toggle', (_, id, en) => { const item = kvGet('providers', id); if (item) { item.enabled = en; kvUpsert('providers', id, item) } })

  // CRUD — skills
  ipcMain.handle('skills:list', () => kvList('skills'))
  ipcMain.handle('skills:save', (_, item) => { kvUpsert('skills', item.id, item) })
  ipcMain.handle('skills:delete', (_, id) => { kvDelete('skills', id) })
  ipcMain.handle('skills:toggle', (_, id, en) => { const item = kvGet('skills', id); if (item) { item.enabled = en; kvUpsert('skills', id, item) } })

  // Pattern & stats — for UI to display auto-generated skills and tool reliability
  ipcMain.handle('patterns:top', (_, limit) => getTopPatterns(limit || 5))
  ipcMain.handle('tools:stats', () => getToolStats())
  ipcMain.handle('tools:reliable', () => getReliableTools())
  ipcMain.handle('tools:unreliable', () => getUnreliableTools())
  ipcMain.handle('tools:health', async () => {
    try { return await getToolHealthReport() } catch { return {} }
  })
  ipcMain.handle('skills:validate', (_, execute: string) => {
    try { return validateCustomSkill(execute) } catch { return { ok: false, reason: 'validation error' } }
  })

  // Generated files — tracked from tool write operations
  ipcMain.handle('generatedFiles:list', () => {
    try { return kvList('generated_files').sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || '')) } catch { return [] }
  })
  ipcMain.handle('generatedFiles:delete', (_, id: string) => { kvDelete('generated_files', id) })
  ipcMain.handle('generatedFiles:clear', () => {
    const items = kvList('generated_files') as any[]
    for (const item of items) kvDelete('generated_files', item.id || item.path)
  })

  // CRUD — MCP servers
  ipcMain.handle('mcp:list', () => kvList('mcp'))
  ipcMain.handle('mcp:save', (_, item) => { kvUpsert('mcp', item.id, item) })
  ipcMain.handle('mcp:delete', (_, id) => { kvDelete('mcp', id) })
  ipcMain.handle('mcp:connect', async (_, serverId: string) => {
    try { return await connectMcpServer(serverId) } catch (e: any) { return { ok: false, tools: [], error: e?.message } }
  })
  ipcMain.handle('mcp:disconnect', (_, serverId: string) => {
    try { disconnectMcpServer(serverId); return { ok: true } } catch (e: any) { return { ok: false, error: e?.message } }
  })
  ipcMain.handle('mcp:callTool', async (_, serverId: string, toolName: string, args: any) => {
    try { return await callMcpTool(serverId, toolName, args) } catch (e: any) { return JSON.stringify({ error: e?.message }) }
  })
  ipcMain.handle('mcp:tools', () => getMcpTools())
  ipcMain.handle('mcp:status', () => getMcpStatus())

  // CRUD — memory (handlers with FTS sync registered below)

  // CRUD — cron
  ipcMain.handle('cron:list', () => kvList('cron'))
  ipcMain.handle('cron:save', (_, item) => { kvUpsert('cron', item.id, item) })
  ipcMain.handle('cron:delete', (_, id) => { kvDelete('cron', id) })
  ipcMain.handle('cron:toggle', (_, id, en) => { const item = kvGet('cron', id); if (item) { item.enabled = en; kvUpsert('cron', id, item) } })

  // CRUD — models
  ipcMain.handle('models:list', () => kvList('models'))
  ipcMain.handle('models:save', (_, item) => { kvUpsert('models', item.id, item) })
  ipcMain.handle('models:delete', (_, id) => { kvDelete('models', id) })
  ipcMain.handle('models:toggle', (_, id, en) => { const item = kvGet('models', id); if (item) { item.enabled = en; kvUpsert('models', id, item) } })

  ipcMain.handle('memory:list', () => kvList('memory'))
  ipcMain.handle('memory:add', (_, content: string, category: string) => {
    const id = 'mem-' + Date.now()
    kvUpsert('memory', id, { id, content, category, importance: 0.5, createdAt: new Date().toISOString() })
    memoryFtsUpsert(id, content, category)
    return id
  })
  ipcMain.handle('memory:save', (_, item) => { kvUpsert('memory', item.id, item); memoryFtsUpsert(item.id, item.content || '', item.category || 'general') })
  ipcMain.handle('memory:delete', (_, id) => { kvDelete('memory', id); memoryFtsDelete(id) })
  ipcMain.handle('memory:search', (_, query: string) => {
    const ftsResults = memoryFtsSearch(query, 10)
    if (ftsResults.length > 0) return ftsResults.map(r => ({ id: r.id, content: r.content, category: r.category }))
    // Fallback to JS filter for short queries
    return kvList('memory').filter((m: any) => m.content.toLowerCase().includes(query.toLowerCase()))
  })

  // Group Chat
  ipcMain.handle('gc:groups', () => kvList('groups'))
  ipcMain.handle('gc:members', (_, gid) => {
    const group = kvGet('groups', gid); if (!group) return []
    const agents = kvList('agents')
    return (group.members || []).map((aid: string) => agents.find((a: any) => a.id === aid) || { agentId: aid, name: aid, icon: 'AI' })
  })
  ipcMain.handle('gc:addMember', (_, gid, aid) => {
    const group = kvGet('groups', gid)
    if (group && !(group.members || []).includes(aid)) { group.members.push(aid); kvUpsert('groups', gid, group) }
  })
  ipcMain.handle('gc:save', (_, group) => { kvUpsert('groups', group.id, group) })
  ipcMain.handle('gc:messages', (_, gid) => gcMsgList(gid))
  ipcMain.handle('gc:sendMessage', async (_, gid, message) => {
    gcMsgAdd(gid, 'user', 'User', 'user', message)
    const group = kvGet('groups', gid)
    const allAgents = cacheAgents()
    const memberAgents = group?.members?.length
      ? group.members.map((aid: string) => allAgents.find((a: any) => a.id === aid)).filter(Boolean)
      : allAgents.slice(0, 1)
    if (!memberAgents.length) return { ok: false, error: 'No agents' }

    // Phase 2: @ mention parsing — filter agents by @name or @all
    const mentions = message.match(/@(\S+)/g)
    let targetAgents = memberAgents
    if (mentions) {
      const names = mentions.map((m: string) => m.slice(1).toLowerCase())
      if (names.includes('all') || names.includes('所有人')) {
        targetAgents = memberAgents
      } else {
        targetAgents = memberAgents.filter((a: any) =>
          names.some((n: string) =>
            a.id.toLowerCase().includes(n) ||
            (a.name || '').toLowerCase().includes(n)
          )
        )
        if (targetAgents.length === 0) targetAgents = memberAgents
      }
      console.log('[GC] @mentions:', names.join(', '), '-> targets:', targetAgents.map((a: any) => a.name).join(', '))
    }
    const port = getOpenClawPort()
    const gcHistory = gcMsgList(gid).slice(-10)
    const basePrompt = kvGet('config', 'main')?.basePrompt || BASE_PROMPT
    const memberNames = memberAgents.map((a: any) => `${a.name || a.id}(${a.identity || '助手'})`).join('、')

    // Task assignment mode: detect leader + task keywords
    const TASK_KEYWORDS = /任务|拆分|分配|计划|规划|task|assign|plan|breakdown|拆解|步骤|实现/
    const leaderId = group?.leader
    const isTaskMode = leaderId && TASK_KEYWORDS.test(message)

    if (isTaskMode) {
      console.log('[GC] Task mode activated, leader:', leaderId)
      const leader = allAgents.find((a: any) => a.id === leaderId)
      if (!leader) { console.log('[GC] Leader not found, falling back to discussion') }
      else {
        // Step 1: Leader decomposes task into subtasks
        const leaderSystemPrompt = buildGcSystemPrompt(leader, basePrompt, memberNames)
        const leaderMsgs = [
          { role: 'system', content: leaderSystemPrompt },
          { role: 'user', content: 'You are the leader of a team. Team members: ' + memberNames + '.\n\n' +
            'The user asked: ' + message + '\n\n' +
            'Break this into subtasks. Reply ONLY with a JSON array, no other text:\n' +
            '[{"task": "description", "assignee": "agent_name"}]\n\n' +
            'assignee must match one of the team member names exactly.' }
        ]
        try {
          const planText = await gatewayChat(port, leader.model || 'openclaw', leaderMsgs, 60000)
          gcMsgAdd(gid, leader.id, leader.name, 'agent', '[Task Plan]\n' + planText)

          // Step 2: Parse the plan
          let subtasks: Array<{ task: string; assignee: string }> = []
          try {
            const jsonMatch = planText.match(/\[[\s\S]*?\]/)
            if (jsonMatch) subtasks = JSON.parse(jsonMatch[0])
          } catch { console.log('[GC] Failed to parse task plan JSON') }

          if (subtasks.length > 0) {
            // Step 3: Execute subtasks in parallel
            const taskResults = await Promise.all(subtasks.map(async (st) => {
              const assignee = memberAgents.find((a: any) =>
                (a.name || '').toLowerCase() === st.assignee.toLowerCase() ||
                a.id.toLowerCase() === st.assignee.toLowerCase()
              ) || memberAgents[0]
              const taskMsgs = [
                { role: 'system', content: buildGcSystemPrompt(assignee, basePrompt, memberNames) + '\n\nYou have been assigned a specific task. Complete it and reply concisely.' },
                { role: 'user', content: st.task }
              ]
              try {
                const reply = await gatewayChat(port, assignee.model || 'openclaw', taskMsgs, 60000)
                gcMsgAdd(gid, assignee.id, assignee.name, 'agent', reply)
                return { agentId: assignee.id, agentName: assignee.name, task: st.task, reply }
              } catch (e) { return { agentId: assignee.id, agentName: assignee.name, task: st.task, error: (e as Error).message } }
            }))

            // Step 4: Leader summarizes
            const summaryInput = taskResults.map((r: any) =>
              '- ' + r.agentName + ' (' + r.task + '): ' + (r.reply || r.error || 'no result')
            ).join('\n')
            const summaryMsgs = [
              { role: 'system', content: buildGcSystemPrompt(leader, basePrompt, memberNames) },
              { role: 'user', content: 'The team completed these subtasks:\n' + summaryInput + '\n\nProvide a brief summary for the user.' }
            ]
            try {
              const summary = await gatewayChat(port, leader.model || 'openclaw', summaryMsgs)
              gcMsgAdd(gid, leader.id, leader.name, 'agent', summary)
              return { ok: true, mode: 'task', replies: taskResults, summary }
            } catch (e) {
              return { ok: true, mode: 'task', replies: taskResults, summary: 'Summary generation failed' }
            }
          }
        } catch (e) {
          console.log('[GC] Task mode error:', (e as Error).message)
        }
      }
    }

    // Discussion mode: all agents reply in parallel
    const results = await Promise.all(targetAgents.map(async (agent: any) => {
      const msgs: any[] = [{ role: 'system', content: buildGcSystemPrompt(agent, basePrompt, memberNames) }]
      for (const m of gcHistory) msgs.push({ role: (m as any).role === 'user' ? 'user' : 'assistant', content: (m as any).content })
      try {
        const reply = await gatewayChat(port, agent.model || 'openclaw', msgs)
        gcMsgAdd(gid, agent.id, agent.name, 'agent', reply)
        return { agentId: agent.id, agentName: agent.name, reply }
      } catch (e) { return { agentId: agent.id, agentName: agent.name, error: (e as Error).message } }
    }))
    return { ok: true, mode: 'discussion', replies: results }
  })
  ipcMain.handle('gc:bookmark', (_, id) => { gcMsgBookmark(id, true) })
  ipcMain.handle('gc:unbookmark', (_, id) => { gcMsgBookmark(id, false) })
  ipcMain.handle('gc:bookmarks', (_, gid) => gcMsgBookmarked(gid))
  ipcMain.handle('gc:pin', (_, id) => { gcMsgPin(id, true) })
  ipcMain.handle('gc:pinned', (_, gid) => gcMsgPinned(gid))
  ipcMain.handle('gc:delete', (_, gid) => { kvDelete('groups', gid); gcMsgDeleteByGroup(gid) })

  // Gateway
  ipcMain.handle('gateway:status', async () => {
    const port = getOpenClawPort()
    const running = await gatewayHealth(port)
    return { running, port }
  })
  ipcMain.handle('gateway:start', () => {
    const { exec } = require('child_process')
    try { exec('openclaw daemon start', { windowsHide: true }); return { ok: true } } catch {}
    return { ok: false, error: 'OpenClaw not found' }
  })

  // Chat streaming
  let abortCtrl: AbortController | null = null
  let chatGeneration = 0
  let lastConvId: string | null = null
  ipcMain.handle('chat:send', async (_, { message, history, systemPrompt, model, agentId, convId }) => {
    const perfStart = Date.now()
    // Reset intent state when switching conversations, summarize previous conversation
    if (convId !== lastConvId) {
      if (lastConvId) {
        try {
          const prevMsgs = msgList(lastConvId)
          summarizeConversation(prevMsgs.map((m: any) => ({ role: m.role, content: m.content || '' })))
        } catch {}
      }
      resetIntentState()
      resetBehaviorMode()
      clearTaskTracking()
      lastConvId = convId || null
    }
    // Abort any in-flight request
    abortCtrl?.abort()
    const myGen = ++chatGeneration
    // DEBUG: always write to tmp file that handler was called
    try { require('fs').appendFileSync(require('path').join(require('os').tmpdir(), 'aaronclaw-debug.log'), `[${new Date().toISOString()}] chat:send CALLED message="${(message||'').slice(0,50)}"\n`) } catch {}
    let port = getOpenClawPort()
    // Warm port: try scanning live Gateway before using cached/config value
    try {
      for (const p of [51345, 18789, 18788]) {
        const h = await fetch(`http://127.0.0.1:${p}/health`, { signal: AbortSignal.timeout(500) })
        if (h.ok) { port = p; cachedPort = p; break }
      }
    } catch {}
    console.log('[Chat] Using Gateway port:', port, '(cached:', cachedPort, ')')
    const agents = cacheAgents()
    const intentResult = classifyIntent(message)
    const agent = agentId
      ? agents.find((a: any) => a.id === agentId)
      : agents.find((a: any) => a.id === intentResult.agentId) || agents[0]
    // B05: Learn from user feedback
    learnFromFeedback(message)
    // Detect emotional tone for response adaptation
    setEmotionalContext(message)
    // Logic: detect multi-step tasks and start tracking
    if (detectMultiStepTask(message)) {
      const steps = extractSteps(message)
      if (steps.length >= 2) {
        startTaskTracking(steps)
        console.log('[Chat] Task tracking started:', steps)
      }
    }

    // Map skill IDs to actual tool function names for system prompt
    const SKILL_TO_TOOL: Record<string, string> = {
      search: 'ac_web_search', read_file: 'ac_read_file', write_file: 'ac_write_file',
      terminal: 'ac_terminal', browser: 'ac_browser', code_execute: 'code_execute',
      data_analyze: 'ac_data_analyze', chart_generate: 'ac_chart_generate',
      memory_save: 'memory_save', read_url: 'ac_read_url', translate: 'translate',
      list_directory: 'list_directory', memory_search: 'memory_search',
      stock_quote: 'skill_stock_quote', stock_kline: 'skill_stock_kline',
      stock_finance: 'skill_stock_finance', stock_screener: 'skill_stock_screener',
      data_profile: 'skill_data_profile', sys_info: 'skill_sys_info',
      text_stats: 'skill_text_stats', code_review: 'skill_code_review',
      project_scan: 'skill_project_scan', csv_clean: 'skill_csv_clean',
      md_format: 'skill_md_format', word_freq: 'skill_word_freq',
      summarize: 'skill_summarize', citation_extract: 'skill_citation_extract',
      // New data providers
      market_overview: 'ac_market_overview', news_search: 'ac_news',
      baike_lookup: 'ac_baike', exchange_rate: 'ac_forex', verify_fact: 'ac_verify',
      // Phase 1: free Chinese APIs
      weather: 'ac_weather', hot_search: 'ac_hot_search',
      daily_briefing: 'ac_daily_briefing', poetry: 'ac_poetry',
      history_today: 'ac_history_today', ip_lookup: 'ac_ip_lookup',
      joke: 'ac_joke', gov_stats: 'ac_gov_stats',
      // Phase 3: workflow skills
      task_decompose: 'task_decompose', decision_analysis: 'decision_analysis',
      workflow_template: 'workflow_template', progress_track: 'progress_track',
      project_plan: 'project_plan',
    }
    const toolNames = (agent?.skills || []).map((s: string) => {
      if (SKILL_TO_TOOL[s]) return SKILL_TO_TOOL[s]
      // Custom skills: if not in static map, check if it has an execute script → tool name is skill_<id>
      const skill = cacheSkills().find((sk: any) => sk.id === s)
      if (skill?.execute && skill.source !== 'builtin') return 'skill_' + s.replace(/[^a-zA-Z0-9_]/g, '_')
      return s
    })
    // Knowledge skill auto-matching: inject relevant skills into system prompt
    const skillMatch = matchSkills({ agentId: agent?.id || 'default', userMessage: message, maxSkills: 5 })
    const knowledgeSkillInjection = buildSkillInjection(skillMatch)
    const finalPrompt = systemPrompt || buildSystemPrompt(agent, toolNames, undefined, knowledgeSkillInjection) || ''
    const msgs: { role: string; content: string }[] = []
    // B01: Environment awareness injection
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10) // YYYY-MM-DD
    const envLines = [
      `[Environment] OS: Windows 10 | User: ${homedir().split('\\').pop()} | Home: ${homedir()} | Date: ${todayStr}`,
      `Desktop: ${join(homedir(), 'Desktop')} | Temp: ${tmpdir()}`,
      `CWD: ${process.cwd()}`,
      `[TimeAware] 当前日期: ${todayStr} (${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日)。搜索和分析时优先使用最新数据，忽略过时信息。`,
    ]
    // Auto-inject current directory listing (top-level, skip hidden)
    try {
      const { readdirSync } = require('fs')
      const cwd = process.cwd()
      const entries = readdirSync(cwd, { withFileTypes: true }).filter((e: any) => !e.name.startsWith('.')).slice(0, 20)
      const listing = entries.map((e: any) => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`).join(', ')
      envLines.push(`CWD contents: ${listing}`)
    } catch {}
    // Auto-inject recent conversation topic if continuing
    if (convId) {
      try {
        const allMsgs = msgList(convId)
        const recent = allMsgs.slice(-5)
        if (recent.length > 0) {
          const topics = recent.filter((m: any) => m.role === 'user').map((m: any) => (m.content || '').slice(0, 80)).join(' | ')
          if (topics) envLines.push(`Recent context: ${topics}`)
        }
      } catch {}
    }
    // Unified response guidance — merges behavior mode, emotion, task progress, proactive hints
    // Priority: user explicit > emotion > task progress > experience > proactive suggestions
    try {
      const suggestions = getProactiveSuggestions()
      const taskHint = getTaskProgressHint()
      const expHint = getExperienceHint(message)
      const guidance = getUnifiedResponseGuidance(suggestions, taskHint, expHint)
      if (guidance) envLines.push(guidance)
    } catch {}
    // P3-3: Inject tool reliability stats (using unified functions)
    try {
      const unreliable = getUnreliableTools()
      const reliable = getReliableTools()
      if (unreliable.length > 0) envLines.push(`Unreliable tools: ${unreliable.join(', ')} — avoid, use alternatives`)
      if (reliable.length > 0) envLines.push(`Reliable tools: ${reliable.join(', ')} — prefer these`)
      // P3-4: Inject reliable tool combinations
      const reliableCombos = getReliableCombinations()
      if (reliableCombos.length > 0) envLines.push(`Reliable tool combos: ${reliableCombos.join('; ')}`)
      // P3-6: Inject slow tool warnings
      const slowTools = getSlowTools()
      if (slowTools.length > 0) envLines.push(`Slow tools (>5s avg): ${slowTools.join(', ')} — use only when necessary`)
      // P2-4: Error pattern learning — inject specific failure reasons
      const stats = getToolStats()
      const errorPatterns: string[] = []
      for (const name of unreliable) {
        const s = stats[name]
        if (s?.lastError) {
          const errHint = s.lastError.slice(0, 80).replace(/\n/g, ' ')
          errorPatterns.push(`${name}: ${errHint}`)
        }
      }
      if (errorPatterns.length > 0) envLines.push(`Error patterns:\n${errorPatterns.map(p => `- ${p}`).join('\n')}`)
      // Pass stats to orchestrator for dynamic recommendations
      ;(globalThis as any).__toolStats = stats
    } catch {}
    const envInfo = envLines.join('\n')
    const envRules = [
      'RULES:',
      '1. Execute immediately. Never say "let me check" or "I will".',
      '2. One tool call per step. Short confirmation after.',
      '3. Use full absolute paths. Windows backslash paths.',
      '4. PowerShell for all commands.',
      '5. Tool failure: read error, fix, retry. Never give up.',
      '6. memory_save for user preferences and project facts.',
      '7. Interpret tool results — don\'t dump raw output. Explain what it means.',
      '8. For complex tasks: state plan → execute → verify → summarize.',
      '9. If a task is beyond your capabilities, say so clearly and suggest alternatives.',
    ].join('\n')
    const fullSystemPrompt = [envInfo, envRules, finalPrompt].filter(Boolean).join('\n\n')
    if (fullSystemPrompt) msgs.push({ role: 'system', content: fullSystemPrompt })

    // Contradiction detection — check if tool results conflict with each other
    const detectContradictions = (results: Array<{ name: string; result: string }>): string[] => {
      const warnings: string[] = []
      // Check for conflicting success/error signals
      const successes = results.filter(r => !r.result.includes('[ERROR]') && !r.result.includes('"error"'))
      const failures = results.filter(r => r.result.includes('[ERROR]') || r.result.includes('"error"'))
      if (successes.length > 0 && failures.length > 0) {
        const successTools = successes.map(r => r.name).join(', ')
        const failTools = failures.map(r => r.name).join(', ')
        warnings.push(`Mixed results: ${successTools} succeeded but ${failTools} failed — verify consistency`)
      }
      // Check for duplicate tool calls with different results
      const byName = new Map<string, string[]>()
      for (const r of results) {
        if (!byName.has(r.name)) byName.set(r.name, [])
        byName.get(r.name)!.push(r.result)
      }
      for (const [name, outputs] of byName) {
        if (outputs.length > 1) {
          const unique = new Set(outputs.map(o => o.slice(0, 100)))
          if (unique.size > 1) warnings.push(`${name} was called ${outputs.length} times with different results — possible inconsistency`)
        }
      }
      return warnings
    }

    // Self-verification — inject verification instruction after multi-tool chains
    const shouldVerify = (toolCalls: any[]) => {
      // Verify if: multiple tools used, or complex tools, or error recovery happened
      return toolCalls.length >= 3 || toolCalls.some(tc => ['ac_terminal', 'code_execute', 'ac_write_file'].includes(tc.function.name))
    }
    // P0-1: Always inject user profile (user_pref memories) for persistent personalization
    const memories = cacheMemory()
    const userProfileMemories = memories.filter((m: any) => m.category === 'user_pref')
    if (userProfileMemories.length > 0) {
      const profileLines = userProfileMemories.slice(0, 10).map((m: any) => `- ${m.content}`).join('\n')
      msgs.push({ role: 'system', content: `User profile (persistent preferences):\n${profileLines}` })
    }
    // P2-1: Inject recent task experience cards
    const expMemories = memories.filter((m: any) => m.category === 'task_experience')
    if (expMemories.length > 0) {
      const recentExp = expMemories.slice(-3).map((m: any) => `- ${m.content}`).join('\n')
      msgs.push({ role: 'system', content: `Recent task experience:\n${recentExp}` })
    }
    // P2-7: Cross-session task continuity — inject last task context for new conversations
    if (!convId || !history || history.length === 0) {
      const lastTask = memories.find((m: any) => m.id === 'last_task_state')
      if (lastTask) {
        const taskAge = Date.now() - new Date(lastTask.createdAt || 0).getTime()
        if (taskAge < 24 * 60 * 60 * 1000) { // Only if within 24 hours
          msgs.push({ role: 'system', content: `Previous session context: ${lastTask.content}\nIf the user's message relates to this task, continue from where they left off.` })
        }
      }
    }
    // P3-1: Knowledge graph injection — entities and relations relevant to current message
    try {
      const kg = queryKnowledgeGraph(message)
      if (kg.entities.length > 0 || kg.relations.length > 0) {
        const kgLines: string[] = []
        if (kg.entities.length > 0) kgLines.push(`Known entities: ${kg.entities.join('; ')}`)
        if (kg.relations.length > 0) kgLines.push(`Known relations: ${kg.relations.join('; ')}`)
        msgs.push({ role: 'system', content: `Knowledge graph:\n${kgLines.join('\n')}` })
      }
    } catch {}
    // Auto-inject relevant memories via FTS5
    if (memories.length > 0) {
      const msgLower = message.toLowerCase()
      const words = msgLower.split(/[\s,.;!?。；！？、\n]+/).filter((w: string) => w.length > 1)
      const chineseChars = message.replace(/[^一-鿿]/g, '')
      const ngrams: string[] = []
      for (let i = 0; i < chineseChars.length - 1; i++) {
        ngrams.push(chineseChars.slice(i, i + 2))
        if (i < chineseChars.length - 2) ngrams.push(chineseChars.slice(i, i + 3))
      }
      const allTokens = [...new Set([...words, ...ngrams])].slice(0, 20)
      let relevant: any[] = []
      if (allTokens.length > 0) {
        const ftsQuery = allTokens.map(t => `"${t}"`).join(' OR ')
        const ftsResults = memoryFtsSearch(ftsQuery, 5)
        if (ftsResults.length > 0) relevant = ftsResults.map(r => ({ content: r.content, category: r.category }))
      }
      if (relevant.length === 0) {
        const scored = memories.map((m: any) => {
          const content = m.content.toLowerCase()
          let score = 0
          for (const t of allTokens) { if (t.length > 1 && content.includes(t)) score++ }
          return { m, score }
        }).filter((s: any) => s.score > 0)
        scored.sort((a: any, b: any) => b.score - a.score || (b.m.importance || 0.5) - (a.m.importance || 0.5))
        relevant = scored.slice(0, 5).map((s: any) => s.m)
      }
      if (relevant.length > 0) {
        const memContext = relevant.map((m: any) => `- ${m.content}`).join('\n')
        msgs.push({ role: 'system', content: `Key memories:\n${memContext}` })
      }
    }
    // Auto-inject relevant RAG knowledge base content
    const ragDocs = cacheRag()
    if (ragDocs.length > 0) {
      const msgLower2 = message.toLowerCase()
      const qWords = msgLower2.split(/[\s,.;!?。；！？、\n]+/).filter((w: string) => w.length > 1)
      const ragResults: { text: string; score: number }[] = []
      for (const doc of ragDocs) {
        const content = doc.content || ''
        const chunks = content.match(/[\s\S]{1,500}/g) || [content]
        for (const chunk of chunks) {
          const chunkLower = chunk.toLowerCase()
          const matchCount = qWords.filter((w: string) => chunkLower.includes(w)).length
          if (matchCount === 0) continue
          const score = matchCount / Math.max(1, qWords.length)
          ragResults.push({ text: chunk.trim(), score })
        }
      }
      ragResults.sort((a, b) => b.score - a.score)
      const topRag = ragResults.slice(0, 3)
      if (topRag.length > 0 && topRag[0].score >= 0.3) {
        const ragContext = topRag.map(r => r.text).join('\n\n---\n\n')
        msgs.push({ role: 'system', content: `Relevant knowledge base:\n${ragContext}` })
      }
    }
    // P2-3: Decision analysis template injection
    const decisionKeywords = ['选择', '对比', '比较', '哪个好', '应该选', '推荐', '决策', '评估', '利弊', '优缺点', 'trade-off', 'which is better', 'should i choose']
    const isDecisionQuestion = decisionKeywords.some(kw => message.toLowerCase().includes(kw))
    if (isDecisionQuestion) {
      msgs.push({ role: 'system', content: `The user is asking a decision/comparison question. Use this analysis framework:\n- 风险: What could go wrong with each option?\n- 收益: What are the benefits?\n- 成本: Time, money, effort required?\n- 替代方案: What other options exist?\n- 建议: Your recommendation with clear reasoning.\nShow your reasoning chain. Be specific with data/examples.` })
    }
    // A03: Smart window — keep recent + relevant + tool-rich history messages
    if (history) {
      const MAX_RECENT = 12
      if (history.length <= MAX_RECENT) {
        msgs.push(...history)
      } else {
        // Always keep recent messages
        const recent = history.slice(-MAX_RECENT)
        const older = history.slice(0, -MAX_RECENT)
        // Extract keywords from current message for relevance matching
        const msgWords = new Set(message.toLowerCase().split(/[\s,，。！？、；：""''（）()\[\]{}]+/).filter((w: string) => w.length > 1))
        // Score older messages by relevance
        const scored = older.map((m: any, i: number) => {
          if (m.role === 'system') return { m, score: 10, i }
          const content = (m.content || '').toLowerCase()
          let score = 0
          // Keyword relevance
          for (const w of msgWords) { if ((w as string).length > 1 && content.includes(w as string)) score++ }
          // Boost tool result messages (contain factual data)
          if (m.role === 'tool' || content.includes('[tool result]') || content.includes('tool_call')) score += 3
          // Boost messages with code/file paths (technical context)
          if (/[A-Z]:\\|\.ts|\.js|\.py|\.json|\.css/.test(m.content || '')) score += 2
          return { m, score, i }
        }).filter((s: any) => s.score > 0)
        scored.sort((a: any, b: any) => b.score - a.score || a.i - b.i)
        const relevant = scored.slice(0, 6).map((s: any) => s.m)
        const trimmed = [...relevant, ...recent]
        console.log(`[Chat] A03: Smart window ${history.length} -> ${trimmed.length} messages (${relevant.length} relevant + ${recent.length} recent)`)
        msgs.push(...trimmed)
      }
    }
    msgs.push({ role: 'user', content: message })
    if (convId) msgAdd(convId, 'user', message)

 // ռ tool_calls thinking
    const collectedToolCalls: any[] = []
    let collectedThinking = ''
    let lastText = ''

    // Build tool list (single pass, no duplicates)
    const tools: any[] = []
    const addedToolNames = new Set<string>()

    // Skill -> tool mapping
    const skillMap: Record<string, any> = {
      'search': { type: 'function', function: { name: 'ac_web_search', description: 'Search the web and return results with titles, URLs, and snippets. USE THIS for finding information, researching topics, looking up facts. Do NOT use browser for searching.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query in any language' } }, required: ['query'] } } },
      'read_file': { type: 'function', function: { name: 'ac_read_file', description: 'Read file content', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
      'write_file': { type: 'function', function: { name: 'ac_write_file', description: 'Write content to file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
      'terminal': { type: 'function', function: { name: 'ac_terminal', description: 'Run a shell command', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } } },
      'browser': { type: 'function', function: { name: 'ac_browser', description: 'Open a URL in the system browser. This ONLY opens the page visually — it does NOT return any content or search results. For getting information, use ac_web_search instead.', parameters: { type: 'object', properties: { url: { type: 'string', description: 'Full URL to open (must start with http/https)' } }, required: ['url'] } } },
      'code_execute': { type: 'function', function: { name: 'code_execute', description: 'Execute code in sandbox (Python/JavaScript)', parameters: { type: 'object', properties: { code: { type: 'string' }, language: { type: 'string', enum: ['python', 'javascript'] } }, required: ['code', 'language'] } } },
      'data_analyze': { type: 'function', function: { name: 'ac_data_analyze', description: 'Run Python code for data analysis', parameters: { type: 'object', properties: { code: { type: 'string', description: 'Python code for data analysis' } }, required: ['code'] } } },
      'chart_generate': { type: 'function', function: { name: 'ac_chart_generate', description: 'Generate charts with Python matplotlib', parameters: { type: 'object', properties: { code: { type: 'string', description: 'Python code to generate charts' } }, required: ['code'] } } },
      'memory_save': { type: 'function', function: { name: 'memory_save', description: 'Save important information to long-term memory', parameters: { type: 'object', properties: { content: { type: 'string' }, category: { type: 'string', enum: ['user_pref', 'project', 'architecture', 'config', 'general'] } }, required: ['content', 'category'] } } },
      'read_url': { type: 'function', function: { name: 'ac_read_url', description: 'Fetch a URL and return its readable text content. Use this to read web pages, articles, documentation, APIs, or any URL. Returns extracted text from the page (not raw HTML). Unlike ac_browser (which just opens a page visually), this actually returns the content.', parameters: { type: 'object', properties: { url: { type: 'string', description: 'Full URL to fetch (must start with http/https)' } }, required: ['url'] } } },
      'translate': { type: 'function', function: { name: 'translate', description: 'Translate text to a target language', parameters: { type: 'object', properties: { text: { type: 'string', description: 'Text to translate' }, target: { type: 'string', description: 'Target language (e.g. en, zh, ja)' } }, required: ['text', 'target'] } } },
      'list_directory': { type: 'function', function: { name: 'list_directory', description: 'List files and folders in a directory', parameters: { type: 'object', properties: { path: { type: 'string', description: 'Directory path to list' } }, required: ['path'] } } },
      'memory_search': { type: 'function', function: { name: 'memory_search', description: 'Search previously saved memories by keyword', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search keyword' } }, required: ['query'] } } },
      // Data providers — free Chinese APIs
      'market_overview': { type: 'function', function: { name: 'ac_market_overview', description: 'Get real-time A-share market overview: major indices (Shanghai, Shenzhen, CSI300, ChiNext) and market breadth (up/down counts). Use this for market sentiment and index data.', parameters: { type: 'object', properties: {} } } },
      'news_search': { type: 'function', function: { name: 'ac_news', description: 'Search Chinese news from Baidu News. Returns recent news articles with titles, sources, and dates. Use for current events, company news, industry updates.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'News search query' } }, required: ['query'] } } },
      'baike_lookup': { type: 'function', function: { name: 'ac_baike', description: 'Look up knowledge on Baidu Baike (Chinese Wikipedia). Returns factual summaries. Use for verifying facts, looking up definitions, companies, people, places.', parameters: { type: 'object', properties: { keyword: { type: 'string', description: 'Keyword to look up' } }, required: ['keyword'] } } },
      'exchange_rate': { type: 'function', function: { name: 'ac_forex', description: 'Get real-time exchange rates (USD/CNY, EUR/CNY, etc). Uses Sina Finance API.', parameters: { type: 'object', properties: { from: { type: 'string', description: 'Source currency (e.g. USD)' }, to: { type: 'string', description: 'Target currency (e.g. CNY)' } }, required: ['from', 'to'] } } },
      'verify_fact': { type: 'function', function: { name: 'ac_verify', description: 'Cross-reference a claim across multiple sources (search engines + Baike). Returns confidence level and supporting evidence. Use when accuracy is critical.', parameters: { type: 'object', properties: { claim: { type: 'string', description: 'The claim or statement to verify' } }, required: ['claim'] } } },
      // Phase 1: free Chinese APIs
      'weather': { type: 'function', function: { name: 'ac_weather', description: 'Get weather forecast for a city. Returns current conditions (temp, humidity, wind) and multi-day forecast. Use for travel planning, daily life.', parameters: { type: 'object', properties: { city: { type: 'string', description: 'City name in Chinese or English (e.g. 北京, Shanghai)' } }, required: ['city'] } } },
      'hot_search': { type: 'function', function: { name: 'ac_hot_search', description: 'Get trending/hot search topics from Chinese platforms. Use for monitoring what is popular, tracking viral content.', parameters: { type: 'object', properties: { platform: { type: 'string', enum: ['weibo', 'zhihu', 'douyin', 'baidu', 'bilibili', 'toutiao'], description: 'Platform to get trending from' } } } } },
      'daily_briefing': { type: 'function', function: { name: 'ac_daily_briefing', description: 'Get 60-second daily news briefing (Chinese). Quick overview of today\'s top news.', parameters: { type: 'object', properties: {} } } },
      'poetry': { type: 'function', function: { name: 'ac_poetry', description: 'Get a random classical Chinese poem or famous quote. Use for cultural content, inspiration, decoration.', parameters: { type: 'object', properties: {} } } },
      'history_today': { type: 'function', function: { name: 'ac_history_today', description: 'Get historical events that happened on this day. Use for trivia, historical context, cultural enrichment.', parameters: { type: 'object', properties: {} } } },
      'ip_lookup': { type: 'function', function: { name: 'ac_ip_lookup', description: 'Look up IP address geolocation. Returns country, region, city, ISP. Use for network diagnostics.', parameters: { type: 'object', properties: { ip: { type: 'string', description: 'IP address to look up (empty = your own IP)' } } } } },
      'github_mirror': { type: 'function', function: { name: 'ac_github_mirror', description: 'Diagnose GitHub connectivity. Tests direct access and mirror fallback. Use when GitHub URLs fail or user reports access issues.', parameters: { type: 'object', properties: {} } } },
      'joke': { type: 'function', function: { name: 'ac_joke', description: 'Get a random joke. Use for lightening the mood, entertainment.', parameters: { type: 'object', properties: {} } } },
      'gov_stats': { type: 'function', function: { name: 'ac_gov_stats', description: 'Get macro-economic data from China National Bureau of Statistics. Supports: GDP, CPI, PPI, population, unemployment, retail, industrial output, fixed investment, import/export.', parameters: { type: 'object', properties: { indicator: { type: 'string', description: 'Economic indicator name (e.g. GDP, CPI, PPI, 人口, 失业率, 社零, 工业增加值, 固投, 进出口)' } }, required: ['indicator'] } } },
      // Phase 3: workflow skills
      'task_decompose': { type: 'function', function: { name: 'task_decompose', description: 'Decompose a complex task into structured steps with dependencies, time estimates, and risk levels. Use BEFORE starting complex work to plan the approach.', parameters: { type: 'object', properties: { description: { type: 'string', description: 'The complex task to decompose' } }, required: ['description'] } } },
      'decision_analysis': { type: 'function', function: { name: 'decision_analysis', description: 'Analyze a decision by comparing options with scoring on benefit/cost/risk dimensions. Returns a ranked recommendation. Use when user faces a choice.', parameters: { type: 'object', properties: { question: { type: 'string', description: 'The decision question' }, options: { type: 'array', items: { type: 'string' }, description: 'List of options to compare (at least 2)' } }, required: ['question', 'options'] } } },
      'workflow_template': { type: 'function', function: { name: 'workflow_template', description: 'Get a pre-built workflow template for common tasks. Use action=list to see all templates, or provide a task description to find a matching template.', parameters: { type: 'object', properties: { description: { type: 'string', description: 'Task description to match a workflow' }, action: { type: 'string', enum: ['match', 'list'], description: 'match=auto-match, list=show all' } } } } },
      'progress_track': { type: 'function', function: { name: 'progress_track', description: 'Track task progress. Actions: start (begin tracking with steps), update (mark step status), report (get current progress), clear (reset).', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['start', 'update', 'report', 'clear'] }, title: { type: 'string' }, steps: { type: 'array', items: { type: 'string' } }, step: { type: 'number' }, status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'blocked'] }, note: { type: 'string' } }, required: ['action'] } } },
      'project_plan': { type: 'function', function: { name: 'project_plan', description: 'Create a project plan with milestones, tasks, risks, and resources. Use for project management and planning.', parameters: { type: 'object', properties: { name: { type: 'string', description: 'Project name' }, objective: { type: 'string', description: 'Project objective' }, constraints: { type: 'array', items: { type: 'string' }, description: 'Known constraints or limitations' } }, required: ['name', 'objective'] } } },
    }

    // Auto-inject enabled skills (skip search - we handle it server-side via Baidu)
    const unhealthyTools = await getUnhealthyTools()
    const enabledSkills = cacheSkills().filter((s: any) => s.enabled !== false && s.id !== 'search')
    const agentSkillFilter = agent?.skills && Array.isArray(agent.skills) ? new Set(agent.skills) : null
    for (const skill of enabledSkills) {
      if (agentSkillFilter && !agentSkillFilter.has(skill.id)) continue
      const mapped = skillMap[skill.id]
      if (mapped && !addedToolNames.has(mapped.function.name)) {
        if (!unhealthyTools.has(mapped.function.name)) {
          tools.push(mapped)
          addedToolNames.add(mapped.function.name)
        }
      }
      // Custom skills with execute script
      if (!mapped && skill.execute && skill.source !== 'builtin') {
        const toolName = 'skill_' + skill.id.replace(/[^a-zA-Z0-9_]/g, '_')
        if (!addedToolNames.has(toolName) && !unhealthyTools.has(toolName)) {
          const validation = validateCustomSkill(skill.execute)
          if (validation.ok) {
            const paramDesc = skill.params || 'input'
            tools.push({
              type: 'function',
              function: {
                name: toolName,
                description: `${skill.description || skill.name}. Parameters: ${paramDesc}`,
                parameters: { type: 'object', properties: { input: { type: 'string', description: paramDesc } }, required: ['input'] }
              }
            })
            addedToolNames.add(toolName)
          }
        }
      }
    }

    // Inject MCP tools from connected servers
    const mcpTools = getMcpTools()
    for (const mt of mcpTools) {
      if (!addedToolNames.has(mt.name) && !unhealthyTools.has(mt.name)) {
        tools.push({
          type: 'function',
          function: {
            name: mt.name,
            description: `[MCP] ${mt.description || mt.name}`,
            parameters: mt.inputSchema || { type: 'object', properties: {} },
          },
        })
        addedToolNames.add(mt.name)
      }
    }

    // Context-aware tool filtering: remove tools irrelevant to detected intent
    const intentAgentId = agentId ? null : intentResult.agentId
    if (intentAgentId && intentAgentId !== 'default' && agent?.id === 'default') {
      // Intent suggests a specialized agent but user is on default — filter out domain-specific tools
      const DOMAIN_TOOL_FILTERS: Record<string, string[]> = {
        stock_analyst: ['ac_weather', 'ac_hot_search', 'ac_daily_briefing', 'ac_poetry', 'ac_history_today', 'ac_joke', 'ac_ip_lookup'],
        life_assistant: ['skill_stock_quote', 'skill_stock_kline', 'skill_stock_finance', 'skill_stock_screener', 'ac_market_overview'],
        health_advisor: ['skill_stock_quote', 'skill_stock_kline', 'ac_market_overview', 'ac_joke'],
        engineer: ['ac_weather', 'ac_joke', 'ac_poetry', 'ac_hot_search', 'ac_history_today'],
      }
      const toRemove = DOMAIN_TOOL_FILTERS[intentAgentId] || []
      if (toRemove.length > 0) {
        for (let i = tools.length - 1; i >= 0; i--) {
          if (toRemove.includes(tools[i].function.name)) tools.splice(i, 1)
        }
      }
    }

    // Dynamic tool selection
    const filteredTools = selectTools(message, tools)

    // Token budget management — estimate tokens and trim if needed
    const estimateTokens = (text: string) => Math.ceil(text.length / 3) // ~3 chars per token for mixed CJK/EN
    const modelConfig = kvGet('config', 'main') || {}
    const maxContext = (cacheModels().find((m: any) => m.id === (model || agent?.model || modelConfig.ai?.model))?.contextWindow) || 128000
    const toolTokenEstimate = filteredTools.length * 200 // ~200 tokens per tool definition
    let totalEstimate = toolTokenEstimate
    for (const m of msgs) totalEstimate += estimateTokens(m.content || '')
    totalEstimate += estimateTokens(message)

    // If exceeding 80% of context window, trim older system messages and compress history
    if (totalEstimate > maxContext * 0.8) {
      console.log(`[Chat] Token budget: ~${totalEstimate} tokens exceeds 80% of ${maxContext} context window, trimming...`)
      // Remove non-essential system messages (RAG, env info, proactive suggestions)
      const essentialSystem: any[] = []
      const removable: any[] = []
      for (const m of msgs) {
        if (m.role === 'system') {
          const content = m.content || ''
          if (content.startsWith('Relevant knowledge base:') || content.startsWith('Proactive suggestions:') || content.includes('Tool reliability:')) {
            removable.push(m)
          } else {
            essentialSystem.push(m)
          }
        }
      }
      // Remove removable system messages until under 70%
      for (const m of removable) {
        if (totalEstimate <= maxContext * 0.7) break
        const tokens = estimateTokens(m.content || '')
        msgs.splice(msgs.indexOf(m), 1)
        totalEstimate -= tokens
      }
      // If still over, trim oldest non-system messages
      if (totalEstimate > maxContext * 0.7) {
        const nonSystem = msgs.filter(m => m.role !== 'system')
        while (nonSystem.length > 4 && totalEstimate > maxContext * 0.7) {
          const removed = nonSystem.shift()!
          const tokens = estimateTokens(removed.content || '')
          msgs.splice(msgs.indexOf(removed), 1)
          totalEstimate -= tokens
        }
      }
      console.log(`[Chat] Token budget after trim: ~${totalEstimate} tokens`)
    }

    // Inject tool instruction into system prompt when tools are available
    if (filteredTools.length > 0) {
      const toolNames = filteredTools.map((t: any) => t.function.name).join(', ')
      const toolInstruction = `\n\nAvailable tools: ${toolNames}. Use them when appropriate, but if no tool fits, just answer directly.`
      if (msgs.length > 0 && msgs[0].role === 'system') {
        msgs[0].content += toolInstruction
      } else {
        msgs.unshift({ role: 'system', content: toolInstruction.trim() })
      }
    }
    const mw = mainWindow
    abortCtrl = new AbortController()

    // Determine API target: prefer direct provider (supports tool_calls), fallback to Gateway
    const config = kvGet('config', 'main') || {}
    const providers = cacheProviders()
    const agentModel = selectModel(message, model || agent?.model || config.ai?.model || 'openclaw', providers)
    let apiBase = `http://127.0.0.1:${port}/v1/chat/completions`
    let apiKey = ''
    let modelName = 'openclaw'
    let useDirect = false

    // Direct mode: provider has API key → bypass Gateway for full tool_calls + thinking support
    // Step 1: Find provider by model name (most reliable)
    const resolvedModel = agentModel !== 'openclaw' ? agentModel : config.ai?.model
    if (resolvedModel && resolvedModel !== 'openclaw') {
      // Try: provider.models array, then models table lookup, then model name prefix match
      let prov = providers.find((p: any) => p.models?.some((m: any) => m.id === resolvedModel))
      if (!prov) {
        const modelEntry = cacheModels().find((m: any) => m.id === resolvedModel)
        if (modelEntry?.provider) prov = providers.find((p: any) => p.id === modelEntry.provider)
      }
      // No prefix fallback — model must be explicitly listed by a provider
      if (prov?.apiKey) {
        // Use model-specific URL and apiId mapping if available
        const modelEntry = cacheModels().find((m: any) => m.id === resolvedModel)
        const modelUrl = modelEntry?.baseUrl
        apiBase = (modelUrl || prov.baseUrl || '').replace(/\/+$/, '') + '/chat/completions'
        apiKey = prov.apiKey
        modelName = modelEntry?.apiId || resolvedModel
        useDirect = true
      }
    }
    // Step 2: Check saved config providerId
    if (!useDirect) {
      const saved = cacheConfig().find((c: any) => c.id === 'default') || config
      const provId = saved?.providerId || config.ai?.provider
      if (provId && provId !== 'openclaw') {
        const prov = providers.find((p: any) => p.id === provId)
        if (prov?.apiKey) {
          const targetModel = saved?.modelId || resolvedModel || 'openclaw'
          const modelEntry = cacheModels().find((m: any) => m.id === targetModel)
          apiBase = (modelEntry?.baseUrl || prov.baseUrl || '').replace(/\/+$/, '') + '/chat/completions'
          apiKey = prov.apiKey
          modelName = modelEntry?.apiId || targetModel
          useDirect = true
        }
      }
    }
    // Step 3: Prefer Direct mode when API key available (better tool_calls + thinking support)
    // Gateway is fallback only when no provider API key is configured
    if (!useDirect) {
      const fallback = providers.find((p: any) => p.apiKey && p.enabled !== false)
      if (fallback) {
        const targetModel = resolvedModel !== 'openclaw' ? resolvedModel : (fallback.models?.[0]?.id || config.ai?.model || 'gpt-4o')
        const modelEntry = cacheModels().find((m: any) => m.id === targetModel)
        apiBase = (modelEntry?.baseUrl || fallback.baseUrl || '').replace(/\/+$/, '') + '/chat/completions'
        apiKey = fallback.apiKey
        modelName = modelEntry?.apiId || targetModel
        useDirect = true
        console.log('[Chat] Using Direct mode via provider:', fallback.name || fallback.id)
      }
    }

    console.log('[Chat] Routing:', { agentModel, resolvedModel, configModel: config.ai?.model, useDirect, apiBase, modelName, providersWithKey: providers.filter((p: any) => p.apiKey).map((p: any) => p.id) })
    console.log('[Chat] API target:', useDirect ? 'DIRECT ' + apiBase : 'GATEWAY port ' + port, 'model:', modelName, 'tools:', tools.length)
    if (tools.length > 0) console.log('[Chat] Tool names:', tools.map((t: any) => t.function.name).join(', '))
    // DEBUG: send mode info to renderer
    try { mw?.webContents.executeJavaScript(`console.log('[Chat mode]', '${useDirect ? 'DIRECT' : 'GATEWAY'}', 'port=${port}', 'apiBase=${apiBase}', 'tools=${tools.length}')`) } catch {}

    try {
      // Build stream context for llm module
      const streamCtx: StreamContext = {
        mainWindow: mw, apiBase, apiKey, modelName,
        abortSignal: abortCtrl!.signal, dispatcher: keepAliveAgent,
        generation: myGen, chatGeneration: () => chatGeneration, config
      }
      const doStreamChat = (messages: any[], requestTools?: any[], opts?: any) => llmStreamChat(streamCtx, messages, requestTools, opts)

      // LLM 请求重试包装: 网络/超时/限速错误自动重试
      const doStreamChatWithRetry = async (messages: any[], requestTools?: any[], opts?: any, maxRetries = 2) => {
        let lastErr: any
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            return await doStreamChat(messages, requestTools, opts)
          } catch (e: any) {
            lastErr = e
            const msg = e?.message || ''
            const isRetryable = /timeout|ECONNREFUSED|ENOTFOUND|fetch failed|429|503|502|网络|取消|abort/i.test(msg)
              && !/401|403|invalid|authentication/i.test(msg)
            if (!isRetryable || attempt === maxRetries) throw e
            const delay = (attempt + 1) * 2000 // 2s, 4s
            console.warn(`[Chat] LLM request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, msg.slice(0, 100))
            mw?.webContents.send('chat:stage', 'retrying')
            await new Promise(r => setTimeout(r, delay))
          }
        }
        throw lastErr
      }

      // First request with tools
      // B07: Dynamic temperature based on task type
      const msgLower3 = message.toLowerCase()
      const isCodeTask = /代码|code|编写|调试|debug|fix|bug|实现|implement|函数|function|class|重构|refactor/.test(msgLower3)
      const isCreativeTask = /写|write|文章|story|文案|创作|creative|小说|poem|翻译|translate/.test(msgLower3)
      const dynamicTemp = isCodeTask ? 0.1 : isCreativeTask ? 0.9 : undefined

      const t0 = Date.now()
      const useTools = filteredTools.length > 0 ? filteredTools : undefined
      const gatewayMode = !useDirect
      if (gatewayMode) console.log('[Chat] Gateway mode: letting Gateway inject tools')
      // DEBUG: step marker
      try { require('fs').appendFileSync(require('path').join(require('os').tmpdir(), 'aaronclaw-step.log'), `[${new Date().toISOString()}] STEP1: before doStreamChat tools=${useTools?.length || 0} msgs=${msgs.length}\n`) } catch {}
      console.log('[Chat] Sending request with', gatewayMode ? 'Gateway-managed' : tools.length + ' local', 'tools, msg count:', msgs.length, dynamicTemp !== undefined ? `, temp=${dynamicTemp}` : '')
      let result: Awaited<ReturnType<typeof doStreamChat>>
      try {
        // Gateway 模式不自组 tools — 让 Gateway 自行注入 OpenClaw 完整工具链
        // Direct 模式正常发送本地 tools
        result = await doStreamChatWithRetry(msgs, gatewayMode ? undefined : useTools, { temperature: dynamicTemp })
      } catch (toolErr: any) {
        const toolErrMsg = toolErr?.message || ''
        // Genuine error recovery: retry without tools only on actual tool-related errors
        if (useTools && (toolErrMsg.includes('400') || toolErrMsg.includes('tool') || toolErrMsg.includes('parameter'))) {
          console.warn('[Chat] Tools request failed, retrying without tools:', toolErrMsg)
          try {
            result = await doStreamChatWithRetry(msgs, undefined, { temperature: dynamicTemp })
          } catch (retryErr: any) {
            throw new Error(`请求失败: ${retryErr?.message || toolErrMsg}`)
          }
        } else {
          throw toolErr
        }
      }
      // DEBUG: step marker
      try { require('fs').appendFileSync(require('path').join(require('os').tmpdir(), 'aaronclaw-step.log'), `[${new Date().toISOString()}] STEP2: after doStreamChat ok=${!!result} fullLen=${result?.full?.length || 0} tc=${result?.toolCalls?.length || 0} elapsed=${Date.now()-t0}ms\n`) } catch {}
      collectedThinking += result.thinking
      const elapsed = Date.now() - t0
      console.log(`[Chat] Response in ${elapsed}ms: content length=${result.full.length}, tool_calls=${result.toolCalls.length}`)


      // Repair pipeline: fix truncated JSON, suppress storm loops
      const repairer = new ToolCallRepair()
      if (result.toolCalls.length > 0) {
        const { calls: repairedCalls, report } = repairer.process(result.toolCalls)
        if (report.notes.length > 0) console.log('[Chat] ToolCallRepair:', report.notes.join('; '))
        result.toolCalls = repairedCalls
      }

      // MCP tool lookup: map tool name → serverId for routing
      const mcpToolMap = new Map<string, string>()
      for (const mt of getMcpTools()) mcpToolMap.set(mt.name, mt.serverId)

      // Fallback: parse tool calls from text if model didn't use tool_calls field
      if (result.toolCalls.length === 0 && result.full.length > 0) {
        const textCalls = parseTextToolCalls(result.full)
        if (textCalls.length > 0) {
          console.log(`[Chat] Recovered ${textCalls.length} tool calls from text`)
          result.toolCalls = textCalls
        }
      }

      if (result.toolCalls.length > 0) {
        const breaker = new CircuitBreaker(2)
        // Notify frontend about tool calls
        for (const tc of result.toolCalls) {
          const rawArgs = tc.function.arguments || ''
          let displayArgs = rawArgs
          try { displayArgs = JSON.stringify(JSON.parse(rawArgs), null, 2) } catch {}
          notifyToolCall(mw, { id: tc.id, name: tc.function.name }, undefined, undefined, displayArgs || rawArgs)
        }

        // Execute tools in parallel for speed
        const toolMsgs: any[] = []
        const toolPromises = result.toolCalls.map(async (tc: any) => {
          collectedToolCalls.push(tc)
          let parsedArgs = {}; try { parsedArgs = JSON.parse(tc.function.arguments || '{}') } catch {}
          // Parameter pre-validation: fix aliases, detect missing required params
          const paramCheck = validateToolParams(tc.function.name, parsedArgs)
          if (!paramCheck.ok) {
            const errMsg = `[ParamError] ${paramCheck.error}`
            notifyToolCall(mw, { id: tc.id, name: tc.function.name }, 'error', errMsg)
            return { msg: { role: 'tool', tool_call_id: tc.id, content: errMsg }, tcId: tc.id, result: errMsg }
          }
          parsedArgs = paramCheck.args
          // Circuit breaker: check before executing
          const blocked = breaker.check(tc.function.name)
          if (blocked) {
            notifyToolCall(mw, { id: tc.id, name: tc.function.name }, 'error', blocked)
            return { msg: { role: 'tool', tool_call_id: tc.id, content: blocked }, tcId: tc.id, result: blocked }
          }
          notifyToolCall(mw, { id: tc.id, name: tc.function.name }, 'running')
          // Route MCP tools to MCP client, built-in tools to executeTool
          const mcpServerId = mcpToolMap.get(tc.function.name)
          const toolStart = Date.now()
          let toolResult = mcpServerId
            ? await callMcpTool(mcpServerId, tc.function.name, parsedArgs)
            : await executeTool(tc.function.name, parsedArgs)
          const toolExecTime = Date.now() - toolStart
          let isError = toolResult.includes('[ERROR]') || (toolResult.startsWith('{') && /"error"\s*:/.test(toolResult))

          // P1-4: Intelligent retry — adjust parameters based on error before falling back
          if (isError) {
            const adjuster = RETRY_ADJUSTMENTS[tc.function.name]
            if (adjuster) {
              const adjusted = adjuster(parsedArgs, toolResult)
              if (adjusted) {
                console.log(`[Chat] Smart retry: ${tc.function.name} with adjusted params`)
                const retryResult = mcpServerId
                  ? await callMcpTool(mcpServerId, tc.function.name, adjusted)
                  : await executeTool(tc.function.name, adjusted)
                const retryOk = !retryResult.includes('[ERROR]') && !(retryResult.startsWith('{') && /"error"\s*:/.test(retryResult))
                if (retryOk) {
                  console.log(`[Chat] Smart retry: ${tc.function.name} succeeded with adjusted params`)
                  toolResult = retryResult
                  isError = false
                }
              }
            }
          }

          // P1-3: Error self-healing — try reliable alternative first, then static fallback
          if (isError) {
            // Check for a reliable tool in the same category first
            const reliableAlt = findReliableAlternative(tc.function.name)
            if (reliableAlt) {
              console.log(`[Chat] Self-heal: ${tc.function.name} failed, trying reliable alternative ${reliableAlt}`)
              const altResult = await executeTool(reliableAlt, parsedArgs)
              const altOk = !altResult.includes('[ERROR]') && !(altResult.startsWith('{') && /"error"\s*:/.test(altResult))
              if (altOk) {
                console.log(`[Chat] Self-heal: reliable ${reliableAlt} succeeded`)
                toolResult = `[Reliable fallback from ${tc.function.name}] ${altResult}`
                isError = false
              }
            }
            // If reliable alternative didn't work, try static fallback
            if (isError) {
              const fallback = SELF_HEAL_FALLBACKS[tc.function.name]
              if (fallback) {
                console.log(`[Chat] Self-heal: ${tc.function.name} failed, trying ${fallback.name}`)
                const fallbackArgs = fallback.mapArgs(parsedArgs, toolResult)
                const fallbackResult = await executeTool(fallback.name, fallbackArgs)
                const fallbackOk = !fallbackResult.includes('[ERROR]') && !(fallbackResult.startsWith('{') && /"error"\s*:/.test(fallbackResult))
                if (fallbackOk) {
                  console.log(`[Chat] Self-heal: ${fallback.name} succeeded`)
                  toolResult = `[Fallback from ${tc.function.name}] ${fallbackResult}`
                  isError = false
                }
              }
            }
          }

          // Loop escape — if tool keeps failing, inject escape instruction
          if (isError) {
            const loopHint = checkForLoop(tc.function.name)
            if (loopHint) {
              toolResult = loopHint + '\n' + toolResult
              console.warn(`[Chat] Loop detected: ${tc.function.name}`)
            }
          }

          // Output quality detection — flag empty, truncated, or suspicious results
          const qualityCheck = checkOutputQuality(tc.function.name, toolResult)
          if (!qualityCheck.ok && !isError) {
            console.warn(`[Chat] Output quality: ${qualityCheck.issue}`)
            if (qualityCheck.severity === 'error') {
              toolResult = `[QualityWarning] ${qualityCheck.issue}\n${toolResult}`
            }
          }

          breaker.record(tc.function.name, isError)
          const resultQuality = computeResultQuality(tc.function.name, toolResult)
          recordToolCall(tc.function.name, !isError, isError ? toolResult.slice(0, 200) : undefined, resultQuality, toolExecTime)
          const correctedResult = wrapToolResult(toolResult, tc.function.name)
          const displayOutput = toolResult.length > 500 ? toolResult.slice(0, 500) + '...' : toolResult
          notifyToolCall(mw, { id: tc.id, name: tc.function.name }, isError ? 'error' : 'done', displayOutput)
          // Track generated files from write operations
          if (!isError && (tc.function.name === 'ac_write_file' || tc.function.name === 'write_file')) {
            try {
              const info = JSON.parse(toolResult)
              if (info?.ok && info?.path) {
                const id = 'gf-' + Buffer.from(info.path).toString('base64url').slice(0, 16)
                kvUpsert('generated_files', id, { path: info.path, name: info.path.split(/[\\/]/).pop(), size: info.bytes || 0, tool: tc.function.name, createdAt: new Date().toISOString() })
              }
            } catch {}
          }
          // Performance: compress large results before adding to context
          const compressedResult = compressToolResult(tc.function.name, correctedResult)
          const truncatedContent = compressedResult.length > 30000
            ? compressedResult.slice(0, 30000) + '\n[... truncated, total ' + compressedResult.length + ' chars]'
            : compressedResult
          return { msg: { role: 'tool', tool_call_id: tc.id, content: truncatedContent }, tcId: tc.id, result: toolResult }
        })
        const toolResults = await Promise.all(toolPromises)
        for (const tr of toolResults) {
          toolMsgs.push(tr.msg)
          if (convId) msgAdd(convId, 'tool', tr.result.slice(0, 30000), 0, undefined, undefined, tr.tcId)
        }

        // Contradiction detection — warn about inconsistent tool results
        if (toolResults.length >= 2) {
          const contradictions = detectContradictions(toolResults.map(tr => ({
            name: result.toolCalls.find((tc: any) => tc.id === tr.tcId)?.function.name || 'unknown',
            result: tr.result,
          })))
          if (contradictions.length > 0) {
            console.log('[Chat] Contradictions detected:', contradictions)
            toolMsgs.push({ role: 'system', content: `[Verification] ${contradictions.join('; ')}` })
          }
        }

        // Self-verification — inject verification instruction for complex tool chains
        if (shouldVerify(result.toolCalls)) {
          toolMsgs.push({ role: 'system', content: '[Verification] Please verify: 1) Do the tool results actually address the user\'s original request? 2) Are there any inconsistencies or missing information? 3) Should any steps be retried with different parameters?' })
        }

        // Growth: detect repeated tool patterns and auto-generate skills
        const toolNames = result.toolCalls.map((tc: any) => tc.function.name)
        const patternResult = detectRepeatedPattern(toolNames, message)
        if (patternResult) {
          toolMsgs.push({ role: 'system', content: `[Growth] ${patternResult.message}` })
          // Auto-register the generated skill
          if (patternResult.autoSkill) {
            try {
              const { kvUpsert } = require('./storage/db')
              kvUpsert('skills', patternResult.autoSkill.id, patternResult.autoSkill)
              console.log('[Growth] Auto-created skill:', patternResult.autoSkill.id)
            } catch (e) { console.warn('[Growth] Failed to auto-create skill:', (e as Error).message) }
          }
        }

        // C07: Skip follow-up for simple successful tool calls
        const allSucceeded = toolResults.every(tr => !tr.result.includes('[ERROR]') && !(tr.result.startsWith('{') && /"error"\s*:/.test(tr.result)))
        const singleSimpleTool = result.toolCalls.length === 1 && allSucceeded
          && !['ac_terminal', 'terminal', 'execute_command', 'code_execute', 'ac_data_analyze', 'ac_chart_generate',
               'memory_save', 'list_directory', 'memory_search', 'translate', 'ac_web_search', 'ac_read_url',
               'skill_stock_quote', 'skill_stock_kline', 'skill_stock_finance', 'skill_data_profile', 'skill_sys_info'].includes(result.toolCalls[0].function.name)
          && toolResults[0].result.length < 300

        if (singleSimpleTool) {
          console.log('[Chat] C07: Skipping follow-up, tool result is self-explanatory')
          const simpleResult = toolResults[0].result
          lastText = simpleResult
          if (convId) msgAdd(convId, 'assistant', simpleResult, 0)
          mw?.webContents.send('chat:done', simpleResult, '', [])
          return { ok: true, text: simpleResult }
        }

        // Follow-up with tool results (streaming)
        console.log('[Chat] Tool call IDs:', result.toolCalls.map(tc => tc.id))
        const assistantMsg: any = { role: 'assistant', content: result.full || null, tool_calls: result.toolCalls.filter((tc: any) => tc?.function?.name) }
        const followUpMsgs = [...msgs, assistantMsg, ...toolMsgs]
        // Notify frontend: tool results ready, starting follow-up — clear stale buffer
        mw?.webContents.send('chat:stage', 'followup')
        let followUp: Awaited<ReturnType<typeof doStreamChat>>
        // Follow-up: Gateway mode omits tools to avoid crash; direct mode includes them for multi-turn tool use
        try {
          followUp = await doStreamChatWithRetry(followUpMsgs, gatewayMode ? undefined : useTools, { temperature: dynamicTemp })
        } catch (fuErr: any) {
          console.warn('[Chat] Follow-up failed after retries:', fuErr?.message)
          followUp = { full: '', toolCalls: [], thinking: '' }
        }
        // DEBUG: follow-up result
        try { require('fs').appendFileSync(require('path').join(require('os').tmpdir(), 'aaronclaw-step.log'), `[${new Date().toISOString()}] FOLLOWUP: fullLen=${followUp?.full?.length||0} tc=${followUp?.toolCalls?.length||0}\n`) } catch {}
        collectedThinking += followUp.thinking
        if (followUp.full) lastText = followUp.full


        // Handle chained tool calls (model calls tools again)
        let chainDepth = 0
        let currentMsgs = followUpMsgs
        let currentResult = followUp
        while (currentResult.toolCalls.length > 0 && chainDepth < 5) {
          chainDepth++
          // Repair pipeline for chained calls
          const { calls: chainRepaired, report: chainReport } = repairer.process(currentResult.toolCalls)
          if (chainReport.notes.length > 0) console.log('[Chat] Chain repair:', chainReport.notes.join('; '))
          currentResult.toolCalls = chainRepaired
          if (currentResult.toolCalls.length === 0) break
          for (const tc of currentResult.toolCalls) {
            notifyToolCall(mw, { id: tc.id, name: tc.function.name })
          }
          const chainToolMsgs: any[] = []
          const chainPromises = currentResult.toolCalls.map(async (tc: any) => {
            collectedToolCalls.push(tc)
            let parsedArgs = {}; try { parsedArgs = JSON.parse(tc.function.arguments || '{}') } catch {}
            const paramCheck2 = validateToolParams(tc.function.name, parsedArgs)
            if (!paramCheck2.ok) {
              const errMsg = `[ParamError] ${paramCheck2.error}`
              notifyToolCall(mw, { id: tc.id, name: tc.function.name }, 'error', errMsg)
              return { msg: { role: 'tool', tool_call_id: tc.id, content: errMsg }, tcId: tc.id, result: errMsg }
            }
            parsedArgs = paramCheck2.args
            const blocked = breaker.check(tc.function.name)
            if (blocked) {
              notifyToolCall(mw, { id: tc.id, name: tc.function.name }, 'error', blocked)
              return { msg: { role: 'tool', tool_call_id: tc.id, content: blocked }, tcId: tc.id, result: blocked }
            }
            notifyToolCall(mw, { id: tc.id, name: tc.function.name }, 'running')
            // Route MCP tools to MCP client, built-in tools to executeTool
            const mcpSid = mcpToolMap.get(tc.function.name)
            let toolResult = mcpSid
              ? await callMcpTool(mcpSid, tc.function.name, parsedArgs)
              : await executeTool(tc.function.name, parsedArgs)
            let isError = toolResult.includes('[ERROR]') || (toolResult.startsWith('{') && /"error"\s*:/.test(toolResult))
            // Intelligent retry in chain loop
            if (isError) {
              const adj = RETRY_ADJUSTMENTS[tc.function.name]
              if (adj) {
                const adjArgs = adj(parsedArgs, toolResult)
                if (adjArgs) {
                  const retryR = mcpSid ? await callMcpTool(mcpSid, tc.function.name, adjArgs) : await executeTool(tc.function.name, adjArgs)
                  if (!retryR.includes('[ERROR]') && !(retryR.startsWith('{') && /"error"\s*:/.test(retryR))) {
                    toolResult = retryR
                    isError = false
                  }
                }
              }
            }
            // Self-healing in chain loop — reliable alternative first, then static fallback
            if (isError) {
              const reliableAlt = findReliableAlternative(tc.function.name)
              if (reliableAlt) {
                const altR = await executeTool(reliableAlt, parsedArgs)
                if (!altR.includes('[ERROR]') && !(altR.startsWith('{') && /"error"\s*:/.test(altR))) {
                  toolResult = `[Reliable fallback from ${tc.function.name}] ${altR}`
                  isError = false
                }
              }
            }
            if (isError) {
              const fb = SELF_HEAL_FALLBACKS[tc.function.name]
              if (fb) {
                const fbArgs = fb.mapArgs(parsedArgs, toolResult)
                const fbResult = await executeTool(fb.name, fbArgs)
                if (!fbResult.includes('[ERROR]') && !(fbResult.startsWith('{') && /"error"\s*:/.test(fbResult))) {
                  toolResult = `[Fallback from ${tc.function.name}] ${fbResult}`
                  isError = false
                }
              }
            }
            // Loop escape in chain loop
            if (isError) {
              const loopHint = checkForLoop(tc.function.name)
              if (loopHint) toolResult = loopHint + '\n' + toolResult
            }
            // Output quality detection (chain loop)
            const quality2 = checkOutputQuality(tc.function.name, toolResult)
            if (!quality2.ok && !isError) {
              console.warn(`[Chain] Output quality: ${quality2.issue}`)
              if (quality2.severity === 'error') {
                toolResult = `[QualityWarning] ${quality2.issue}\n${toolResult}`
              }
            }
            breaker.record(tc.function.name, isError)
            const chainQuality = computeResultQuality(tc.function.name, toolResult)
            recordToolCall(tc.function.name, !isError, isError ? toolResult.slice(0, 200) : undefined, chainQuality)
            const correctedResult = wrapToolResult(toolResult, tc.function.name)
            const chainOutput = toolResult.length > 500 ? toolResult.slice(0, 500) + '...' : toolResult
            notifyToolCall(mw, { id: tc.id, name: tc.function.name }, isError ? 'error' : 'done', chainOutput)
            const compressedChain = compressToolResult(tc.function.name, correctedResult)
            const truncatedContent = compressedChain.length > 30000
              ? compressedChain.slice(0, 30000) + '\n[... truncated, total ' + compressedChain.length + ' chars]'
              : compressedChain
            return { msg: { role: 'tool', tool_call_id: tc.id, content: truncatedContent }, tcId: tc.id, result: toolResult }
          })
          const chainResults = await Promise.all(chainPromises)
          for (const cr of chainResults) {
            chainToolMsgs.push(cr.msg)
            if (convId) msgAdd(convId, 'tool', cr.result.slice(0, 30000), 0, undefined, undefined, cr.tcId)
          }
          // Growth: detect repeated patterns in chain and auto-generate skills
          const chainToolNames = currentResult.toolCalls.map((tc: any) => tc.function.name)
          const chainPatternResult = detectRepeatedPattern(chainToolNames, message)
          if (chainPatternResult) {
            chainToolMsgs.push({ role: 'system', content: `[Growth] ${chainPatternResult.message}` })
            if (chainPatternResult.autoSkill) {
              try {
                const { kvUpsert } = require('./storage/db')
                kvUpsert('skills', chainPatternResult.autoSkill.id, chainPatternResult.autoSkill)
              } catch {}
            }
          }
          const chainAssistantMsg: any = { role: 'assistant', content: currentResult.full || null, tool_calls: currentResult.toolCalls.filter((tc: any) => tc?.function?.name) }
          currentMsgs = [...currentMsgs, chainAssistantMsg, ...chainToolMsgs]
          // Keep messages bounded to prevent API payload bloat
          if (currentMsgs.length > 30) {
            const sysMsgs = currentMsgs.filter(m => m.role === 'system')
            const nonSys = currentMsgs.filter(m => m.role !== 'system')
            currentMsgs = [...sysMsgs, ...nonSys.slice(-20)]
          }
          mw?.webContents.send('chat:stage', 'followup')
          currentResult = await doStreamChatWithRetry(currentMsgs, gatewayMode ? undefined : useTools)
          collectedThinking += currentResult.thinking
          if (currentResult.full) lastText = currentResult.full

        }
      } else {
        // No tool calls — result.full is the final text
      }

      // Save ONE complete message with all data
      const finalText = lastText || result.full
      if (myGen !== chatGeneration) { mw?.webContents.send('chat:done', '', '', []); return { ok: true, text: '' } }
      if (convId && finalText) {
        const validToolCalls = collectedToolCalls.filter((tc: any) => tc?.function?.name)
        const tcJson = validToolCalls.length ? JSON.stringify(validToolCalls) : undefined
        msgAdd(convId, 'assistant', finalText, 0, tcJson, collectedThinking || undefined)

        // P2-1: Task profile — save experience card when tools were used successfully
        if (validToolCalls.length > 0) {
          const toolNames = [...new Set(validToolCalls.map((tc: any) => tc.function.name))].join(', ')
          const profile = `Task: "${message.slice(0, 100)}" | Tools: ${toolNames} | Agent: ${agent?.id || 'default'} | Success`
          const memId = 'task-' + Date.now()
          smartSaveMemory(memId, profile, 'task_profile', 0.3)
          // P3-2: Log behavior for pattern recognition
          const category = agent?.id === 'stock_analyst' ? 'finance' : agent?.id === 'coder' ? 'coding' : agent?.id === 'data_scientist' ? 'data' : 'general'
          logBehavior(message.slice(0, 100), category)
        }
      }

      // DEBUG: step marker
      try { require('fs').appendFileSync(require('path').join(require('os').tmpdir(), 'aaronclaw-step.log'), `[${new Date().toISOString()}] STEP3: returning ok=true finalLen=${(finalText||'').length}\n`) } catch {}
      // Send complete message data to frontend
      mw?.webContents.send('chat:done', finalText, collectedThinking || '', collectedToolCalls)

      // P2-1: Auto-generate experience card from completed task
      try {
        if (collectedToolCalls.length > 0 && finalText && !finalText.startsWith('Error:')) {
          // P3-4: Record tool combination success
          const toolSeq = collectedToolCalls.map((tc: any) => tc.function?.name).filter(Boolean)
          if (toolSeq.length >= 2) recordToolCombination(toolSeq, true)
          const uniqueTools = [...new Set(toolSeq)]
          const userMsg = message.slice(0, 100)
          const resultSummary = finalText.slice(0, 200)
          const expId = 'exp_' + Date.now()
          const expContent = `Task: ${userMsg} | Tools: ${uniqueTools.join('→')} | Steps: ${toolSeq.length} | Result: ${resultSummary}`
          kvUpsert('memory', expId, { id: expId, content: expContent, category: 'task_experience', importance: 0.6, createdAt: new Date().toISOString() })
          try { memoryFtsUpsert(expId, expContent, 'task_experience') } catch {}

          // P2-7: Save last task state for cross-session continuity
          if (toolSeq.length >= 2) {
            try {
              const stateId = 'last_task_state'
              const stateContent = `Last task: ${userMsg} | Tools: ${uniqueTools.join(', ')} | Status: completed | Time: ${new Date().toISOString()}`
              kvUpsert('memory', stateId, { id: stateId, content: stateContent, category: 'task_state', importance: 0.8, createdAt: new Date().toISOString() })
              try { memoryFtsUpsert(stateId, stateContent, 'task_state') } catch {}
            } catch {}
          }

          // P2-2: Implicit user preference learning from tool usage
          try {
            const allMemories = cacheMemory()
            // Detect tech stack from file extensions in tool args
            const fileExts = collectedToolCalls
              .map((tc: any) => { try { const a = JSON.parse(tc.function?.arguments || '{}'); return a.path || a.file_path || '' } catch { return '' } })
              .filter(Boolean)
              .map((p: string) => { const m = p.match(/\.(\w+)$/); return m ? m[1].toLowerCase() : '' })
              .filter(Boolean)
            const extCounts: Record<string, number> = {}
            for (const ext of fileExts) extCounts[ext] = (extCounts[ext] || 0) + 1
            const topExts = Object.entries(extCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0])
            if (topExts.length > 0) {
              const existing = allMemories.find((m: any) => m.category === 'user_pref' && m.content.includes('常用文件类型'))
              const newContent = `常用文件类型: ${topExts.join(', ')}`
              if (!existing) {
                const id = 'mem-pref-ext-' + Date.now()
                kvUpsert('memory', id, { id, content: newContent, category: 'user_pref', importance: 0.4, createdAt: new Date().toISOString() })
                try { memoryFtsUpsert(id, newContent, 'user_pref') } catch {}
              }
            }
            // Detect frequently used tool combinations
            if (uniqueTools.length >= 2) {
              const comboKey = uniqueTools.sort().join('+')
              const existingCombo = allMemories.find((m: any) => m.category === 'user_pref' && m.content.includes(`常用工具组合: ${comboKey}`))
              if (!existingCombo) {
                const id = 'mem-pref-combo-' + Date.now()
                const comboContent = `常用工具组合: ${comboKey}`
                kvUpsert('memory', id, { id, content: comboContent, category: 'user_pref', importance: 0.3, createdAt: new Date().toISOString() })
                try { memoryFtsUpsert(id, comboContent, 'user_pref') } catch {}
              }
            }
          } catch {}
        }
      } catch {}

      // P3-3: Self-optimization — run analysis every 10 completions
      try {
        if (!(globalThis as any).__optCounter) (globalThis as any).__optCounter = 0
        ;(globalThis as any).__optCounter++
        if ((globalThis as any).__optCounter >= 10) {
          (globalThis as any).__optCounter = 0
          const opt = analyzeAndOptimize()
          if (opt.actions.length > 0) console.log('[Optimize]', opt.actions.join('; '))
        }
      } catch {}

      // P3-6: Performance tracking
      const perfTotal = Date.now() - perfStart
      if (perfTotal > 10000) {
        console.warn(`[Perf] Slow chat:send: ${perfTotal}ms for "${message.slice(0, 50)}..." (${collectedToolCalls.length} tools)`)
      }

      return { ok: true, text: finalText }
    } catch (e) {
      if (myGen !== chatGeneration) { mw?.webContents.send('chat:done', '', '', []); return { ok: true, text: '' } }
      const errMsg = (e as Error).message || String(e) || '未知错误'
      // Dump full error to temp file for debugging
      try {
        const debugInfo = `[${new Date().toISOString()}] errMsg="${errMsg}" type=${typeof e} constructor=${e?.constructor?.name} keys=${Object.keys(e||{}).join(',')} stack=${(e as Error)?.stack || 'no stack'}\n`
        require('fs').appendFileSync(require('path').join(require('os').tmpdir(), 'aaronclaw-error.log'), debugInfo)
      } catch {}
      try { mw?.webContents.executeJavaScript(`console.log('[Chat error]', ${JSON.stringify(errMsg)})`) } catch {}
      console.error('[Chat] Error:', errMsg, '\nStack:', (e as Error)?.stack || '')
      // Send chat:done with error so frontend doesn't stay stuck in streaming state
      mw?.webContents.send('chat:done', `Error: ${errMsg}`, '', collectedToolCalls)
      return { ok: false, error: errMsg }
    }
  })
  ipcMain.handle('chat:cancel', () => { abortCtrl?.abort(); killAllProcesses(); return true })

  // P2-5: Response quality feedback — track regenerate/fork signals
  ipcMain.handle('chat:feedback', (_, { type, convId }: { type: 'regenerate' | 'fork' | 'good'; convId?: string }) => {
    try {
      const feedbackKey = 'feedback_' + Date.now()
      const content = `Feedback: ${type} at ${new Date().toISOString()}${convId ? ' conv=' + convId : ''}`
      kvUpsert('memory', feedbackKey, { id: feedbackKey, content, category: 'quality_feedback', importance: type === 'regenerate' ? 0.8 : 0.3, createdAt: new Date().toISOString() })
      try { memoryFtsUpsert(feedbackKey, content, 'quality_feedback') } catch {}
      // Track regenerate rate for adaptive behavior
      const recentFeedbacks = cacheMemory().filter((m: any) => m.category === 'quality_feedback')
      const regenCount = recentFeedbacks.filter((m: any) => m.content.includes('regenerate')).length
      if (regenCount >= 3) {
        // High regenerate rate — save as user preference to be more careful
        const id = 'mem-pref-quality-' + Date.now()
        const hint = '用户频繁重新生成回答，应该更仔细地理解需求，回答前先确认理解是否正确'
        kvUpsert('memory', id, { id, content: hint, category: 'user_pref', importance: 0.7, createdAt: new Date().toISOString() })
        try { memoryFtsUpsert(id, hint, 'user_pref') } catch {}
      }
    } catch {}
    return { ok: true }
  })

  // Multi-agent dispatch: decompose complex task into sub-tasks, execute with best agent for each
  ipcMain.handle('chat:dispatch', async (_, { message, convId }) => {
    const mw = mainWindow
    const port = getOpenClawPort()
    const config = kvGet('config', 'main') || {}
    const agents = kvList('agents').filter((a: any) => a.enabled !== false)
    if (agents.length === 0) return { ok: false, error: 'No agents available' }

    // Step 1: Plan — ask LLM to decompose task
    const agentList = agents.map((a: any) => `- ${a.id}: ${a.name} (${a.description || 'general'})`).join('\n')
    const planPrompt = `You are a task planner. Decompose the following task into 2-4 sub-tasks. For each sub-task, assign the best agent.

Available agents:
${agentList}

Task: ${message}

Reply in JSON format ONLY (no markdown):
[{"subtask": "description", "agentId": "agent-id", "depends": []}]
If the task is simple (single domain), return just one sub-task.`

    try {
      const planText = await gatewayChat(port, config.ai?.model || 'openclaw', [{ role: 'user', content: planPrompt }]) || '[]'

      // Parse plan (handle markdown code blocks)
      let plan: any[]
      try {
        const cleaned = planText.replace(/```json?\s*/g, '').replace(/```/g, '').trim()
        plan = JSON.parse(cleaned)
      } catch { plan = [{ subtask: message, agentId: agents[0].id, depends: [] }] }

      if (!Array.isArray(plan) || plan.length === 0) plan = [{ subtask: message, agentId: agents[0].id, depends: [] }]
      if (plan.length === 1) {
        // Simple task — just use chat:send directly
        return { ok: true, mode: 'single', plan }
      }

      // Step 2: Execute sub-tasks (parallel where possible)
      mw?.webContents.send('chat:dispatch:start', { plan, total: plan.length })
      const results: any[] = []
      const completed: Record<string, string> = {}

      // Topological sort — execute tasks with no unmet dependencies first
      const pending = [...plan]
      let iter = 0
      while (pending.length > 0 && iter < 10) {
        iter++
        const ready = pending.filter(t => (t.depends || []).every((d: string) => completed[d]))
        if (ready.length === 0) { /* circular dep fallback */ pending.splice(0, 1).forEach(t => ready.push(t)) }

        const batchResults = await Promise.allSettled(ready.map(async (task, idx) => {
          const agent = agents.find((a: any) => a.id === task.agentId) || agents[0]
          const depContext = (task.depends || []).map((d: string) => completed[d]).filter(Boolean).join('\n\n')
          const fullMsg = depContext ? `Previous results:\n${depContext}\n\nCurrent task: ${task.subtask}` : task.subtask

          mw?.webContents.send('chat:dispatch:progress', { subtask: task.subtask, agentId: agent.id, status: 'running' })

          const text = await gatewayChat(port, agent.model || config.ai?.model || 'openclaw', [
            ...(agent ? [{ role: 'system', content: buildSystemPrompt(agent, agent.skills || []) }] : []),
            { role: 'user', content: fullMsg }
          ], 60000)
          return { subtask: task.subtask, agentId: agent.id, agentName: agent.name, result: text }
        }))

        for (let i = 0; i < ready.length; i++) {
          const task = ready[i]
          const r = batchResults[i]
          const result = r.status === 'fulfilled' ? r.value : { subtask: task.subtask, agentId: task.agentId, result: 'Error: ' + (r as any).reason?.message }
          results.push(result)
          completed[task.subtask] = result.result
          mw?.webContents.send('chat:dispatch:progress', { subtask: task.subtask, agentId: task.agentId, status: 'done' })
        }
        for (const t of ready) pending.splice(pending.indexOf(t), 1)
      }

      // Step 3: Merge results
      const mergePrompt = `Merge these sub-task results into a coherent response for the user.

Original task: ${message}

Results:
${results.map((r, i) => `[${r.agentName}] ${r.subtask}:\n${r.result}`).join('\n\n---\n\n')}

Provide a unified, well-structured response.`

      const finalText = await gatewayChat(port, config.ai?.model || 'openclaw', [{ role: 'user', content: mergePrompt }]) || results.map(r => `**${r.agentName}**: ${r.result}`).join('\n\n')

      if (convId) msgAdd(convId, 'user', message)
      if (convId) msgAdd(convId, 'assistant', finalText)
      mw?.webContents.send('chat:dispatch:done', { finalText, subTasks: results })
      mw?.webContents.send('chat:done', finalText, '', [])
      return { ok: true, mode: 'multi', text: finalText, subTasks: results }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // Files
  ipcMain.handle('files:list', (_, dir) => {
    const base = dir || app.getPath('home')
    if (!isPathAllowed(base)) return []
    try {
      return readdirSync(base, { withFileTypes: true }).filter(e => !e.name.startsWith('.')).map(e => {
        const full = join(base, e.name); let st = {} as any; try { st = statSync(full) } catch {}
        return { name: e.name, path: full, isDir: e.isDirectory(), size: st.size || 0, modified: st.mtime?.toISOString() || '' }
      }).sort((a, b) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0) || a.name.localeCompare(b.name))
    } catch { return [] }
  })
  ipcMain.handle('files:openExternal', (_, fp) => {
    if (!isPathAllowed(fp)) return
    shell.openPath(fp)
  })

  // System
  ipcMain.handle('system:info', () => ({
    version: app.getVersion(), platform: process.platform, arch: process.arch,
    electron: process.versions.electron, chrome: process.versions.chrome,
    node: process.versions.node, userData: app.getPath('userData')
  }))
  ipcMain.handle('settings:get', (_, key) => { const s = kvGet('settings', key); return s })
  ipcMain.handle('settings:set', (_, key, value) => { kvUpsert('settings', key, value) })

  // Draft
  ipcMain.handle('draft:save', (_, convId, text) => { kvUpsert('drafts', convId, { text, savedAt: new Date().toISOString() }) })
  ipcMain.handle('draft:get', (_, convId) => { const d = kvGet('drafts', convId); return d?.text || '' })

  // Data backup/restore
  ipcMain.handle('data:export', () => {
    const backupDir = join(getDataDir(), 'backups', 'export-' + Date.now())
    mkdirSync(backupDir, { recursive: true })
    const dbPath = join(getDataDir(), 'aaronclaw.db')
    if (existsSync(dbPath)) { copyFileSync(dbPath, join(backupDir, 'aaronclaw.db')); return { ok: true, path: backupDir } }
    return { ok: false, error: 'DB not found' }
  })
  ipcMain.handle('data:import', (_, path) => {
    try {
      const src = join(path, 'aaronclaw.db')
      if (existsSync(src)) { copyFileSync(src, join(getDataDir(), 'aaronclaw.db')); return { ok: true } }
      return { ok: false, error: 'Backup file not found' }
    } catch (e) { return errorResult(e) }
  })

  // Health check
  ipcMain.handle('health:check', async () => {
    const port = getOpenClawPort()
    const gateway = await gatewayHealth(port)
    return { gateway, port }
  })

  // Encryption
  ipcMain.handle('crypto:encrypt', (_, text) => {
    try { const { safeStorage } = require('electron'); if (!safeStorage.isEncryptionAvailable()) return text; return safeStorage.encryptString(text).toString('base64') } catch { return text }
  })
  ipcMain.handle('crypto:decrypt', (_, encoded) => {
    try { const { safeStorage } = require('electron'); if (!safeStorage.isEncryptionAvailable()) return encoded; return safeStorage.decryptString(Buffer.from(encoded, 'base64')) } catch { return encoded }
  })

  // Notifications
  ipcMain.handle('notify', (_, title, body) => {
    const cfg = loadConfig()
    if (cfg.notifications?.desktop === false) return
    try { const { Notification } = require('electron'); if (Notification.isSupported()) new Notification({ title, body }).show() } catch {}
  })

 // ======== // Missing IPC Handlers (from audit) ========

 // RAG (知识
  ipcMain.handle('rag:import', (_, filePath) => {
    if (!isPathAllowed(filePath)) return { ok: false, error: 'Access denied: path outside allowed directories' }
    try {
      const content = readFileSync(filePath, 'utf8').slice(0, 100000)
      const id = 'rag-' + Date.now()
      const filename = filePath.split(/[\\/]/).pop() || filePath
      const chunkCount = Math.max(1, Math.ceil(content.length / 500))
      kvUpsert('rag', id, { id, filename, path: filePath, content, chunkCount, createdAt: new Date().toISOString() })
      return { ok: true, id }
    } catch (e) { return errorResult(e) }
  })
  ipcMain.handle('rag:list', () => kvList('rag'))
  ipcMain.handle('rag:delete', (_, id) => { kvDelete('rag', id) })
  ipcMain.handle('rag:search', (_, query, topK?) => {
    const items: any[] = kvList('rag')
    const q = query.toLowerCase()
    const qWords = q.split(/\s+/).filter((w: string) => w.length > 1)
    const results: any[] = []
    for (const doc of items) {
      const content = (doc.content || '').toLowerCase()
      if (qWords.length > 1 && !qWords.every((w: string) => content.includes(w))) continue
      const chunks = doc.content.match(/[\s\S]{1,500}/g) || [doc.content]
      for (const chunk of chunks) {
        const chunkLower = chunk.toLowerCase()
        const matchCount = qWords.filter((w: string) => chunkLower.includes(w)).length
        if (matchCount === 0) continue
        const score = Math.min(1, matchCount / Math.max(1, qWords.length) * 0.8 + 0.1)
        results.push({ text: chunk.trim(), score, docId: doc.id })
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, topK || 5)
  })

  // Workflow
  ipcMain.handle('wf:list', () => kvList('workflows'))
  ipcMain.handle('wf:save', (_, wf) => { kvUpsert('workflows', wf.id, wf) })
  ipcMain.handle('wf:delete', (_, id) => { kvDelete('workflows', id) })
  ipcMain.handle('wf:execute', async (_, id, input?) => {
    const wf: any = kvGet('workflows', id)
    if (!wf) return { success: false, output: 'Workflow not found', steps: [] }
    const port = getOpenClawPort()
    const nodes = wf.nodes || []
    const nodeMap = new Map(nodes.map((n: any) => [n.id, n]))
    const allAgents = kvList('agents')
    const steps: any[] = []; let currentInput = input || ''; let success = true
    let currentNode = nodes.find((n: any) => n.type === 'trigger') || nodes[0]
    const visited = new Set<string>()
    while (currentNode && !visited.has(currentNode.id)) {
      visited.add(currentNode.id)
      const start = Date.now()
      try {
        if (currentNode.type === 'trigger') {
          steps.push({ nodeId: currentNode.id, type: 'trigger', input: currentInput, output: currentInput, duration: 0 })
        } else if (currentNode.type === 'agent') {
          const msgs: any[] = []
          const nodeAgent = allAgents.find((a: any) => a.id === currentNode.config?.agentId)
          const nodeBasePrompt = buildSystemPrompt(nodeAgent || { identity: currentNode.config?.role || '助手', expertise: currentNode.config?.systemPrompt || '' }, [])
          msgs.push({ role: 'system', content: nodeBasePrompt })
          msgs.push({ role: 'user', content: currentInput })
          currentInput = await gatewayChat(port, currentNode.config?.model || 'openclaw', msgs)
          steps.push({ nodeId: currentNode.id, type: 'agent', input: currentInput.slice(0, 200), output: currentInput.slice(0, 500), duration: Date.now() - start })
        } else if (currentNode.type === 'tool') {
          const result = await executeTool(currentNode.config?.toolName || 'web_search', { query: currentInput })
          steps.push({ nodeId: currentNode.id, type: 'tool', input: currentInput, output: result.slice(0, 500), duration: Date.now() - start })
          currentInput = result
        } else if (currentNode.type === 'condition') {
          const keywords: string[] = currentNode.config?.keywords || []
          const matched = keywords.some((k: string) => currentInput.includes(k))
          const nextId = matched ? currentNode.next?.[0] : currentNode.next?.[1]
          steps.push({ nodeId: currentNode.id, type: 'condition', input: currentInput, output: `branch: ${matched}`, duration: Date.now() - start })
          currentNode = nextId ? nodeMap.get(nextId) : null
          continue
        } else if (currentNode.type === 'output') {
          steps.push({ nodeId: currentNode.id, type: 'output', input: currentInput, output: currentInput, duration: Date.now() - start })
        } else {
          steps.push({ nodeId: currentNode.id, type: currentNode.type, input: currentInput, output: currentInput, duration: Date.now() - start })
        }
      } catch (e) {
        success = false
        steps.push({ nodeId: currentNode.id, type: currentNode.type, input: currentInput, output: 'Error: ' + (e as Error).message, duration: Date.now() - start })
      }
      const nextId = currentNode.next?.[0]
      currentNode = nextId ? nodeMap.get(nextId) : null
    }
    return { success, output: currentInput, steps }
  })
  ipcMain.handle('wf:presets', () => [
    { id: 'wf-chat', name: '\u5bf9\u8bdd\u5de5\u4f5c\u6d41', enabled: true, createdAt: new Date().toISOString(), nodes: [
      { id: 'n1', type: 'trigger', config: {}, next: ['n2'] },
      { id: 'n2', type: 'agent', config: { model: 'openclaw' }, next: ['n3'] },
      { id: 'n3', type: 'output', config: {}, next: [] },
    ]},
    { id: 'wf-research', name: '\u7814\u7a76\u5de5\u4f5c\u6d41', enabled: true, createdAt: new Date().toISOString(), nodes: [
      { id: 'n1', type: 'trigger', config: {}, next: ['n2'] },
      { id: 'n2', type: 'search', config: {}, next: ['n3'] },
      { id: 'n3', type: 'agent', config: { model: 'openclaw' }, next: ['n4'] },
      { id: 'n4', type: 'output', config: {}, next: [] },
    ]},
    { id: 'wf-code', name: '\u4ee3\u7801\u5ba1\u67e5\u6d41', enabled: true, createdAt: new Date().toISOString(), nodes: [
      { id: 'n1', type: 'trigger', config: {}, next: ['n2'] },
      { id: 'n2', type: 'agent', config: { model: 'openclaw' }, next: ['n3'] },
      { id: 'n3', type: 'output', config: {}, next: [] },
    ]},
  ])

  // Backup
  ipcMain.handle('backup:create', () => {
    try {
      const backupDir = join(getDataDir(), 'backups', 'backup-' + Date.now())
      mkdirSync(backupDir, { recursive: true })
      const dbPath = join(getDataDir(), 'aaronclaw.db')
      if (existsSync(dbPath)) {
        copyFileSync(dbPath, join(backupDir, 'aaronclaw.db'))
        const st = statSync(join(backupDir, 'aaronclaw.db'))
        return { timestamp: new Date().toISOString(), size: st.size, messages: 0, conversations: kvList('conversations').length, path: backupDir }
      }
      return null
    } catch { return null }
  })
  ipcMain.handle('backup:list', () => {
    try {
      const backupDir = join(getDataDir(), 'backups')
      if (!existsSync(backupDir)) return []
      return readdirSync(backupDir).filter(f => f.startsWith('backup-') || f.startsWith('export-')).map(f => {
        const p = join(backupDir, f)
        const st = statSync(p)
        return { timestamp: st.mtime.toISOString(), size: st.size, messages: 0, conversations: 0, path: p }
      }).sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    } catch { return [] }
  })
  ipcMain.handle('backup:restore', (_, backupPath) => {
    try {
      const src = join(backupPath, 'aaronclaw.db')
      if (existsSync(src)) {
        const dbPath = join(getDataDir(), 'aaronclaw.db')
        copyFileSync(dbPath, dbPath + '.bak')
        closeDB()
        copyFileSync(src, dbPath)
        initDB(getDataDir())
        return { ok: true }
      }
      return { ok: false, error: 'Backup file not found' }
    } catch (e) { return errorResult(e) }
  })

  // Cron history
  ipcMain.handle('cron:history', () => kvList('cron_history').slice(-50))

  // Prompts
  ipcMain.handle('prompts:list', () => kvList('prompts'))
  ipcMain.handle('prompts:save', (_, p) => { kvUpsert('prompts', p.id, p) })
  ipcMain.handle('prompts:delete', (_, id) => { kvDelete('prompts', id) })

  // Logs
  ipcMain.handle('logs:list', () => {
    try {
      const logDir = join(app.getPath('userData'), 'logs')
      if (!existsSync(logDir)) return []
      return readdirSync(logDir).filter(f => f.endsWith('.log')).map(f => ({
        name: f,
        path: join(logDir, f),
        size: statSync(join(logDir, f)).size
      }))
    } catch { return [] }
  })
  ipcMain.handle('logs:read', (_, logPath) => {
    try { return readFileSync(logPath, 'utf8').slice(-10000) } catch { return '' }
  })
  ipcMain.handle('logs:dir', () => join(app.getPath('userData'), 'logs'))

  // Gateway circuit breaker
  ipcMain.handle('gateway:circuit', () => {
    const port = getOpenClawPort()
    return fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) })
      .then(() => ({ state: 'closed', failures: 0 }))
      .catch(() => ({ state: 'open', failures: 1 }))
  })

  // Search messages
  ipcMain.handle('search:messages', (_, query, limit?) => searchMessages(query, limit || 20))

  // Conv fork
  ipcMain.handle('conv:fork', (_, convId, idx?) => {
    const msgs = msgList(convId)
    const newId = randomUUID()
    const now = new Date().toISOString()
    const srcConv = kvGet('conversations', convId)
    kvUpsert('conversations', newId, { id: newId, title: (srcConv?.title || 'Fork') + ' (fork)', model: srcConv?.model, createdAt: now, updatedAt: now })
    const forkMsgs = typeof idx === 'number' ? msgs.slice(0, idx + 1) : msgs
    if (forkMsgs.length > 0) {
      const stmt = getDB().prepare('INSERT INTO messages (id, conv_id, role, content, tokens) VALUES (?, ?, ?, ?, ?)')
      transaction(() => {
        for (const m of forkMsgs) {
          const msgId = 'msg-' + Date.now() + '-' + randomUUID().slice(0, 8)
          stmt.run(msgId, newId, (m as any).role, (m as any).content, (m as any).tokens || 0)
        }
      })
    }
    return newId
  })

  // Capabilities
  ipcMain.handle('cap:tts', async (_, text, voice?) => {
    const port = getOpenClawPort()
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/v1/audio/speech`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'tts-1', input: text, voice: voice || 'alloy', response_format: 'mp3' }),
        signal: AbortSignal.timeout(30000)
      })
      if (!resp.ok) return { ok: false, error: await resp.text() }
      const buf = Buffer.from(await resp.arrayBuffer())
      const audioPath = join(getDataDir(), 'tts-' + Date.now() + '.mp3')
      writeFileSync(audioPath, buf)
      return { ok: true, path: audioPath }
    } catch (e) { return errorResult(e) }
  })
  ipcMain.handle('cap:imageGen', async (_, prompt, size?) => {
    const port = getOpenClawPort()
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/v1/images/generations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: size || '1024x1024', response_format: 'url' }),
        signal: AbortSignal.timeout(60000)
      })
      const data = await resp.json()
      return { ok: true, url: data.data?.[0]?.url, revised_prompt: data.data?.[0]?.revised_prompt }
    } catch (e) { return errorResult(e) }
  })
  ipcMain.handle('cap:transcribe', async (_, audioPath) => {
    const port = getOpenClawPort()
    try {
      const audioBuf = readFileSync(audioPath)
      const blob = new Blob([audioBuf], { type: 'audio/mp3' })
      const form = new FormData()
      form.append('file', blob, 'audio.mp3')
      form.append('model', 'whisper-1')
      const resp = await fetch(`http://127.0.0.1:${port}/v1/audio/transcriptions`, { method: 'POST', body: form, signal: AbortSignal.timeout(60000) })
      const data = await resp.json()
      return { ok: true, text: data.text }
    } catch (e) { return errorResult(e) }
  })
  ipcMain.handle('cap:docExtract', async (_, filePath) => {
    if (!isPathAllowed(filePath)) return { ok: false, error: 'Access denied: path outside allowed directories' }
    try {
      const content = readFileSync(filePath, 'utf8').slice(0, 50000)
      return { ok: true, content, filename: filePath.split(/[\\/]/).pop() }
    } catch (e) { return errorResult(e) }
  })
  ipcMain.handle('cap:webSearch', async (_, query) => {
    try {
      const resp = await fetch(`https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=5`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
        signal: AbortSignal.timeout(10000)
      })
      const html = await resp.text()
      const results: string[] = []
      const re = /<h3[^>]*class="t"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/gi
      let m
      while ((m = re.exec(html)) !== null && results.length < 5) {
        const title = m[2].replace(/<[^>]+>/g, '').trim()
        if (title) results.push((results.length + 1) + '. ' + title + ' | ' + m[1])
      }
      if (results.length === 0) return { ok: true, results: 'No results found for: ' + query }
      return { ok: true, results: results.join(String.fromCharCode(10)) }
    } catch (e) { return errorResult(e) }
  })
  ipcMain.handle('cap:embed', async (_, text) => {
    const port = getOpenClawPort()
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/v1/embeddings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
        signal: AbortSignal.timeout(15000)
      })
      const data = await resp.json()
      return { ok: true, embedding: data.data?.[0]?.embedding }
    } catch (e) { return errorResult(e) }
  })
    // Voice recording
  const MAX_VOICE_SIZE = 50 * 1024 * 1024 // 50MB limit
  let voiceChunks: Buffer[] = []
  let voiceTotalSize = 0
  ipcMain.handle('voice:start', () => { voiceChunks = []; voiceTotalSize = 0; return { ok: true } })
  ipcMain.handle('voice:chunk', (_, base64Chunk: string) => {
    const buf = Buffer.from(base64Chunk, 'base64')
    voiceTotalSize += buf.length
    if (voiceTotalSize > MAX_VOICE_SIZE) return { ok: false, error: 'Audio too large (>50MB)' }
    voiceChunks.push(buf)
    return { ok: true }
  })
  ipcMain.handle('voice:stop', async () => {
    try {
      const audioBuffer = Buffer.concat(voiceChunks)
      const audioPath = join(getDataDir(), 'voice-' + Date.now() + '.webm')
      writeFileSync(audioPath, audioBuffer)
      // Transcribe via Gateway
      const port = getOpenClawPort()
      const blob = new Blob([audioBuffer], { type: 'audio/webm' })
      const form = new FormData()
      form.append('file', blob, 'audio.webm')
      form.append('model', 'whisper-1')
      const resp = await fetch('http://127.0.0.1:' + port + '/v1/audio/transcriptions', { method: 'POST', body: form, signal: AbortSignal.timeout(60000) })
      const data = await resp.json()
      voiceChunks = []
      return { ok: true, text: data.text || '' }
    } catch (e) { voiceChunks = []; return { ok: false, error: (e as Error).message } }
  })

  ipcMain.handle('cap:playAudio', (_, audioPath) => {
    try {
      // Clean old TTS files (older than 1 hour)
      const dataDir = getDataDir()
      const now = Date.now()
      try {
        for (const f of readdirSync(dataDir)) {
          if (f.startsWith('tts-') && f.endsWith('.mp3')) {
            const fp = join(dataDir, f)
            if (now - statSync(fp).mtimeMs > 3600000) require('fs').unlinkSync(fp)
          }
        }
      } catch {}
      return { ok: true }
    } catch (e) { return errorResult(e) }
  })
}

// ======== Gateway Port Scan ========
async function warmGatewayPort() {
  for (const p of [51345, 18789, 18788]) {
    try {
      const resp = await fetch(`http://127.0.0.1:${p}/health`, { signal: AbortSignal.timeout(1000) })
      if (resp.ok) { cachedPort = p; console.log('[Gateway] Found live Gateway on port', p); return }
    } catch {}
  }
}

// ======== Gateway Auto-Start ========
let gatewayProcess: any = null

function autoStartGateway() {
  setTimeout(async () => {
    // Scan for live Gateway port first (overrides stale cachedPort)
    await warmGatewayPort()
    try {
      const port = getOpenClawPort()
      fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) })
        .then(() => console.log('[Gateway] Already running on port', port))
        .catch(() => {
          try {
            const resDir = app.isPackaged ? process.resourcesPath : join(__dirname, '..', 'resources')
            const nodeBin = join(resDir, 'node.exe')
            const ocEntry = join(resDir, 'openclaw', 'openclaw.mjs')
            if (existsSync(nodeBin) && existsSync(ocEntry)) {
              gatewayProcess = execFile(nodeBin, [ocEntry, 'gateway'], { windowsHide: true })
              gatewayProcess.stdout?.on('data', (d: string) => console.log('[Gateway]', d.toString().trim()))
              gatewayProcess.stderr?.on('data', (d: string) => console.log('[Gateway]', d.toString().trim()))
              gatewayProcess.on('exit', (code: number) => console.log('[Gateway] Exited with code', code))
              console.log('[Gateway] Started via bundled node + openclaw on port', port)
              return
            }
            gatewayProcess = exec('openclaw gateway', { windowsHide: true })
            console.log('[Gateway] Started via system CLI on port', port)
          } catch (e) { console.log('[Gateway] Start failed:', (e as Error).message) }
        })
    } catch (e) { console.log('[Gateway] Auto-start error:', (e as Error).message) }
  }, 2000)
}

// ======== // Global Error Handling ========
process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.message || String(reason)
  // Only suppress Gateway health-check connection errors (127.0.0.1:port)
  if (reason?.code === 'ECONNREFUSED' && msg.includes('127.0.0.1')) {
    console.log('[Gateway] Connection refused (expected if Gateway not running)')
  } else {
    console.error('[Unhandled Rejection]', reason)
  }
})

// ======== // App ========
app.whenReady().then(() => {
  initDB(getDataDir())
  runMigrations()
  migrateFromJSON()
  seedDefaults()
  // Run memory maintenance on startup (decay old, deduplicate, enforce caps)
  try { runMemoryMaintenance() } catch (e) { logger.error('Startup', 'Memory maintenance failed', e) }
  // Load persisted behavior log for proactive suggestions
  try { loadBehaviorLog() } catch {}
  try { loadBehaviorMode() } catch {}
  // Load persisted tool stats for self-learning
  try { loadToolStats() } catch {}
  // Load persisted pattern counts for auto skill generation
  try { loadPatternCounts() } catch {}
  setupIPC()
  createWindow()
  createTray()
  startCronScheduler()
  autoStartGateway()
  // GitHub 镜像预热(异步，不阻塞启动)
  warmupMirrors().catch(() => {})
  // 知识技能引擎初始化
  try { initSkillEngine() } catch {}
  // MCP removed — caused timeouts in China
})

app.on('before-quit', () => { tray?.destroy(); if (gatewayProcess) { gatewayProcess.kill(); gatewayProcess = null } })
app.on('window-all-closed', () => { closeDB(); if (process.platform !== 'darwin') app.quit() })













