import { app } from 'electron'
import { registerConfigIpc, syncAllProvidersToGateway } from './main/ipc/config'
import { registerFeaturesIpc } from './main/ipc/features'
import { registerGroupChatIpc } from './main/ipc/groupchat'
import { registerSmartIpc } from './main/ipc/smart'
import { registerChatIpc } from './main/ipc/chat'
import { registerMiscIpc } from './main/ipc/misc'
import { registerTemplatesIpc } from './main/ipc/templates'
import { registerTtsIpc } from './main/ipc/tts'
import { registerClipboardIpc } from './main/ipc/clipboard'
import { registerPluginsIpc } from './main/ipc/plugins'
import { registerMcpIpc } from './main/ipc/mcp'
import { registerSkillsIpc } from './main/ipc/skills'
import { registerWindowsIpc } from './main/ipc/windows'
import { registerAnalyticsIpc } from './main/ipc/analytics'
import { registerTokenStatsIpc } from './main/ipc/token-stats'
import { createWindow, createTray, getMainWindow, destroyTray, showSplash, updateSplashStatus } from './main/window'
import { autoStartGateway } from './main/gateway'
import { getDataDir } from './main/utils'
import { initDB, kvList, kvUpsert, closeDB } from './storage/db'
import { runMigrations } from './storage/migrations'
import { seedDefaults, migrateFromJSON } from './ipc/seed'
import { startAutoBackup } from './storage/backup'
import { OLLAMA_BASE_URL, API_PATH_OLLAMA_TAGS, TIMEOUT_HEALTH_CHECK } from './constants'
import { startAutoDream } from './ipc/auto-dream'

import { warmupMirrors } from './ipc/github-mirror'
import { getDueReminders } from './ipc/calendar'
import { logger } from './ipc/logger'
import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// Forward main process logs to renderer
logger.setRendererSend((level: string, ...args: any[]) => {
  try {
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ').slice(0, 500)
    getMainWindow()?.webContents.send('debug:log', { level, msg })
  } catch {}
})
logger.patchConsole()

function initWorkspace() {
  const workspaceDir = join(homedir(), '.openclaw', 'workspace')
  if (!existsSync(workspaceDir)) mkdirSync(workspaceDir, { recursive: true })

  // Copy default workspace files from bundled resources (only if missing)
  const resDir = app.isPackaged ? process.resourcesPath : join(__dirname, '..', 'resources')
  const templateDir = join(resDir, 'openclaw', 'workspace')
  if (!existsSync(templateDir)) return

  const defaults = ['SOUL.md', 'AGENTS.md', 'TOOLS.md', 'USER.md']
  for (const file of defaults) {
    const dest = join(workspaceDir, file)
    if (!existsSync(dest)) {
      const src = join(templateDir, file)
      if (existsSync(src)) {
        try { copyFileSync(src, dest) } catch {}
      }
    }
  }
}

function setupIPC() {
  registerConfigIpc(getMainWindow)
  registerFeaturesIpc()
  registerGroupChatIpc()
  registerSmartIpc()
  registerChatIpc(getMainWindow)
  registerMiscIpc()
  registerTemplatesIpc()
  registerTtsIpc()
  registerClipboardIpc()
  registerPluginsIpc()
  registerMcpIpc()
  registerSkillsIpc()
  registerWindowsIpc()
  registerAnalyticsIpc()
  registerTokenStatsIpc()
}

// Global error handling
process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.message || String(reason)
  if (reason?.code === 'ECONNREFUSED' && msg.includes('127.0.0.1')) {
    console.log('[Gateway] Connection refused (expected if Gateway not running)')
  } else {
    console.error('[Unhandled Rejection]', reason)
  }
})

app.whenReady().then(() => {
  showSplash()

  updateSplashStatus('正在初始化数据库...')
  initDB(getDataDir())
  runMigrations()
  migrateFromJSON()
  seedDefaults()

  updateSplashStatus('正在初始化工作区...')
  initWorkspace()

  updateSplashStatus('正在注册服务...')
  setupIPC()

  updateSplashStatus('正在加载界面...')
  createWindow()
  createTray()

  updateSplashStatus('正在启动 Gateway...')
  startAutoBackup()
  // Sync providers to OpenClaw config before starting gateway
  try { syncAllProvidersToGateway() } catch (e) { console.warn('[Sync] Startup sync failed:', (e as Error).message) }
  autoStartGateway()
  startAutoDream()
  warmupMirrors().catch(() => {})

  // Calendar reminders: check every 60s
  setInterval(() => {
    try {
      const reminders = getDueReminders(1)
      for (const evt of reminders) {
        const { Notification } = require('electron')
        if (Notification.isSupported()) {
          new Notification({ title: '日程提醒', body: evt.title + (evt.description ? `: ${evt.description}` : '') }).show()
        }
      }
    } catch {}
  }, 60000)

  // Auto-detect Ollama
  fetch(`${OLLAMA_BASE_URL}${API_PATH_OLLAMA_TAGS}`, { signal: AbortSignal.timeout(TIMEOUT_HEALTH_CHECK) })
    .then(r => r.json())
    .then(data => {
      const ollamaModels = (data.models || []).map((m: any) => ({
        id: 'ollama/' + m.name, name: m.name + ' (本地)', provider: 'ollama',
        contextWindow: 32768, maxTokens: 4096, enabled: true,
      }))
      const existingProviders = kvList('providers')
      if (!existingProviders.find((p: any) => p.id === 'ollama')) {
        kvUpsert('providers', 'ollama', { id: 'ollama', name: 'Ollama (本地)', baseUrl: `${OLLAMA_BASE_URL}/v1`, apiKey: '', models: ollamaModels, enabled: true })
      }
      for (const m of ollamaModels) {
        const existing = kvList('models').find((x: any) => x.id === m.id)
        if (!existing) kvUpsert('models', m.id, m)
      }
      console.log('[Ollama] Detected', ollamaModels.length, 'local models')
    })
    .catch(() => {})
})

app.on('before-quit', () => { destroyTray() })
app.on('window-all-closed', () => {
  closeDB()
  if (process.platform !== 'darwin') app.quit()
})
