import { lazy, Suspense, useEffect, useState, type JSX } from 'react'
import { useAppStore } from './stores/appStore'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { RightPanel } from './components/RightPanel'
import { ErrorBoundary } from './components/ui'
import { CommandPalette } from './components/CommandPalette'
import { api } from './lib/ipc'
import './styles/globals.css'

const ChatPage = lazy(() => import('./pages/ChatPage').then(m => ({ default: m.ChatPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const AgentsPage = lazy(() => import('./pages/AgentsPage').then(m => ({ default: m.AgentsPage })))
const SkillsPage = lazy(() => import('./pages/SkillsPage').then(m => ({ default: m.SkillsPage })))
const MemoryPage = lazy(() => import('./pages/MemoryPage').then(m => ({ default: m.MemoryPage })))
const CronPage = lazy(() => import('./pages/CronPage').then(m => ({ default: m.CronPage })))
const McpPage = lazy(() => import('./pages/McpPage').then(m => ({ default: m.McpPage })))
const ModelsPage = lazy(() => import('./pages/ModelsPage').then(m => ({ default: m.ModelsPage })))
const ModelsProvidersPage = lazy(() => import('./pages/ModelsProvidersPage').then(m => ({ default: m.ModelsProvidersPage })))
const ProvidersPage = lazy(() => import('./pages/ProvidersPage').then(m => ({ default: m.ProvidersPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const AboutPage = lazy(() => import('./pages/AboutPage').then(m => ({ default: m.AboutPage })))
const HistoryPage = lazy(() => import('./pages/HistoryPage').then(m => ({ default: m.HistoryPage })))
const FilesPage = lazy(() => import('./pages/FilesPage').then(m => ({ default: m.FilesPage })))
const GroupPage = lazy(() => import('./pages/GroupPage').then(m => ({ default: m.GroupPage })))
const ContextPage = lazy(() => import('./pages/ContextPage').then(m => ({ default: m.ContextPage })))
const AgentMarketPage = lazy(() => import('./pages/AgentMarketPage').then(m => ({ default: m.AgentMarketPage })))
const WorkspacePage = lazy(() => import('./pages/WorkspacePage').then(m => ({ default: m.WorkspacePage })))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })))
const RagPage = lazy(() => import('./pages/RagPage').then(m => ({ default: m.RagPage })))
const WorkflowPage = lazy(() => import('./pages/WorkflowPage').then(m => ({ default: m.WorkflowPage })))
const LogsPage = lazy(() => import('./pages/LogsPage').then(m => ({ default: m.LogsPage })))
const BackupPage = lazy(() => import('./pages/BackupPage').then(m => ({ default: m.BackupPage })))

const pages: Record<string, React.LazyExoticComponent<() => JSX.Element>> = {
  chat: ChatPage, dashboard: DashboardPage, agents: AgentsPage, skills: SkillsPage,
  memory: MemoryPage, cron: CronPage, mcp: McpPage, models: ModelsPage,
  providers: ProvidersPage, 'models-providers': ModelsProvidersPage, 'agent-market': AgentMarketPage,
  workspace: WorkspacePage, analytics: AnalyticsPage, settings: SettingsPage, about: AboutPage,
  history: HistoryPage, files: FilesPage, group: GroupPage, context: ContextPage,
  rag: RagPage, workflow: WorkflowPage, logs: LogsPage, backup: BackupPage,
}

function PageLoader() {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)' }}>{'加载中...'}</div>
}

export default function App() {
  const { currentPage, rightPanelVisible, setPage, toggleSidebar, toggleRightPanel } = useAppStore()
  const [showWizard, setShowWizard] = useState(false)
  const PageComponent = pages[currentPage] || ChatPage

  // Apply theme
  useEffect(() => {
    api.settingsGet?.('theme').then((t: string) => {
      const theme = t || 'system'
      const root = document.documentElement
      if (theme === 'dark') root.setAttribute('data-theme', 'dark')
      else if (theme === 'light') root.setAttribute('data-theme', 'light')
      else root.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    }).catch(() => {})
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
      if (e.ctrlKey && e.key === 'k') { e.preventDefault() }
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const navPages = ['chat', 'group', 'history', 'files', 'dashboard', 'agents', 'memory', 'settings', 'about']
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
              <p style={{ marginBottom: 16, color: 'var(--text2)', lineHeight: 1.8 }}>{'请配置您的 AI 服务商和 API Key。您可以在「供应商管理」中配置多个提供商。'}</p>
              <div className="setting-group">
                <h4>{'快速开始'}</h4>
                <div className="setting-row"><span className="label">1. {'点击侧边栏「供应商管理」'}</span></div>
                <div className="setting-row"><span className="label">2. {'添加您的 AI 提供商 (OpenAI/DeepSeek/...)'}</span></div>
                <div className="setting-row"><span className="label">3. {'输入 API Key 并测试连接'}</span></div>
                <div className="setting-row"><span className="label">4. {'开始对话！'}</span></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowWizard(false)}>{'稍后配置'}</button>
              <button className="btn btn-primary" onClick={() => { setShowWizard(false); setPage('providers') }}>{'开始配置'}</button>
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
    </ErrorBoundary>
  )
}