import { existsSync, mkdirSync, copyFileSync, readdirSync, unlinkSync, statSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { getDB } from './db'
import { logger } from '../ipc/logger'

const BACKUP_DIR = join(app.getPath('userData'), 'backups')
const MAX_BACKUPS = 10

export interface BackupMeta {
  timestamp: string
  size: number
  messages: number
  conversations: number
}

export function createBackup(): BackupMeta | null {
  try {
    mkdirSync(BACKUP_DIR, { recursive: true })
    const dbPath = join(app.getPath('userData'), 'data', 'aaronclaw.db')
    if (!existsSync(dbPath)) return null

    const db = getDB()
    db.pragma('wal_checkpoint(TRUNCATE)')

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = join(BACKUP_DIR, `aaronclaw-${timestamp}.db`)
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
    const files = readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.db'))
      .map(f => ({ name: f, time: statSync(join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time)
    for (const file of files.slice(MAX_BACKUPS)) {
      unlinkSync(join(BACKUP_DIR, file.name))
      const metaPath = join(BACKUP_DIR, file.name.replace('.db', '.json'))
      if (existsSync(metaPath)) unlinkSync(metaPath)
    }
  } catch {}
}

export function listBackups(): Array<BackupMeta & { path: string }> {
  mkdirSync(BACKUP_DIR, { recursive: true })
  return readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const meta = JSON.parse(readFileSync(join(BACKUP_DIR, f), 'utf8'))
        return { ...meta, path: join(BACKUP_DIR, f.replace('.json', '.db')) }
      } catch { return null }
    })
    .filter(Boolean)
    .sort((a, b) => (b!.timestamp || '').localeCompare(a!.timestamp || ''))
}

export function restoreBackup(backupPath: string): boolean {
  try {
    if (!existsSync(backupPath)) return false
    const dbPath = join(app.getPath('userData'), 'data', 'aaronclaw.db')
    createBackup()
    const { closeDB } = require('./db')
    closeDB()
    copyFileSync(backupPath, dbPath)
    logger.info('Backup', `Restored from: ${backupPath}`)
    return true
  } catch (e: any) {
    logger.error('Backup', `Restore failed: ${e.message}`)
    return false
  }
}

let backupTimer: NodeJS.Timeout | null = null

export function startAutoBackup(intervalMs = 3600000) {
  if (backupTimer) clearInterval(backupTimer)
  setTimeout(() => createBackup(), 5 * 60 * 1000)
  backupTimer = setInterval(() => createBackup(), intervalMs)
  logger.info('Backup', `Auto-backup started, interval: ${intervalMs / 60000} min`)
}