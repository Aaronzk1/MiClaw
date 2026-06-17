import { ipcMain, app, shell } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { kvList, kvGet, kvUpsert, kvDelete, msgList, msgAdd, searchMessages, getDB, transaction, closeDB, initDB } from '../../storage/db'
import { invalidate } from '../../ipc/chat-cache'
import { gatewayChat, gatewayHealth, getOpenClawPort, loadConfig, restartGateway } from '../gateway'
import { errorResult, getDataDir, isPathAllowed } from '../utils'

export function registerMiscIpc() {
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
  ipcMain.handle('files:read', (_, fp) => {
    if (!isPathAllowed(fp)) return { ok: false, error: '路径不允许' }
    try {
      const st = statSync(fp)
      if (st.size > 2 * 1024 * 1024) return { ok: false, error: '文件过大(>2MB)' }
      const content = readFileSync(fp, 'utf8')
      return { ok: true, content, size: st.size }
    } catch (e) { return { ok: false, error: (e as Error).message } }
  })

  ipcMain.handle('system:info', () => ({
    version: app.getVersion(), platform: process.platform, arch: process.arch,
    electron: process.versions.electron, chrome: process.versions.chrome,
    node: process.versions.node, userData: app.getPath('userData')
  }))
  ipcMain.handle('settings:get', (_, key) => { const s = kvGet('settings', key); return s })
  ipcMain.handle('settings:set', (_, key, value) => { kvUpsert('settings', key, value) })

  ipcMain.handle('draft:save', (_, convId, text) => { kvUpsert('drafts', convId, { text, savedAt: new Date().toISOString() }) })
  ipcMain.handle('draft:get', (_, convId) => { const d = kvGet('drafts', convId); return d?.text || '' })

  ipcMain.handle('data:export', () => {
    const backupDir = join(getDataDir(), 'backups', 'export-' + Date.now())
    mkdirSync(backupDir, { recursive: true })
    const dbPath = join(getDataDir(), 'aaronclaw.db')
    if (existsSync(dbPath)) { copyFileSync(dbPath, join(backupDir, 'aaronclaw.db')); return { ok: true, path: backupDir } }
    return { ok: false, error: '数据库未找到' }
  })
  ipcMain.handle('data:import', (_, path) => {
    try {
      const src = join(path, 'aaronclaw.db')
      if (existsSync(src)) { copyFileSync(src, join(getDataDir(), 'aaronclaw.db')); invalidate(); return { ok: true } }
      return { ok: false, error: '备份文件未找到' }
    } catch (e) { return errorResult(e) }
  })

  ipcMain.handle('health:check', async () => {
    const port = getOpenClawPort()
    const gateway = await gatewayHealth(port)
    return { gateway, port }
  })


  ipcMain.handle('crypto:encrypt', (_, text) => {
    try { const { safeStorage } = require('electron'); if (!safeStorage.isEncryptionAvailable()) return text; return safeStorage.encryptString(text).toString('base64') } catch { return text }
  })
  ipcMain.handle('crypto:decrypt', (_, encoded) => {
    try { const { safeStorage } = require('electron'); if (!safeStorage.isEncryptionAvailable()) return encoded; return safeStorage.decryptString(Buffer.from(encoded, 'base64')) } catch { return encoded }
  })

  ipcMain.handle('notify', (_, title, body) => {
    const cfg = loadConfig()
    if (cfg.notifications?.desktop === false) return
    try { const { Notification } = require('electron'); if (Notification.isSupported()) new Notification({ title, body }).show() } catch {}
  })

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
        invalidate()
        return { ok: true }
      }
      return { ok: false, error: '备份文件未找到' }
    } catch (e) { return errorResult(e) }
  })

  ipcMain.handle('logs:list', () => {
    try {
      const logDir = join(app.getPath('userData'), 'logs')
      if (!existsSync(logDir)) return []
      return readdirSync(logDir).filter(f => f.endsWith('.log')).map(f => ({
        name: f, path: join(logDir, f), size: statSync(join(logDir, f)).size
      }))
    } catch { return [] }
  })
  ipcMain.handle('logs:read', (_, logPath) => {
    try { return readFileSync(logPath, 'utf8').slice(-10000) } catch { return '' }
  })
  ipcMain.handle('logs:dir', () => join(app.getPath('userData'), 'logs'))

  ipcMain.handle('channel:weixin-qr', async () => {
    try {
      const uuidResp = await fetch(`https://login.weixin.qq.com/jslogin?appid=wx782c26e4c19acffb&redirect_uri=https%3A%2F%2Flogin.weixin.qq.com%2Fcgi-bin%2Fmmwebwx-bin%2Fwebwxnewloginpage&fun=new&lang=zh_CN&_=${Date.now()}`)
      const uuidText = await uuidResp.text()
      const uuidMatch = uuidText.match(/uuid\s*=\s*"([^"]+)"/)
      if (!uuidMatch) return { ok: false, message: '获取UUID失败' }
      const uuid = uuidMatch[1]
      const qrUrl = `https://login.weixin.qq.com/qrcode/${uuid}`
      return { ok: true, uuid, qrUrl }
    } catch (e) { return { ok: false, message: (e as Error).message } }
  })
  ipcMain.handle('channel:weixin-poll', async (_, uuid: string) => {
    try {
      const resp = await fetch(`https://login.weixin.qq.com/cgi-bin/mmwebwx-bin/login?uuid=${uuid}&tip=1&_=${Date.now()}`)
      const text = await resp.text()
      if (text.includes('200')) {
        const urlMatch = text.match(/redirect_uri\s*=\s*"([^"]+)"/)
        return { status: 'confirmed', redirectUrl: urlMatch?.[1] || '' }
      }
      if (text.includes('201')) return { status: 'scanned' }
      if (text.includes('408')) return { status: 'waiting' }
      if (text.includes('400')) return { status: 'expired' }
      return { status: 'unknown', raw: text }
    } catch (e) { return { status: 'error', message: (e as Error).message } }
  })
  ipcMain.handle('channel:status', async () => {
    try {
      const port = getOpenClawPort()
      const running = await gatewayHealth(port)
      if (!running) return { running: false, channels: {} }
      const resp = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) })
      const data = await resp.json().catch(() => ({}))
      return { running: true, channels: data?.channels || {} }
    } catch { return { running: false, channels: {} } }
  })
  ipcMain.handle('channel:setup', async (_, channelId: string, credentials?: Record<string, string>) => {
    try {
      const cfg = kvGet('config', 'main') || {}
      if (!cfg.channels) cfg.channels = {}
      if (!cfg.channels[channelId]) cfg.channels[channelId] = {}
      if (credentials) Object.assign(cfg.channels[channelId], credentials)
      cfg.channels[channelId].enabled = true
      kvUpsert('config', 'main', cfg); invalidate()
      const ocDir = join(require('os').homedir(), '.openclaw')
      const ocConfigPath = join(ocDir, 'openclaw.json')
      try {
        let ocCfg: any = {}
        if (existsSync(ocConfigPath)) ocCfg = JSON.parse(readFileSync(ocConfigPath, 'utf8'))
        if (!ocCfg.channels) ocCfg.channels = {}
        if (!ocCfg.channels[channelId]) ocCfg.channels[channelId] = {}
        const envVars: Record<string, string> = {}
        if (credentials) {
          for (const [k, v] of Object.entries(credentials)) {
            if (/^[A-Z_]+$/.test(k)) envVars[k] = v
            else ocCfg.channels[channelId][k] = v
          }
        }
        ocCfg.channels[channelId].enabled = true
        writeFileSync(ocConfigPath, JSON.stringify(ocCfg, null, 2))
        if (Object.keys(envVars).length > 0) {
          const envPath = join(ocDir, '.env')
          let envContent = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
          for (const [k, v] of Object.entries(envVars)) {
            const regex = new RegExp(`^${k}=.*$`, 'm')
            if (regex.test(envContent)) envContent = envContent.replace(regex, `${k}=${v}`)
            else envContent += `\n${k}=${v}`
          }
          writeFileSync(envPath, envContent.trim() + '\n')
        }
      } catch {}
      restartGateway().catch(() => {})
      return { ok: true, message: `${channelId} 已启用，网关重启中...` }
    } catch (e) { return { ok: false, message: (e as Error).message } }
  })
  ipcMain.handle('channel:disconnect', async (_, channelId: string) => {
    try {
      const cfg = kvGet('config', 'main') || {}
      if (cfg.channels?.[channelId]) {
        cfg.channels[channelId].enabled = false
        kvUpsert('config', 'main', cfg); invalidate()
      }
      const ocConfigPath = join(require('os').homedir(), '.openclaw', 'openclaw.json')
      try {
        let ocCfg: any = {}
        if (existsSync(ocConfigPath)) ocCfg = JSON.parse(readFileSync(ocConfigPath, 'utf8'))
        if (ocCfg.channels?.[channelId]) {
          ocCfg.channels[channelId].enabled = false
          writeFileSync(ocConfigPath, JSON.stringify(ocCfg, null, 2))
        }
      } catch {}
      restartGateway().catch(() => {})
      return { ok: true }
    } catch (e) { return { ok: false, message: (e as Error).message } }
  })

  ipcMain.handle('search:messages', (_, query, limit?) => {
    const results = searchMessages(query, limit || 20)
    // Enrich with convTitle from KV store
    const titleMap = new Map<string, string>()
    for (const r of results as any[]) {
      if (!titleMap.has(r.convId)) {
        const conv = kvGet('conversations', r.convId) as any
        titleMap.set(r.convId, conv?.title || r.convId.slice(0, 12))
      }
      r.convTitle = titleMap.get(r.convId)
    }
    return results
  })
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
}
