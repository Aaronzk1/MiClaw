import { ipcMain, BrowserWindow, shell, app } from 'electron'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import { kvList, kvGet, kvUpsert, kvDelete } from '../storage/db'
import { encryptProvider, decryptProvider, encryptSecret, decryptSecret } from '../storage/crypto'
import { logger } from './logger'

let mainWindow: BrowserWindow | null = null
export function setMainWindow(w: BrowserWindow | null) { mainWindow = w }
export function getMainWindow() { return mainWindow }

export function setupCoreIPC() {
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => { if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize() })
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('config:get', () => loadConfig())
  ipcMain.handle('config:save', (_, c) => {
    if (c.ai?.apiKey) c.ai.apiKey = encryptSecret(c.ai.apiKey)
    kvUpsert('config', 'main', c)
    return true
  })

  ipcMain.handle('conv:list', () => kvList('conversations').sort((a: any, b: any) => (b.updatedAt || '').localeCompare(a.updatedAt || '')))
  ipcMain.handle('conv:create', (_, title, model) => {
    const { randomUUID } = require('crypto')
    const id = randomUUID(); const now = new Date().toISOString()
    kvUpsert('conversations', id, { id, title, model: model || 'openclaw', createdAt: now, updatedAt: now })
    return id
  })
  ipcMain.handle('conv:delete', (_, id) => {
    kvDelete('conversations', id)
    const { msgDeleteByConv } = require('../storage/db')
    msgDeleteByConv(id)
  })
  ipcMain.handle('conv:messages', (_, cid) => {
    const { msgList } = require('../storage/db')
    return msgList(cid)
  })
  ipcMain.handle('conv:saveMessage', (_, cid, role, content) => {
    const { msgAdd } = require('../storage/db')
    msgAdd(cid, role, content)
  })

  // ─── CRUD with encryption for providers ───
  ipcMain.handle('agents:list', () => kvList('agents'))
  ipcMain.handle('agents:save', (_, item: any) => { kvUpsert('agents', item.id, item) })
  ipcMain.handle('agents:delete', (_, id: string) => { kvDelete('agents', id) })
  ipcMain.handle('agents:toggle', (_, id: string, en: boolean) => { const item = kvGet('agents', id); if (item) { item.enabled = en; kvUpsert('agents', id, item) } })

  ipcMain.handle('providers:list', () => kvList('providers').map(decryptProvider))
  ipcMain.handle('providers:save', (_, item: any) => { kvUpsert('providers', item.id, encryptProvider(item)) })
  ipcMain.handle('providers:delete', (_, id: string) => { kvDelete('providers', id) })
  ipcMain.handle('providers:toggle', (_, id: string, en: boolean) => { const item = kvGet('providers', id); if (item) { item.enabled = en; kvUpsert('providers', id, item) } })

  ipcMain.handle('skills:list', () => kvList('skills'))
  ipcMain.handle('skills:save', (_, item: any) => { kvUpsert('skills', item.id, item) })
  ipcMain.handle('skills:delete', (_, id: string) => { kvDelete('skills', id) })
  ipcMain.handle('skills:toggle', (_, id: string, en: boolean) => { const item = kvGet('skills', id); if (item) { item.enabled = en; kvUpsert('skills', id, item) } })

  ipcMain.handle('memory:list', () => kvList('memory'))
  ipcMain.handle('memory:save', (_, item: any) => { kvUpsert('memory', item.id, item) })
  ipcMain.handle('memory:delete', (_, id: string) => { kvDelete('memory', id) })
  ipcMain.handle('memory:toggle', (_, id: string, en: boolean) => { const item = kvGet('memory', id); if (item) { item.enabled = en; kvUpsert('memory', id, item) } })

  ipcMain.handle('cron:list', () => kvList('cron'))
  ipcMain.handle('cron:save', (_, item: any) => { kvUpsert('cron', item.id, item) })
  ipcMain.handle('cron:delete', (_, id: string) => { kvDelete('cron', id) })
  ipcMain.handle('cron:toggle', (_, id: string, en: boolean) => { const item = kvGet('cron', id); if (item) { item.enabled = en; kvUpsert('cron', id, item) } })

  ipcMain.handle('mcp:list', () => kvList('mcp'))
  ipcMain.handle('mcp:save', (_, item: any) => { kvUpsert('mcp', item.id, item) })
  ipcMain.handle('mcp:delete', (_, id: string) => { kvDelete('mcp', id) })
  ipcMain.handle('mcp:toggle', (_, id: string, en: boolean) => { const item = kvGet('mcp', id); if (item) { item.enabled = en; kvUpsert('mcp', id, item) } })

  ipcMain.handle('models:list', () => kvList('models'))
  ipcMain.handle('models:save', (_, item: any) => { kvUpsert('models', item.id, item) })
  ipcMain.handle('models:toggle', (_, id: string, en: boolean) => { const item = kvGet('models', id); if (item) { item.enabled = en; kvUpsert('models', id, item) } })

  ipcMain.handle('memory:add', (_, content: string, category: string) => {
    const id = 'mem-' + Date.now()
    kvUpsert('memory', id, { id, content, category, importance: 0.5, createdAt: new Date().toISOString() })
    return id
  })
  ipcMain.handle('memory:search', (_, query: string) => {
    return kvList('memory').filter((m: any) => m.content.toLowerCase().includes(query.toLowerCase()))
  })

  ipcMain.handle('files:list', (_, dir) => {
    const base = dir || app.getPath('home')
    try {
      return readdirSync(base, { withFileTypes: true }).filter(e => !e.name.startsWith('.')).map(e => {
        const full = join(base, e.name); let st = {} as any; try { st = statSync(full) } catch {}
        return { name: e.name, path: full, isDir: e.isDirectory(), size: st.size || 0, modified: st.mtime?.toISOString() || '' }
      }).sort((a, b) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0) || a.name.localeCompare(b.name))
    } catch { return [] }
  })
  ipcMain.handle('files:openExternal', (_, fp) => { shell.openPath(fp) })

  ipcMain.handle('system:info', () => ({
    version: app.getVersion(), platform: process.platform, arch: process.arch,
    electron: process.versions.electron, chrome: process.versions.chrome,
    node: process.versions.node, userData: app.getPath('userData')
  }))
  ipcMain.handle('settings:get', (_, key) => { const s = kvGet('settings', key); return s })
  ipcMain.handle('settings:set', (_, key, value) => { kvUpsert('settings', key, value) })

  // ─── Crypto ───
  ipcMain.handle('crypto:encrypt', (_, text: string) => encryptSecret(text))
  ipcMain.handle('crypto:decrypt', (_, encoded: string) => decryptSecret(encoded))

  // ─── Logs ───
  ipcMain.handle('logs:list', () => {
    const { readdirSync, mkdirSync } = require('fs')
    const logDir = logger.getLogDir()
    mkdirSync(logDir, { recursive: true })
    return readdirSync(logDir).filter((f: string) => f.endsWith('.log')).sort().reverse()
  })
  ipcMain.handle('logs:read', (_, filename: string) => {
    const { existsSync, readFileSync } = require('fs')
    const path = require('path').join(logger.getLogDir(), filename)
    if (!existsSync(path)) return ''
    const content = readFileSync(path, 'utf8')
    const lines = content.split('\n')
    return lines.slice(-2000).join('\n')
  })
  ipcMain.handle('logs:dir', () => logger.getLogDir())
}

import { randomUUID } from 'crypto'
import { msgList, msgAdd, msgDeleteByConv } from '../storage/db'

export function loadConfig(): any {
  return kvGet('config', 'main') || { gateway: { port: 18789, host: '127.0.0.1' }, ai: { provider: 'openclaw', model: 'openclaw', maxTokens: 4096, temperature: 0.7 } }
}