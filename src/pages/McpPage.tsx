import { useEffect, useState } from 'react'
import { api } from '../lib/ipc'

export function McpPage() {
  const [servers, setServers] = useState<any[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCommand, setNewCommand] = useState('')
  const [newType, setNewType] = useState('stdio')

  useEffect(() => { api.mcpList().then(setServers).catch(console.error) }, [])

  const handleToggle = (id: string, enabled: boolean) => {
    const s = servers.find(x => x.id === id)
    if (s) { s.enabled = enabled; api.mcpSave(s); setServers([...servers]) }
  }

  const handleAdd = () => {
    if (!newName.trim()) return
    const s = { id: 'mcp-' + Date.now(), name: newName, command: newCommand, type: newType, enabled: true, status: 'offline' }
    api.mcpSave(s).then(() => { setServers([...servers, s]); setNewName(''); setNewCommand(''); setShowAdd(false) })
  }

  const statusColor = (status: string) => {
    if (status === 'online' || status === 'connected') return 'var(--success)'
    if (status === 'warning') return 'var(--warning)'
    return 'var(--error)'
  }

  return (
    <div className="page" id="page-mcp">
      <div className="pg">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>MCP 服务器</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ 添加服务器</button>
        </div>
        {servers.length === 0 && <div className="empty-state"><h3>无 MCP 服务器</h3><p>添加 MCP 服务器扩展 Agent 能力</p></div>}
        {servers.map(s => (
          <div key={s.id} className="card" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(s.status), flexShrink: 0, boxShadow: s.status === 'online' ? '0 0 6px rgba(22,163,74,0.4)' : 'none' }}></span>
              <div style={{ flex: 1 }}>
                <div className="card-title">{s.name}</div>
                <div className="card-sub" style={{ fontFamily: 'var(--mono)' }}>{s.command}</div>
              </div>
              <span className="badge badge-blue">{s.type || 'stdio'}</span>
              {s.latency && <span style={{ fontSize: 10, color: 'var(--text4)', fontFamily: 'var(--mono)' }}>{s.latency}ms</span>}
              <div className={'toggle' + (s.enabled !== false ? ' on' : '')} onClick={() => handleToggle(s.id, s.enabled === false)}></div>
              <button className="btn btn-sm btn-ghost" onClick={() => handleToggle(s.id, !s.enabled)} title={'\u91cd\u542f'}>&#8634;</button>
            </div>
          </div>
        ))}
        {showAdd && (
          <div className="modal-overlay" onClick={() => setShowAdd(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header"><h3>添加 MCP 服务器</h3></div>
              <div className="modal-body">
                <div className="form-group"><label>名称</label><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="服务器名称..." /></div>
                <div className="form-group"><label>命令</label><input value={newCommand} onChange={e => setNewCommand(e.target.value)} placeholder="npx @modelcontextprotocol/server-..." /></div>
                <div className="form-group"><label>传输类型</label><select value={newType} onChange={e => setNewType(e.target.value)}><option value="stdio">stdio</option><option value="http">HTTP</option><option value="sse">SSE</option></select></div>
              </div>
              <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowAdd(false)}>取消</button><button className="btn btn-primary" onClick={handleAdd}>添加</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
