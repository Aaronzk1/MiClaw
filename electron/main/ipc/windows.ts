import { ipcMain, BrowserWindow } from 'electron'
import { createSecondWindow, getAllWindows } from '../window'

export function registerWindowsIpc() {
  ipcMain.handle('window:open', () => {
    const win = createSecondWindow()
    return { id: win.id }
  })

  ipcMain.handle('window:list', () => {
    return getAllWindows().map(w => ({ id: w.id, focused: w.isFocused(), visible: w.isVisible() }))
  })
}
