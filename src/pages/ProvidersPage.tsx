import { useEffect, useState } from 'react'
import { api } from '../lib/ipc'

export function ProvidersPage() {
  const [providers, setProviders] = useState<any[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newKey, setNewKey] = useState('')
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, boolean>>({})

  useEffect(() => { api.providersList().then(setProviders).catch(() => {}) }, [])

  const handleTest = async (p: any) => {
    setTesting(p.id)
    try {
      const url = (p.baseUrl || '').replace(/\/+$/, '')
      if (!url) { setTestResult(r => ({ ...r, [p.id]: false })); setTesting(null); return }
      const resp = await fetch(`${url}/models`, {
        headers: { 'Authorization': `Bearer ${p.apiKey || ''}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000)
      })
      setTestResult(r => ({ ...r, [p.id]: resp.ok }))
    } catch { setTestResult(r => ({ ...r, [p.id]: false })) }
    setTesting(null)
  }

  const handleSave = () => {
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

  const handleEdit = (p: any) => {
    setEditId(p.id); setNewName(p.name || ''); setNewUrl(p.baseUrl || ''); setNewKey(p.apiKey || ''); setShowAdd(true)
  }

  const handleDelete = (id: string) => {
    api.providersDelete(id).then(() => setProviders(providers.filter(p => p.id !== id)))
  }

  const maskKey = (key: string) => {
    if (!key || key.length < 10) return key || '\u672a\u914d\u7f6e'
    return key.slice(0, 5) + '...' + key.slice(-4)
  }

  return (
    <div className="page" id="page-providers">
      <div className="pg">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{'\u4f9b\u5e94\u5546\u7ba1\u7406'}</h2>
          <button className="btn btn-primary btn-sm" onClick={() => { setEditId(null); setNewName(''); setNewUrl(''); setNewKey(''); setShowAdd(true) }}>+ {'\u6dfb\u52a0\u4f9b\u5e94\u5546'}</button>
        </div>
        {providers.length === 0 && <div className="empty-state"><h3>{'\u65e0\u4f9b\u5e94\u5546'}</h3><p>{'\u70b9\u51fb\u4e0a\u65b9\u6309\u94ae\u6dfb\u52a0\u4f9b\u5e94\u5546'}</p></div>}
        {providers.map(p => (
          <div key={p.id} className="card" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>{(p.name || 'P')[0].toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <div className="card-title">{p.name}</div>
                <div className="card-sub" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{p.baseUrl || '\u672a\u914d\u7f6e URL'}</div>
              </div>
              <span className={'badge ' + (p.apiKey ? 'badge-green' : 'badge-yellow')}>{p.apiKey ? '\u5df2\u914d\u7f6e' : '\u672a\u914d\u7f6e'}</span>
            </div>
            <div className="kv-row"><span className="k">API Key</span><span className="v">{maskKey(p.apiKey)}</span></div>
            <div className="kv-row"><span className="k">{'\u6a21\u578b\u6570'}</span><span className="v">{(p.models || []).length}</span></div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button className="btn btn-sm btn-secondary" onClick={() => handleEdit(p)}>{'\u7f16\u8f91'}</button>
              <button className="btn btn-sm btn-secondary" onClick={() => handleTest(p)} disabled={testing === p.id}>{testing === p.id ? '\u6d4b\u8bd5\u4e2d...' : '\u6d4b\u8bd5\u8fde\u63a5'}</button>
              {testResult[p.id] !== undefined && <span className={'badge ' + (testResult[p.id] ? 'badge-green' : 'badge-red')}>{testResult[p.id] ? '\u6210\u529f' : '\u5931\u8d25'}</span>}
              <div style={{ flex: 1 }}></div>
              <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}>{'\u5220\u9664'}</button>
            </div>
          </div>
        ))}
        {showAdd && (
          <div className="modal-overlay" onClick={() => { setShowAdd(false); setEditId(null) }}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header"><h3>{editId ? '\u7f16\u8f91\u4f9b\u5e94\u5546' : '\u6dfb\u52a0\u4f9b\u5e94\u5546'}</h3></div>
              <div className="modal-body">
                <div className="form-group"><label>{'\u540d\u79f0'}</label><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="OpenAI, Anthropic, DeepSeek..." /></div>
                <div className="form-group"><label>Base URL</label><input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://api.openai.com/v1" /></div>
                <div className="form-group"><label>API Key</label><input type="password" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="sk-..." /></div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => { setShowAdd(false); setEditId(null) }}>{'\u53d6\u6d88'}</button>
                <button className="btn btn-primary" onClick={handleSave}>{'\u4fdd\u5b58'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
