import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs'
import { initDB, kvList, kvGet, kvUpsert, kvUpsertMany, closeDB } from './storage/db'
import { setMainWindow, loadConfig } from './ipc/core'
import { setupCoreIPC } from './ipc/core'
import { setupChatIPC } from './ipc/chat'
import { setupSystemIPC } from './ipc/system'
import { setupCapabilitiesIPC } from './ipc/capabilities'
import { setupVoiceIPC } from './ipc/voice'
import { logger } from './ipc/logger'
import { runMigrations } from './storage/migrations'
import { startAutoBackup } from './storage/backup'
import { startApiServer } from './ipc/api-server'

const isDev = process.argv.includes('--dev')
let mainWindow: BrowserWindow | null = null
let DATA_DIR = ''

function getDataDir(): string {
  if (!DATA_DIR) { DATA_DIR = join(app.getPath('userData'), 'data'); mkdirSync(DATA_DIR, { recursive: true }) }
  return DATA_DIR
}

// ─── Seed ───
function seedDefaults() {
  if (kvList('agents').length > 0) return
  const candidates = [
    join(__dirname, '..', 'data', 'agents.json'),
    join(app.getAppPath(), 'data', 'agents.json'),
    join(process.cwd(), 'data', 'agents.json'),
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    try {
      const data = JSON.parse(readFileSync(p, 'utf8'))
      kvUpsertMany('agents', (data.agents || []).map((a: any) => ({ ...a, enabled: true })))
      kvUpsertMany('providers', (data.providers || []).map((p: any) => ({ ...p, enabled: true })))
      const models: any[] = []
      for (const prov of (data.providers || [])) for (const m of (prov.models || []))
        models.push({ id: m.id, name: m.name, provider: prov.id, contextWindow: m.contextWindow || m.maxTokens || 128000, maxTokens: m.maxTokens || 4096, temperature: 0.7, enabled: true })
      kvUpsertMany('models', models)
      if (data.prompts) kvUpsertMany('prompts', data.prompts)
      logger.info('Seed', `Loaded from: ${p}`)
      break
    } catch (e: any) { logger.error('Seed', `Error: ${e.message}`) }
  }
  if (!kvGet('config', 'main')) kvUpsert('config', 'main', loadConfig())
}

// ─── Migrate from JSON ───
function migrateFromJSON() {
  const jsonDir = getDataDir()
  const collections = ['agents', 'providers', 'models', 'skills', 'memory', 'cron', 'mcp', 'groups', 'conversations', 'config', 'settings']
  for (const ns of collections) {
    if (kvList(ns).length > 0) continue
    const jsonPath = join(jsonDir, ns + '.json')
    if (!existsSync(jsonPath)) continue
    try {
      const items = JSON.parse(readFileSync(jsonPath, 'utf8'))
      if (Array.isArray(items)) kvUpsertMany(ns, items)
      else if (typeof items === 'object' && items !== null) {
        if (ns === 'config') kvUpsert('config', 'main', items)
        else for (const [k, v] of Object.entries(items)) kvUpsert(ns, k, v)
      }
      logger.info('Migrate', `${ns} -> SQLite`)
    } catch {}
  }
}

// ─── Window ───
function createWindow() {
  const iconPath = join(__dirname, '..', 'public', 'logo.png')
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1024, minHeight: 700,
    frame: true, backgroundColor: '#fafaf8',
    icon: iconPath, autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false }
  })
  setMainWindow(mainWindow)
  if (isDev) { mainWindow.loadURL('http://localhost:5173'); mainWindow.webContents.openDevTools({ mode: 'detach' }) }
  else mainWindow.loadFile(join(__dirname, '..', 'dist', 'index.html'))
  mainWindow.on('close', (e) => { if (!(app as any).isQuitting) { e.preventDefault(); mainWindow?.hide() } })
  mainWindow.on('closed', () => { mainWindow = null; setMainWindow(null) })
}

// ─── Gateway Auto-Start ───
function autoStartGateway() {
  setTimeout(() => {
    const config = loadConfig(); const port = config.gateway?.port || 18789
    fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) })
      .then(() => logger.info('Gateway', 'Already running'))
      .catch(() => {
        const candidates = [join(__dirname, '..', 'bundled', 'openclaw', 'openclaw.mjs')]
        for (const oc of candidates) {
          if (existsSync(oc)) {
            require('child_process').exec(`node "${oc}" daemon start`, { windowsHide: true })
            logger.info('Gateway', `Started from ${oc}`)
            return
          }
        }
        try { require('child_process').exec('openclaw daemon start', { windowsHide: true }); logger.info('Gateway', 'Started via CLI') } catch { logger.warn('Gateway', 'Not found') }
      })
  }, 2000)
}

