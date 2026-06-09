import { logger } from './logger'

interface GatewayConfig {
  baseUrl: string
  timeout: number
  maxRetries: number
  retryDelay: number
}

const defaultConfig: GatewayConfig = {
  baseUrl: 'http://127.0.0.1:18789',
  timeout: 60000,
  maxRetries: 2,
  retryDelay: 1000,
}

class CircuitBreaker {
  private failures = 0
  private lastFailure = 0
  private state: 'closed' | 'open' | 'half-open' = 'closed'
  private readonly threshold = 5
  private readonly recoveryTime = 30000

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.recoveryTime) {
        this.state = 'half-open'
      } else {
        throw new Error('Gateway circuit breaker open, retry later')
      }
    }
    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (e) {
      this.onFailure()
      throw e
    }
  }

  private onSuccess() { this.failures = 0; this.state = 'closed' }
  private onFailure() {
    this.failures++
    this.lastFailure = Date.now()
    if (this.failures >= this.threshold) {
      this.state = 'open'
      logger.error('CircuitBreaker', `Open after ${this.failures} consecutive failures`)
    }
  }
  getState() { return this.state }
  getFailures() { return this.failures }
}

const breaker = new CircuitBreaker()

export async function gatewayRequest(path: string, options: RequestInit = {}, config: Partial<GatewayConfig> = {}): Promise<Response> {
  const cfg = { ...defaultConfig, ...config }
  const url = `${cfg.baseUrl}${path}`

  return breaker.execute(async () => {
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), cfg.timeout)
        const resp = await fetch(url, { ...options, signal: controller.signal })
        clearTimeout(timer)
        if (!resp.ok && resp.status >= 500 && attempt < cfg.maxRetries) {
          await sleep(cfg.retryDelay * (attempt + 1))
          continue
        }
        return resp
      } catch (e: any) {
        lastError = e
        if (e.name === 'AbortError') lastError = new Error(`Gateway request timeout (${cfg.timeout}ms)`)
        if (attempt < cfg.maxRetries) {
          logger.warn('GatewayClient', `Retry ${attempt + 1}/${cfg.maxRetries}: ${path}`)
          await sleep(cfg.retryDelay * (attempt + 1))
        }
      }
    }
    throw lastError || new Error('Gateway request failed')
  })
}

export async function gatewayStreamRequest(
  path: string, body: any, config: Partial<GatewayConfig> = {},
  onToken: (t: string) => void, onThinking: (t: string) => void, onToolCall: (d: any) => void, signal?: AbortSignal,
): Promise<string> {
  const cfg = { ...defaultConfig, ...config }
  return breaker.execute(async () => {
    const resp = await fetch(`${cfg.baseUrl}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal,
    })
    if (!resp.ok) throw new Error(await resp.text())
    const reader = resp.body!.getReader()
    const dec = new TextDecoder()
    let buf = '', full = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n'); buf = lines.pop()!
      for (const line of lines) {
        const t = line.trim()
        if (!t.startsWith('data: ')) continue
        const d = t.slice(6)
        if (d === '[DONE]') return full
        try {
          const obj = JSON.parse(d); const delta = obj.choices?.[0]?.delta
          if (!delta) continue
          if (delta.content) { full += delta.content; onToken(delta.content) }
          const th = delta.reasoning_content || delta.thinking; if (th) onThinking(th)
          if (delta.tool_calls) for (const tc of delta.tool_calls) onToolCall({ id: tc.id, name: tc.function?.name })
        } catch {}
      }
    }
    return full
  })
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export function getGatewayCircuitStatus() {
  return { state: breaker.getState(), failures: breaker.getFailures() }
}