import { existsSync, mkdirSync, copyFileSync, readdirSync, unlinkSync, statSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { getDB } from './db'
import { logger } from '../ipc/logger'

let _backupDir = ''
function getBackupDir(): string {
  if (!_backupDir) { _backupDir = join(app.getPath('userData'), 'backups'); mkdirSync(_backupDir, { recursive: true }) }
  return _backupDir
}

const MAX_BACKUPS = 10

export interface BackupMeta {
  timestamp: string
  size: number
  messages: number
  conversations: number
}

export function createBackup(): BackupMeta | null {
  try {
    const dir = getBackupDir()
    const dbPath = join(app.getPath('userData'), 'data', 'aaronclaw.db')
    if (!existsSync(dbPath)) return null

    const db = getDB()
    db.pragma('wal_checkpoint(TRUNCATE)')

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = join(dir, `aaronclaw-${timestamp}.db`)
    copyFileSync(dbPath, backupPath)

    const stats = statSync(backupPath)
    const msgCount = db.prepare('SELECT COUNT(*) as c FROM messages').get() as any
    const convCount = db.prepare("SELECT COUNT(*) as c FROM kv WHERE ns='conversations'").get() as any

    const meta: BackupMeta = {
      timestamp: new Date().toISOString(),
      size: stats.size,
      messages: msgCount.c,
      conversations: convCount.c,
    }

    const metaPath = backupPath.replace('.db', '.json')
    writeFileSync(metaPath, JSON.stringify(meta, null, 2))
    cleanupOldBackups()

    logger.info('Backup', `Created: ${backupPath} (${(stats.size / 1024).toFixed(0)}KB)`)
    return meta
  } catch (e: any) {
    logger.error('Backup', `Failed: ${e.message}`)
    return null
  }
}

function cleanupOldBackups() {
  try {
    const dir = getBackupDir()
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.db'))
      .map(f => ({ name: f, time: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time)
    for (const file of files.slice(MAX_BACKUPS)) {
      unlinkSync(join(dir, file.name))
      const metaPath = join(dir, file.name.replace('.db', '.json'))
      if (existsSync(metaPath)) unlinkSync(metaPath)
    }
  } catch {}
}

let backupTimer: NodeJS.Timeout | null = null

export function startAutoBackup(intervalMs = 3600000) {
  if (backupTimer) clearInterval(backupTimer)
  setTimeout(() => createBackup(), 5 * 60 * 1000)
  backupTimer = setInterval(() => createBackup(), intervalMs)
  logger.info('Backup', `Auto-backup started, interval: ${intervalMs / 60000} min`)
}