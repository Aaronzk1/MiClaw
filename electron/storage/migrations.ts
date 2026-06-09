import { logger } from '../ipc/logger'
import { getDB } from './db'

interface Migration {
  version: number
  description: string
  up: string[]
}

const migrations: Migration[] = [
  { version: 1, description: 'Initial schema', up: [] },
  {
    version: 2,
    description: 'Add API Key encryption flag',
    up: [`ALTER TABLE kv ADD COLUMN encrypted INTEGER DEFAULT 0`],
  },
  {
    version: 3,
    description: 'Add conversation forking support',
    up: [
      `ALTER TABLE messages ADD COLUMN parent_msg_id TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_msg_parent ON messages(parent_msg_id)`,
    ],
  },
  {
    version: 4,
    description: 'Add execution log table',
    up: [
      `CREATE TABLE IF NOT EXISTS exec_logs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        command TEXT,
        result TEXT,
        duration INTEGER,
        timestamp TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_exec_type ON exec_logs(type)`,
    ],
  },
  {
    version: 5,
    description: 'Add RAG documents table',
    up: [
      `CREATE TABLE IF NOT EXISTS rag_chunks (
        id TEXT PRIMARY KEY,
        doc_id TEXT NOT NULL,
        chunk_idx INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_rag_doc ON rag_chunks(doc_id)`,
    ],
  },
  {
    version: 6,
    description: 'Add workflow table',
    up: [
      `CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )`,
    ],
  },
]

export function getCurrentVersion(): number {
  try {
    const db = getDB()
    db.exec(`CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      description TEXT,
      applied_at TEXT DEFAULT (datetime('now'))
    )`)
    const row = db.prepare('SELECT MAX(version) as v FROM migrations').get() as any
    return row?.v || 0
  } catch {
    return 0
  }
}

export function runMigrations(): number {
  const current = getCurrentVersion()
  const pending = migrations.filter(m => m.version > current)

  if (pending.length === 0) {
    logger.info('Migration', `Database is up to date (v${current})`)
    return current
  }

  logger.info('Migration', `Found ${pending.length} pending migrations (v${current} -> v${pending[pending.length - 1].version})`)
  const db = getDB()

  for (const migration of pending) {
    try {
      logger.info('Migration', `Running v${migration.version}: ${migration.description}`)
      db.transaction(() => {
        for (const sql of migration.up) {
          if (sql.trim()) db.exec(sql)
        }
        db.prepare('INSERT OR REPLACE INTO migrations (version, description) VALUES (?, ?)')
          .run(migration.version, migration.description)
      })()
      logger.info('Migration', `v${migration.version} done`)
    } catch (e: any) {
      if (e.message.includes('duplicate column') || e.message.includes('already exists')) {
        logger.warn('Migration', `v${migration.version} already applied, skipping`)
        db.prepare('INSERT OR IGNORE INTO migrations (version, description) VALUES (?, ?)')
          .run(migration.version, migration.description)
      } else {
        logger.error('Migration', `v${migration.version} failed: ${e.message}`)
        break
      }
    }
  }
  return getCurrentVersion()
}