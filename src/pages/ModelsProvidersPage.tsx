import { useEffect, useState, useMemo } from 'react'
import { api } from '../lib/ipc'

export function ModelsProvidersPage() {
  const [providers, setProviders] = useState<any[]>([])
  const [models, setModels] = useState<any[]>([])
  const [config, setConfig] = useState<any>({})
  const [tab, setTab] = useState<'providers' | 'models'>('providers')
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newKey, setNewKey] = useState('')
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.providersList().then(setProviders).catch(console.error)
    api.modelsList().then(setModels).catch(console.error)
    api.getConfig().then(setConfig).catch(console.error)
  }, [])

  const currentModel = config.ai?.model || 'openclaw'

  const configuredProviders = useMemo(() => providers.filter(p => p.apiKey), [providers])
  const unconfiguredProviders = useMemo(() => providers.filter(p => !p.apiKey), [providers])

  const filteredModels = useMemo(() => {
    let list = models
    if (search) { const q = search.toLowerCase(); list = list.filter(m => (m.name || m.id || '').toLowerCase().includes(q)) }
    return list
  }, [models, search])

  const handleTest = async (p: any) => {
    setTesting(p.id)
    try {
      const url = (p.baseUrl || '').replace(/\/+$/, '')
      if (!url) { setTestResult(r => ({ ...r, [p.id]: false })); setTesting(null); return }
      const resp = await fetch(`${url}/models`, {
        headers: { 'Authorization': `Bearer ${p.apiKey || ''}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000)
      })
      const ok = resp.ok
      setTestResult(r => ({ ...r, [p.id]: ok }))
      // Chain 1: 测试成功自动启用该供应商所有模型
      if (ok) {
        const provModels = models.filter(m => m.provider === p.id)
        for (const m of provModels) {
          if (m.enabled === false) {
            api.modelsToggle(m.id, true)
            m.enabled = true
          }
        }
        setModels([...models])
      }
    } catch { setTestResult(r => ({ ...r, [p.id]: false })) }
    setTesting(null)
  }

  const handleSaveProvider = () => {
    if (!newName.trim()) return
    if (editId) {
      const updated = providers.map(p => p.id === editId ? { ...p, name: newName, baseUrl: newUrl, apiKey: newKey } : p)
      const item = updated.find(p => p.id === editId)
      if (item) api.providersSave(item)
      setProviders(updated)
    } else {
      const p = { id: 'prov-' + Date.now(), name: newName, baseUrl: newUrl, apiKey: newKey, enabled: true, models: [] }
      api.providersSave(p).then(() => setProviders([...providers, p]))
    }
    setNewName(''); setNewUrl(''); setNewKey(''); setShowAdd(false); setEditId(null)
  }

  const handleDeleteProvider = (id: string) => {
    api.providersDelete(id).then(() => setProviders(providers.filter(p => p.id !== id)))
  }

  const handleEditProvider = (p: any) => {
    setEditId(p.id); setNewName(p.name || ''); setNewUrl(p.baseUrl || ''); setNewKey(p.apiKey || ''); setShowAdd(true)
  }

  const handleSetPrimary = (id: string) => {
    const newConfig = { ...config, ai: { ...config.ai, model: id } }
    setConfig(newConfig)
    api.saveConfig(newConfig)
  }

  const handleToggleModel = (id: string, enabled: boolean) => {
    api.modelsToggle(id, enabled)
    setModels(models.map(m => m.id === id ? { ...m, enabled } : m))
  }

  const maskKey = (key: string) => {
    if (!key || key.length < 10) return key || '\u672a\u914d\u7f6e'
    return key.slice(0, 5) + '...' + key.slice(-4)
  }

  const providerColors: Record<string, string> = {
    openai: '#10a37f', anthropic: '#d97706', google: '#4285f4', meta: '#1877f2',
    deepseek: '#6366f1', qwen: '#f97316', mistral: '#ef4444', openclaw: '#4f46e5',
    xiaomi: '#ff6700', zai: '#8b5cf6', moonshot: '#6366f1', minimax: '#06b6d4',
    stepfun: '#16a34a', groq: '#f59e0b', ollama: '#22c55e',
  }

  const getProviderColor = (id: string) => {
    for (const [key, color] of Object.entries(providerColors)) {
      if (id.toLowerCase().includes(key)) return color
    }
    return 'var(--accent)'
  }

  return (
    <div className="page" id="page-models">
      <div className="pg" style={{ maxWidth: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{'\u6a21\u578b\u914d\u7f6e'}</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {tab === 'providers' && (
              <button className="btn btn-primary btn-sm" onClick={() => { setEditId(null); setNewName(''); setNewUrl(''); setNewKey(''); setShowAdd(true) }}>+ {'\u6dfb\u52a0\u4f9b\u5e94\u5546'}</button>
            )}
          </div>
        </div>

        <div className="gc-tabs" style={{ marginBottom: 16 }}>
          <button className={'gc-tab' + (tab === 'providers' ? ' active' : '')} onClick={() => setTab('providers')}>{'\u4f9b\u5e94\u5546'} ({providers.length})</button>
          <button className={'gc-tab' + (tab === 'models' ? ' active' : '')} onClick={() => setTab('models')}>{'\u6a21\u578b'} ({models.length})</button>
        </div>

        {tab === 'providers' && (
          <>
            {configuredProviders.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{'\u5df2\u914d\u7f6e'} ({configuredProviders.length})</div>
                <div className="dash-grid">
                  {configuredProviders.map(p => (
                    <div key={p.id} className="card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: getProviderColor(p.id) + '15', color: getProviderColor(p.id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>{(p.name || 'P')[0].toUpperCase()}</div>
                        <div style={{ flex: 1 }}>
                          <div className="card-title">{p.name}</div>
                          <div className="card-sub" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{p.baseUrl || '\u672a\u914d\u7f6e URL'}</div>
                        </div>
                        <span className="badge badge-green">{'\u5df2\u8fde\u63a5'}</span>
                      </div>
                      <div className="kv-row"><span className="k">API Key</span><span className="v">{maskKey(p.apiKey)}</span></div>
                      <div className="kv-row"><span className="k">{'\u6a21\u578b\u6570'}</span><span className="v">{models.filter(m => m.provider === p.id).length}</span></div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => handleEditProvider(p)}>{'\u7f16\u8f91'}</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => handleTest(p)} disabled={testing === p.id}>{testing === p.id ? '\u6d4b\u8bd5\u4e2d...' : '\u6d4b\u8bd5'}</button>
                        {testResult[p.id] !== undefined && <span className={'badge ' + (testResult[p.id] ? 'badge-green' : 'badge-red')}>{testResult[p.id] ? '\u2713' : '\u2717'}</span>}
                        <div style={{ flex: 1 }}></div>
                        <button className="btn btn-sm btn-ghost" onClick={() => handleDeleteProvider(p.id)} style={{ color: 'var(--error)' }}>{'\u5220\u9664'}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {unconfiguredProviders.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{'\u672a\u914d\u7f6e'} ({unconfiguredProviders.length})</div>
                <div className="dash-grid">
                  {unconfiguredProviders.map(p => (
                    <div key={p.id} className="card" style={{ opacity: 0.6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg3)', color: 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>{(p.name || 'P')[0].toUpperCase()}</div>
                        <div style={{ flex: 1 }}>
                          <div className="card-title">{p.name}</div>
                          <div className="card-sub">{'\u8bf7\u914d\u7f6e API Key'}</div>
                        </div>
                        <button className="btn btn-sm btn-primary" onClick={() => handleEditProvider(p)}>{'\u914d\u7f6e'}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'models' && (
          <>
            <div className="filter-bar">
              <input type="text" placeholder={'\u641c\u7d22\u6a21\u578b...'} value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
              <span className="badge badge-blue">{filteredModels.length} {'\u4e2a\u6a21\u578b'}</span>
            </div>
            {configuredProviders.length === 0 && (
              <div className="empty-state"><h3>{'\u8bf7\u5148\u914d\u7f6e\u4f9b\u5e94\u5546'}</h3><p>{'\u5207\u6362\u5230\u4f9b\u5e94\u5546 Tab \u914d\u7f6e API Key'}</p></div>
            )}
            <div className="dash-grid">
              {filteredModels.map(m => {
                const isActive = m.id === currentModel
                const prov = providers.find(p => p.id === m.provider)
                const color = getProviderColor(m.provider || '')
                return (
                  <div key={m.id} className="card" style={{ position: 'relative' }}>
                    {isActive && <span className="badge badge-green" style={{ position: 'absolute', top: 8, right: 8 }}>{'\u9996\u9009'}</span>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${color}, ${color}88)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{(m.name || m.id || 'M').substring(0, 2).toUpperCase()}</div>
                      <div>
                        <div className="card-title">{m.name || m.id}</div>
                        <div className="card-sub">{prov?.name || m.provider || 'unknown'}</div>
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
                      <div className={'toggle' + (m.enabled !== false ? ' on' : '')} onClick={() => handleToggleModel(m.id, m.enabled === false)}></div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {showAdd && (
          <div className="modal-overlay" onClick={() => { setShowAdd(false); setEditId(null) }}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header"><h3>{editId ? '\u7f16\u8f91\u4f9b\u5e94\u5546' : '\u6dfb\u52a0\u4f9b\u5e94\u5546'}</h3></div>
              <div className="modal-body">
                <div className="form-group"><label>{'\u540d\u79f0'}</label><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="OpenAI, DeepSeek, Anthropic..." /></div>
                <div className="form-group"><label>Base URL</label><input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://api.openai.com/v1" /></div>
                <div className="form-group"><label>API Key</label><input type="password" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="sk-..." /></div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => { setShowAdd(false); setEditId(null) }}>{'\u53d6\u6d88'}</button>
                <button className="btn btn-primary" onClick={handleSaveProvider}>{'\u4fdd\u5b58'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
