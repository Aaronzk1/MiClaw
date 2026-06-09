import { useEffect, useState, useMemo } from 'react'
import { api } from '../lib/ipc'

export function ModelsPage() {
  const [models, setModels] = useState<any[]>([])
  const [providers, setProviders] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [config, setConfig] = useState<any>({})
  const [showAdd, setShowAdd] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState('')
  const [providerModels, setProviderModels] = useState<any[]>([])

  useEffect(() => {
    api.modelsList().then(setModels).catch(() => {})
    api.providersList().then(setProviders).catch(() => {})
    api.getConfig().then(setConfig).catch(() => {})
  }, [])

  const currentModel = config.ai?.model || 'openclaw'

  const filtered = useMemo(() => {
    if (!search) return models
    const q = search.toLowerCase()
    return models.filter(m => (m.name || m.id || '').toLowerCase().includes(q))
  }, [models, search])

  const handleSetPrimary = (id: string) => {
    const newConfig = { ...config, ai: { ...config.ai, model: id } }
    setConfig(newConfig)
    api.saveConfig(newConfig)
  }

  const handleToggle = (id: string, enabled: boolean) => {
    api.modelsToggle(id, enabled)
    setModels(models.map(m => m.id === id ? { ...m, enabled } : m))
  }

  const providerColors: Record<string, string> = {
    openai: '#10a37f', anthropic: '#d97706', google: '#4285f4', meta: '#1877f2',
    deepseek: '#6366f1', qwen: '#f97316', mistral: '#ef4444', openclaw: '#4f46e5',
  }

  const handleProviderSelect = (provId: string) => {
    setSelectedProvider(provId)
    const prov = providers.find(p => p.id === provId)
    setProviderModels(prov?.models || [])
  }

  const handleAddModel = (m: any) => {
    const newModel = { id: m.id || m.name, name: m.name || m.id, provider: selectedProvider, contextWindow: m.contextWindow || 128000, maxTokens: m.maxTokens || 4096, temperature: 0.7, enabled: true }
    api.modelsSave(newModel).then(() => {
      setModels([...models, newModel])
      setShowAdd(false)
    })
  }

  return (
    <div className="page" id="page-models">
      <div className="pg">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{'\u6a21\u578b\u914d\u7f6e'}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="badge badge-blue">{filtered.length} {'\u4e2a\u6a21\u578b'}</span>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ {'\u6dfb\u52a0\u6a21\u578b'}</button>
          </div>
        </div>
        <div className="filter-bar">
          <input type="text" placeholder={'\u641c\u7d22\u6a21\u578b...'} value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
        </div>
        <div className="dash-grid">
          {filtered.map(m => {
            const isActive = m.id === currentModel
            const color = providerColors[(m.provider || '').toLowerCase()] || 'var(--accent)'
            return (
              <div key={m.id} className="card" style={{ position: 'relative' }}>
                {isActive && <span className="badge badge-green" style={{ position: 'absolute', top: 8, right: 8 }}>{'\u9996\u9009'}</span>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${color}, ${color}88)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{(m.name || m.id || 'M').substring(0, 2).toUpperCase()}</div>
                  <div>
                    <div className="card-title">{m.name || m.id}</div>
                    <div className="card-sub">{m.provider || 'unknown'}</div>
                  </div>
                </div>
                <div className="kv-row"><span className="k">{'\u4e0a\u4e0b\u6587'}</span><span className="v">{((m.contextWindow || 0) / 1000).toFixed(0)}K</span></div>
                <div className="ctx-bar" style={{ margin: '4px 0' }}>
                  <div className="ctx-seg" style={{ width: Math.min(100, Math.round(((m.contextWindow || 0) / 1048576) * 100)) + '%', background: color }}></div>
                </div>
                <div className="kv-row"><span className="k">{'\u6700\u5927\u8f93\u51fa'}</span><span className="v">{((m.maxTokens || 0) / 1000).toFixed(0)}K</span></div>
                <div className="kv-row"><span className="k">{'\u6e29\u5ea6'}</span><span className="v">{m.temperature || 0.7}</span></div>
                <div className="kv-row"><span className="k">{'\u5de5\u5177\u8c03\u7528'}</span><span className="v">{m.tools !== false ? '\u652f\u6301' : '\u4e0d\u652f\u6301'}</span></div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
                  {!isActive && <button className="btn btn-sm btn-primary" onClick={() => handleSetPrimary(m.id)}>{'\u8bbe\u4e3a\u9996\u9009'}</button>}
                  {isActive && <span className="badge badge-green">{'\u5f53\u524d\u4f7f\u7528'}</span>}
                  <div style={{ flex: 1 }}></div>
                  <div className={'toggle' + (m.enabled !== false ? ' on' : '')} onClick={() => handleToggle(m.id, m.enabled === false)}></div>
                </div>
              </div>
            )
          })}
        </div>
        {showAdd && (
          <div className="modal-overlay" onClick={() => setShowAdd(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 480 }}>
              <div className="modal-header"><h3>{'\u6dfb\u52a0\u6a21\u578b'}</h3></div>
              <div className="modal-body">
                <div className="form-group">
                  <label>{'\u9009\u62e9\u4f9b\u5e94\u5546'}</label>
                  <select value={selectedProvider} onChange={e => handleProviderSelect(e.target.value)}>
                    <option value="">{'\u9009\u62e9\u4f9b\u5e94\u5546...'}</option>
                    {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                {providerModels.length > 0 && (
                  <div className="form-group">
                    <label>{'\u53ef\u7528\u6a21\u578b'} ({providerModels.length})</label>
                    <div style={{ maxHeight: 200, overflow: 'auto' }}>
                      {providerModels.map((m: any, i: number) => (
                        <div key={i} className="card" style={{ marginBottom: 4, padding: '8px 12px', cursor: 'pointer' }} onClick={() => handleAddModel(m)}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12.5, fontWeight: 500 }}>{m.name || m.id}</span>
                            <span className="badge badge-blue" style={{ fontSize: 10 }}>{((m.contextWindow || 128000) / 1000).toFixed(0)}K</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedProvider && providerModels.length === 0 && (
                  <div className="empty-state" style={{ padding: 20 }}><p>{'\u6b64\u4f9b\u5e94\u5546\u65e0\u53ef\u7528\u6a21\u578b\uff0c\u8bf7\u5148\u914d\u7f6e API Key \u5e76\u6d4b\u8bd5\u8fde\u63a5'}</p></div>
                )}
              </div>
              <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowAdd(false)}>{'\u5173\u95ed'}</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
