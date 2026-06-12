import { lazy, Suspense, useEffect, useState, type JSX } from 'react'
import { useAppStore } from './stores/appStore'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { RightPanel } from './components/RightPanel'
import { ErrorBoundary } from './components/ui'
import { ToastContainer } from './components/Toast'
import { CommandPalette } from './components/CommandPalette'
import { api } from './lib/ipc'
import './styles/agent.css'

const ChatPage = lazy(() => import('./pages/ChatPage').then(m => ({ default: m.ChatPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const AgentsPage = lazy(() => import('./pages/AgentsPage').then(m => ({ default: m.AgentsPage })))
const SkillsPage = lazy(() => import('./pages/SkillsPage').then(m => ({ default: m.SkillsPage })))
const MemoryPage = lazy(() => import('./pages/MemoryPage').then(m => ({ default: m.MemoryPage })))
const AutomationPage = lazy(() => import('./pages/AutomationPage').then(m => ({ default: m.AutomationPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const FilesPage = lazy(() => import('./pages/FilesPage').then(m => ({ default: m.FilesPage })))
const GroupPage = lazy(() => import('./pages/GroupPage').then(m => ({ default: m.GroupPage })))
const CalendarPage = lazy(() => import('./pages/CalendarPage').then(m => ({ default: m.CalendarPage })))
const GoalsPage = lazy(() => import('./pages/GoalsPage').then(m => ({ default: m.GoalsPage })))
const ToolsPage = lazy(() => import('./pages/ToolsPage').then(m => ({ default: m.ToolsPage })))

const pages: Record<string, React.LazyExoticComponent<() => JSX.Element>> = {
  chat: ChatPage, dashboard: DashboardPage, agents: AgentsPage, skills: SkillsPage,
  memory: MemoryPage, automation: AutomationPage,
  settings: SettingsPage,
  files: FilesPage, group: GroupPage,
  calendar: CalendarPage, goals: GoalsPage, tools: ToolsPage,
}

function PageLoader() {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)' }}>{'加载中...'}</div>
}

export default function App() {
  const { currentPage, rightPanelVisible, setPage, toggleSidebar, toggleRightPanel } = useAppStore()
  const [showWizard, setShowWizard] = useState(false)
  const PageComponent = pages[currentPage] || ChatPage

  // Capture console errors and IPC events for debug panel
  useEffect(() => {
    const addLog = useAppStore.getState().addDebugLog
    const origError = console.error
    const origWarn = console.warn
    console.error = (...args: any[]) => { origError(...args); addLog('error', args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')) }
    console.warn = (...args: any[]) => { origWarn(...args); addLog('warn', args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')) }
    // Capture IPC errors
    api.onChatError?.((err: any) => addLog('error', 'IPC chat:error ' + JSON.stringify(err)))
    return () => { console.error = origError; console.warn = origWarn }
  }, [])

  // Apply theme
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    let currentTheme = 'system'
    const apply = (theme: string) => {
      const root = document.documentElement
      if (theme === 'dark') root.setAttribute('data-theme', 'dark')
      else if (theme === 'light') root.setAttribute('data-theme', 'light')
      else root.setAttribute('data-theme', mq.matches ? 'dark' : 'light')
    }
    const onSystemChange = () => { if (currentTheme === 'system') apply('system') }
    const onThemeChange = (e: Event) => { currentTheme = (e as CustomEvent).detail || 'system'; apply(currentTheme) }
    api.getConfig().then((c: any) => {
      currentTheme = c?.theme || 'system'
      apply(currentTheme)
    }).catch(() => {})
    mq.addEventListener('change', onSystemChange)
    window.addEventListener('theme-change', onThemeChange)
    return () => { mq.removeEventListener('change', onSystemChange); window.removeEventListener('theme-change', onThemeChange) }
  }, [])

  useEffect(() => {
    api.getConfig().then((c: any) => {
      if (!c?.ai?.model || c.ai.model === 'openclaw') {
        api.agentsList().then((a: any[]) => {
          if (a.length === 0) setShowWizard(true)
        }).catch(() => {})
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'b') { e.preventDefault(); toggleSidebar() }
      if (e.ctrlKey && e.key === ',') { e.preventDefault(); setPage('settings') }
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        setPage('chat')
        useAppStore.getState().setCurrentConvId(null)
        useAppStore.getState().setMessages([])
        useAppStore.getState().setTokenUsage(0)
        localStorage.removeItem('lastConvId')
      }
      if (e.ctrlKey && e.key === 'k') { e.preventDefault() }
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const navPages = ['chat', 'group', 'dashboard', 'files', 'automation', 'skills', 'memory', 'settings']
        const idx = parseInt(e.key) - 1
        if (idx < navPages.length) setPage(navPages[idx])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setPage, toggleSidebar, toggleRightPanel])

  return (
    <ErrorBoundary>
      <CommandPalette />
      {showWizard && (
        <div className="modal-overlay" onClick={() => setShowWizard(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 480 }}>
            <div className="modal-header"><h3>{'欢迎使用 AaronClaw'}</h3></div>
            <div className="modal-body">
              <p style={{ marginBottom: 16, color: 'var(--text2)', lineHeight: 1.8 }}>{'请配置您的 AI 服务商和 API Key。您可以在「设置」中配置提供商。'}</p>
              <div className="setting-group">
                <h4>{'快速开始'}</h4>
                <div className="setting-row"><span className="label">1. {'点击侧边栏「设置」'}</span></div>
                <div className="setting-row"><span className="label">2. {'添加您的 AI 提供商 (OpenAI/DeepSeek/...)'}</span></div>
                <div className="setting-row"><span className="label">3. {'输入 API Key 并测试连接'}</span></div>
                <div className="setting-row"><span className="label">4. {'开始对话！'}</span></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowWizard(false)}>{'稍后配置'}</button>
              <button className="btn btn-primary" onClick={() => { setShowWizard(false); setPage('settings') }}>{'开始配置'}</button>
            </div>
          </div>
        </div>
      )}
      <div id="app">
        <Sidebar />
        <div id="center">
          <Toolbar />
          <div id="content">
            <Suspense fallback={<PageLoader />}>
              <PageComponent />
            </Suspense>
          </div>
        </div>
        {rightPanelVisible && currentPage === 'chat' && <RightPanel />}
      </div>
      <ToastContainer />
    </ErrorBoundary>
  )
}