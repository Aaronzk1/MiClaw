import { ipcMain } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { kvUpsert, kvGet, kvList } from '../storage/db'

export function setupSystemIPC() {
  ipcMain.handle('draft:save', (_, convId, text) => { kvUpsert('drafts', convId, { text, savedAt: new Date().toISOString() }) })
  ipcMain.handle('draft:get', (_, convId) => { const d = kvGet('drafts', convId); return d?.text || '' })

  ipcMain.handle('data:export', () => {
    const backupDir = join(app.getPath('desktop'), 'aaronclaw-backup-' + Date.now())
    mkdirSync(backupDir, { recursive: true })
    const dbPath = join(app.getPath('userData'), 'data', 'aaronclaw.db')
    if (existsSync(dbPath)) { copyFileSync(dbPath, join(backupDir, 'aaronclaw.db')); return { ok: true, path: backupDir } }
    return { ok: false, error: 'DB not found' }
  })
  ipcMain.handle('data:import', (_, path) => {
    try {
      const src = join(path, 'aaronclaw.db')
      if (existsSync(src)) { copyFileSync(src, join(app.getPath('userData'), 'data', 'aaronclaw.db')); return { ok: true } }
      return { ok: false, error: 'Backup file not found' }
    } catch (e) { return { ok: false, error: (e as Error).message } }
  })

  ipcMain.handle('health:check', async () => {
    const config = kvGet('config', 'main') || {}; const port = config.gateway?.port || 18789
    try { await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) }); return { gateway: true, port } } catch { return { gateway: false, port } }
  })

  ipcMain.handle('crypto:encrypt', (_, text) => {
    try { const { safeStorage } = require('electron'); if (!safeStorage.isEncryptionAvailable()) return text; return safeStorage.encryptString(text).toString('base64') } catch { return text }
  })
  ipcMain.handle('crypto:decrypt', (_, encoded) => {
    try { const { safeStorage } = require('electron'); if (!safeStorage.isEncryptionAvailable()) return encoded; return safeStorage.decryptString(Buffer.from(encoded, 'base64')) } catch { return encoded }
  })

  ipcMain.handle('notify', (_, title, body) => {
    try { const { Notification } = require('electron'); if (Notification.isSupported()) new Notification({ title, body }).show() } catch {}
  })
}
