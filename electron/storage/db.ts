import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { randomUUID } from 'crypto'

let db: Database.Database | null = null

export function initDB(dataDir: string): Database.Database {
  if (db) return db
  mkdirSync(dataDir, { recursive: true })
  db = new Database(join(dataDir, 'aaronclaw.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('synchronous = NORMAL')
  db.pragma('cache_size = -64000')
  db.pragma('temp_store = MEMORY')
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      ns TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (ns, id)
    );
    CREATE INDEX IF NOT EXISTS idx_kv_ns ON kv(ns);
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conv_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      tokens INTEGER DEFAULT 0,
      pinned INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conv_id);
    CREATE TABLE IF NOT EXISTS gc_messages (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      bookmarked INTEGER DEFAULT 0,
      pinned INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_gcmsg_group ON gc_messages(group_id);
  `)
  try { db.exec('ALTER TABLE messages ADD COLUMN pinned INTEGER DEFAULT 0') } catch {}
  try { db.exec('ALTER TABLE gc_messages ADD COLUMN bookmarked INTEGER DEFAULT 0') } catch {}
  try { db.exec('ALTER TABLE gc_messages ADD COLUMN pinned INTEGER DEFAULT 0') } catch {}
  try { db.exec('ALTER TABLE messages ADD COLUMN tool_calls TEXT') } catch {}
  try { db.exec('ALTER TABLE messages ADD COLUMN thinking TEXT') } catch {}
  try { db.exec('ALTER TABLE messages ADD COLUMN tool_call_id TEXT') } catch {}
  // FTS5 for memory full-text search
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(id, content, category, tokenize='unicode61')`)
    // Only backfill if FTS table is empty
    const ftsCount = (db.prepare('SELECT COUNT(*) as c FROM memory_fts').get() as any)?.c || 0
    if (ftsCount === 0) {
      const existing = db.prepare("SELECT data FROM kv WHERE ns = 'memory'").all() as any[]
      const insert = db.prepare('INSERT OR REPLACE INTO memory_fts (id, content, category) VALUES (?, ?, ?)')
      const tx = db.transaction((rows: any[]) => {
        for (const row of rows) {
          try {
            const d = JSON.parse(row.data)
            insert.run(d.id, d.content || '', d.category || 'general')
          } catch {}
        }
      })
      tx(existing)
    }
  } catch (e) { console.error('[DB] FTS5 init failed:', (e as Error).message) }
  return db
}

export function getDB(): Database.Database {
  if (!db) throw new Error('DB not initialized')
  return db
}

export function closeDB() {
  if (db) { db.close(); db = null }
}

export function transaction<T>(fn: () => T): T {
  return getDB().transaction(fn)()
}

// ─── Input validation ───
export function validateId(id: string): string {
  if (!id || typeof id !== 'string') throw new Error('Invalid id')
  if (id.length > 200) throw new Error('Id too long')
  return id
}

export function validateNs(ns: string): string {
  const allowed = ['agents', 'providers', 'models', 'skills', 'memory', 'cron', 'mcp',
    'groups', 'conversations', 'config', 'settings', 'drafts', 'prompts',
    'documents', 'embeddings', 'workflows', 'rag', 'rag_history', 'cron_history']
  if (!allowed.includes(ns)) throw new Error(`Invalid namespace: ${ns}`)
  return ns
}

export function validateData(data: any): string {
  const json = JSON.stringify(data)
  if (json.length > 1024 * 1024) throw new Error('Data too large (>1MB)')
  return json
}

// ─── KV Store ───
export function kvList<T = any>(ns: string): T[] {
  validateNs(ns)
  return getDB().prepare('SELECT data FROM kv WHERE ns = ?').all(ns).map((r: any) => JSON.parse(r.data))
}

export function kvGet<T = any>(ns: string, id: string): T | null {
  validateNs(ns)
  validateId(id)
  const row = getDB().prepare('SELECT data FROM kv WHERE ns = ? AND id = ?').get(ns, id) as any
  return row ? JSON.parse(row.data) : null
}

export function kvUpsert(ns: string, id: string, data: any) {
  validateNs(ns)
  validateId(id)
  const json = validateData(data)
  getDB().prepare('INSERT OR REPLACE INTO kv (ns, id, data, updated_at) VALUES (?, ?, ?, datetime(\'now\'))').run(ns, id, json)
}

export function kvDelete(ns: string, id: string) {
  validateNs(ns)
  validateId(id)
  getDB().prepare('DELETE FROM kv WHERE ns = ? AND id = ?').run(ns, id)
}

export function kvCount(ns: string): number {
  validateNs(ns)
  const row = getDB().prepare('SELECT COUNT(*) as c FROM kv WHERE ns = ?').get(ns) as any
  return row.c
}

export function kvUpsertMany(ns: string, items: any[], idKey = 'id') {
  validateNs(ns)
  const stmt = getDB().prepare('INSERT OR REPLACE INTO kv (ns, id, data, updated_at) VALUES (?, ?, ?, datetime(\'now\'))')
  const tx = getDB().transaction((list: any[]) => {
    for (const item of list) {
      validateId(item[idKey])
      stmt.run(ns, item[idKey], validateData(item))
    }
  })
  tx(items)
}

// ─── Messages ───
export function msgList(convId: string) {
  validateId(convId)
  return getDB().prepare('SELECT role, content, timestamp, tokens, pinned, tool_calls, thinking, tool_call_id FROM messages WHERE conv_id = ? ORDER BY rowid').all(convId)
}

