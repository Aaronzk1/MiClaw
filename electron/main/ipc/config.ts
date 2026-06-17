import { ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import { kvList, kvGet, kvUpsert, kvDelete, msgAdd, msgList, msgDeleteByConv } from '../../storage/db'
import { invalidate } from '../../ipc/chat-cache'
import { loadConfig, restartGateway } from '../gateway'
import { DEFAULT_MODEL, DEFAULT_AGENT_ID } from '../../constants'

// ═══════════════════════════════════════════════════
// Sync MiClaw providers → OpenClaw gateway config
// ═══════════════════════════════════════════════════

function getOpenClawConfigPath(): string {
  return join(require('os').homedir(), '.openclaw', 'openclaw.json')
}

function getAuthProfilesPath(): string {
  return join(require('os').homedir(), '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json')
}

function readOpenClawConfig(): any {
  const p = getOpenClawConfigPath()
  if (!existsSync(p)) return {}
  try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return {} }
}

function writeOpenClawConfig(cfg: any) {
  const p = getOpenClawConfigPath()
  const dir = require('path').dirname(p)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf-8')
}

/** Update Gateway auth store so it uses the latest API key */
function updateAuthStore(providerId: string, apiKey: string) {
  if (!apiKey) return
  const p = getAuthProfilesPath()
  const dir = require('path').dirname(p)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  let auth: any = { version: 1, profiles: {} }
  if (existsSync(p)) {
    try { auth = JSON.parse(readFileSync(p, 'utf-8')) } catch {}
    if (!auth.profiles) auth.profiles = {}
  }
  const profileKey = `${providerId}:default`
  auth.profiles[profileKey] = { type: 'api_key', provider: providerId, key: apiKey }
  writeFileSync(p, JSON.stringify(auth, null, 2), 'utf-8')
  console.log('[Sync] Auth store updated:', profileKey)
}

/** Map MiClaw provider to OpenClaw config format */
function mapProviderToOpenClaw(provider: any): any {
  // Skip providers without baseUrl (can't route without it)
  if (!provider.baseUrl) return null
  const result: any = {}
  if (provider.apiKey) result.apiKey = provider.apiKey
  result.baseUrl = provider.baseUrl
  result.api = provider.api || 'openai-completions'
  if (provider.models && Array.isArray(provider.models)) {
    result.models = provider.models.map((m: any) => ({
      id: m.id || m.name,
      name: m.name || m.id,
      contextWindow: m.contextWindow || 128000,
      maxTokens: m.maxTokens || 4096,
      reasoning: m.reasoning !== false,
    }))
  }
  return result
}

/** Ensure gateway config has required fields for API to work */
function ensureGatewayConfig(cfg: any): any {
  if (!cfg.gateway) cfg.gateway = {}
  cfg.gateway.mode = cfg.gateway.mode || 'local'
  if (!cfg.gateway.auth) cfg.gateway.auth = { mode: 'none' }
  if (!cfg.gateway.http) cfg.gateway.http = {}
  if (!cfg.gateway.http.endpoints) cfg.gateway.http.endpoints = {}
  if (!cfg.gateway.http.endpoints.chatCompletions) cfg.gateway.http.endpoints.chatCompletions = { enabled: true }
  return cfg
}

/** Sync one provider to OpenClaw config — merge with existing to preserve apiKey */
function syncProviderToGateway(provider: any) {
  try {
    const cfg = ensureGatewayConfig(readOpenClawConfig())
    if (!cfg.models) cfg.models = {}
    if (!cfg.models.providers) cfg.models.providers = {}
    const existing = cfg.models.providers[provider.id] || {}
    const mapped = mapProviderToOpenClaw(provider)
    if (mapped) {
      // Preserve existing apiKey if new one is missing
      if (!mapped.apiKey && existing.apiKey) mapped.apiKey = existing.apiKey
      cfg.models.providers[provider.id] = { ...existing, ...mapped }
    }
    writeOpenClawConfig(cfg)
    // Update auth store so Gateway uses the latest key
    if (provider.apiKey) updateAuthStore(provider.id, provider.apiKey)
    console.log('[Sync] Provider synced to Gateway:', provider.id)
  } catch (e) {
    console.warn('[Sync] Failed to sync provider:', (e as Error).message)
  }
}

