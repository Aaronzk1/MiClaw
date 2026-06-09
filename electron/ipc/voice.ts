import { ipcMain } from 'electron'
import { logger } from './logger'
import { loadConfig } from './core'

let voiceBuffer: Buffer[] = []

export function setupVoiceIPC() {
  ipcMain.handle('voice:start', () => {
    voiceBuffer = []
    return { ok: true }
  })

  ipcMain.handle('voice:chunk', (_, chunkBase64: string) => {
    voiceBuffer.push(Buffer.from(chunkBase64, 'base64'))
    return { ok: true }
  })

  ipcMain.handle('voice:stop', async () => {
    if (voiceBuffer.length === 0) return { ok: false, error: 'No audio data' }
    const audioBuffer = Buffer.concat(voiceBuffer)
    voiceBuffer = []
    return speechToText(audioBuffer, 'webm')
  })
}

export async function speechToText(audioBuffer: Buffer, format = 'wav'): Promise<{ ok: boolean; text?: string; error?: string }> {
  try {
    const config = loadConfig()
    const port = config.gateway?.port || 18789

    const blob = new Blob([new Uint8Array(audioBuffer)], { type: `audio/${format}` })
    const form = new FormData()
    form.append('file', blob, `audio.${format}`)
    form.append('model', 'whisper-1')
    form.append('language', 'zh')

    const resp = await fetch(`http://127.0.0.1:${port}/v1/audio/transcriptions`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30000),
    })

    if (!resp.ok) return { ok: false, error: await resp.text() }
    const data = await resp.json()
    logger.info('Voice', `STT done: ${(data.text || '').slice(0, 50)}`)
    return { ok: true, text: data.text }
  } catch (e: any) {
    logger.error('Voice', `STT failed: ${e.message}`)
    return { ok: false, error: e.message }
  }
}
