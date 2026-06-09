import { useEffect, useState } from 'react'
import { api } from '../lib/ipc'

function getNextRun(cron: string): string {
  try {
    const parts = cron.split(' ')
    if (parts.length < 2) return '-'
    const now = new Date()
    const h = parts[1] === '*' ? now.getHours() : parseInt(parts[1])
    const m = parts[0] === '*' ? now.getMinutes() : parseInt(parts[0])
    const next = new Date(now)
    next.setHours(h, m, 0, 0)
    if (next <= now) next.setDate(next.getDate() + 1)
    return next.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch { return '-' }
}

export function CronPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSchedule, setNewSchedule] = useState('')
  const [newCommand, setNewCommand] = useState('')

  useEffect(() => { api.cronList().then(setJobs).catch(console.error) }, [])

  const handleToggle = (id: string, enabled: boolean) => {
    const job = jobs.find(j => j.id === id)
    if (job) { job.enabled = enabled; api.cronSave(job); setJobs([...jobs]) }
  }

  const handleDelete = (id: string) => {
    api.cronDelete(id).then(() => setJobs(jobs.filter(j => j.id !== id)))
  }

  const handleAdd = () => {
    if (!newName.trim() || !newSchedule.trim()) return
    const job = { id: 'cron-' + Date.now(), name: newName, schedule: newSchedule, command: newCommand, enabled: true }
    api.cronSave(job).then(() => { setJobs([...jobs, job]); setNewName(''); setNewSchedule(''); setNewCommand(''); setShowAdd(false) })
  }

  return (
    <div className="page" id="page-cron">
      <div className="pg">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>定时任务</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ 新建任务</button>
        </div>
        {jobs.length === 0 && <div className="empty-state"><h3>无定时任务</h3><p>创建定时任务自动化您的工作流</p></div>}
        {jobs.map(j => (
          <div key={j.id} className="card" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: 'var(--accent)', minWidth: 100 }}>{j.schedule || j.cron}</span>
              <div style={{ flex: 1 }}>
                <div className="card-title">{j.name || j.command}</div>
                <div className="card-sub" style={{ fontFamily: 'var(--mono)' }}>{j.command}</div>
              </div>
              <span className={'badge ' + (j.enabled ? 'badge-green' : 'badge-yellow')}>{j.enabled ? '\u542f\u7528' : '\u6682\u505c'}</span>
              {j.enabled && j.schedule && <span style={{ fontSize: 10, color: 'var(--text4)', fontFamily: 'var(--mono)' }}>{'\u4e0b\u6b21'}: {getNextRun(j.schedule)}</span>}
              <div className={'toggle' + (j.enabled ? ' on' : '')} onClick={() => handleToggle(j.id, !j.enabled)}></div>
              <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(j.id)}>&#10005;</button>
            </div>
          </div>
        ))}
        {showAdd && (
          <div className="modal-overlay" onClick={() => setShowAdd(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header"><h3>新建定时任务</h3></div>
              <div className="modal-body">
                <div className="form-group"><label>名称</label><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="任务名称..." /></div>
                <div className="form-group"><label>Cron 表达式</label><input value={newSchedule} onChange={e => setNewSchedule(e.target.value)} placeholder="0 */6 * * *" style={{ fontFamily: 'var(--mono)' }} /></div>
                <div className="form-group"><label>命令</label><input value={newCommand} onChange={e => setNewCommand(e.target.value)} placeholder="hermes run ..." /></div>
              </div>
              <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowAdd(false)}>取消</button><button className="btn btn-primary" onClick={handleAdd}>创建</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