export function msgAdd(convId: string, role: string, content: string, tokens = 0, toolCalls?: string, thinking?: string, toolCallId?: string): string {
  validateId(convId)
  if (!['user', 'assistant', 'system', 'tool'].includes(role)) throw new Error('Invalid role')
  if (content.length > 500000) throw new Error('Message too large')
  const id = 'msg-' + Date.now() + '-' + randomUUID().slice(0, 8)
  transaction(() => {
    getDB().prepare('INSERT INTO messages (id, conv_id, role, content, tokens, tool_calls, thinking, tool_call_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, convId, role, content, tokens, toolCalls || null, thinking || null, toolCallId || null)
    getDB().prepare('UPDATE kv SET updated_at = datetime(\'now\') WHERE ns = ? AND id = ?').run('conversations', convId)
  })
  return id
}

export function msgDeleteByConv(convId: string) {
  validateId(convId)
  getDB().prepare('DELETE FROM messages WHERE conv_id = ?').run(convId)
}

export function msgCount(convId: string): number {
  validateId(convId)
  const row = getDB().prepare('SELECT COUNT(*) as c FROM messages WHERE conv_id = ?').get(convId) as any
  return row.c
}

export function msgTokens(convId: string): number {
  validateId(convId)
  const row = getDB().prepare('SELECT COALESCE(SUM(tokens), 0) as t FROM messages WHERE conv_id = ?').get(convId) as any
  return row.t
}

export function msgPin(id: string, val: boolean) {
  validateId(id)
  getDB().prepare('UPDATE messages SET pinned = ? WHERE id = ?').run(val ? 1 : 0, id)
}

// ─── GC Messages ───
export function gcMsgList(groupId: string) {
  validateId(groupId)
  return getDB().prepare('SELECT id, group_id as groupId, sender_id as senderId, sender_name as senderName, role, content, timestamp, bookmarked, pinned FROM gc_messages WHERE group_id = ? ORDER BY rowid').all(groupId)
}

export function gcMsgAdd(groupId: string, senderId: string, senderName: string, role: string, content: string) {
  validateId(groupId)
  const id = 'gm-' + Date.now() + '-' + randomUUID().slice(0, 8)
  getDB().prepare('INSERT INTO gc_messages (id, group_id, sender_id, sender_name, role, content) VALUES (?, ?, ?, ?, ?, ?)').run(id, groupId, senderId, senderName, role, content)
  return id
}

export function gcMsgBookmark(id: string, val: boolean) {
  validateId(id)
  getDB().prepare('UPDATE gc_messages SET bookmarked = ? WHERE id = ?').run(val ? 1 : 0, id)
}

export function gcMsgPin(id: string, val: boolean) {
  validateId(id)
  getDB().prepare('UPDATE gc_messages SET pinned = ? WHERE id = ?').run(val ? 1 : 0, id)
}

export function gcMsgBookmarked(groupId: string) {
  validateId(groupId)
  return getDB().prepare('SELECT id, sender_name as senderName, content, timestamp FROM gc_messages WHERE group_id = ? AND bookmarked = 1 ORDER BY rowid DESC').all(groupId)
}

export function gcMsgPinned(groupId: string) {
  validateId(groupId)
  return getDB().prepare('SELECT id, sender_name as senderName, content FROM gc_messages WHERE group_id = ? AND pinned = 1 ORDER BY rowid DESC LIMIT 3').all(groupId)
}

export function gcMsgDeleteByGroup(groupId: string) {
  validateId(groupId)
  getDB().prepare('DELETE FROM gc_messages WHERE group_id = ?').run(groupId)
}

export function gcMsgSearch(groupId: string, query: string) {
  validateId(groupId)
  const safe = query.replace(/[%_]/g, '\\$&')
  return getDB().prepare("SELECT id, sender_name as senderName, content, timestamp FROM gc_messages WHERE group_id = ? AND content LIKE ? ESCAPE '\\' ORDER BY rowid DESC LIMIT 20").all(groupId, `%${safe}%`)
}

export function searchMessages(query: string, limit = 20) {
  return getDB().prepare('SELECT conv_id as convId, role, content, timestamp FROM messages WHERE content LIKE ? ORDER BY rowid DESC LIMIT ?').all(`%${query}%`, limit)
}

// ─── Memory FTS5 ───
export function memoryFtsUpsert(id: string, content: string, category: string) {
  try { getDB().prepare('INSERT OR REPLACE INTO memory_fts (id, content, category) VALUES (?, ?, ?)').run(id, content, category) } catch (e) { console.error('[FTS] upsert failed:', (e as Error).message) }
}

export function memoryFtsDelete(id: string) {
  try { getDB().prepare('DELETE FROM memory_fts WHERE id = ?').run(id) } catch (e) { console.error('[FTS] delete failed:', (e as Error).message) }
}

export function memoryFtsSearch(query: string, limit = 5): Array<{ id: string; content: string; category: string; rank: number }> {
  try {
    return getDB().prepare('SELECT id, content, category, rank FROM memory_fts WHERE memory_fts MATCH ? ORDER BY rank LIMIT ?').all(query, limit) as any[]
  } catch {
    // Fallback to LIKE if FTS5 query syntax fails
    return getDB().prepare("SELECT id, content, category, 0 as rank FROM memory_fts WHERE content LIKE ? ORDER BY rowid LIMIT ?").all(`%${query}%`, limit) as any[]
  }
}
