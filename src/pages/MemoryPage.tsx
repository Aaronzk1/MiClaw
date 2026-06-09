import { useEffect, useState, useMemo } from 'react'
import { api } from '../lib/ipc'

export function MemoryPage() {
  const [memories, setMemories] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState('general')
  const [view, setView] = useState('cluster')

  useEffect(() => { api.memoryList().then(setMemories).catch(() => {}) }, [])

  const filtered = useMemo(() => {
    if (!search) return memories
    const q = search.toLowerCase()
    return memories.filter(m => m.content.toLowerCase().includes(q))
  }, [memories, search])

  const stats = useMemo(() => {
    const short = memories.filter(m => m.category === 'short' || m.category === 'user_pref' || m.category === 'general').length
    const mid = memories.filter(m => m.category === 'mid' || m.category === 'project' || m.category === 'config').length
    const long = memories.filter(m => m.category === 'long' || m.category === 'architecture').length
    return { short, mid, long }
  }, [memories])

  const clusters = useMemo(() => {
    const groups: Record<string, any[]> = {}
    for (const m of memories) {
      const cat = m.category || 'general'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(m)
    }
    return Object.entries(groups).map(([cat, items]) => ({
      category: cat,
      count: items.length,
      avgImportance: items.reduce((s, m) => s + (m.importance || 0.5), 0) / items.length,
      items,
      color: cat === 'user_pref' ? 'var(--accent)' : cat === 'project' ? 'var(--success)' : cat === 'architecture' ? 'var(--warning)' : cat === 'config' ? '#8b5cf6' : 'var(--text3)',
    }))
  }, [memories])

  const handleAdd = () => {
    if (!newContent.trim()) return
    api.memoryAdd(newContent, newCategory).then((id: string) => {
      setMemories([...memories, { id, content: newContent, category: newCategory, importance: 0.5, createdAt: new Date().toISOString() }])
      setNewContent(''); setShowAdd(false)
    })
  }

  const handleDelete = (id: string) => {
    api.memoryDelete(id).then(() => setMemories(memories.filter(m => m.id !== id)))
  }

  // SVG visualization
  const vizNodes = useMemo(() => {
    if (memories.length === 0) return []
    const nodes: { x: number; y: number; r: number; color: string; label: string; cat: string }[] = []
    const catColors: Record<string, string> = {
      user_pref: '#4f46e5', general: '#6366f1', project: '#16a34a',
      architecture: '#f59e0b', config: '#8b5cf6', short: '#4f46e5',
      mid: '#f59e0b', long: '#16a34a',
    }
    clusters.forEach((c, ci) => {
      const cx = 150 + ci * 120
      const cy = 120
      nodes.push({ x: cx, y: cy, r: 20 + c.count * 2, color: c.color, label: c.category, cat: c.category })
      c.items.slice(0, 5).forEach((_, mi) => {
        const angle = (mi / Math.min(c.items.length, 5)) * Math.PI * 2
        const dist = 60 + Math.random() * 30
        nodes.push({ x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist, r: 6, color: c.color + '88', label: '', cat: c.category })
      })
    })
    return nodes
  }, [clusters, memories])

  return (
    <div className="page" id="page-memory">
      <div className="pg" style={{ maxWidth: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{'\u8bb0\u5fc6\u7ba1\u7406'}</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ {'\u6dfb\u52a0\u8bb0\u5fc6'}</button>
        </div>
        <div className="dash-grid" style={{ marginBottom: 16 }}>
          <div className="dash-card"><div className="big-num">{stats.short}</div><div className="sub-label">{'\u77ed\u671f\u8bb0\u5fc6'}</div></div>
          <div className="dash-card"><div className="big-num">{stats.mid}</div><div className="sub-label">{'\u4e2d\u671f\u8bb0\u5fc6'}</div></div>
          <div className="dash-card"><div className="big-num">{stats.long}</div><div className="sub-label">{'\u957f\u671f\u8bb0\u5fc6'}</div></div>
        </div>
        <div className="gc-tabs" style={{ marginBottom: 12 }}>
          <button className={'gc-tab' + (view === 'cluster' ? ' active' : '')} onClick={() => setView('cluster')}>{'\u96c6\u7fa4\u89c6\u56fe'}</button>
          <button className={'gc-tab' + (view === 'viz' ? ' active' : '')} onClick={() => setView('viz')}>{'\u53ef\u89c6\u5316'}</button>
          <button className={'gc-tab' + (view === 'list' ? ' active' : '')} onClick={() => setView('list')}>{'\u5217\u8868'}</button>
        </div>
        <div className="filter-bar">
          <input type="text" placeholder={'\u641c\u7d22\u8bb0\u5fc6...'} value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
        </div>

        {view === 'viz' && (
          <div className="dash-card" style={{ marginBottom: 16, padding: 20, textAlign: 'center' }}>
            <svg width="100%" height="280" viewBox="0 0 600 280" style={{ maxWidth: 600 }}>
              {/* Lines between clusters */}
              {vizNodes.filter(n => n.r > 10).map((n, i) => {
                const next = vizNodes.filter(n2 => n2.r > 10)[i + 1]
                if (!next) return null
                return <line key={'l' + i} x1={n.x} y1={n.y} x2={next.x} y2={next.y} stroke="var(--border)" strokeWidth="1" strokeDasharray="4,4" />
              })}
              {/* Nodes */}
              {vizNodes.map((n, i) => (
                <g key={i}>
                  <circle cx={n.x} cy={n.y} r={n.r} fill={n.color} opacity={n.r > 10 ? 0.9 : 0.5} />
                  {n.label && <text x={n.x} y={n.y + n.r + 14} textAnchor="middle" fontSize="10" fill="var(--text2)">{n.label}</text>}
                  {n.r > 10 && <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="600">{n.r > 10 ? vizNodes.filter(nn => nn.cat === n.cat).length - 1 : ''}</text>}
                </g>
              ))}
            </svg>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
              {clusters.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text3)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, display: 'inline-block' }}></span>
                  {c.category} ({c.count})
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'cluster' && clusters.map((c, i) => (
          <div key={i} className="card" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.color }}></span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{c.category}</span>
              </div>
              <span className="badge badge-green">{c.count} {'\u6761'}</span>
            </div>
            <div className="ctx-bar" style={{ marginBottom: 6 }}>
              <div className="ctx-seg" style={{ width: Math.round(c.avgImportance * 100) + '%', background: c.color }}></div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>{'\u5e73\u5747\u91cd\u8981\u6027'}: {(c.avgImportance * 100).toFixed(0)}%</div>
            {c.items.slice(0, 3).map((m: any) => (
              <div key={m.id} style={{ fontSize: 12, color: 'var(--text2)', padding: '4px 0', borderTop: '1px solid var(--bg2)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.content}</span>
                <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(m.id)} style={{ fontSize: 10 }}>{'\u2715'}</button>
              </div>
            ))}
          </div>
        ))}

        {view === 'list' && filtered.map((m: any) => (
          <div key={m.id} className="card" style={{ marginBottom: 6, padding: '10px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>{m.content}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <span className="badge badge-blue">{m.category || 'general'}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--text4)' }}>{new Date(m.createdAt).toLocaleDateString('zh-CN')}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--text4)' }}>W{(m.importance || 0.5).toFixed(1)}</span>
                </div>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(m.id)}>{'\u2715'}</button>
            </div>
          </div>
        ))}

        {showAdd && (
          <div className="modal-overlay" onClick={() => setShowAdd(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header"><h3>{'\u6dfb\u52a0\u8bb0\u5fc6'}</h3><button className="btn btn-sm btn-ghost" onClick={() => setShowAdd(false)}>{'\u2715'}</button></div>
              <div className="modal-body">
                <div className="form-group"><label>{'\u5185\u5bb9'}</label><textarea rows={3} value={newContent} onChange={e => setNewContent(e.target.value)} placeholder={'\u8f93\u5165\u8bb0\u5fc6\u5185\u5bb9...'} /></div>
                <div className="form-group"><label>{'\u5206\u7c7b'}</label><select value={newCategory} onChange={e => setNewCategory(e.target.value)}><option value="general">{'\u901a\u7528'}</option><option value="user_pref">{'\u7528\u6237\u504f\u597d'}</option><option value="project">{'\u9879\u76ee'}</option><option value="architecture">{'\u67b6\u6784'}</option><option value="config">{'\u914d\u7f6e'}</option></select></div>
              </div>
              <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowAdd(false)}>{'\u53d6\u6d88'}</button><button className="btn btn-primary" onClick={handleAdd}>{'\u6dfb\u52a0'}</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
