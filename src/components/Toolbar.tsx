import { useEffect, useState, useMemo, useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'

const tabs = [
  { id: 'chat', label: '对话' },
  { id: 'files', label: '文件预览' },
]

export function Toolbar() {
  const currentPage = useAppStore(s => s.currentPage)
  const setPage = useAppStore(s => s.setPage)
  const toggleSidebar = useAppStore(s => s.toggleSidebar)
  const toggleRightPanel = useAppStore(s => s.toggleRightPanel)
  const rightPanelVisible = useAppStore(s => s.rightPanelVisible)
  const compareMode = useAppStore(s => s.compareMode)
  const setCompareMode = useAppStore(s => s.setCompareMode)
  const tokenUsage = useAppStore(s => s.tokenUsage)
  const config = useAppStore(s => s.config)
  const setConfig = useAppStore(s => s.setConfig)
  const [models, setModels] = useState<any[]>([])

  const fetchModels = useCallback(() => {
    api.getConfig().then(c => setConfig(c)).catch(() => {})
    api.modelsList().then((m: any[]) => {
      setModels(m.filter((x: any) => x.enabled !== false))
    }).catch(() => {})
  }, [setConfig])

  useEffect(() => {
    fetchModels()
    const onProvidersChanged = () => fetchModels()
    window.addEventListener('providers-changed', onProvidersChanged)
    return () => window.removeEventListener('providers-changed', onProvidersChanged)
  }, [fetchModels])

  const currentModel = config?.ai?.model || 'openclaw'

  const handleModelChange = (modelId: string) => {
    const newConfig = { ...config, ai: { ...config?.ai, model: modelId } }
    setConfig(newConfig)
    api.saveConfig(newConfig).catch(() => {})
  }

  const tokenPct = useMemo(() => {
    if (!tokenUsage) return 0
    const modelId = config?.ai?.model || 'openclaw'
    const model = models.find((m: any) => m.id === modelId)
    const max = model?.contextWindow || config?.ai?.maxTokens || 128000
    return Math.min(100, Math.round((tokenUsage / max) * 100))
  }, [tokenUsage, config, models])

  return (
    <div className="toolbar" role="toolbar" aria-label="工具栏">
      <button className="tb-sidebar-toggle" onClick={toggleSidebar} aria-label="切换侧边栏">&#9776;</button>
      <div className="tb-tabs" role="tablist">
        {tabs.map(t => (
          <button key={t.id} className={'tb-tab' + (currentPage === t.id ? ' active' : '')}
            role="tab" aria-selected={currentPage === t.id}
            onClick={() => setPage(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="tb-sep"></div>
      <button className="tb-new-conv primary" onClick={async () => {
        try {
          const id = await api.convCreate('新对话')
          useAppStore.getState().setCurrentConvId(id)
          useAppStore.getState().setMessages([])
          useAppStore.getState().setTokenUsage(0)
          localStorage.setItem('lastConvId', id)
          setPage('chat')
          api.convList().then(useAppStore.getState().setConversations).catch(() => {})
        } catch {}
      }} aria-label="新建对话">+ 新建对话</button>
      {currentPage === 'chat' && (
        <button className={'tb-tab' + (compareMode ? ' active' : '')} onClick={() => setCompareMode(!compareMode)} style={{ marginLeft: 4 }}>{compareMode ? '退出对比' : '对比'}</button>
      )}
      <div style={{ flex: 1 }}></div>
      {tokenUsage > 0 && (
        <div className="tb-token-badge">
          <div className="tb-token-bar"><div className="tb-token-fill" style={{ width: tokenPct + '%' }}></div></div>
          <span>{tokenUsage} tokens</span>
        </div>
      )}
      <div className="tb-sep"></div>
      <select className="model-select" value={currentModel} onChange={e => handleModelChange(e.target.value)}>
        <option value="auto">Auto (智能路由)</option>
        {models.map(m => (
          <option key={m.id} value={m.id}>{m.name || m.id}</option>
        ))}
        {models.length === 0 && <option value="openclaw">OpenClaw</option>}
      </select>
      <div className="tb-sep"></div>
      <button className="tb-panel-toggle" onClick={() => { api.windowOpen() }} title="新窗口">&#9723;</button>
      <button className={'tb-panel-toggle' + (rightPanelVisible ? ' on' : '')} onClick={toggleRightPanel}>&#8942;</button>
    </div>
  )
}
