import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

const TRACE_FILE = join(require('os').tmpdir(), 'aaronclaw-trace.log')

export function trace(step: string, data: any) {
  try {
    const ts = new Date().toISOString().split('T')[1].replace('Z', '')
    const line = `[${ts}] ${step} | ${typeof data === 'string' ? data : JSON.stringify(data)}\n`
    require('fs').appendFileSync(TRACE_FILE, line)
  } catch {}
}

let DATA_DIR = ''

export function getDataDir(): string {
  if (!DATA_DIR) { DATA_DIR = join(app.getPath('userData'), 'data'); mkdirSync(DATA_DIR, { recursive: true }) }
  return DATA_DIR
}

export let cachedPort: number | null = null

export function setCachedPort(port: number | null) { cachedPort = port }

export function errorResult(e: any): { ok: false; error: string } {
  return { ok: false, error: (e as Error).message }
}

// Path safety — block access to sensitive system paths
const BLOCKED_PATHS = [
  /^c:\\windows\\system32/i,
  /^c:\\windows\\syswow64/i,
  /^c:\\program files/i,
  /^c:\\program files \(x86\)/i,
  /\\\.ssh\\/i,
  /\\\.aws\\/i,
  /\\\.azure\\/i,
  /\\\.gnupg\\/i,
  /[\\\/]\.env$/i,
  /[\\\/]\.env\.[a-z]/i,
  /\\credentials/i,
  /\\\.git\\/i,
  /node_modules\\/i,
]

export function isPathAllowed(filePath: string): boolean {
  if (!filePath) return false
  const normalized = filePath.replace(/\//g, '\\')
  return !BLOCKED_PATHS.some(re => re.test(normalized))
}
