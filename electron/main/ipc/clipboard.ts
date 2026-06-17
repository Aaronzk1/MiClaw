import { ipcMain, clipboard } from 'electron'
import { createHash } from 'crypto'

const MAX_HISTORY = 50
const POLL_INTERVAL = 2000

const history: Array<{ text: string; timestamp: number }> = []
let lastHash = ''
let polling = false

function textHash(s: string): string {
  return createHash('md5').update(s).digest('hex').slice(0, 12)
}

function pollClipboard() {
  try {
    const text = clipboard.readText()
    if (text && text.trim()) {
      const h = textHash(text)
      if (h !== lastHash) {
        lastHash = h
        // Deduplicate: don't add if same text is already at top
        if (history.length === 0 || history[0].text !== text) {
          history.unshift({ text, timestamp: Date.now() })
          if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
        }
      }
    }
  } catch {}
}

export function registerClipboardIpc() {
  // Start polling
  if (!polling) {
    polling = true
    setInterval(pollClipboard, POLL_INTERVAL)
    pollClipboard() // Initial read
  }

  ipcMain.handle('clipboard:history', () => {
    return [...history]
  })

  ipcMain.handle('clipboard:pick', (_, text: string) => {
    clipboard.writeText(text)
    return { ok: true }
  })

  ipcMain.handle('clipboard:clear', () => {
    history.length = 0
    lastHash = ''
    return { ok: true }
  })
}
