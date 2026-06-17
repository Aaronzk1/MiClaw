import { ipcMain } from 'electron'
import { gatewayHealth, getOpenClawPort } from '../gateway'

async function fetchGateway(port: number, path: string, timeout = 3000): Promise<any> {
  try {
    const resp = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(timeout) })
    if (!resp.ok) return null
    return await resp.json()
  } catch { return null }
}

export function registerSmartIpc() {
  ipcMain.handle('gateway:status', async () => {
    const port = getOpenClawPort()
    const running = await gatewayHealth(port)
    return { running, port }
  })

  ipcMain.handle('gateway:info', async () => {
    const port = getOpenClawPort()
    const running = await gatewayHealth(port)
    if (!running) return { running: false }

    const [sessions, providers, tools] = await Promise.all([
      fetchGateway(port, '/v1/sessions'),
      fetchGateway(port, '/v1/providers'),
      fetchGateway(port, '/v1/mcp/tools'),
    ])
    return {
      running: true,
      port,
      sessions: sessions?.data || sessions || [],
      providers: providers?.data || providers || [],
      tools: tools?.data || tools || [],
    }
  })

  ipcMain.handle('gateway:start', () => {
    const { execFile, exec } = require('child_process')
    const { app } = require('electron')
    const { join } = require('path')
    const { existsSync } = require('fs')
    try {
      const resDir = app.isPackaged ? process.resourcesPath : join(__dirname, '..', '..', 'resources')
      const nodeBin = join(resDir, 'node.exe')
      const ocEntry = join(resDir, 'openclaw', 'openclaw.mjs')
      if (existsSync(nodeBin) && existsSync(ocEntry)) {
        execFile(nodeBin, [ocEntry, 'gateway', '--allow-unconfigured'], { windowsHide: true })
        return { ok: true }
      }
      exec('openclaw gateway --allow-unconfigured', { windowsHide: true })
      return { ok: true }
    } catch {}
    return { ok: false, error: '未找到OpenClaw' }
  })
}
