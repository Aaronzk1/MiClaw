import { appendFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const LOG_DIR = join(app.getPath('userData'), 'logs')
const MAX_LOG_SIZE = 5 * 1024 * 1024
const MAX_LOG_FILES = 5

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const LEVEL_ICON: Record<LogLevel, string> = { debug: '\u{1f50d}', info: '\u{1f4d8}', warn: '\u26a0\ufe0f', error: '\u274c' }

let minLevel: LogLevel = 'info'

function getLogFile(): string {
  mkdirSync(LOG_DIR, { recursive: true })
  const today = new Date().toISOString().slice(0, 10)
  return join(LOG_DIR, `aaronclaw-${today}.log`)
}

function rotateIfNeeded() {
  try {
    const files = readdirSync(LOG_DIR)
      .filter(f => f.endsWith('.log'))
      .map(f => ({ name: f, size: statSync(join(LOG_DIR, f)).size, time: statSync(join(LOG_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time)
    for (const file of files.slice(MAX_LOG_FILES)) {
      unlinkSync(join(LOG_DIR, file.name))
    }
  } catch {}
}

export function log(level: LogLevel, module: string, message: string, data?: any) {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return
  const ts = new Date().toISOString()
  const icon = LEVEL_ICON[level]
  const dataStr = data ? ' ' + JSON.stringify(data) : ''
  const line = `[${ts}] ${icon} [${level.toUpperCase()}] [${module}] ${message}${dataStr}\n`
  const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  consoleFn(line.trim())
  try {
    appendFileSync(getLogFile(), line, 'utf8')
    rotateIfNeeded()
  } catch {}
}

export const logger = {
  debug: (mod: string, msg: string, data?: any) => log('debug', mod, msg, data),
  info: (mod: string, msg: string, data?: any) => log('info', mod, msg, data),
  warn: (mod: string, msg: string, data?: any) => log('warn', mod, msg, data),
  error: (mod: string, msg: string, data?: any) => log('error', mod, msg, data),
  setLevel: (level: LogLevel) => { minLevel = level },
  getLogDir: () => LOG_DIR,
}