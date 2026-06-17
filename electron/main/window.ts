import { app, BrowserWindow, shell, Tray, Menu, nativeImage, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

const isDev = process.argv.includes('--dev')

let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null
let splashCreateTime = 0
let appReady = false
const SPLASH_MIN_MS = 1800
const SPLASH_MAX_MS = 12000
const secondaryWindows: BrowserWindow[] = []
let tray: Tray | null = null

export function getMainWindow() { return mainWindow }
export function getAllWindows(): BrowserWindow[] { return mainWindow ? [mainWindow, ...secondaryWindows] : [...secondaryWindows] }

export function updateSplashStatus(msg: string) {
  try { splashWindow?.webContents.send('splash:status', msg) } catch {}
}

export function showSplash() {
  if (splashWindow) return
  const iconPath = join(__dirname, '..', 'public', 'logo.png')
  splashWindow = new BrowserWindow({
    width: 360, height: 320,
    frame: false, transparent: false,
    resizable: false, movable: true,
    center: true, alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#fafaf8',
    icon: existsSync(iconPath) ? iconPath : undefined,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  })
  splashWindow.loadFile(join(__dirname, '..', 'public', 'splash.html'))
  splashCreateTime = Date.now()
}

function closeSplashAndShowMain() {
  if (!splashWindow) return
  const elapsed = Date.now() - splashCreateTime
  const remain = Math.max(0, SPLASH_MIN_MS - elapsed)
  setTimeout(() => {
    splashWindow?.close()
    splashWindow = null
    mainWindow?.show()
    mainWindow?.focus()
  }, remain)
}

// Renderer calls app:ready when React is fully mounted and initial data loaded
ipcMain.handle('app:ready', () => {
  appReady = true
  updateSplashStatus('准备就绪')
  setTimeout(() => closeSplashAndShowMain(), 300)
})

export function createWindow() {
  const iconPath = join(__dirname, '..', 'public', 'logo.png')
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1024, minHeight: 700,
    frame: true, backgroundColor: '#fafaf8',
    icon: existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    show: false, // hidden until ready
    webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false }
  })
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') { callback(true); return }
    callback(false)
  })
  if (isDev) { mainWindow.loadURL('http://localhost:5173') }
  else { mainWindow.loadFile(join(__dirname, '..', 'dist', 'index.html')) }
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      e.preventDefault()
      shell.openExternal(url)
    }
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Fallback: if renderer never calls app:ready, force close after max time
  const fallbackTimer = setTimeout(() => {
    if (splashWindow && !appReady) {
      closeSplashAndShowMain()
    }
  }, SPLASH_MAX_MS)

  mainWindow.once('show', () => clearTimeout(fallbackTimer))

  mainWindow.on('closed', () => { mainWindow = null })
}

export function createSecondWindow(): BrowserWindow {
  const iconPath = join(__dirname, '..', 'public', 'logo.png')
  const win = new BrowserWindow({
    width: 1200, height: 800, minWidth: 1024, minHeight: 700,
    frame: true, backgroundColor: '#fafaf8',
    icon: existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    show: true,
    webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false }
  })
  if (isDev) { win.loadURL('http://localhost:5173') }
  else { win.loadFile(join(__dirname, '..', 'dist', 'index.html')) }
  win.webContents.on('will-navigate', (e, url) => {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') { e.preventDefault(); shell.openExternal(url) }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.on('closed', () => {
    const idx = secondaryWindows.indexOf(win)
    if (idx !== -1) secondaryWindows.splice(idx, 1)
  })
  secondaryWindows.push(win)
  return win
}

export function createTray() {
  try {
    const iconPath = join(__dirname, '..', 'public', 'logo.png')
    if (!existsSync(iconPath)) return
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    tray = new Tray(icon)
    tray.setToolTip('MiClaw')
    const contextMenu = Menu.buildFromTemplate([
      { label: '显示窗口', click: () => { mainWindow?.show(); mainWindow?.focus() } },
      { label: '新建对话', click: () => { mainWindow?.show(); mainWindow?.webContents.send('action:new-conv') } },
      { type: 'separator' },
      { label: '退出', click: () => { app.quit() } },
    ])
    tray.setContextMenu(contextMenu)
    tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus() })
  } catch (e) { console.error('[Tray] Failed:', (e as Error).message) }
}

export function destroyTray() { tray?.destroy() }
