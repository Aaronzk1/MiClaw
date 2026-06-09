import { useEffect, useState, useMemo } from 'react'
import { api } from '../lib/ipc'

export function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editAgent, setEditAgent] = useState<any>(null)
  const [name, setName] = useState('')
  const [model, setModel] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [color, setColor] = useState('#4f46e5')
  const [search, setSearch] = useState('')

  useEffect(() => { api.agentsList().then(setAgents).catch(console.error) }, [])

  const filtered = useMemo(() => {
    if (!search) return agents
    const q = search.toLowerCase()
    return agents.filter(a => (a.name || '').toLowerCase().includes(q))
  }, [agents, search])

  const handleToggle = (id: string, enabled: boolean) => {
    api.agentsToggle(id, enabled)
    setAgents(agents.map(a => a.id === id ? { ...a, enabled } : a))
  }

  const openCreate = () => { setEditAgent(null); setName(''); setModel(''); setSystemPrompt(''); setColor('#4f46e5'); setShowModal(true) }
  const openEdit = (a: any) => { setEditAgent(a); setName(a.name || ''); setModel(a.model || ''); setSystemPrompt(a.systemPrompt || ''); setColor(a.color || '#4f46e5'); setShowModal(true) }

  const handleSave = () => {
    if (!name.trim()) return
    const agent = { ...(editAgent || {}), id: editAgent?.id || 'ag-' + Date.now(), name, model, systemPrompt, color, enabled: true }
    api.agentsSave(agent).then(() => {
      if (editAgent) setAgents(agents.map(a => a.id === agent.id ? agent : a))
      else setAgents([...agents, agent])
      setShowModal(false)
    })
  }

  const handleDelete = (id: string) => {
    api.agentsDelete(id).then(() => setAgents(agents.filter(a => a.id !== id)))
  }

  const colorPresets = ['#4f46e5', '#ec4899', '#16a34a', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#a855f7']

  return (
    <div className="page" id="page-agents">
      <div className="pg">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Agent 管理</h2>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>+ 新建 Agent</button>
        </div>
        <div className="filter-bar">
          <input type="text" placeholder="搜索 Agent..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
          <span className="badge badge-blue">{filtered.length} 个 Agent</span>
        </div>
        <div className="dash-grid">
          {filtered.map(a => (
            <div key={a.id} className="card" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: a.color || 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>{(a.name || 'A')[0]}</div>
                <div style={{ flex: 1 }}>
                  <div className="card-title">{a.name}</div>
                  <div className="card-sub">{a.model || 'openclaw'}</div>
                </div>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.enabled !== false ? 'var(--success)' : 'var(--error)' }}></span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5, marginBottom: 8, maxHeight: 40, overflow: 'hidden' }}>{a.systemPrompt?.slice(0, 80) || '无 System Prompt'}</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button className="btn btn-sm btn-secondary" onClick={() => openEdit(a)}>编辑</button>
                <div className={'toggle' + (a.enabled !== false ? ' on' : '')} onClick={() => handleToggle(a.id, a.enabled === false)}></div>
                <div style={{ flex: 1 }}></div>
                <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(a.id)}>&#10005;</button>
              </div>
            </div>
          ))}
        </div>
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 440 }}>
              <div className="modal-header"><h3>{editAgent ? '编辑 Agent' : '新建 Agent'}</h3></div>
              <div className="modal-body">
                <div className="form-group"><label>名称</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Agent 名称..." /></div>
                <div className="form-group"><label>{'模型'}</label><select value={model} onChange={e => setModel(e.target.value)}><option value="openclaw">OpenClaw</option><option value="gpt-4o">GPT-4o</option><option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option><option value="deepseek-chat">DeepSeek Chat</option><option value="qwen-max">Qwen Max</option><option value="mimo-v2.5-pro">MiMo V2.5 Pro</option></select></div>
                <div className="form-group"><label>颜色</label><div style={{ display: 'flex', gap: 6 }}>{colorPresets.map(c => <div key={c} onClick={() => setColor(c)} style={{ width: 28, height: 28, borderRadius: 6, background: c, cursor: 'pointer', border: color === c ? '2px solid var(--text)' : '2px solid transparent' }}></div>)}</div></div>
                <div className="form-group"><label>System Prompt</label><textarea rows={4} value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} placeholder="你是一个..." /></div>
              </div>
              <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowModal(false)}>取消</button><button className="btn btn-primary" onClick={handleSave}>保存</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
