import { appendFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'

let LOG_DIR = ''
const MAX_LOG_SIZE = 5 * 1024 * 1024
const MAX_LOG_FILES = 5

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const LEVEL_ICON: Record<LogLevel, string> = { debug: '\u{1f50d}', info: '\u{1f4d8}', warn: '\u26a0\ufe0f', error: '\u274c' }

let minLevel: LogLevel = 'info'
let logCount = 0
const ROTATE_EVERY = 100
let rendererSend: ((level: string, ...args: any[]) => void) | null = null

function getLogDir(): string {
  if (!LOG_DIR) {
    try {
      const { app } = require('electron')
      LOG_DIR = join(app.getPath('userData'), 'logs')
    } catch {
      LOG_DIR = join(process.cwd(), 'logs')
    }
  }
  return LOG_DIR
}

function getLogFile(): string {
  const dir = getLogDir()
  mkdirSync(dir, { recursive: true })
  const today = new Date().toISOString().slice(0, 10)
  return join(dir, `aaronclaw-${today}.log`)
}

function rotateIfNeeded() {
  try {
    const dir = getLogDir()
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.log'))
      .map(f => ({ name: f, size: statSync(join(dir, f)).size, time: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time)
    for (const file of files.slice(MAX_LOG_FILES)) {
      unlinkSync(join(dir, file.name))
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
  try { rendererSend?.(level, `[${module}] ${message}`, data ? data : '') } catch {}
  try {
    appendFileSync(getLogFile(), line, 'utf8')
    if (++logCount >= ROTATE_EVERY) { logCount = 0; rotateIfNeeded() }
  } catch {}
}

export const logger = {
  debug: (mod: string, msg: string, data?: any) => log('debug', mod, msg, data),
  info: (mod: string, msg: string, data?: any) => log('info', mod, msg, data),
  warn: (mod: string, msg: string, data?: any) => log('warn', mod, msg, data),
  error: (mod: string, msg: string, data?: any) => log('error', mod, msg, data),
  setLevel: (level: LogLevel) => { minLevel = level },
  setRendererSend: (fn: (level: string, ...args: any[]) => void) => { rendererSend = fn },
  getLogDir: () => getLogDir(),
  /** Override console.log/warn/error to also forward to renderer + log file */
  patchConsole: () => {
    const origLog = console.log, origWarn = console.warn, origError = console.error
    console.log = (...args: any[]) => { origLog(...args); rendererSend?.('info', ...args) }
    console.warn = (...args: any[]) => { origWarn(...args); rendererSend?.('warn', ...args) }
    console.error = (...args: any[]) => { origError(...args); rendererSend?.('error', ...args) }
  },
}