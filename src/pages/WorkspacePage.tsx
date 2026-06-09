import { useState, useEffect } from 'react'
import { api } from '../lib/ipc'

export function WorkspacePage() {
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const [current, setCurrent] = useState('default')
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    api.settingsGet('workspaces').then((ws: any) => {
      if (ws) setWorkspaces(JSON.parse(ws))
      else setWorkspaces([{ id: 'default', name: '\u9ed8\u8ba4\u5de5\u4f5c\u533a', createdAt: new Date().toISOString() }])
    }).catch(() => {
      setWorkspaces([{ id: 'default', name: '\u9ed8\u8ba4\u5de5\u4f5c\u533a', createdAt: new Date().toISOString() }])
    })
    api.settingsGet('currentWorkspace').then((w: any) => { if (w) setCurrent(w) }).catch(() => {})
  }, [])

  const handleCreate = () => {
    if (!newName.trim()) return
    const ws = { id: 'ws-' + Date.now(), name: newName, createdAt: new Date().toISOString() }
    const updated = [...workspaces, ws]
    setWorkspaces(updated)
    api.settingsSet('workspaces', JSON.stringify(updated))
    setNewName(''); setShowCreate(false)
  }

  const handleSwitch = (id: string) => {
    setCurrent(id)
    api.settingsSet('currentWorkspace', id)
  }

  const handleDelete = (id: string) => {
    if (id === 'default') return
    const updated = workspaces.filter(w => w.id !== id)
    setWorkspaces(updated)
    api.settingsSet('workspaces', JSON.stringify(updated))
    if (current === id) { setCurrent('default'); api.settingsSet('currentWorkspace', 'default') }
  }

  return (
    <div className="page" id="page-workspace">
      <div className="pg" style={{ maxWidth: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{'\u5de5\u4f5c\u533a\u7ba1\u7406'}</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ {'\u65b0\u5efa\u5de5\u4f5c\u533a'}</button>
        </div>
        <div className="dash-grid">
          {workspaces.map(ws => (
            <div key={ws.id} className="card" style={{ border: current === ws.id ? '2px solid var(--accent)' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: current === ws.id ? 'var(--accent)' : 'var(--bg3)', color: current === ws.id ? '#fff' : 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>{ws.name[0]}</div>
                <div style={{ flex: 1 }}>
                  <div className="card-title">{ws.name}</div>
                  <div className="card-sub">{ws.id === 'default' ? '\u9ed8\u8ba4\u5de5\u4f5c\u533a' : '\u81ea\u5b9a\u4e49'}</div>
                </div>
                {current === ws.id && <span className="badge badge-green">{'\u5f53\u524d'}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {current !== ws.id && <button className="btn btn-sm btn-primary" onClick={() => handleSwitch(ws.id)}>{'\u5207\u6362'}</button>}
                {ws.id !== 'default' && <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(ws.id)} style={{ color: 'var(--error)' }}>{'\u5220\u9664'}</button>}
              </div>
            </div>
          ))}
        </div>
        {showCreate && (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header"><h3>{'\u65b0\u5efa\u5de5\u4f5c\u533a'}</h3></div>
              <div className="modal-body">
                <div className="form-group"><label>{'\u5de5\u4f5c\u533a\u540d\u79f0'}</label><input value={newName} onChange={e => setNewName(e.target.value)} placeholder={'\u8f93\u5165\u5de5\u4f5c\u533a\u540d\u79f0...'} onKeyDown={e => { if (e.key === 'Enter') handleCreate() }} /></div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>{'\u53d6\u6d88'}</button>
                <button className="btn btn-primary" onClick={handleCreate}>{'\u521b\u5efa'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
