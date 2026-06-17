import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { exec, execFile } from 'child_process'
import { cachedPort, setCachedPort } from './utils'
import { kvGet } from '../storage/db'
import { DEFAULT_GATEWAY_PORT, DEFAULT_MODEL, API_PATH_CHAT, TIMEOUT_HEALTH_CHECK, TIMEOUT_GATEWAY_SCAN, TIMEOUT_GATEWAY_START } from '../constants'

/** Read openclaw.json config */
function getOpenClawConfig(): any {
  try {
    const p = join(require('os').homedir(), '.openclaw', 'openclaw.json')
    if (!existsSync(p)) return {}
    let raw = readFileSync(p, 'utf8')
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)
    return JSON.parse(raw)
  } catch { return {} }
}

export async function gatewayChat(port: number, model: string, messages: any[], timeout = TIMEOUT_GATEWAY_SCAN): Promise<string> {
  // Gateway only accepts 'openclaw' or 'openclaw/<agentId>', map other models
  const resolvedModel = (model && model.startsWith('openclaw')) ? model : DEFAULT_MODEL
  const body = JSON.stringify({ model: resolvedModel, stream: false, messages })

  // Retry up to 2 times on network errors
  let lastErr: any
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}${API_PATH_CHAT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(timeout)
      })
      const data = await resp.json()
      return data.choices?.[0]?.message?.content || ''
    } catch (e: any) {
      lastErr = e
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    }
  }
  throw lastErr
}

export async function gatewayToolInvoke(port: number, toolName: string, args: any): Promise<string> {
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/tools/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: toolName, input: args }),
      signal: AbortSignal.timeout(TIMEOUT_GATEWAY_START),
    })
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      return `Tool error (${resp.status}): ${errText.slice(0, 500)}`
    }
    const data = await resp.json()
    return typeof data === 'string' ? data : JSON.stringify(data)
  } catch (e: any) {
    return `Tool execution failed: ${e?.message || String(e)}`
  }
}

export async function gatewayHealth(port: number): Promise<boolean> {
  try { await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(TIMEOUT_HEALTH_CHECK) }); return true } catch { return false }
}

/** 从配置文件读取端口 (不发网络请求) */
export function getOpenClawPort(): number {
  if (cachedPort) return cachedPort
  try {
    const ocConfigPath = join(require('os').homedir(), '.openclaw', 'openclaw.json')
    if (existsSync(ocConfigPath)) {
      let raw = readFileSync(ocConfigPath, 'utf8')
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)
      const oc = JSON.parse(raw)
      if (oc.gateway?.port) { setCachedPort(oc.gateway.port); return cachedPort! }
    }
  } catch {}
  return DEFAULT_GATEWAY_PORT
}

/** 端口缓存: 上次探测成功的端口和时间 */
let lastProbedPort: number | null = null
let lastProbeTime = 0
const PROBE_TTL = 30_000 // 30秒内不重复探测

/**
 * 统一端口解析 — 带缓存，避免每条消息都HTTP探测
 * 1. 有缓存且未过期 → 直接返回
 * 2. 尝试配置文件端口
 * 3. 探测常见端口
 */
export async function scanGatewayPort(): Promise<number> {
  const now = Date.now()
  if (lastProbedPort && now - lastProbeTime < PROBE_TTL) return lastProbedPort

  // 先试配置文件端口
  const configPort = getOpenClawPort()
  try {
    const resp = await fetch(`http://127.0.0.1:${configPort}/health`, { signal: AbortSignal.timeout(1500) })
    if (resp.ok) { lastProbedPort = configPort; lastProbeTime = now; setCachedPort(configPort); return configPort }
  } catch {}

  // 探测常见端口
  for (const p of [51345, DEFAULT_GATEWAY_PORT, 18788]) {
    if (p === configPort) continue
    try {
      const resp = await fetch(`http://127.0.0.1:${p}/health`, { signal: AbortSignal.timeout(1000) })
      if (resp.ok) { lastProbedPort = p; lastProbeTime = now; setCachedPort(p); return p }
    } catch {}
  }
  return configPort
}

export function loadConfig(): any {
  const base = kvGet('config', 'main') || { gateway: { port: DEFAULT_GATEWAY_PORT, host: '127.0.0.1' }, ai: { provider: DEFAULT_MODEL, model: DEFAULT_MODEL, maxTokens: 4096, temperature: 0.7 } }
  const ocPort = getOpenClawPort()
  if (!base.gateway) base.gateway = { port: ocPort, host: '127.0.0.1' }; else base.gateway.port = ocPort
  return base
}

