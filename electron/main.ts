import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { exec, execFile } from 'child_process'
import { executeTool, killAllProcesses, isPathAllowed, recordToolCall, validateToolParams, checkOutputQuality, loadToolStats, compressToolResult, translateError, getReliableTools, getUnreliableTools, getToolStats, computeResultQuality, recordToolCombination, getReliableCombinations, getSlowTools, getErrorContext } from './ipc/tool-executor'
import { buildSystemPrompt, BASE_PROMPT, detectMultiStepTask, extractSteps, startTaskTracking, getTaskProgressHint, clearTaskTracking } from './ipc/orchestrator'
import { initSkillEngine, matchSkills, buildSkillInjection, importSkillFromMarkdown } from './ipc/skill-engine'
import { withRetry, classifyError } from './ipc/retry-engine'
import './ipc/builtin-skills'
import { cacheAgents, cacheMemory, cacheProviders, cacheModels, cacheSkills, cacheRag, cacheConfig } from './ipc/chat-cache'
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
  if (toolFailures >= 5) {
    recentFailures.length = 0 // Reset after triggering
    return `[LoopEscape] "${toolName}" has failed ${toolFailures} times. DO NOT use "${toolName}" again. Use a COMPLETELY DIFFERENT tool or approach. For example: if terminal failed, try code_execute; if search failed, try read_url; if a command failed, try a simpler version. You MUST call a different tool NOW.`
  }
  return null
}
import { selectTools, parseTextToolCalls } from './ipc/tools'
import { learnFromFeedback, selectModel, classifyIntent, logBehavior, getProactiveSuggestions, resetIntentState, loadBehaviorLog, setEmotionalContext, summarizeConversation, detectRepeatedPattern, getContextualGreeting, resetBehaviorMode, getUnifiedResponseGuidance, getExperienceHint, loadPatternCounts, getTopPatterns, analyzeAndOptimize, loadBehaviorMode, detectEnhancedFeedback, recordFeedback, getFeedbackContext } from './ipc/feedback'
import { streamChat as llmStreamChat, wrapToolResult, type StreamContext } from './ipc/llm'
import { seedDefaults, migrateFromJSON } from './ipc/seed'
import { connectMcpServer, disconnectMcpServer, callMcpTool, getMcpTools, getMcpStatus, initInternalMcpServer, refreshInternalMcpServer } from './ipc/mcp-client'
import { getUnhealthyTools, getToolHealthReport, validateCustomSkill } from './ipc/tool-health'
import { runMemoryMaintenance, smartSaveMemory, dreamConsolidate } from './ipc/memory-manager'
import { speak, getVoices, stop as stopTts } from './ipc/tts'
import { checkPermission, getPermissions, savePermission } from './ipc/permissions'
import { getTemplatesForAgent, getAllTemplates, saveTemplate } from './ipc/templates'
import { screenshot, click, typeText, scroll, getScreenSize } from './ipc/computer-use'
import { navigate as browserNavigate, getContent as browserGetContent, click as browserClick, type as browserType, screenshot as browserScreenshot, extractLinks as browserExtractLinks, close as browserClose } from './ipc/browser-agent'
import { createEvent, listEvents, getUpcoming, getToday, updateEvent, deleteEvent, getDueReminders } from './ipc/calendar'
import { generateCandidates, judgeCandidates } from './ipc/max-mode'
import { analyzeConversations, saveDistilledSkill, getDistilledSkills, distillFromConversation } from './ipc/distill'
import { startCronScheduler } from './ipc/cron-scheduler'
import { warmupMirrors } from './ipc/github-mirror'
import { analyzeTask, createSmartTeam, buildWorkflow, routeTask } from './ipc/smart-collab'
import { createGoal, getGoals, updateGoal, deleteGoal } from './ipc/background-goals'
import { buildMemoryConstraints, detectConflicts } from './ipc/memory-enforcer'
import { logger } from './ipc/logger'

import { randomUUID } from 'crypto'
import { Agent as UndiciAgent } from 'undici'