// ─── Cron Scheduler ───
function matchesCron(schedule: string, now: Date): boolean {
  const parts = schedule.trim().split(/\s+/)
  if (parts.length < 2) return false
  const [min, hour, day, month, weekday] = parts
  const checks = [
    { val: now.getMinutes(), expr: min },
    { val: now.getHours(), expr: hour },
    { val: now.getDate(), expr: day || '*' },
    { val: now.getMonth() + 1, expr: month || '*' },
    { val: now.getDay(), expr: weekday || '*' },
  ]
  return checks.every(({ val, expr }) => {
    if (expr === '*') return true
    if (expr.startsWith('*/')) return val % parseInt(expr.slice(2)) === 0
    if (expr.includes(',')) return expr.split(',').map(Number).includes(val)
    return val === parseInt(expr)
  })
}

const lastRunMap = new Map<string, number>()
export function cleanupCronRun(jobId: string) { lastRunMap.delete(jobId) }

function startCronScheduler() {
  setInterval(() => {
    const jobs = kvList('cron').filter((j: any) => j.enabled)
    const now = new Date()
    for (const job of jobs) {
      if (!job.schedule || !matchesCron(job.schedule, now)) continue
      const lastRun = lastRunMap.get(job.id) || 0
      if (Date.now() - lastRun < 60000) continue
      lastRunMap.set(job.id, Date.now())
      logger.info('Cron', `Execute: ${job.name || job.command}`)
      const { safeExec, recordExecution } = require('./ipc/cron-sandbox')
      safeExec(job.command || 'echo cron', 30000).then((result: any) => {
        recordExecution(job.id, job.command, result)
      })
    }
  }, 15000)
}

// ─── Uncaught Exception ───
function setupCrashHandler() {
  const crashLog = join(app.getPath('userData'), 'crash.log')
  // Check last crash
  if (existsSync(crashLog)) {
    try {
      const content = require('fs').readFileSync(crashLog, 'utf8')
      if (content.trim()) {
        logger.warn('Recovery', `Previous crash detected: ${crashLog}`)
        writeFileSync(crashLog, '')
      }
    } catch {}
  }
  process.on('uncaughtException', (err) => {
    logger.error('CRASH', err.message, { stack: err.stack })
    try {
      writeFileSync(crashLog, `[${new Date().toISOString()}] ${err.stack || err.message}\n`, { flag: 'a' })
    } catch {}
  })
}


// ─── System Tray ───
let tray: Tray | null = null

function createTray() {
  const iconPath = join(__dirname, '..', 'public', 'logo.png')
  try {
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    tray = new Tray(icon)
    tray.setToolTip('AaronClaw')
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show Window', click: () => { mainWindow?.show(); mainWindow?.focus() } },
      { label: 'New Conversation', click: () => { mainWindow?.show(); mainWindow?.webContents.send('action:new-conv') } },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.quit() } },
    ])
    tray.setContextMenu(contextMenu)
    tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus() })
  } catch (e) {
    logger.warn('Tray', `Failed to create tray: ${(e as Error).message}`)
  }
}
// ─── App ───
app.whenReady().then(() => {
  setupCrashHandler()
  initDB(getDataDir())

  // Run database migrations
  const dbVersion = runMigrations()
  logger.info('App', `Database version: ${dbVersion}`)

  migrateFromJSON()
  seedDefaults()

  // Start auto backup (every hour)
  startAutoBackup()

  // Register all IPC handlers
  setupCoreIPC()
  setupChatIPC()
  setupSystemIPC()
  setupCapabilitiesIPC()
  setupVoiceIPC()

  startCronScheduler()
  createWindow()
  createTray()
  autoStartGateway()

  // Start optional HTTP API server
  const config = loadConfig()
  if (config.apiServer?.enabled) {
    startApiServer({ port: config.apiServer.port || 18800, enabled: true, apiKey: config.apiServer.apiKey })
  }

  logger.info('App', `AaronClaw v3.0.0 started`, { dev: isDev, dbVersion })
})

app.on('before-quit', () => { (app as any).isQuitting = true })
app.on('window-all-closed', () => { closeDB(); if (process.platform !== 'darwin') app.quit() })