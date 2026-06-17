import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, mkdirSync } from 'fs'
import { kvList, kvGet, kvUpsert, kvUpsertMany } from '../storage/db'
import { logger } from './logger'
import { DEFAULT_GATEWAY_PORT, DEFAULT_MODEL } from '../constants'

function getDataDir(): string {
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Seed providers and models from agents.json into SQLite.
 * Does NOT seed agents — agent behavior is controlled by OpenClaw workspace files.
 */
export function seedDefaults() {
  const candidates = [
    join(__dirname, '..', 'data', 'agents.json'),
    join(app.getAppPath(), 'data', 'agents.json'),
    join(process.cwd(), 'data', 'agents.json'),
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    try {
      const data = JSON.parse(readFileSync(p, 'utf8'))

      // Merge providers: add missing ones from json (don't overwrite existing API keys)
      const existingProviders = kvList('providers')
      const existingProvMap = new Map(existingProviders.map((p: any) => [p.id, p]))
      const jsonProviders = (data.providers || []).map((p: any) => ({ ...p, enabled: true }))
      const provToUpsert: any[] = []
      for (const jp of jsonProviders) {
        if (!existingProvMap.has(jp.id)) {
          provToUpsert.push(jp)
        }
      }
      if (provToUpsert.length > 0) {
        kvUpsertMany('providers', provToUpsert)
        logger.info('Seed', `Synced ${provToUpsert.length} missing providers`)
      }

      // Merge models: add missing ones from json
      const existingModels = kvList('models')
      const existingModelMap = new Map(existingModels.map((m: any) => [m.id, m]))
      const modelsToUpsert: any[] = []
      for (const prov of jsonProviders) for (const m of (prov.models || [])) {
        if (!existingModelMap.has(m.id)) {
          modelsToUpsert.push({ id: m.id, name: m.name, provider: prov.id, contextWindow: m.contextWindow || m.maxTokens || 128000, maxTokens: m.maxTokens || 4096, temperature: 0.7, enabled: true })
        }
      }
      if (modelsToUpsert.length > 0) kvUpsertMany('models', modelsToUpsert)
      logger.info('Seed', `Synced models from: ${p}`)
      break
    } catch (e) { logger.error('Seed', 'Error', e) }
  }
  if (!kvGet('config', 'main')) kvUpsert('config', 'main', { gateway: { port: DEFAULT_GATEWAY_PORT, host: '127.0.0.1' }, ai: { provider: DEFAULT_MODEL, model: DEFAULT_MODEL, maxTokens: 16384, temperature: 0.7 } })
}

export function migrateFromJSON() {
  const jsonDir = getDataDir()
  const collections = ['providers', 'models', 'skills', 'mcp', 'groups', 'conversations', 'config', 'settings']
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
