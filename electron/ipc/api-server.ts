import { createServer, IncomingMessage, ServerResponse } from 'http'
import { logger } from './logger'
import { kvList, kvUpsert, kvGet } from '../storage/db'
import { loadConfig } from './core'

// Basic rate limiter
const requestCounts = new Map<string, { count: number; resetAt: number }>()
function checkRateLimit(ip: string, maxPerMinute = 60): boolean {
  const now = Date.now()
  const entry = requestCounts.get(ip)
  if (!entry || now > entry.resetAt) { requestCounts.set(ip, { count: 1, resetAt: now + 60000 }); return true }
  entry.count++
  return entry.count <= maxPerMinute
}

let apiServer: ReturnType<typeof createServer> | null = null

interface ApiServerConfig {
  port: number
  enabled: boolean
  apiKey?: string
}

export function startApiServer(config: ApiServerConfig) {
  if (!config.enabled || apiServer) return

  apiServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    const clientIp = req.socket.remoteAddress || 'unknown'
    if (!checkRateLimit(clientIp)) { res.writeHead(429, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Rate limit exceeded' })); return }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    if (config.apiKey) {
      const auth = req.headers.authorization
      if (!auth || auth !== `Bearer ${config.apiKey}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Unauthorized' }))
        return
      }
    }

    const url = new URL(req.url || '/', `http://localhost:${config.port}`)
    try {
      if (url.pathname === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok', version: '3.0.0' }))
        return
      }
      if (url.pathname === '/api/agents' && req.method === 'GET') {
        const agents = kvList('agents')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ agents }))
        return
      }
      if (url.pathname === '/api/chat' && req.method === 'POST') {
        const body = await readBody(req)
        const { message, agentId } = JSON.parse(body)
        const result = await handleExternalChat(message, agentId)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
        return
      }
      if (url.pathname === '/api/memory' && req.method === 'GET') {
        const memories = kvList('memory')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ memories }))
        return
      }
      if (url.pathname === '/api/conversations' && req.method === 'GET') {
        const convs = kvList('conversations')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ conversations: convs }))
        return
      }
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
    } catch (e: any) {
      logger.error('ApiServer', e.message)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    }
  })

  apiServer.listen(config.port, '127.0.0.1', () => {
    logger.info('ApiServer', `HTTP API started: http://127.0.0.1:${config.port}`)
  })
}

export function stopApiServer() {
  apiServer?.close()
  apiServer = null
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => data += chunk)
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

async function handleExternalChat(message: string, agentId?: string): Promise<any> {
  const config = loadConfig()
  const port = config.gateway?.port || 18789
  const agents = kvList('agents')
  const agent = agents.find((a: any) => a.id === agentId) || agents[0]
  const msgs: any[] = []
  if (agent?.systemPrompt) msgs.push({ role: 'system', content: agent.systemPrompt })
  msgs.push({ role: 'user', content: message })

  const resp = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: agent?.model || 'openclaw', stream: false, messages: msgs }),
  })
  const data = await resp.json()
  return {
    reply: data.choices?.[0]?.message?.content || '',
    agent: agent?.name || 'default',
    model: agent?.model || 'openclaw',
  }
}