let gatewayProcess: any = null
let restartCount = 0
const MAX_RESTARTS = 5
const RESTART_WINDOW_MS = 60_000 // 5次/分钟内不再重启
let firstCrashTime = 0

/** Start gateway process — returns child process or null */
function startGatewayProcess(): any {
  const resDir = app.isPackaged ? process.resourcesPath : join(__dirname, '..', 'resources')
  const nodeBin = join(resDir, 'node.exe')
  const ocEntry = join(resDir, 'openclaw', 'openclaw.mjs')
  try {
    if (existsSync(nodeBin) && existsSync(ocEntry)) {
      const proc = execFile(nodeBin, [ocEntry, 'gateway', '--allow-unconfigured'], { windowsHide: true })
      proc.stdout?.on('data', (d: string) => console.log('[Gateway]', d.toString().trim()))
      proc.stderr?.on('data', (d: string) => console.log('[Gateway]', d.toString().trim()))
      proc.on('exit', (code: number) => {
        console.log('[Gateway] Exited with code', code)
        if (gatewayProcess === proc) {
          gatewayProcess = null
          scheduleRestart()
        }
      })
      return proc
    }
    return exec('openclaw gateway --allow-unconfigured', { windowsHide: true })
  } catch (e) { console.log('[Gateway] Start failed:', (e as Error).message); return null }
}

/** Auto-restart with backoff and crash loop detection */
function scheduleRestart() {
  const now = Date.now()
  if (now - firstCrashTime > RESTART_WINDOW_MS) {
    restartCount = 0
    firstCrashTime = now
  }
  restartCount++
  if (restartCount > MAX_RESTARTS) {
    console.error(`[Gateway] Crash loop detected (${restartCount} crashes in ${RESTART_WINDOW_MS / 1000}s), giving up.`)
    return
  }
  const delay = Math.min(2000 * restartCount, 30000) // 2s, 4s, 6s... max 30s
  console.log(`[Gateway] Restarting in ${delay / 1000}s (attempt ${restartCount}/${MAX_RESTARTS})...`)
  setTimeout(async () => {
    const port = getOpenClawPort()
    gatewayProcess = startGatewayProcess()
    if (gatewayProcess) await waitForGateway(port, 'Auto-restarted')
  }, delay)
}

/** Wait for gateway health, up to 15s */
async function waitForGateway(port: number, label = 'Ready'): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < 15000) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(TIMEOUT_HEALTH_CHECK) })
      if (resp.ok) { console.log(`[Gateway] ${label} on port`, port, `(${Date.now() - start}ms)`); return true }
    } catch {}
    await new Promise(r => setTimeout(r, 1000))
  }
  return false
}

export async function restartGateway() {
  // Kill ALL openclaw gateway processes — Windows taskkill /T kills process tree
  try {
    if (gatewayProcess?.pid) {
      try { exec(`cmd.exe /c "taskkill /PID ${gatewayProcess.pid} /T /F"`, { windowsHide: true }) } catch {}
    }
    gatewayProcess = null
  } catch {}
  await new Promise(r => setTimeout(r, 1500))
  const port = getOpenClawPort()
  gatewayProcess = startGatewayProcess()
  if (!gatewayProcess) return
  await waitForGateway(port, 'Restarted OK')
}

export async function autoStartGateway() {
  setTimeout(async () => {
    await scanGatewayPort()
    try {
      const port = getOpenClawPort()
      let alreadyRunning = false
      try {
        const resp = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(TIMEOUT_HEALTH_CHECK) })
        if (resp.ok) { alreadyRunning = true; console.log('[Gateway] Already running on port', port) }
      } catch {}

      if (!alreadyRunning) {
        gatewayProcess = startGatewayProcess()
        if (!gatewayProcess) return
      }
      await waitForGateway(port)
    } catch (e) { console.log('[Gateway] Auto-start error:', (e as Error).message) }
  }, 2000)

  // Periodic health check — restart if gateway becomes unresponsive
  setInterval(async () => {
    if (!gatewayProcess) return // Not our process, skip
    const port = getOpenClawPort()
    const healthy = await gatewayHealth(port)
    if (!healthy) {
      console.warn('[Gateway] Health check failed, restarting...')
      try { gatewayProcess.kill() } catch {}
      // scheduleRestart() will be triggered by the 'exit' event
    }
  }, 30_000) // Check every 30s
}
