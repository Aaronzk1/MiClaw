// Hot cache for chat:send — eliminates repeated SQLite kvList() calls
// Invalidation: call invalidate() after any kvUpsert/kvDelete/kvUpsertMany

import { kvList } from '../storage/db'

interface CacheEntry {
  data: any[]
  ts: number
}

const CACHE_TTL = 30_000 // 30 seconds
const cache = new Map<string, CacheEntry>()

function get(namespace: string): any[] {
  const entry = cache.get(namespace)
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data
  const data = kvList(namespace)
  cache.set(namespace, { data, ts: Date.now() })
  return data
}

export function cacheAgents() { return get('agents') }
export function cacheProviders() { return get('providers') }
export function cacheModels() { return get('models') }

export function invalidate(namespace?: string) {
  if (namespace) {
    cache.delete(namespace)
  } else {
    cache.clear()
  }
}
