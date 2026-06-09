import { ipcMain } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { exec } from 'child_process'
import { loadConfig } from './core'

function gwUrl(path: string): string {
  const port = loadConfig().gateway?.port || 18789
  return 'http://127.0.0.1:' + port + path
}

function execAsync(cmd: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout, windowsHide: true }, (err: any, stdout: string) => {
      err ? reject(err) : resolve(stdout)
    })
  })
}

export function setupCapabilitiesIPC() {
  ipcMain.handle('cap:tts', async (_, text: string, voice?: string) => {
    try {
      const resp = await fetch(gwUrl('/v1/audio/speech'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'tts-1', input: text, voice: voice || 'alloy', response_format: 'mp3' })
      })
      if (!resp.ok) return { ok: false, error: await resp.text() }
      const buf = Buffer.from(await resp.arrayBuffer())
      const audioPath = join(app.getPath('userData'), 'data', 'tts-' + Date.now() + '.mp3')
      writeFileSync(audioPath, buf)
      return { ok: true, path: audioPath }
    } catch (e) { return { ok: false, error: (e as Error).message } }
  })

  ipcMain.handle('cap:imageGen', async (_, prompt: string, size?: string) => {
    try {
      const resp = await fetch(gwUrl('/v1/images/generations'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: size || '1024x1024', response_format: 'url' })
      })
      const data = await resp.json()
      return { ok: true, url: data.data?.[0]?.url, revised_prompt: data.data?.[0]?.revised_prompt }
    } catch (e) { return { ok: false, error: (e as Error).message } }
  })

  ipcMain.handle('cap:transcribe', async (_, audioPath: string) => {
    try {
      const audioBuf = readFileSync(audioPath)
      const blob = new Blob([new Uint8Array(audioBuf)], { type: 'audio/mp3' })
      const form = new FormData()
      form.append('file', blob, 'audio.mp3')
      form.append('model', 'whisper-1')
      const resp = await fetch(gwUrl('/v1/audio/transcriptions'), { method: 'POST', body: form })
      const data = await resp.json()
      return { ok: true, text: data.text }
    } catch (e) { return { ok: false, error: (e as Error).message } }
  })

  ipcMain.handle('cap:docExtract', async (_, filePath: string) => {
    try {
      const content = readFileSync(filePath, 'utf8').slice(0, 50000)
      return { ok: true, content, filename: filePath.split(/[\\/]/).pop() }
    } catch (e) { return { ok: false, error: (e as Error).message } }
  })

  ipcMain.handle('cap:webSearch', async (_, query: string) => {
    try {
      const resp = await fetch(gwUrl('/v1/chat/completions'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'openclaw', stream: false, messages: [{ role: 'user', content: `Search the web for: ${query}. Return top 3 results with title, URL, snippet.` }] })
      })
      const data = await resp.json()
      return { ok: true, results: data.choices?.[0]?.message?.content }
    } catch (e) { return { ok: false, error: (e as Error).message } }
  })

  ipcMain.handle('cap:embed', async (_, text: string) => {
    try {
      const resp = await fetch(gwUrl('/v1/embeddings'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: text })
      })
      const data = await resp.json()
      return { ok: true, embedding: data.data?.[0]?.embedding }
    } catch (e) { return { ok: false, error: (e as Error).message } }
  })

  ipcMain.handle('cap:insights', async (_, days?: number) => {
    try { return { ok: true, data: await execAsync(`hermes insights --days ${days || 7}`, 15000) } } catch (e) { return { ok: false, error: (e as Error).message } }
  })

  ipcMain.handle('cap:doctor', async () => {
    try { return { ok: true, data: await execAsync('hermes doctor', 15000) } } catch (e) { return { ok: false, error: (e as Error).message } }
  })

  ipcMain.handle('cap:sessions', async () => {
    try { return { ok: true, data: await execAsync('hermes sessions list', 10000) } } catch (e) { return { ok: false, error: (e as Error).message } }
  })

  ipcMain.handle('cap:kanban', async (_, action: string, args?: string) => {
    try { return { ok: true, data: await execAsync(`hermes kanban ${action} ${args || ''}`, 10000) } } catch (e) { return { ok: false, error: (e as Error).message } }
  })

  ipcMain.handle('cap:playAudio', (_, audioPath: string) => {
    try { return { ok: true } } catch (e) { return { ok: false, error: (e as Error).message } }
  })
}