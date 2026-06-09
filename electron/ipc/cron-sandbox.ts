import { exec } from 'child_process'
import { app } from 'electron'
import { logger } from './logger'

const ALLOWED_COMMANDS = new Set([
  'hermes', 'openclaw', 'node', 'python', 'python3',
  'npm', 'npx', 'git', 'echo', 'dir', 'ls', 'type',
  'curl', 'ping',
])

const BLOCKED_PATTERNS = [
  /\brm\s+-rf\b/i, /\bformat\b/i, /\bdel\s+\/[sfq]\b/i,
  /\bregedit\b/i, /\bnet\s+user\b/i, /\bshutdown\b/i,
  /\bpowershell\s+-[eE]c\b/i, /\bcmd\s+\/c\s+del\b/i,
]

export interface CronExecutionResult {
  success: boolean
  output?: string
  error?: string
  duration: number
  blocked?: boolean
}

const executionHistory: Array<{
  jobId: string; command: string; result: CronExecutionResult; timestamp: string
}> = []
const MAX_HISTORY = 100

export function safeExec(command: string, timeout = 30000): Promise<CronExecutionResult> {
  const startTime = Date.now()
  return new Promise((resolve) => {
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        logger.warn('CronSandbox', `Blocked dangerous command: ${command}`)
        resolve({ success: false, blocked: true, error: `Blocked by security policy: ${pattern}`, duration: 0 })
        return
      }
    }

    const firstToken = command.trim().split(/\s+/)[0].toLowerCase()
    const baseName = firstToken.replace(/\.(exe|cmd|bat|ps1)$/i, '')
    if (!ALLOWED_COMMANDS.has(baseName)) {
      logger.warn('CronSandbox', `Not in allowlist: ${baseName}`)
      resolve({ success: false, blocked: true, error: `Command '${baseName}' not in allowlist`, duration: 0 })
      return
    }

    logger.info('CronSandbox', `Execute: ${command}`)
    exec(command, {
      timeout, windowsHide: true,
      env: { ...process.env, NODE_ENV: 'production' },
      cwd: app.getPath('home'),
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      const duration = Date.now() - startTime
      if (error) {
        logger.error('CronSandbox', `Failed (${duration}ms): ${error.message}`)
        resolve({ success: false, error: error.message, duration })
      } else {
        logger.info('CronSandbox', `Success (${duration}ms)`)
        resolve({ success: true, output: stdout, duration })
      }
    })
  })
}

export function recordExecution(jobId: string, command: string, result: CronExecutionResult) {
  executionHistory.unshift({ jobId, command, result, timestamp: new Date().toISOString() })
  if (executionHistory.length > MAX_HISTORY) executionHistory.pop()
}

export function getExecutionHistory(jobId?: string) {
  if (jobId) return executionHistory.filter(h => h.jobId === jobId)
  return executionHistory
}