/** Sync all providers to OpenClaw config */
export function syncAllProvidersToGateway() {
  try {
    const cfg = ensureGatewayConfig(readOpenClawConfig())
    cfg.models = cfg.models || {}
    // Merge with existing providers — don't wipe config-only providers
    if (!cfg.models.providers) cfg.models.providers = {}
    const existingProviders = { ...cfg.models.providers }
    const { safeStorage } = require('electron')
    for (const p of kvList('providers')) {
      if (p.enabled !== false) {
        const provider = { ...p }
        if (provider.apiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
          try { provider.apiKey = safeStorage.decryptString(Buffer.from(provider.apiKeyEncrypted, 'base64')) } catch {}
        }
        const mapped = mapProviderToOpenClaw(provider)
        if (mapped) {
          // Preserve existing apiKey if new one is missing
          const prev = existingProviders[p.id]
          if (!mapped.apiKey && prev?.apiKey) mapped.apiKey = prev.apiKey
          cfg.models.providers[p.id] = { ...prev, ...mapped }
        }
        // Update auth store
        if (provider.apiKey) updateAuthStore(provider.id, provider.apiKey)
      }
    }
    writeOpenClawConfig(cfg)
    console.log('[Sync] All providers synced to Gateway')
  } catch (e) {
    console.warn('[Sync] Failed to sync providers:', (e as Error).message)
  }
}

export function registerConfigIpc(getMainWindow: () => Electron.BrowserWindow | null) {
  ipcMain.handle('window:minimize', () => getMainWindow()?.minimize())
  ipcMain.handle('window:maximize', () => { const w = getMainWindow(); if (w?.isMaximized()) w.unmaximize(); else w?.maximize() })
  ipcMain.handle('window:close', () => getMainWindow()?.close())
  ipcMain.handle('config:get', () => loadConfig())
  ipcMain.handle('config:save', (_, c) => {
    kvUpsert('config', 'main', c)
    invalidate()
    return true
  })

  ipcMain.handle('conv:list', () => kvList('conversations').sort((a: any, b: any) => (b.updatedAt || '').localeCompare(a.updatedAt || '')))
  ipcMain.handle('conv:create', (_, title, model, agentId) => {
    const id = randomUUID(); const now = new Date().toISOString()
    kvUpsert('conversations', id, { id, title, model: model || DEFAULT_MODEL, agentId: agentId || DEFAULT_AGENT_ID, createdAt: now, updatedAt: now })
    return id
  })
  ipcMain.handle('conv:delete', (_, id) => { if (!id) return; kvDelete('conversations', id); msgDeleteByConv(id) })
  ipcMain.handle('conv:messages', (_, cid) => msgList(cid))
  ipcMain.handle('conv:saveMessage', (_, cid, role, content, toolCalls, thinking) => { msgAdd(cid, role, content, 0, toolCalls, thinking) })
  ipcMain.handle('conv:updateTitle', (_, cid, title) => {
    const conv = kvGet('conversations', cid)
    if (conv) { conv.title = title; kvUpsert('conversations', cid, conv) }
    return true
  })

  ipcMain.handle('agents:list', () => kvList('agents'))
  ipcMain.handle('agents:save', (_, item) => { if (!item?.id) return; kvUpsert('agents', item.id, item); invalidate('agents') })
  ipcMain.handle('agents:delete', (_, id) => { if (!id) return; kvDelete('agents', id); invalidate('agents') })
  ipcMain.handle('agents:toggle', (_, id, en) => { const item = kvGet('agents', id); if (item) { item.enabled = en; kvUpsert('agents', id, item); invalidate('agents') } })

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
    kvUpsert('providers', item.id, item); invalidate('providers')
    syncProviderToGateway(item)
    // Restart Gateway so it picks up the new provider config
    restartGateway().catch((e: any) => console.warn('[Sync] Gateway restart failed:', e.message))
  })
  ipcMain.handle('providers:delete', (_, id) => { if (!id) return; kvDelete('providers', id); invalidate('providers'); syncAllProvidersToGateway() })
  ipcMain.handle('providers:toggle', (_, id, en) => { const item = kvGet('providers', id); if (item) { item.enabled = en; kvUpsert('providers', id, item); invalidate('providers'); syncProviderToGateway(item) } })


  ipcMain.handle('generatedFiles:list', () => {
    try { return kvList('generated_files').sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || '')) } catch { return [] }
  })
  ipcMain.handle('generatedFiles:delete', (_, id: string) => { kvDelete('generated_files', id) })
  ipcMain.handle('generatedFiles:clear', () => {
    const items = kvList('generated_files') as any[]
    for (const item of items) kvDelete('generated_files', item.id || item.path)
  })


  ipcMain.handle('models:list', () => kvList('models'))
  ipcMain.handle('models:save', (_, item) => { kvUpsert('models', item.id, item); invalidate('models') })
  ipcMain.handle('models:delete', (_, id) => { kvDelete('models', id); invalidate('models') })
  ipcMain.handle('models:toggle', (_, id, en) => { const item = kvGet('models', id); if (item) { item.enabled = en; kvUpsert('models', id, item); invalidate('models') } })
}
