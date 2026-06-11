import { useEffect, useState, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'
import { ConfirmModal } from '../components/ui'

export function DashboardPage() {
  const { setPage, setCurrentConvId, setMessages } = useAppStore()
  const [tab, setTab] = useState<'overview' | 'analytics' | 'history' | 'workspace'>('overview')
  const [data, setData] = useState({ convs: 0, agents: 0, skills: 0, models: 0, memory: 0 })
  const [recentConvs, setRecentConvs] = useState<any[]>([])
  const [cronJobs, setCronJobs] = useState<any[]>([])
  const [memories, setMemories] = useState<any[]>([])
  const [gatewayRunning, setGatewayRunning] = useState(false)
  const [allConvs, setAllConvs] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const [currentWs, setCurrentWs] = useState('default')
  const [showCreateWs, setShowCreateWs] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [timeFilter, setTimeFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.convList(), api.agentsList(), api.skillsList(), api.modelsList(), api.memoryList(), api.cronList()]).then(([c, a, s, m, mem, cr]) => {
      setData({ convs: c.length, agents: a.length, skills: s.length, models: m.length, memory: mem.length })
      setRecentConvs(c.slice(0, 4))
      setCronJobs(cr.slice(0, 3))
      setMemories(mem)
      setAllConvs(c)
      setAgents(a)
    }).catch(console.error)
    api.gatewayStatus().then((s: any) => setGatewayRunning(s.running)).catch(() => {})
    api.settingsGet('workspaces').then((ws: any) => {
      try {
        if (ws) setWorkspaces(JSON.parse(ws))
        else setWorkspaces([{ id: 'default', name: '默认工作区', createdAt: new Date().toISOString() }])
      } catch { setWorkspaces([{ id: 'default', name: '默认工作区', createdAt: new Date().toISOString() }]) }
    }).catch(() => { setWorkspaces([{ id: 'default', name: '默认工作区', createdAt: new Date().toISOString() }]) })
    api.settingsGet('currentWorkspace').then((w: any) => { if (w) setCurrentWs(w) }).catch(() => {})
  }, [])

  const memStats = useMemo(() => {
    const short = memories.filter(m => ['short', 'user_pref', 'general'].includes(m.category)).length
    const mid = memories.filter(m => ['mid', 'project', 'config'].includes(m.category)).length
    const long = memories.filter(m => ['long', 'architecture'].includes(m.category)).length
    return { short, mid, long }
  }, [memories])

  const memRingPct = useMemo(() => {
    const total = memories.length; const max = Math.max(50, Math.ceil(total / 50) * 50)
    return Math.min(100, Math.round((total / max) * 100))
  }, [memories])

  const analyticsStats = useMemo(() => {
    const now = new Date()
    const today = allConvs.filter(c => new Date(c.updatedAt).toDateString() === now.toDateString()).length
    const week = allConvs.filter(c => now.getTime() - new Date(c.updatedAt).getTime() < 604800000).length
    const models: Record<string, number> = {}
    allConvs.forEach(c => { const m = c.model || 'openclaw'; models[m] = (models[m] || 0) + 1 })
    const topModel = Object.entries(models).sort((a, b) => b[1] - a[1])[0]
    return { total: allConvs.length, today, week, memories: memories.length, agents: agents.length, topModel: topModel?.[0] || '-' }
  }, [allConvs, memories, agents])

  const filteredConvs = useMemo(() => {
    let list = [...allConvs]
    if (search) { const q = search.toLowerCase(); list = list.filter(c => (c.title || '').toLowerCase().includes(q)) }
    if (timeFilter !== 'all') {
      const now = Date.now(); const ms = timeFilter === 'today' ? 86400000 : timeFilter === 'week' ? 604800000 : 2592000000
      list = list.filter(c => now - new Date(c.updatedAt || c.createdAt).getTime() < ms)
    }
    list.sort((a, b) => sortBy === 'newest' ? (b.updatedAt || '').localeCompare(a.updatedAt || '') : (a.updatedAt || '').localeCompare(b.updatedAt || ''))
    return list
  }, [allConvs, search, sortBy, timeFilter])

  const handleOpenConv = (c: any) => { setCurrentConvId(c.id); api.convMessages(c.id).then(setMessages).catch(() => {}); setPage('chat') }
  const doDeleteConv = () => { if (!deleteId) return; api.convDelete(deleteId).then(() => setAllConvs(allConvs.filter(c => c.id !== deleteId))).catch(console.error); setDeleteId(null) }
  const handleArchive = (id: string) => { api.settingsSet('archived_' + id, '1').catch(() => {}); setAllConvs(allConvs.filter(c => c.id !== id)) }
  const handleCreateWs = () => { if (!newWsName.trim()) return; const ws = { id: 'ws-' + Date.now(), name: newWsName, createdAt: new Date().toISOString() }; const updated = [...workspaces, ws]; setWorkspaces(updated); api.settingsSet('workspaces', JSON.stringify(updated)).catch(() => {}); setNewWsName(''); setShowCreateWs(false) }
  const handleSwitchWs = (id: string) => { setCurrentWs(id); api.settingsSet('currentWorkspace', id).catch(() => {}) }
  const handleDeleteWs = (id: string) => { if (id === 'default') return; const updated = workspaces.filter(w => w.id !== id); setWorkspaces(updated); api.settingsSet('workspaces', JSON.stringify(updated)).catch(() => {}); if (currentWs === id) { setCurrentWs('default'); api.settingsSet('currentWorkspace', 'default').catch(() => {}) } }

  return (
    <div className="page" id="page-dashboard">
      <div className="pg" style={{ maxWidth: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>仪表盘</h2>
        </div>
        <div className="gc-tabs" style={{ marginBottom: 16 }}>
          <button className={'gc-tab' + (tab === 'overview' ? ' active' : '')} onClick={() => setTab('overview')}>概览</button>
          <button className={'gc-tab' + (tab === 'analytics' ? ' active' : '')} onClick={() => setTab('analytics')}>分析</button>
          <button className={'gc-tab' + (tab === 'history' ? ' active' : '')} onClick={() => setTab('history')}>历史 ({analyticsStats.total})</button>
          <button className={'gc-tab' + (tab === 'workspace' ? ' active' : '')} onClick={() => setTab('workspace')}>工作区 ({workspaces.length})</button>
        </div>

        {/* ── 概览 ── */}
        {tab === 'overview' && (
          <>
            <div className="dash-grid">
              <div className="dash-card" onClick={() => setPage('chat')} style={{ cursor: 'pointer' }}>
                <div className="big-num">{data.convs}</div><div className="sub-label">对话</div>
              </div>
              <div className="dash-card" onClick={() => setPage('agents')} style={{ cursor: 'pointer' }}>
                <div className="big-num">{data.agents}</div><div className="sub-label">智能体</div>
              </div>
              <div className="dash-card">
                <div className="big-num">{data.models}</div><div className="sub-label">模型</div>
              </div>
              <div className="dash-card" onClick={() => setPage('skills')} style={{ cursor: 'pointer' }}>
                <div className="big-num">{data.skills}</div><div className="sub-label">技能</div>
              </div>
              <div className="dash-card full">
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ width: 80, height: 80, position: 'relative' }}>
                    <svg viewBox="0 0 36 36" width="80" height="80">
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--bg3)" strokeWidth="3" />
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray={`${memRingPct} ${100 - memRingPct}`} strokeDashoffset="25" strokeLinecap="round" />
                      <text x="18" y="20" textAnchor="middle" fontSize="8" fontWeight="600" fill="var(--text)">{data.memory}</text>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>记忆统计</div>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <div><span style={{ color: 'var(--accent)', fontWeight: 600 }}>{memStats.short}</span><br /><span style={{ fontSize: 11, color: 'var(--text3)' }}>短期</span></div>
                      <div><span style={{ color: 'var(--warning)', fontWeight: 600 }}>{memStats.mid}</span><br /><span style={{ fontSize: 11, color: 'var(--text3)' }}>中期</span></div>
                      <div><span style={{ color: 'var(--success)', fontWeight: 600 }}>{memStats.long}</span><br /><span style={{ fontSize: 11, color: 'var(--text3)' }}>长期</span></div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="dash-card full">
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>近期对话</div>
                {recentConvs.length === 0 && <div style={{ color: 'var(--text4)', fontSize: 12 }}>暂无对话</div>}
                {recentConvs.map((c: any) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--bg2)', cursor: 'pointer' }} onClick={() => handleOpenConv(c)}>
                    <span style={{ flex: 1, fontSize: 12.5 }}>{c.title || '新建对话'}</span>
                    <span style={{ fontSize: 11, color: 'var(--text4)' }}>{new Date(c.updatedAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                ))}
              </div>
              {cronJobs.length > 0 && (
                <div className="dash-card full">
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>定时任务</div>
                  {cronJobs.map((j: any) => (
                    <div key={j.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--bg2)' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', marginRight: 10 }}>{j.schedule}</span>
                      <span style={{ flex: 1, fontSize: 12.5 }}>{j.command || j.name}</span>
                      <span className={'badge ' + (j.enabled ? 'badge-green' : 'badge-yellow')}>{j.enabled ? '启用' : '暂停'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {gatewayRunning && <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text4)' }}>网关运行中</div>}
          </>
        )}

        {/* ── 分析 ── */}
        {tab === 'analytics' && (
          <>
            <div className="dash-grid" style={{ marginBottom: 20 }}>
              <div className="dash-card"><div className="big-num">{analyticsStats.total}</div><div className="sub-label">总对话数</div></div>
              <div className="dash-card"><div className="big-num">{analyticsStats.today}</div><div className="sub-label">今天</div></div>
              <div className="dash-card"><div className="big-num">{analyticsStats.week}</div><div className="sub-label">本周</div></div>
              <div className="dash-card"><div className="big-num">{analyticsStats.memories}</div><div className="sub-label">记忆数</div></div>
              <div className="dash-card"><div className="big-num">{analyticsStats.agents}</div><div className="sub-label">Agent 数</div></div>
              <div className="dash-card"><div className="big-num" style={{ fontSize: 18 }}>{analyticsStats.topModel}</div><div className="sub-label">最常使用</div></div>
            </div>
          </>
        )}

        {/* ── 历史 ── */}
        {tab === 'history' && (
          <>
            <div className="filter-bar" style={{ marginBottom: 12 }}>
              <input type="text" placeholder="搜索对话..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
              <select value={timeFilter} onChange={e => setTimeFilter(e.target.value)}>
                <option value="all">全部时间</option><option value="today">今天</option><option value="week">本周</option><option value="month">本月</option>
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="newest">最新</option><option value="oldest">最早</option>
              </select>
            </div>
            {filteredConvs.length === 0 && <div className="empty-state"><h3>无历史对话</h3><p>开始一个新对话吧</p></div>}
            {filteredConvs.map((c: any) => (
              <div key={c.id} className="card" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => handleOpenConv(c)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div className="card-title">{c.title || '新建对话'}</div>
                    <div className="card-sub">{c.model || 'default'} / {new Date(c.updatedAt || c.createdAt).toLocaleString('zh-CN')}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-sm btn-ghost" onClick={e => { e.stopPropagation(); handleArchive(c.id) }}>归档</button>
                    <button className="btn btn-sm btn-danger" onClick={e => { e.stopPropagation(); setDeleteId(c.id) }}>删除</button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── 工作区 ── */}
        {tab === 'workspace' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={() => setShowCreateWs(true)}>+ 新建工作区</button>
            </div>
            <div className="dash-grid">
              {workspaces.map(ws => (
                <div key={ws.id} className="card" style={{ border: currentWs === ws.id ? '2px solid var(--accent)' : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: currentWs === ws.id ? 'var(--accent)' : 'var(--bg3)', color: currentWs === ws.id ? '#fff' : 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>{ws.name[0]}</div>
                    <div style={{ flex: 1 }}>
                      <div className="card-title">{ws.name}</div>
                      <div className="card-sub">{ws.id === 'default' ? '默认工作区' : '自定义'}</div>
                    </div>
                    {currentWs === ws.id && <span className="badge badge-green">当前</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {currentWs !== ws.id && <button className="btn btn-sm btn-primary" onClick={() => handleSwitchWs(ws.id)}>切换</button>}
                    {ws.id !== 'default' && <button className="btn btn-sm btn-ghost" onClick={() => handleDeleteWs(ws.id)} style={{ color: 'var(--error)' }}>删除</button>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {deleteId && <ConfirmModal title="删除对话" message="确定删除此对话？删除后无法恢复。" onConfirm={doDeleteConv} onCancel={() => setDeleteId(null)} danger />}
        {showCreateWs && (
          <div className="modal-overlay" onClick={() => setShowCreateWs(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header"><h3>新建工作区</h3></div>
              <div className="modal-body">
                <div className="form-group"><label>工作区名称</label><input value={newWsName} onChange={e => setNewWsName(e.target.value)} placeholder="输入工作区名称..." onKeyDown={e => { if (e.key === 'Enter') handleCreateWs() }} /></div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowCreateWs(false)}>取消</button>
                <button className="btn btn-primary" onClick={handleCreateWs}>创建</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
