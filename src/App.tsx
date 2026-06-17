import { lazy, Suspense, useEffect, useState, useRef, Component, type ReactNode, type JSX } from 'react'
import { useAppStore } from './stores/appStore'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { RightPanel } from './components/RightPanel'
import { ErrorBoundary } from './components/ui'
import { ToastContainer } from './components/Toast'
import { CommandPalette } from './components/CommandPalette'
import { SearchModal } from './components/SearchModal'
import { api } from './lib/ipc'
import './styles/agent.css'

const ChatPage = lazy(() => import('./pages/ChatPage').then(m => ({ default: m.ChatPage })))
const ComparePage = lazy(() => import('./pages/ComparePage').then(m => ({ default: m.ComparePage })))
const AgentsPage = lazy(() => import('./pages/AgentsPage').then(m => ({ default: m.AgentsPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const FilesPage = lazy(() => import('./pages/FilesPage').then(m => ({ default: m.FilesPage })))
const GroupPage = lazy(() => import('./pages/GroupPage').then(m => ({ default: m.GroupPage })))
const CalendarPage = lazy(() => import('./pages/CalendarPage').then(m => ({ default: m.CalendarPage })))
const PluginsPage = lazy(() => import('./pages/PluginsPage').then(m => ({ default: m.PluginsPage })))
const McpPage = lazy(() => import('./pages/McpPage').then(m => ({ default: m.McpPage })))
const TokenStatsPage = lazy(() => import('./pages/TokenStatsPage').then(m => ({ default: m.TokenStatsPage })))
const GatewayPage = lazy(() => import('./pages/GatewayPage').then(m => ({ default: m.GatewayPage })))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })))
const TreePage = lazy(() => import('./pages/TreePage').then(m => ({ default: m.TreePage })))

const pages: Record<string, React.LazyExoticComponent<() => JSX.Element>> = {
  chat: ChatPage, agents: AgentsPage,
  settings: SettingsPage, mcp: McpPage,
  files: FilesPage, group: GroupPage, calendar: CalendarPage,
  plugins: PluginsPage, tokenStats: TokenStatsPage,
  gateway: GatewayPage, analytics: AnalyticsPage, tree: TreePage,
}

function PageLoader() {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)' }}>{'加载中...'}</div>
}

class PageErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: Error }> {
  state = { hasError: false, error: undefined as Error | undefined }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error } }
  componentDidCatch(error: Error) { console.error('[PageError]', error) }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text3)' }}>
          <p style={{ fontSize: 14 }}>页面加载失败</p>
          <button className="btn btn-sm btn-secondary" onClick={() => this.setState({ hasError: false, error: undefined })}>重试</button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const currentPage = useAppStore(s => s.currentPage)
  const rightPanelVisible = useAppStore(s => s.rightPanelVisible)
  const compareMode = useAppStore(s => s.compareMode)
  const setPage = useAppStore(s => s.setPage)
  const toggleSidebar = useAppStore(s => s.toggleSidebar)
  const toggleRightPanel = useAppStore(s => s.toggleRightPanel)
  const [showWizard, setShowWizard] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const readyRef = useRef({ config: false, agents: false })
  const PageComponent = (compareMode && currentPage === 'chat') ? ComparePage : (pages[currentPage] || ChatPage)

  // Capture console errors for debug panel
  useEffect(() => {
    const addLog = useAppStore.getState().addDebugLog
    const origError = console.error
    const origWarn = console.warn
    console.error = (...args: any[]) => {
      origError(...args)
      try { addLog('error', args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')) } catch {}
    }
    console.warn = (...args: any[]) => {
      origWarn(...args)
      try { addLog('warn', args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')) } catch {}
    }
    api.onChatError?.((err: any) => { try { addLog('error', 'IPC chat:error ' + JSON.stringify(err)) } catch {} })
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

  // Restore current agent from localStorage on startup
  useEffect(() => {
    api.agentsList().then((agents: any[]) => {
      useAppStore.getState().setAgents(agents)
      if (agents.length === 0) return
      const savedId = localStorage.getItem('currentAgentId')
      const found = savedId ? agents.find((a: any) => a.id === savedId) : null
      useAppStore.getState().setCurrentAgent(found || agents[0])
    }).catch(() => {}).finally(() => {
      readyRef.current.agents = true
      if (readyRef.current.config) api.appReady()
    })
  }, [])

  useEffect(() => {
    api.getConfig().then((c: any) => {
      if (!c?.ai?.model || c.ai.model === 'openclaw') {
        api.agentsList().then((a: any[]) => {
          if (a.length === 0) setShowWizard(true)
        }).catch(() => {})
      }
    }).catch(() => {}).finally(() => {
      readyRef.current.config = true
      if (readyRef.current.agents) api.appReady()
    })
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
      if (e.ctrlKey && e.shiftKey && e.key === 'F') { e.preventDefault(); setShowSearch(true) }
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const navPages = ['chat', 'group', 'files', 'settings']
        const idx = parseInt(e.key) - 1
        if (idx < navPages.length) setPage(navPages[idx])
      }
    }
    const onOpenSearch = () => setShowSearch(true)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('open-search', onOpenSearch)
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('open-search', onOpenSearch) }
  }, [setPage, toggleSidebar, toggleRightPanel])

  return (
    <ErrorBoundary>
      <CommandPalette />
      {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
      {showWizard && (
        <div className="modal-overlay" onClick={() => setShowWizard(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 480 }}>
            <div className="modal-header"><h3>{'欢迎使用 MiClaw'}</h3></div>
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
            <PageErrorBoundary key={currentPage}>
              <Suspense fallback={<PageLoader />}>
                <PageComponent />
              </Suspense>
            </PageErrorBoundary>
          </div>
        </div>
        {rightPanelVisible && currentPage === 'chat' && !compareMode && <RightPanel />}
      </div>
      <ToastContainer />
    </ErrorBoundary>
  )
}