// A05: HTTP Keep-Alive agent for LLM API calls
const keepAliveAgent = new UndiciAgent({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 600_000, connections: 2 })
import { initDB, kvList, kvGet, kvUpsert, kvDelete, msgList, msgAdd, msgDeleteByConv, gcMsgList, gcMsgAdd, gcMsgBookmark, gcMsgPin, gcMsgBookmarked, gcMsgPinned, gcMsgDeleteByGroup, searchMessages, closeDB, memoryFtsUpsert, memoryFtsDelete, memoryFtsSearch, semanticSearch, ragFtsUpsert, ragFtsDelete, ragFtsSearch, transaction, getDB } from './storage/db'
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
  // Allow microphone for voice input
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') { callback(true); return }
    callback(false)
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
  ipcMain.handle('conv:updateTitle', (_, cid, title) => {
    const conv = kvGet('conversations', cid)
    if (conv) { conv.title = title; kvUpsert('conversations', cid, conv) }
    return true
  })

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
  ipcMain.handle('skills:save', (_, item) => { kvUpsert('skills', item.id, item); try { refreshInternalMcpServer() } catch {} })
  ipcMain.handle('skills:delete', (_, id) => { kvDelete('skills', id); try { refreshInternalMcpServer() } catch {} })
  ipcMain.handle('skills:toggle', (_, id, en) => { const item = kvGet('skills', id); if (item) { item.enabled = en; kvUpsert('skills', id, item); try { refreshInternalMcpServer() } catch {} } })

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
  ipcMain.handle('skills:market', () => {
    try {
      const paths = [
        join(app.getAppPath(), 'data', 'skills-market.json'),
        join(__dirname, '..', 'data', 'skills-market.json'),
        join(process.cwd(), 'data', 'skills-market.json'),
        join(app.getPath('userData'), 'data', 'skills-market.json'),
      ]
      for (const p of paths) {
        if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'))
      }
      // Fallback: embedded market data
      return [
        { id: 'market-stock-pro', name: '高级选股器', description: '多维度条件选股，技术面+基本面+资金面组合筛选', category: '金融', author: 'AaronClaw', version: '1.0', skills: ['stock_quote','stock_kline','stock_finance','stock_screener','chart_generate'] },
        { id: 'market-web-scraper', name: '网页抓取器', description: '智能网页抓取，自动提取正文，支持批量', category: '工具', author: 'AaronClaw', version: '1.0', skills: ['read_url','write_file'] },
        { id: 'market-translate-pro', name: '专业翻译', description: '中英日韩翻译，专业术语行业标准译法', category: '写作', author: 'AaronClaw', version: '1.0', skills: ['translate','text_stats'] },
        { id: 'market-data-viz', name: '数据可视化', description: '自动生成图表、仪表盘、数据报告', category: '分析', author: 'AaronClaw', version: '1.0', skills: ['chart_generate','data_analyze','data_profile'] },
        { id: 'market-code-review', name: '代码审查专家', description: '自动审查代码质量、安全性、性能', category: '开发', author: 'AaronClaw', version: '1.0', skills: ['code_review','project_scan','code_execute'] },
        { id: 'market-news-digest', name: '新闻简报', description: '每日新闻摘要、行业动态追踪', category: '生活', author: 'AaronClaw', version: '1.0', skills: ['news_search','daily_briefing','hot_search'] },
      ]
    } catch { return [] }
  })
  ipcMain.handle('skills:installFromMarket', (_, skill: any) => {
    try {
      const id = 'user-' + (skill.id || skill.name).toLowerCase().replace(/[^a-z0-9]/g, '-')
      const installed = { id, name: skill.name, description: skill.description, category: skill.category, source: 'market', enabled: true, execute: skill.execute || '', params: skill.params || '' }
      kvUpsert('skills', id, installed)
      try { refreshInternalMcpServer() } catch {}
      return { ok: true, id }
    } catch (e: any) { return { ok: false, error: e?.message } }
  })
  ipcMain.handle('skills:import', (_, content: string, source?: string) => {
    try {
      const result = importSkillFromMarkdown(content, source)
      if (result.ok && result.skill) {
        kvUpsert('skills', result.skill.id, result.skill)
        try { refreshInternalMcpServer() } catch {}
      }
      return result
    } catch (e: any) { return { ok: false, error: e?.message } }
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
    const ftsResults = semanticSearch(query, 10)
    if (ftsResults.length > 0) return ftsResults.map(r => ({ id: r.id, content: r.content, category: r.category }))
    return kvList('memory').filter((m: any) => m.content.toLowerCase().includes(query.toLowerCase()))
  })
  ipcMain.handle('memory:dream', async () => {
    try { return await dreamConsolidate() } catch (e: any) { return { consolidated: 0, removed: 0, insights: [e?.message] } }
  })

  // TTS
  ipcMain.handle('tts:speak', async (_, text: string, voice?: string) => {
    try { return await speak(text, voice) } catch (e: any) { return { ok: false, error: e?.message } }
  })
  ipcMain.handle('tts:voices', async () => {
    try { return await getVoices() } catch { return [] }
  })
  ipcMain.handle('tts:stop', async () => {
    try { stopTts(); return { ok: true } } catch { return { ok: false } }
  })

  // Permissions
  ipcMain.handle('permissions:check', (_, context: any) => {
    try { return checkPermission(context) } catch { return { level: 'allow' } }
  })
  ipcMain.handle('permissions:list', () => {
    try { return getPermissions() } catch { return [] }
  })
  ipcMain.handle('permissions:save', (_: any, rule: any) => {
    try { savePermission(rule); return { ok: true } } catch { return { ok: false } }
  })

  // Templates
  ipcMain.handle('templates:list', () => {
    try { return getAllTemplates() } catch { return [] }
  })
  ipcMain.handle('templates:forAgent', (_, agentId: string) => {
    try { return getTemplatesForAgent(agentId) } catch { return [] }
  })
  ipcMain.handle('templates:save', (_: any, template: any) => {
    try { saveTemplate(template); return { ok: true } } catch { return { ok: false } }
  })

  // Computer Use
  ipcMain.handle('computer:screenshot', async (_, region?: any) => {
    try { return await screenshot(region) } catch (e: any) { return { ok: false, error: e?.message } }
  })
  ipcMain.handle('computer:click', async (_, x: number, y: number, button?: string) => {
    try { return await click(x, y, button as any) } catch (e: any) { return { ok: false, error: e?.message } }
  })
  ipcMain.handle('computer:type', async (_, text: string) => {
    try { return await typeText(text) } catch (e: any) { return { ok: false, error: e?.message } }
  })
  ipcMain.handle('computer:scroll', async (_, direction: string, amount?: number) => {
    try { return await scroll(direction as any, amount) } catch (e: any) { return { ok: false, error: e?.message } }
  })
  ipcMain.handle('computer:screenSize', async () => {
    try { return await getScreenSize() } catch { return { width: 1920, height: 1080 } }
  })

  // Browser Agent
  ipcMain.handle('browser:navigate', async (_, url: string) => {
    try { return await browserNavigate(url) } catch (e: any) { return { ok: false, error: e?.message } }
  })
  ipcMain.handle('browser:getContent', async () => {
    try { return await browserGetContent() } catch (e: any) { return { ok: false, error: e?.message } }
  })
  ipcMain.handle('browser:click', async (_, selector: string) => {
    try { return await browserClick(selector) } catch (e: any) { return { ok: false, error: e?.message } }
  })
  ipcMain.handle('browser:type', async (_, selector: string, text: string) => {
    try { return await browserType(selector, text) } catch (e: any) { return { ok: false, error: e?.message } }
  })
  ipcMain.handle('browser:screenshot', async () => {
    try { return await browserScreenshot() } catch (e: any) { return { ok: false, error: e?.message } }
  })
  ipcMain.handle('browser:extractLinks', async () => {
    try { return await browserExtractLinks() } catch (e: any) { return { ok: false, error: e?.message } }
  })
  ipcMain.handle('browser:close', async () => {
    try { await browserClose(); return { ok: true } } catch { return { ok: false } }
  })

  // Calendar
  ipcMain.handle('calendar:create', (_, event: any) => {
    try { return createEvent(event) } catch { return null }
  })
  ipcMain.handle('calendar:list', (_, startDate?: string, endDate?: string) => {
    try { return listEvents(startDate, endDate) } catch { return [] }
  })
  ipcMain.handle('calendar:upcoming', () => {
    try { return getUpcoming() } catch { return [] }
  })
  ipcMain.handle('calendar:today', () => {
    try { return getToday() } catch { return [] }
  })
  ipcMain.handle('calendar:update', (_, id: string, updates: any) => {
    try { updateEvent(id, updates); return { ok: true } } catch { return { ok: false } }
  })
  ipcMain.handle('calendar:delete', (_, id: string) => {
    try { deleteEvent(id); return { ok: true } } catch { return { ok: false } }
  })
  ipcMain.handle('calendar:reminders', (_, minutes?: number) => {
    try { return getDueReminders(minutes) } catch { return [] }
  })

  // Max Mode
  ipcMain.handle('maxmode:generate', async (_, prompt: string, systemPrompt: string, models: string[], temperatures?: number[]) => {
    try { return await generateCandidates(prompt, systemPrompt, models, temperatures) } catch (e: any) { return [] }
  })
  ipcMain.handle('maxmode:judge', async (_, prompt: string, candidates: any[]) => {
    try { return await judgeCandidates(prompt, candidates) } catch (e: any) { return { best: candidates?.[0], reasoning: e?.message } }
  })

  // Distill
  ipcMain.handle('distill:analyze', () => {
    try { return analyzeConversations() } catch { return [] }
  })
  ipcMain.handle('distill:save', (_, skill: any) => {
    try { saveDistilledSkill(skill); return { ok: true } } catch { return { ok: false } }
  })
  ipcMain.handle('distill:list', () => {
    try { return getDistilledSkills() } catch { return [] }
  })
  ipcMain.handle('distill:fromConversation', (_, messages: any[]) => {
    try { return distillFromConversation(messages) } catch { return null }
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
  ipcMain.handle('gc:clearMessages', (_, gid) => { gcMsgDeleteByGroup(gid); return true })

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

  // Smart collaboration: analyze task and build team
  ipcMain.handle('smart:analyze', (_, message: string) => {
    try { return analyzeTask(message) } catch { return { type: 'general', complexity: 'simple', neededRoles: ['researcher'], suggestedTeam: [], description: message } }
  })
  ipcMain.handle('smart:createTeam', (_, analysis: any) => {
    try { return createSmartTeam(analysis) } catch { return [] }
  })
  ipcMain.handle('smart:buildWorkflow', (_, message: string, agentIds: string[], analysis: any) => {
    try { return buildWorkflow(message, agentIds, analysis) } catch { return [] }
  })
  ipcMain.handle('smart:executeStep', async (_, step: any, groupId: string, previousResults: string[]) => {
    try {
      const agent = kvGet('agents', step.agentId)
      if (!agent) return { ok: false, error: 'Agent not found' }

      // Try task routing if agent can't handle it
      const allAgents = kvList('agents')
      const routed = routeTask(step.task, allAgents)
      if (routed && routed.id !== step.agentId) {
        console.log(`[SmartCollab] Routed task to ${routed.name} (better match)`)
        step.agentId = routed.id
        step.agentName = routed.name
      }

      const port = getOpenClawPort()
      const config = kvGet('config', 'main') || {}
      // Build structured context from previous results
      const contextPrefix = previousResults.length > 0
        ? '=== COLLABORATION CONTEXT ===\n' +
          'Previous agent outputs (read carefully, build upon them):\n\n' +
          previousResults.map((r, i) => `[Step ${i + 1} Output]\n${r.slice(0, 2000)}`).join('\n\n') +
          '\n\n=== YOUR TASK ===\n'
        : ''
      const fullTask = contextPrefix + step.task
      const msgs = [{ role: 'user', content: fullTask }]
      // Use agent's model and skills
      const providers2 = cacheProviders()
      const prov = providers2.find((p: any) => p.apiKey && p.enabled !== false)
      let apiBase = `http://127.0.0.1:${port}/v1/chat/completions`
      let apiKey = ''
      let modelName = agent.model || 'openclaw'
      if (prov?.apiKey) {
        apiBase = (prov.baseUrl || '').replace(/\/+$/, '') + '/chat/completions'
        apiKey = prov.apiKey
      }
      const resp = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({ model: modelName, messages: [{ role: 'system', content: agent.expertise || 'You are a helpful assistant.' }, ...msgs], stream: false, max_tokens: 4096 }),
        signal: AbortSignal.timeout(60000),
      })
      const data = await resp.json()
      const result = data.choices?.[0]?.message?.content || ''
      // Save to group messages
      gcMsgAdd(groupId, step.agentId, step.agentName, 'agent', result)
      return { ok: true, result }
    } catch (e: any) { return { ok: false, error: e?.message || 'Execution failed' } }
  })

  // Background Goals
  ipcMain.handle('goals:list', () => getGoals())
  ipcMain.handle('goals:create', (_, title: string, task: string, steps?: string[]) => createGoal(title, task, steps))
  ipcMain.handle('goals:delete', (_, id: string) => { deleteGoal(id); return true })
  ipcMain.handle('goals:execute', async (_, goalId: string) => {
    const goal = kvGet('goals', goalId) as any
    if (!goal) return { ok: false, error: 'Goal not found' }
    updateGoal(goalId, { status: 'running', progress: 0 })
    try {
      const port = getOpenClawPort()
      const providers = cacheProviders()
      const prov = providers.find((p: any) => p.apiKey && p.enabled !== false)
      let apiBase = `http://127.0.0.1:${port}/v1/chat/completions`
      let apiKey = ''
      if (prov?.apiKey) { apiBase = (prov.baseUrl || '').replace(/\/+$/, '') + '/chat/completions'; apiKey = prov.apiKey }
      const resp = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({ model: 'openclaw', messages: [{ role: 'user', content: goal.task }], stream: false, max_tokens: 4096 }),
        signal: AbortSignal.timeout(120000),
      })
      const data = await resp.json()
      const result = data.choices?.[0]?.message?.content || ''
      updateGoal(goalId, { status: 'done', progress: 100, result, completedAt: new Date().toISOString() })
      return { ok: true, result }
    } catch (e: any) {
      updateGoal(goalId, { status: 'failed', error: e?.message })
      return { ok: false, error: e?.message }
    }
  })

  // Chat streaming
  let abortCtrl: AbortController | null = null
  let chatGeneration = 0
  let lastConvId: string | null = null
  ipcMain.handle('chat:send', async (_, { message, history, systemPrompt, model, agentId, convId, devMode }) => {
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
    // Enhanced feedback detection
    const feedback = detectEnhancedFeedback(message)
    if (feedback.type === 'positive') {
      recordFeedback('positive', message)
      console.log('[Feedback] Positive feedback detected')
    } else if (feedback.type === 'negative') {
      recordFeedback('negative', message)
      console.log('[Feedback] Negative feedback detected')
    }
    // Detect memory conflicts
    const conflicts = detectConflicts(message)
    if (conflicts.length > 0) {
      console.log('[Memory] Conflicts detected:', conflicts)
    }
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
    // Base skills: all agents automatically get these (universal tools)
    const BASE_SKILLS = ['search', 'read_file', 'write_file', 'read_url', 'memory_save']
    const agentSkills = agent?.skills || []
    const mergedSkills = [...new Set([...BASE_SKILLS, ...agentSkills])]
    const toolNames = mergedSkills.map((s: string) => {
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
      '5. CRITICAL: When a tool fails, you MUST immediately try a different tool or approach. NEVER just describe the error — ACT on it. If ac_terminal fails, try code_execute. If ac_web_search fails, try ac_read_url. If one approach fails, try another. Keep trying until success or all options exhausted.',
      '6. memory_save for user preferences and project facts.',
      '7. Interpret tool results — don\'t dump raw output. Explain what it means.',
      '8. For complex tasks: state plan → execute → verify → summarize.',
      '9. If a task is beyond your capabilities, say so clearly and suggest alternatives.',
      '10. NEVER end a response with just an error description. Always follow up with a tool call to try an alternative.',
    ].join('\n')
    // Inject memory constraints, error learning, and feedback context
    const memoryConstraints = buildMemoryConstraints()
    const errorContext = getErrorContext()
    const feedbackContext = getFeedbackContext()
    const allContextParts = [envInfo, envRules, memoryConstraints, errorContext, feedbackContext, finalPrompt].filter(Boolean)
    const fullSystemPrompt = allContextParts.join('\n\n')
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
    // Memory injection — use FTS5 for relevant memories instead of loading all
    const memories = cacheMemory()
    // Always inject user preferences (small, always relevant)
    const userPrefs = memories.filter((m: any) => m.category === 'user_pref').slice(0, 10)
    if (userPrefs.length > 0) {
      msgs.push({ role: 'system', content: `User profile:\n${userPrefs.map((m: any) => `- ${m.content}`).join('\n')}` })
    }
    // Task experience — last 3
    const taskExps = memories.filter((m: any) => m.category === 'task_experience').slice(-3)
    if (taskExps.length > 0) {
      msgs.push({ role: 'system', content: `Recent task experience:\n${taskExps.map((m: any) => `- ${m.content}`).join('\n')}` })
    }
    // Cross-session continuity
    const lastTask = memories.find((m: any) => m.id === 'last_task_state')
    if (lastTask && (!convId || !history || history.length === 0)) {
      const taskAge = Date.now() - new Date(lastTask.createdAt || 0).getTime()
      if (taskAge < 86400000) {
        msgs.push({ role: 'system', content: `Previous session: ${lastTask.content}\nIf related, continue from where left off.` })
      }
    }
    // FTS5 search for message-relevant memories (replaces full scan)
    try {
      const words = message.toLowerCase().split(/[\s,.;!?。；！？、\n]+/).filter((w: string) => w.length > 1).slice(0, 8)
      if (words.length > 0) {
        const ftsQuery = words.map((t: string) => `"${t}"`).join(' OR ')
        const ftsResults = memoryFtsSearch(ftsQuery, 5)
        if (ftsResults.length > 0) {
          msgs.push({ role: 'system', content: `Relevant memories:\n${ftsResults.map((r: any) => `- ${r.content}`).join('\n')}` })
        }
      }
    } catch {}
    // Auto-inject relevant RAG knowledge base content (FTS5 optimized)
    const ragDocs = cacheRag()
    if (ragDocs.length > 0) {
      try {
        const words = message.toLowerCase().split(/[\s,.;!?。；！？、\n]+/).filter((w: string) => w.length > 1).slice(0, 8)
        if (words.length > 0) {
          const ftsQuery = words.map((t: string) => `"${t}"`).join(' OR ')
          const ragResults = ragFtsSearch(ftsQuery, 3)
          if (ragResults.length > 0) {
            msgs.push({ role: 'system', content: `Relevant knowledge base:\n${ragResults.map((r: any) => r.chunk_text).join('\n\n---\n\n')}` })
          }
        }
      } catch {}
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
        // Performance cap: only scan last 50 older messages for relevance
        const scanLimit = Math.min(older.length, 50)
        const scanStart = older.length - scanLimit
        const scanOlder = older.slice(scanStart)
        // Extract keywords from current message for relevance matching
        const msgWords = new Set(message.toLowerCase().split(/[\s,，。！？、；：""''（）()\[\]{}]+/).filter((w: string) => w.length > 1))
        // Score older messages by relevance (optimized: single pass)
        const scored: Array<{ m: any; score: number; i: number }> = []
        for (let i = 0; i < scanOlder.length; i++) {
          const m = scanOlder[i]
          if (m.role === 'system') { scored.push({ m, score: 10, i: scanStart + i }); continue }
          const content = (m.content || '').toLowerCase()
          let score = 0
          for (const w of msgWords) { if (content.includes(w as string)) score++ }
          if (score === 0) continue
          if (m.role === 'tool' || content.includes('[tool result]') || content.includes('tool_call')) score += 3
          if (/[A-Z]:\\|\.ts|\.js|\.py|\.json|\.css/.test(m.content || '')) score += 2
          scored.push({ m, score, i: scanStart + i })
        }
        scored.sort((a, b) => b.score - a.score || a.i - b.i)
        const relevant = scored.slice(0, 6).map((s) => s.m)
        const trimmed = [...relevant, ...recent]
        console.log(`[Chat] A03: Smart window ${history.length} -> ${trimmed.length} messages (${relevant.length} relevant + ${recent.length} recent)`)
        msgs.push(...trimmed)
      }
    }
    msgs.push({ role: 'user', content: message })
    if (convId) msgAdd(convId, 'user', message)

    // collect tool_calls and thinking
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
      'patch_file': { type: 'function', function: { name: 'ac_patch_file', description: 'Incrementally modify a file by replacing specific text. Use this instead of write_file when you only need to change part of a file. Requires old_text (exact text to find) and new_text (replacement).', parameters: { type: 'object', properties: { path: { type: 'string', description: 'File path' }, old_text: { type: 'string', description: 'Exact text to find and replace' }, new_text: { type: 'string', description: 'Replacement text' } }, required: ['path', 'old_text', 'new_text'] } } },
      'git': { type: 'function', function: { name: 'ac_git', description: 'Run Git commands. Supports: status, diff, log, branch, add, commit, push, pull, stash, remote. Use for version control operations.', parameters: { type: 'object', properties: { command: { type: 'string', description: 'Git subcommand (e.g. "status", "add . && commit -m message", "log --oneline -10")' }, path: { type: 'string', description: 'Working directory (optional)' } }, required: ['command'] } } },
      'translate': { type: 'function', function: { name: 'translate', description: 'Translate text to a target language', parameters: { type: 'object', properties: { text: { type: 'string', description: 'Text to translate' }, target: { type: 'string', description: 'Target language (e.g. en, zh, ja)' } }, required: ['text', 'target'] } } },
      'list_directory': { type: 'function', function: { name: 'list_directory', description: 'List files and folders in a directory. Use recursive:true to scan project structure. Returns tree with file types.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'Directory path to list' }, recursive: { type: 'boolean', description: 'Scan recursively (default false)' }, depth: { type: 'number', description: 'Max recursion depth (1-5, default 3)' } }, required: ['path'] } } },
      'memory_search': { type: 'function', function: { name: 'memory_search', description: 'Search previously saved memories by keyword', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search keyword' } }, required: ['query'] } } },
      // Stock tools
      'stock_quote': { type: 'function', function: { name: 'skill_stock_quote', description: 'Get real-time stock quote for A-share market. Returns price, change, volume, PE, PB, market cap. Use for checking current stock prices.', parameters: { type: 'object', properties: { code: { type: 'string', description: 'Stock code (e.g. 600519, 002119)' } }, required: ['code'] } } },
      'stock_kline': { type: 'function', function: { name: 'skill_stock_kline', description: 'Get K-line (candlestick) data for a stock. Returns daily OHLCV data. Use for technical analysis.', parameters: { type: 'object', properties: { code: { type: 'string', description: 'Stock code (e.g. 600519)' }, period: { type: 'string', enum: ['daily', 'weekly', 'monthly'], description: 'Data period' } }, required: ['code'] } } },
      'stock_finance': { type: 'function', function: { name: 'skill_stock_finance', description: 'Get financial statements for a stock. Returns revenue, profit, ROE, PE, PB. Use for fundamental analysis.', parameters: { type: 'object', properties: { code: { type: 'string', description: 'Stock code (e.g. 600519)' } }, required: ['code'] } } },
      'stock_screener': { type: 'function', function: { name: 'skill_stock_screener', description: 'Screen stocks by conditions. Returns list of matching stocks. Use for finding stocks that meet specific criteria.', parameters: { type: 'object', properties: { condition: { type: 'string', description: 'Screening condition (e.g. PE<20, ROE>15%)' } }, required: ['condition'] } } },
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
    const BASE_SKILLS_INJECT = ['search', 'read_file', 'write_file', 'read_url', 'memory_save']
    const agentSkillFilter = agent?.skills && Array.isArray(agent.skills) ? new Set([...BASE_SKILLS_INJECT, ...agent.skills]) : null
    const agentToolWhitelist = agent?.toolWhitelist && Array.isArray(agent.toolWhitelist) ? new Set(agent.toolWhitelist) : null
    for (const skill of enabledSkills) {
      if (agentSkillFilter && !agentSkillFilter.has(skill.id)) continue
      const mapped = skillMap[skill.id]
      if (mapped && !addedToolNames.has(mapped.function.name)) {
        if (!unhealthyTools.has(mapped.function.name)) {
          tools.push(mapped)
          addedToolNames.add(mapped.function.name)
        }
      }
      // Auto-generate tool definition for any skill not in skillMap
      if (!mapped && !addedToolNames.has(skill.id)) {
        const toolName = skill.source === 'builtin' ? skill.id : 'skill_' + skill.id.replace(/[^a-zA-Z0-9_]/g, '_')
        if (!unhealthyTools.has(toolName)) {
          tools.push({
            type: 'function',
            function: {
              name: toolName,
              description: skill.description || skill.name || skill.id,
              parameters: skill.execute
                ? { type: 'object', properties: { input: { type: 'string', description: skill.params || 'Input' } }, required: ['input'] }
                : { type: 'object', properties: { code: { type: 'string', description: 'Code or input' }, language: { type: 'string', description: 'python or javascript' } }, required: ['code', 'language'] },
            },
          })
          addedToolNames.add(toolName)
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

    // Inject MCP tools from connected servers (skip __builtin__ — those are already registered above)
    const mcpTools = getMcpTools()
    for (const mt of mcpTools) {
      if (mt.serverId === '__builtin__') continue
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
    let filteredTools = selectTools(message, tools)

    // Per-agent tool whitelist filtering
    if (agentToolWhitelist && agentToolWhitelist.size > 0) {
      filteredTools = filteredTools.filter((t: any) => agentToolWhitelist.has(t.function?.name || ''))
    }

    // Dev mode tool filtering
    if (devMode === 'plan') {
      // Plan mode: only read-only tools (no write, no terminal, no code execution)
      filteredTools = filteredTools.filter((t: any) => {
        const name = t.function?.name || ''
        return !['ac_write_file', 'ac_terminal', 'code_execute', 'ac_browser'].includes(name)
      })
    }
    // Code mode: all tools (default)
    // Auto mode: all tools (same as code, but LLM doesn't ask for confirmation)

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

    const mw = mainWindow
    abortCtrl = new AbortController()

    // Pressure level detection (0-3)
    const pressurePct = totalEstimate / maxContext
    const pressureLevel = pressurePct < 0.5 ? 0 : pressurePct < 0.7 ? 1 : pressurePct < 0.85 ? 2 : 3
    if (pressureLevel >= 2) {
      console.log(`[Chat] Context pressure: level ${pressureLevel} (${Math.round(pressurePct * 100)}%)`)
      mw?.webContents.send('chat:stage', `pressure-${pressureLevel}`)
    }

    // Auto-compaction: when pressure >= 2, summarize older messages
    if (pressureLevel >= 2 && history && history.length > 6) {
      try {
        const toSummarize = history.slice(0, -6).filter((m: any) => m.role !== 'system')
        if (toSummarize.length >= 4) {
          const summaryText = toSummarize.map((m: any) => `[${m.role}]: ${(m.content || '').slice(0, 200)}`).join('\n')
          const compactionPrompt = `Summarize this conversation history in 2-3 sentences, preserving key facts and decisions:\n\n${summaryText.slice(0, 3000)}`
          const port = getOpenClawPort()
          const providers2 = cacheProviders()
          const prov = providers2.find((p: any) => p.apiKey && p.enabled !== false)
          let apiBase2 = `http://127.0.0.1:${port}/v1/chat/completions`
          let apiKey2 = ''
          if (prov?.apiKey) { apiBase2 = (prov.baseUrl || '').replace(/\/+$/, '') + '/chat/completions'; apiKey2 = prov.apiKey }
          const resp = await fetch(apiBase2, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(apiKey2 ? { 'Authorization': `Bearer ${apiKey2}` } : {}) },
            body: JSON.stringify({ model: model || 'openclaw', messages: [{ role: 'user', content: compactionPrompt }], stream: false, max_tokens: 300 }),
            signal: AbortSignal.timeout(15000),
          })
          const data = await resp.json()
          const summary = data.choices?.[0]?.message?.content || ''
          if (summary && summary.length > 20) {
            const keepFrom = history.length - 6
            const removedCount = keepFrom
            msgs.splice(0, msgs.length, { role: 'system', content: `[Previous conversation summary]\n${summary}` }, ...history.slice(-6))
            totalEstimate = estimateTokens(summary) + history.slice(-6).reduce((s: number, m: any) => s + estimateTokens(m.content || ''), 0) + toolTokenEstimate
            console.log(`[Chat] Compacted ${removedCount} messages into summary. New estimate: ~${totalEstimate} tokens`)
            mw?.webContents.send('chat:stage', 'compacted')
          }
        }
      } catch (e) {
        console.warn('[Chat] Compaction failed:', (e as Error).message)
      }
    }

    // Checkpoint save (every 10 messages)
    if (convId && history && history.length > 0 && history.length % 10 === 0) {
      try {
        const checkpoint = {
          convId,
          messageCount: history.length,
          tokenEstimate: totalEstimate,
          lastMessage: history[history.length - 1]?.content?.slice(0, 100),
          timestamp: new Date().toISOString(),
        }
        kvUpsert('checkpoints', convId, checkpoint)
        console.log(`[Chat] Checkpoint saved for ${convId}`)
      } catch {}
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

    // Determine API target: prefer direct provider (supports tool_calls), fallback to Gateway
    const config = kvGet('config', 'main') || {}
    const providers = cacheProviders()
    const agentModel = selectModel(message, model || agent?.model || config.ai?.model || 'openclaw', providers)
    const resolvedModelId = agentModel !== 'openclaw' ? agentModel : config.ai?.model
    const modelEntry = cacheModels().find((m: any) => m.id === resolvedModelId)
    const modelMaxTokens = modelEntry?.maxTokens
    const modelContextWindow = modelEntry?.contextWindow
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
        generation: myGen, chatGeneration: () => chatGeneration, config,
        modelMaxTokens, modelContextWindow,
      }
      const doStreamChat = (messages: any[], requestTools?: any[], opts?: any) => llmStreamChat(streamCtx, messages, requestTools, opts)

      // LLM 请求重试包装: 网络/超时/限速错误自动重试
      const doStreamChatWithRetry = async (messages: any[], requestTools?: any[], opts?: any, maxRetries = 2) => {
        const retryResult = await withRetry(
          () => doStreamChat(messages, requestTools, opts),
          {
            maxRetries,
            onRetry: (error, delay, attempt) => {
              console.warn(`[Chat] LLM retry ${attempt + 1}/${maxRetries + 1} in ${delay}ms: ${error.message}`)
              mw?.webContents.send('chat:stage', 'retrying')
            },
          }
        )
        if (!retryResult.success || !retryResult.result) throw new Error(retryResult.error?.message || 'LLM request failed')
        return retryResult.result
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
          // Error already tracked by recordToolCall above
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
          // Translate technical errors to user-friendly Chinese + compress large results
          const translatedResult = translateError(correctedResult)
          const compressedResult = compressToolResult(tc.function.name, translatedResult)
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

        // Auto-cleanup: delete temporary script files created and executed in this batch
        try {
          const writtenPaths = new Set<string>()
          const executedPaths = new Set<string>()
          for (const tc of result.toolCalls) {
            if (tc.function.name === 'ac_write_file' || tc.function.name === 'write_file') {
              try { const a = JSON.parse(tc.function.arguments || '{}'); if (a.path) writtenPaths.add(a.path.replace(/\\/g, '/')) } catch {}
            }
            if (tc.function.name === 'ac_terminal') {
              try {
                const a = JSON.parse(tc.function.arguments || '{}')
                const cmd = (a.command || a.cmd || '').replace(/\\/g, '/')
                for (const wp of writtenPaths) { if (cmd.includes(wp.split('/').pop()!)) executedPaths.add(wp) }
              } catch {}
            }
          }
          for (const p of executedPaths) {
            try {
              const ext = p.split('.').pop()?.toLowerCase()
              if (['ps1', 'py', 'sh', 'bat', 'cmd', 'js'].includes(ext || '')) {
                const { unlinkSync } = require('fs')
                unlinkSync(p)
                console.log('[Cleanup] Deleted temp script:', p)
                // Also remove from generated_files tracking
                const id = 'gf-' + Buffer.from(p).toString('base64url').slice(0, 16)
                kvDelete('generated_files', id)
              }
            } catch {}
          }
        } catch {}

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

        // CRITICAL: When ALL tools failed, force LLM to try alternatives
        const allFailed = toolResults.every(tr => tr.result.includes('[ERROR]') || (tr.result.startsWith('{') && /"error"\s*:/.test(tr.result)))
        if (allFailed && toolResults.length > 0) {
          const failedNames = toolResults.map(tr => result.toolCalls.find((tc: any) => tc.id === tr.tcId)?.function.name || 'unknown').join(', ')
          toolMsgs.push({ role: 'system', content: `[RECOVERY REQUIRED] All tools failed: ${failedNames}. You MUST immediately call a DIFFERENT tool to accomplish the user's request. Do NOT just describe the error. Try: code_execute for commands, ac_read_url for web content, ac_baike for knowledge, or ask the user for clarification. CALL A TOOL NOW.` })
        }

        // Growth: detect repeated tool patterns and auto-generate skills
        const toolNames = result.toolCalls.map((tc: any) => tc.function.name)
        const patternResult = detectRepeatedPattern(toolNames, message)
        if (patternResult) {
          toolMsgs.push({ role: 'system', content: `[Growth] ${patternResult.message}` })
          // Auto-register the generated skill
          if (patternResult.autoSkill) {
            try {
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

        // Auto-retry: if all tools failed and LLM didn't call new tools, force another attempt
        if (followUp.toolCalls.length === 0 && allFailed) {
          console.log('[Chat] All tools failed, LLM responded with text only. Forcing retry with different tools...')
          const retryMsgs = [...followUpMsgs, { role: 'assistant', content: followUp.full || '' }, { role: 'system', content: '[AUTO-RETRY] The previous approach failed. You MUST try a completely different tool NOW. Do NOT explain the error. Do NOT ask the user. Just call a different tool immediately. For example: if terminal failed, use code_execute; if web_search failed, use read_url; if read_file failed, use terminal with ls/dir command.' }]
          try {
            const retryResult = await doStreamChatWithRetry(retryMsgs, gatewayMode ? undefined : useTools, { temperature: dynamicTemp })
            if (retryResult.toolCalls.length > 0) {
              console.log('[Chat] Auto-retry succeeded, got', retryResult.toolCalls.length, 'new tool calls')
              collectedThinking += retryResult.thinking
              if (retryResult.full) lastText = retryResult.full
              // Process the retry tool calls through the chain loop
              followUp = retryResult
            }
          } catch (retryErr) {
            console.warn('[Chat] Auto-retry failed:', (retryErr as Error).message)
          }
        }


        // Handle chained tool calls (model calls tools again)
        let chainDepth = 0
        let currentMsgs = followUpMsgs
        let currentResult = followUp
        while (currentResult.toolCalls.length > 0 && chainDepth < 10) {
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
            const chainToolStart = Date.now()
            let toolResult = mcpSid
              ? await callMcpTool(mcpSid, tc.function.name, parsedArgs)
              : await executeTool(tc.function.name, parsedArgs)
            const chainToolExecTime = Date.now() - chainToolStart
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
            recordToolCall(tc.function.name, !isError, isError ? toolResult.slice(0, 200) : undefined, chainQuality, chainToolExecTime)
            // Error already tracked by recordToolCall above
            const correctedResult = wrapToolResult(toolResult, tc.function.name)
            const chainOutput = toolResult.length > 500 ? toolResult.slice(0, 500) + '...' : toolResult
            notifyToolCall(mw, { id: tc.id, name: tc.function.name }, isError ? 'error' : 'done', chainOutput)
            const translatedChain = translateError(correctedResult)
            const compressedChain = compressToolResult(tc.function.name, translatedChain)
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

          // Auto-cleanup temp scripts in chain
          try {
            const chainWritten = new Set<string>()
            const chainExecuted = new Set<string>()
            for (const tc of currentResult.toolCalls) {
              if (tc.function.name === 'ac_write_file' || tc.function.name === 'write_file') {
                try { const a = JSON.parse(tc.function.arguments || '{}'); if (a.path) chainWritten.add(a.path.replace(/\\/g, '/')) } catch {}
              }
              if (tc.function.name === 'ac_terminal') {
                try {
                  const a = JSON.parse(tc.function.arguments || '{}')
                  const cmd = (a.command || a.cmd || '').replace(/\\/g, '/')
                  for (const wp of chainWritten) { if (cmd.includes(wp.split('/').pop()!)) chainExecuted.add(wp) }
                } catch {}
              }
            }
            for (const p of chainExecuted) {
              try {
                const ext = p.split('.').pop()?.toLowerCase()
                if (['ps1', 'py', 'sh', 'bat', 'cmd', 'js'].includes(ext || '')) {
                  require('fs').unlinkSync(p)
                  console.log('[Cleanup] Deleted temp script:', p)
                  const id = 'gf-' + Buffer.from(p).toString('base64url').slice(0, 16)
                  kvDelete('generated_files', id)
                }
              } catch {}
            }
          } catch {}
          // Growth: detect repeated patterns in chain and auto-generate skills
          const chainToolNames = currentResult.toolCalls.map((tc: any) => tc.function.name)
          const chainPatternResult = detectRepeatedPattern(chainToolNames, message)
          if (chainPatternResult) {
            chainToolMsgs.push({ role: 'system', content: `[Growth] ${chainPatternResult.message}` })
            if (chainPatternResult.autoSkill) {
              try {
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
      // Goal+Judge: verify task completion before ending
      let finalOutput = finalText
      if (finalText && collectedToolCalls.length > 0) {
        const responseLower = finalText.toLowerCase()
        const isIncomplete = finalText.length < 100 && !responseLower.includes('完成') && !responseLower.includes('done') && !responseLower.includes('已')
          && !responseLower.includes('以下是') && !responseLower.includes('总结') && !responseLower.includes('综上')
        if (isIncomplete) {
          console.log('[GoalJudge] Response seems incomplete, requesting completion...')
          try {
            const goalPrompt = `The user asked: "${message}"\nYour response was: "${finalText.slice(0, 200)}"\n\nWas the user's request fully addressed? If not, continue and complete the task. If yes, just say "任务已完成".`
            const port = getOpenClawPort()
            const providers3 = cacheProviders()
            const prov3 = providers3.find((p: any) => p.apiKey && p.enabled !== false)
            let apiBase3 = `http://127.0.0.1:${port}/v1/chat/completions`
            let apiKey3 = ''
            if (prov3?.apiKey) { apiBase3 = (prov3.baseUrl || '').replace(/\/+$/, '') + '/chat/completions'; apiKey3 = prov3.apiKey }
            const goalResp = await fetch(apiBase3, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(apiKey3 ? { 'Authorization': `Bearer ${apiKey3}` } : {}) },
              body: JSON.stringify({ model: modelName, messages: [{ role: 'user', content: goalPrompt }], stream: false, max_tokens: 500 }),
              signal: AbortSignal.timeout(15000),
            })
            const goalData = await goalResp.json()
            const goalResult = goalData.choices?.[0]?.message?.content || ''
            if (goalResult && !goalResult.includes('任务已完成') && goalResult.length > 50) {
              finalOutput = finalText + '\n\n' + goalResult
              console.log('[GoalJudge] Added completion text')
            }
          } catch (e) {
            console.warn('[GoalJudge] Failed:', (e as Error).message)
          }
        }
      }

      // Send complete message data to frontend
      mw?.webContents.send('chat:done', finalOutput, collectedThinking || '', collectedToolCalls)

      // Send desktop notification for completed response
      try {
        const cfg = loadConfig()
        if (cfg.notifications?.desktop !== false && finalText) {
          const { Notification } = require('electron')
          if (Notification.isSupported()) {
            const preview = finalText.slice(0, 100).replace(/\n/g, ' ')
            new Notification({ title: 'AaronClaw', body: preview + (finalText.length > 100 ? '...' : '') }).show()
          }
        }
      } catch {}

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
  ipcMain.handle('ollama:status', async () => {
    try {
      const r = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) })
      const data = await r.json()
      return { running: true, models: (data.models || []).map((m: any) => m.name) }
    } catch { return { running: false, models: [] } }
  })
  ipcMain.handle('chat:compare', async (_, { message, modelIds }: { message: string; modelIds: string[] }) => {
    const config = kvGet('config', 'main') || {}
    const providers = cacheProviders()
    const results: any[] = []
    for (const modelId of modelIds) {
      const prov = providers.find((p: any) => p.apiKey && p.enabled !== false)
      let apiBase = `http://127.0.0.1:${getOpenClawPort()}/v1/chat/completions`
      let apiKey = ''
      let modelName = modelId
      if (prov?.apiKey) {
        apiBase = (prov.baseUrl || '').replace(/\/+$/, '') + '/chat/completions'
        apiKey = prov.apiKey
      }
      try {
        const resp = await fetch(apiBase, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}) },
          body: JSON.stringify({ model: modelName, messages: [{ role: 'user', content: message }], stream: false, max_tokens: 4096, temperature: 0.7 }),
          signal: AbortSignal.timeout(60000),
        })
        const data = await resp.json()
        const text = data.choices?.[0]?.message?.content || ''
        results.push({ model: modelId, text, ok: resp.ok })
      } catch (e: any) {
        results.push({ model: modelId, text: '', ok: false, error: e?.message })
      }
    }
    return { ok: true, results }
  })

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
      ragFtsUpsert(id, content)
      return { ok: true, id }
    } catch (e) { return errorResult(e) }
  })
  ipcMain.handle('rag:list', () => kvList('rag'))
  ipcMain.handle('rag:delete', (_, id) => { kvDelete('rag', id); ragFtsDelete(id) })
  ipcMain.handle('rag:search', (_, query, topK?) => {
    const limit = topK || 5
    try {
      const ftsQuery = query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 1).map((w: string) => `"${w}"`).join(' OR ')
      const results = ragFtsSearch(ftsQuery, limit)
      if (results.length > 0) {
        return results.map((r: any) => ({ text: r.chunk_text, score: 1 - r.rank * 0.1, docId: r.doc_id }))
      }
    } catch {}
    // Fallback to JS search
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
       const stmt = getDB().prepare('INSERT INTO messages (id, conv_id, role, content, tokens, tool_calls, thinking, tool_call_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
       transaction(() => {
         for (const m of forkMsgs) {
           const msgId = 'msg-' + Date.now() + '-' + randomUUID().slice(0, 8)
           stmt.run(msgId, newId, (m as any).role, (m as any).content, (m as any).tokens || 0, (m as any).tool_calls || null, (m as any).thinking || null, (m as any).tool_call_id || null)
         }
       })
     }
     return newId
   })

  // Capabilities
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
  // Built-in MCP server (开箱即用，不需要外部 npm 包)
  try { initInternalMcpServer() } catch (e) { console.error('[MCP] Internal server init failed:', e) }
  // Auto-detect Ollama for local model support
  fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) })
    .then(r => r.json())
    .then(data => {
      const ollamaModels = (data.models || []).map((m: any) => ({
        id: 'ollama/' + m.name,
        name: m.name + ' (本地)',
        provider: 'ollama',
        contextWindow: 32768,
        maxTokens: 4096,
        enabled: true,
      }))
      const existingProviders = kvList('providers')
      if (!existingProviders.find((p: any) => p.id === 'ollama')) {
        kvUpsert('providers', 'ollama', { id: 'ollama', name: 'Ollama (本地)', baseUrl: 'http://localhost:11434/v1', apiKey: '', models: ollamaModels, enabled: true })
      }
      for (const m of ollamaModels) {
        const existing = kvList('models').find((x: any) => x.id === m.id)
        if (!existing) kvUpsert('models', m.id, m)
      }
      console.log('[Ollama] Detected', ollamaModels.length, 'local models')
    })
    .catch(() => {})
})

app.on('before-quit', () => { tray?.destroy(); if (gatewayProcess) { gatewayProcess.kill(); gatewayProcess = null } })
app.on('window-all-closed', () => { closeDB(); if (process.platform !== 'darwin') app.quit() })









