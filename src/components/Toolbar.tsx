import { useEffect, useState, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'

const tabs = [
  { id: 'chat', label: '对话' },
  { id: 'group', label: '群聊' },
  { id: 'history', label: '历史' },
  
]

export function Toolbar() {
  const { currentPage, setPage, toggleSidebar, toggleRightPanel, rightPanelVisible, currentConvId, tokenUsage } = useAppStore()
  const [config, setConfig] = useState<any>({})
  const [models, setModels] = useState<any[]>([])

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => {})
    Promise.all([api.modelsList(), api.providersList()]).then(([m, p]) => {
          const configured = new Set(p.filter((x: any) => x.apiKey).map((x: any) => x.id))
          setModels(m.filter((x: any) => x.enabled !== false && (configured.has(x.provider) || x.provider === 'openclaw')))
        }).catch(() => {})
  }, [currentPage])

  const currentModel = config.ai?.model || 'openclaw'

  const handleModelChange = (modelId: string) => {
    const newConfig = { ...config, ai: { ...config.ai, model: modelId } }
    setConfig(newConfig)
    api.saveConfig(newConfig).catch(() => {})
  }

  const tokenPct = useMemo(() => {
    if (!tokenUsage) return 0
    const max = config.ai?.maxTokens || 4096
    return Math.min(100, Math.round((tokenUsage / max) * 100))
  }, [tokenUsage, config])

  return (
    <div className="toolbar">
      <button className="tb-sidebar-toggle" onClick={toggleSidebar}>&#9776;</button>
      <div className="tb-tabs">
        {tabs.map(t => (
          <button key={t.id} className={'tb-tab' + (currentPage === t.id ? ' active' : '')}
            onClick={() => setPage(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="tb-sep"></div>
      <button className="tb-new-conv primary" onClick={() => { setPage('chat'); useAppStore.getState().setCurrentConvId(null); useAppStore.getState().setMessages([]); useAppStore.getState().setTokenUsage(0); }}>+ 新建对话</button>
      <div style={{ flex: 1 }}></div>
      {tokenUsage > 0 && (
        <div className="tb-token-badge">
          <div className="tb-token-bar"><div className="tb-token-fill" style={{ width: tokenPct + '%' }}></div></div>
          <span>{tokenUsage} tokens</span>
        </div>
      )}
      <div className="tb-sep"></div>
      <select className="model-select" value={currentModel} onChange={e => handleModelChange(e.target.value)}>
        {models.map(m => (
          <option key={m.id} value={m.id}>{m.name || m.id}</option>
        ))}
        {models.length === 0 && <option value="openclaw">OpenClaw</option>}
      </select>
      <div className="tb-sep"></div>
      <button className={'tb-panel-toggle' + (rightPanelVisible ? ' on' : '')} onClick={toggleRightPanel}>&#8942;</button>
    </div>
  )
}
