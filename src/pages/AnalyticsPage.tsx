import { useEffect, useState, useMemo } from 'react'
import { api } from '../lib/ipc'

export function AnalyticsPage() {
  const [convs, setConvs] = useState<any[]>([])
  const [memories, setMemories] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [insights, setInsights] = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.convList().then(setConvs).catch(() => {})
    api.memoryList().then(setMemories).catch(() => {})
    api.agentsList().then(setAgents).catch(() => {})
  }, [])

  const stats = useMemo(() => {
    const now = new Date()
    const today = convs.filter(c => { const d = new Date(c.updatedAt); return d.toDateString() === now.toDateString() }).length
    const week = convs.filter(c => { const d = new Date(c.updatedAt); return (now.getTime() - d.getTime()) < 604800000 }).length
    const models: Record<string, number> = {}
    convs.forEach(c => { const m = c.model || 'openclaw'; models[m] = (models[m] || 0) + 1 })
    const topModel = Object.entries(models).sort((a, b) => b[1] - a[1])[0]
    return { total: convs.length, today, week, memories: memories.length, agents: agents.length, topModel: topModel ? topModel[0] : '-' }
  }, [convs, memories, agents])

  const handleInsights = async () => {
    setLoading(true)
    const r = await api.capInsights(7)
    if (r.ok) setInsights(r.data || '\u65e0\u6570\u636e')
    setLoading(false)
  }

  return (
    <div className="page" id="page-analytics">
      <div className="pg" style={{ maxWidth: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{'\u5bf9\u8bdd\u5206\u6790'}</h2>
          <button className="btn btn-secondary btn-sm" onClick={handleInsights} disabled={loading}>{loading ? '\u5206\u6790\u4e2d...' : 'Hermes Insights'}</button>
        </div>
        <div className="dash-grid" style={{ marginBottom: 20 }}>
          <div className="dash-card">
            <div className="big-num">{stats.total}</div>
            <div className="sub-label">{'\u603b\u5bf9\u8bdd\u6570'}</div>
          </div>
          <div className="dash-card">
            <div className="big-num">{stats.today}</div>
            <div className="sub-label">{'\u4eca\u5929'}</div>
          </div>
          <div className="dash-card">
            <div className="big-num">{stats.week}</div>
            <div className="sub-label">{'\u672c\u5468'}</div>
          </div>
          <div className="dash-card">
            <div className="big-num">{stats.memories}</div>
            <div className="sub-label">{'\u8bb0\u5fc6\u6570'}</div>
          </div>
          <div className="dash-card">
            <div className="big-num">{stats.agents}</div>
            <div className="sub-label">{'Agent \u6570'}</div>
          </div>
          <div className="dash-card">
            <div className="big-num" style={{ fontSize: 18 }}>{stats.topModel}</div>
            <div className="sub-label">{'\u6700\u5e38\u7528\u6a21\u578b'}</div>
          </div>
        </div>
        {insights && (
          <div className="setting-group">
            <h4>Hermes Insights {'\u62a5\u544a'}</h4>
            <pre style={{ fontSize: 12, fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--text2)' }}>{insights}</pre>
          </div>
        )}
        <div className="setting-group">
          <h4>{'\u6700\u8fd1\u5bf9\u8bdd'}</h4>
          {convs.slice(0, 10).map(c => (
            <div key={c.id} className="kv-row">
              <span className="k">{c.title || '\u65b0\u5efa\u5bf9\u8bdd'}</span>
              <span className="v">{c.model || 'openclaw'} / {new Date(c.updatedAt).toLocaleDateString('zh-CN')}</span>
            </div>
          ))}
          {convs.length === 0 && <div style={{ color: 'var(--text4)', fontSize: 12 }}>{'\u6682\u65e0\u5bf9\u8bdd'}</div>}
        </div>
      </div>
    </div>
  )
}

