import { useEffect, useState, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'

export function DashboardPage() {
  const { setPage } = useAppStore()
  const [data, setData] = useState({ convs: 0, agents: 0, skills: 0, models: 0, memory: 0, cron: 0 })
  const [recentConvs, setRecentConvs] = useState<any[]>([])
  const [cronJobs, setCronJobs] = useState<any[]>([])
  const [memories, setMemories] = useState<any[]>([])
  const [gatewayRunning, setGatewayRunning] = useState(false)

  useEffect(() => {
    Promise.all([api.convList(), api.agentsList(), api.skillsList(), api.modelsList(), api.memoryList(), api.cronList()]).then(([c, a, s, m, mem, cr]) => {
      setData({ convs: c.length, agents: a.length, skills: s.length, models: m.length, memory: mem.length, cron: cr.length })
      setRecentConvs(c.slice(0, 4))
      setCronJobs(cr.slice(0, 3))
      setMemories(mem)
    }).catch(console.error)
    api.gatewayStatus().then((s: any) => setGatewayRunning(s.running)).catch(console.error)
  }, [])

  const memStats = useMemo(() => {
    const short = memories.filter(m => m.category === 'short' || m.category === 'user_pref' || m.category === 'general').length
    const mid = memories.filter(m => m.category === 'mid' || m.category === 'project' || m.category === 'config').length
    const long = memories.filter(m => m.category === 'long' || m.category === 'architecture').length
    const total = memories.length || 1
    return { short, mid, long, total, pctShort: Math.round(short / total * 100), pctMid: Math.round(mid / total * 100), pctLong: Math.round(long / total * 100) }
  }, [memories])

  const memRingPct = useMemo(() => {
    const total = memories.length
    const max = 100
    return Math.min(100, Math.round((total / max) * 100))
  }, [memories])

  return (
    <div className="page" id="page-dashboard">
      <div className="pg">
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>仪表盘</h2>
        <div className="dash-grid">
          <div className="dash-card" onClick={() => setPage('chat')} style={{ cursor: 'pointer' }}>
            <div className="icon-box" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>&#128172;</div>
            <div className="big-num">{data.convs}</div>
            <div className="sub-label">对话</div>
          </div>
          <div className="dash-card" onClick={() => setPage('agents')} style={{ cursor: 'pointer' }}>
            <div className="icon-box" style={{ background: '#fce7f3', color: '#ec4899' }}>&#129302;</div>
            <div className="big-num">{data.agents}</div>
            <div className="sub-label">Agents</div>
          </div>
          <div className="dash-card" onClick={() => setPage('models')} style={{ cursor: 'pointer' }}>
            <div className="icon-box" style={{ background: '#f0f9ff', color: '#0ea5e9' }}>&#9881;</div>
            <div className="big-num">{data.models}</div>
            <div className="sub-label">模型</div>
          </div>
          <div className="dash-card" onClick={() => setPage('skills')} style={{ cursor: 'pointer' }}>
            <div className="icon-box" style={{ background: '#ecfdf5', color: 'var(--success)' }}>&#127919;</div>
            <div className="big-num">{data.skills}</div>
            <div className="sub-label">技能</div>
          </div>
          <div className="dash-card full">
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ width: 80, height: 80, position: 'relative' }}>
                <svg viewBox="0 0 36 36" width="80" height="80">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--bg3)" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray={`${memRingPct} ${100 - memRingPct}`} strokeDashoffset="25" strokeLinecap="round" style={{ transition: 'stroke-dasharray .5s ease' }} />
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
                <div className="ctx-bar" style={{ marginTop: 8 }}>
                  <div className="ctx-seg" style={{ width: memStats.pctShort + '%', background: 'var(--accent)' }}></div>
                  <div className="ctx-seg" style={{ width: memStats.pctMid + '%', background: 'var(--warning)' }}></div>
                  <div className="ctx-seg" style={{ width: memStats.pctLong + '%', background: 'var(--success)' }}></div>
                </div>
              </div>
            </div>
          </div>
          <div className="dash-card full">
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>近期对话</div>
            {recentConvs.length === 0 && <div style={{ color: 'var(--text4)', fontSize: 12 }}>暂无对话</div>}
            {recentConvs.map((c: any) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--bg2)', cursor: 'pointer' }} onClick={() => { setPage('chat') }}>
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
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', marginRight: 10 }}>{j.schedule || j.cron}</span>
                  <span style={{ flex: 1, fontSize: 12.5 }}>{j.command || j.name}</span>
                  <span className={'badge ' + (j.enabled ? 'badge-green' : 'badge-yellow')}>{j.enabled ? '启用' : '暂停'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
