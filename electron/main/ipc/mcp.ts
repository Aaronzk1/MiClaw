import { ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { scanGatewayPort } from '../gateway'

const CONFIG_PATH = join(homedir(), '.openclaw', 'openclaw.json')

function loadConfig(): any {
  try {
    if (!existsSync(CONFIG_PATH)) return {}
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  } catch { return {} }
}

function saveConfig(config: any) {
  const dir = join(homedir(), '.openclaw')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
}

function getServers(): Record<string, any> {
  const cfg = loadConfig()
  return cfg?.mcp?.servers || {}
}

async function probeServer(id: string, serverCfg: any): Promise<{ ok: boolean; tools?: any[]; error?: string }> {
  const port = await scanGatewayPort()
  if (!port) return { ok: false, error: 'Gateway not running' }
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/v1/mcp/servers/${encodeURIComponent(id)}/tools`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json' },
    })
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` }
    const data = await resp.json() as any
    return { ok: true, tools: data?.tools || data?.data || [] }
  } catch (e: any) {
    return { ok: false, error: e.message || 'Connection failed' }
  }
}

export function registerMcpIpc() {
  // List all MCP servers
  ipcMain.handle('mcp:list', async () => {
    const servers = getServers()
    const result: any[] = []
    for (const [id, cfg] of Object.entries(servers)) {
      result.push({
        id,
        name: cfg.name || id,
        command: cfg.command || '',
        args: cfg.args || [],
        url: cfg.url || '',
        transport: cfg.transport || (cfg.command ? 'stdio' : cfg.url ? 'http' : 'stdio'),
        enabled: cfg.enabled !== false,
        env: cfg.env || {},
        cwd: cfg.cwd || '',
        status: 'unknown',
      })
    }
    return result
  })

  // Save (create/update) an MCP server
  ipcMain.handle('mcp:save', async (_, server: { id: string; name?: string; command?: string; args?: string[]; url?: string; transport?: string; env?: Record<string, string>; cwd?: string; enabled?: boolean }) => {
    try {
      const cfg = loadConfig()
      if (!cfg.mcp) cfg.mcp = {}
      if (!cfg.mcp.servers) cfg.mcp.servers = {}

      const id = server.id
      const existing = cfg.mcp.servers[id] || {}

      cfg.mcp.servers[id] = {
        ...existing,
        enabled: server.enabled !== false,
      }

      if (server.name !== undefined) cfg.mcp.servers[id].name = server.name
      if (server.command !== undefined) cfg.mcp.servers[id].command = server.command
      if (server.args !== undefined) cfg.mcp.servers[id].args = server.args
      if (server.url !== undefined) cfg.mcp.servers[id].url = server.url
      if (server.transport !== undefined) cfg.mcp.servers[id].transport = server.transport
      if (server.env !== undefined) cfg.mcp.servers[id].env = server.env
      if (server.cwd !== undefined) cfg.mcp.servers[id].cwd = server.cwd

      saveConfig(cfg)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // Delete an MCP server
  ipcMain.handle('mcp:delete', async (_, id: string) => {
    try {
      const cfg = loadConfig()
      if (cfg.mcp?.servers?.[id]) {
        delete cfg.mcp.servers[id]
        saveConfig(cfg)
      }
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // Toggle enabled state
  ipcMain.handle('mcp:toggle', async (_, id: string, enabled: boolean) => {
    try {
      const cfg = loadConfig()
      if (!cfg.mcp?.servers?.[id]) return { ok: false, error: 'Server not found' }
      cfg.mcp.servers[id].enabled = enabled
      saveConfig(cfg)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // Probe a server to check connectivity and list tools
  ipcMain.handle('mcp:probe', async (_, id: string) => {
    const servers = getServers()
    const serverCfg = servers[id]
    if (!serverCfg) return { ok: false, error: 'Server not found' }
    return probeServer(id, serverCfg)
  })

  // List all tools from all enabled MCP servers via Gateway
  ipcMain.handle('mcp:tools', async () => {
    const port = await scanGatewayPort()
    if (!port) return []
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/v1/mcp/tools`, { signal: AbortSignal.timeout(5000) })
      if (!resp.ok) return []
      const data = await resp.json() as any
      return Array.isArray(data) ? data : data?.data || data?.tools || []
    } catch { return [] }
  })
}
