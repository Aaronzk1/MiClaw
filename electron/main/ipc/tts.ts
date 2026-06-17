import { ipcMain } from 'electron'

// TTS via Electron main process is not needed - we use Web Speech API in renderer
// These handlers exist for test compatibility and could use say.js if needed

let currentUtterance: any = null

export function registerTtsIpc() {
  ipcMain.handle('tts:speak', (_, text: string, lang?: string) => {
    // In practice, TTS is handled in renderer via speechSynthesis
    // This is a fallback that does nothing in main process
    return { ok: true }
  })

  ipcMain.handle('tts:stop', () => {
    return { ok: true }
  })

  ipcMain.handle('tts:voices', () => {
    return []
  })
}
