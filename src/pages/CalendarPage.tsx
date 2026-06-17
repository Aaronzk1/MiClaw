import { useEffect, useState } from 'react'
import { api } from '../lib/ipc'
import { toast } from '../components/Toast'
import { ConfirmModal } from '../components/ui'

export function CalendarPage() {
  const [events, setEvents] = useState<any[]>([])
  const [today, setToday] = useState<any[]>([])
  const [upcoming, setUpcoming] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', description: '', startTime: '', endTime: '', reminder: 10, recurring: 'none' })

  const load = async () => {
    setLoading(true)
    try {
      const [all, t, u] = await Promise.all([api.calendarList(), api.calendarToday(), api.calendarUpcoming()])
      setEvents(all || []); setToday(t || []); setUpcoming(u || [])
    } catch (e: any) { toast('加载日程失败', 'error') }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!form.title.trim() || !form.startTime) { toast('请填写标题和时间', 'info'); return }
    try {
      await api.calendarCreate(form)
      setForm({ title: '', description: '', startTime: '', endTime: '', reminder: 10, recurring: 'none' })
      setShowCreate(false)
      load()
      toast('事件已创建', 'success')
    } catch (e: any) { toast('创建失败: ' + e.message, 'error') }
  }

  const handleDelete = (id: string) => { setDeleteId(id) }
  const confirmDelete = async () => {
    if (!deleteId) return
    try {
      await api.calendarDelete(deleteId)
      load()
      toast('已删除', 'success')
    } catch (e: any) { toast('删除失败', 'error') }
    setDeleteId(null)
  }

  const formatTime = (t: string) => {
    try { return new Date(t).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return t }
  }

  return (
    <div className="page" id="page-calendar">
      <div className="pg" style={{ maxWidth: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>📅 日程规划</h2>
          <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? '✕ 关闭' : '+ 新建事件'}
          </button>
        </div>

        {/* 创建表单 */}
        {showCreate && (
          <div className="card" style={{ padding: 16, marginBottom: 16, border: '1px solid var(--accent)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>新建事件</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input placeholder="事件标题" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                style={{ gridColumn: '1 / -1', padding: '8px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)' }} />
              <input placeholder="描述（可选）" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                style={{ gridColumn: '1 / -1', padding: '8px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)' }} />
              <div>
                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>开始时间</label>
                <input type="datetime-local" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })}
                  style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>结束时间（可选）</label>
                <input type="datetime-local" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })}
                  style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>提醒</label>
                <select value={form.reminder} onChange={e => setForm({ ...form, reminder: Number(e.target.value) })}
                  style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)' }}>
                  <option value={0}>无提醒</option>
                  <option value={5}>5分钟前</option>
                  <option value={10}>10分钟前</option>
                  <option value={30}>30分钟前</option>
                  <option value={60}>1小时前</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>重复</label>
                <select value={form.recurring} onChange={e => setForm({ ...form, recurring: e.target.value })}
                  style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)' }}>
                  <option value="none">不重复</option>
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="monthly">每月</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleCreate}>创建</button>
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>取消</button>
            </div>
          </div>
        )}

        {/* 今日时间线 + 未来7天 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>📌 今日时间线</h3>
            {loading ? <p style={{ color: 'var(--text4)', fontSize: 12 }}>加载中...</p> :
              today.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text4)' }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>☀️</div>
                  <p style={{ fontSize: 13 }}>今天没有安排</p>
                  <p style={{ fontSize: 11, marginTop: 4 }}>点击"新建事件"添加日程</p>
                </div>
              ) : (
                <div style={{ position: 'relative', paddingLeft: 20 }}>
                  {/* 时间线竖线 */}
                  <div style={{ position: 'absolute', left: 6, top: 4, bottom: 4, width: 2, background: 'var(--border)' }}></div>
                  {today.sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()).map((e: any) => {
                    const now = new Date()
                    const eventTime = new Date(e.startTime)
                    const isPast = eventTime < now
                    const isCurrent = !isPast && (now.getTime() - eventTime.getTime()) < 3600000
                    return (
                      <div key={e.id} style={{ position: 'relative', marginBottom: 16, paddingLeft: 16 }}>
                        {/* 时间点 */}
                        <div style={{
                          position: 'absolute', left: -17, top: 4, width: 10, height: 10, borderRadius: '50%',
                          background: isCurrent ? 'var(--accent)' : isPast ? 'var(--bg3)' : 'var(--success)',
                          border: '2px solid var(--bg)', boxShadow: isCurrent ? '0 0 0 3px var(--accent-light)' : 'none'
                        }}></div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: isPast ? 'var(--text4)' : 'var(--text)' }}>{e.title}</div>
                        <div style={{ fontSize: 11, color: isCurrent ? 'var(--accent)' : 'var(--text3)', marginTop: 2 }}>
                          {formatTime(e.startTime)}
                          {isCurrent && <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--accent-light)', padding: '1px 6px', borderRadius: 4 }}>进行中</span>}
                          {isPast && <span style={{ marginLeft: 6, fontSize: 10 }}>✓ 已过</span>}
                        </div>
                        {e.description && <div style={{ fontSize: 11, color: 'var(--text4)', marginTop: 2 }}>{e.description}</div>}
                      </div>
                    )
                  })}
                </div>
              )
            }
          </div>
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>📅 未来 7 天</h3>
            {loading ? <p style={{ color: 'var(--text4)', fontSize: 12 }}>加载中...</p> :
              upcoming.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text4)' }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>📭</div>
                  <p style={{ fontSize: 13 }}>未来 7 天没有事件</p>
                </div>
              ) : upcoming.map(e => (
                <div key={e.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{e.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{formatTime(e.startTime)}</div>
                </div>
              ))
            }
          </div>
        </div>

        {/* 所有事件 */}
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>📋 所有事件 ({events.length})</h3>
          {loading ? <p style={{ color: 'var(--text4)', fontSize: 12 }}>加载中...</p> :
            events.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--text4)' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>📅</div>
                <p style={{ fontSize: 13 }}>暂无事件</p>
                <p style={{ fontSize: 11, marginTop: 4 }}>点击"新建事件"创建第一个</p>
              </div>
            ) : events.map((e, i) => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < events.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{e.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                    {formatTime(e.startTime)}
                    {e.recurring && e.recurring !== 'none' && <span style={{ marginLeft: 8, color: 'var(--accent)' }}>🔄 {e.recurring === 'daily' ? '每天' : e.recurring === 'weekly' ? '每周' : '每月'}</span>}
                  </div>
                </div>
                <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(e.id)} style={{ color: 'var(--error)' }}>删除</button>
              </div>
            ))
          }
        </div>
      </div>
      {deleteId && <ConfirmModal title="删除事件" message="确定删除此事件？" onConfirm={confirmDelete} onCancel={() => setDeleteId(null)} danger />}
    </div>
  )
}
