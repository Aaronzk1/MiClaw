import { useEffect, useState } from 'react'
import { api } from '../lib/ipc'
import { ConfirmModal } from '../components/ui'

function getNextRun(cron: string): string {
  try {
    const parts = cron.trim().split(/\s+/)
    if (parts.length < 2) return '-'
    const now = new Date()
    const isWildM = parts[0] === '*'
    const isWildH = parts[1] === '*'
    const isWildDom = parts[2] === '*' || !parts[2]
    const isWildMon = parts[3] === '*' || !parts[3]
    const dow = parts[4] === '*' || !parts[4] ? -1 : parseInt(parts[4])
    const next = new Date(now); next.setSeconds(0, 0)
    if (isWildM && isWildH && isWildDom && isWildMon && dow < 0) {
      next.setMinutes(next.getMinutes() + 1)
      return next.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }
    const m = isWildM ? null : parseInt(parts[0])
    const h = isWildH ? null : parseInt(parts[1])
    const dom = isWildDom ? null : parseInt(parts[2])
    const mon = isWildMon ? null : parseInt(parts[3]) - 1
    const base = new Date(now); base.setSeconds(0, 0)
    for (let d = 0; d < 400; d++) {
      const c = new Date(base); c.setDate(c.getDate() + d)
      if (mon !== null) c.setMonth(mon)
      if (dom !== null) c.setDate(dom)
      if (m !== null) c.setMinutes(m, 0, 0); else c.setMinutes(0, 0, 0)
      if (h !== null) c.setHours(h); else c.setHours(0)
      if (dow >= 0 && c.getDay() !== dow) continue
      if (c <= now) continue
      return c.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }
    return '-'
  } catch { return '-' }
}

export function AutomationPage() {
  const [tab, setTab] = useState<'workflow' | 'cron'>('workflow')
  const [workflows, setWorkflows] = useState<any[]>([])
  const [presets, setPresets] = useState<any[]>([])
  const [running, setRunning] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<any>(null)
  const [runInput, setRunInput] = useState('')
  const [showRun, setShowRun] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [jobs, setJobs] = useState<any[]>([])
  const [showAddCron, setShowAddCron] = useState(false)
  const [cronName, setCronName] = useState('')
  const [cronSchedule, setCronSchedule] = useState('')
  const [cronCommand, setCronCommand] = useState('')
  const [deleteWfId, setDeleteWfId] = useState<string | null>(null)
  const [deleteCronId, setDeleteCronId] = useState<string | null>(null)

  useEffect(() => {
    api.wfList?.().then(setWorkflows).catch(() => {})
    api.wfPresets?.().then(setPresets).catch(() => {})
    api.cronList().then(setJobs).catch(() => {})
  }, [])

  const handleRunWf = async (wfId: string) => {
    if (!runInput.trim()) return
    setRunning(wfId); setRunResult(null)
    try {
      const result = await api.wfExecute?.(wfId, runInput)
      setRunResult(result); setRunning(null)
    } catch (e) { setRunning(null); setRunResult({ success: false, error: (e as Error).message }) }
  }
  const handleImportPreset = async (preset: any) => { try { await api.wfSave?.(preset); setWorkflows(await api.wfList?.() || []) } catch {} }
  const handleCreateWf = async () => {
    if (!newName.trim()) return
    try {
      const wf = { id: 'wf-' + Date.now(), name: newName, description: newDesc, enabled: true, createdAt: new Date().toISOString(),
        nodes: [{ id: 'trigger', type: 'trigger', config: {}, next: ['agent'] }, { id: 'agent', type: 'agent', config: { agentId: 'default', systemPrompt: 'Process the input.' }, next: ['output'] }, { id: 'output', type: 'output', config: { template: '{input}' }, next: [] }] }
      await api.wfSave?.(wf); setWorkflows(await api.wfList?.() || []); setNewName(''); setNewDesc(''); setShowCreate(false)
    } catch {}
  }
  const doDeleteWf = () => { if (!deleteWfId) return; api.wfDelete?.(deleteWfId).catch(() => {}); setWorkflows(workflows.filter(w => w.id !== deleteWfId)); setDeleteWfId(null) }

  const handleToggleCron = (id: string, enabled: boolean) => {
    setJobs(prev => prev.map(j => { if (j.id !== id) return j; const updated = { ...j, enabled }; api.cronSave(updated).catch(console.error); return updated }))
  }
  const handleAddCron = () => {
    if (!cronName.trim() || !cronSchedule.trim()) return
    const job = { id: 'cron-' + Date.now(), name: cronName, schedule: cronSchedule, command: cronCommand, enabled: true }
    api.cronSave(job).then(() => { setJobs([...jobs, job]); setCronName(''); setCronSchedule(''); setCronCommand(''); setShowAddCron(false) }).catch(console.error)
  }
  const doDeleteCron = () => { if (!deleteCronId) return; api.cronDelete(deleteCronId).then(() => setJobs(jobs.filter(j => j.id !== deleteCronId))).catch(console.error); setDeleteCronId(null) }

  return (
    <div className="page" id="page-automation">
      <div className="pg" style={{ maxWidth: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>自动化</h2>
          {tab === 'workflow' && <button className="btn btn-secondary btn-sm" onClick={() => setShowCreate(true)}>+ 新建工作流</button>}
          {tab === 'cron' && <button className="btn btn-primary btn-sm" onClick={() => setShowAddCron(true)}>+ 新建任务</button>}
        </div>
        <div className="gc-tabs" style={{ marginBottom: 16 }}>
          <button className={'gc-tab' + (tab === 'workflow' ? ' active' : '')} onClick={() => setTab('workflow')}>工作流 ({workflows.length})</button>
          <button className={'gc-tab' + (tab === 'cron' ? ' active' : '')} onClick={() => setTab('cron')}>定时任务 ({jobs.length})</button>
        </div>

        {/* ── 工作流 ── */}
        {tab === 'workflow' && (
          <>
            {presets.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>预置模板</h4>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {presets.map(p => <button key={p.id} className="btn btn-sm btn-secondary" onClick={() => handleImportPreset(p)}>{p.name}</button>)}
                </div>
              </div>
            )}
            {workflows.length === 0 && <div className="empty-state"><h3>无工作流</h3><p>创建多Agent协作的自动化流程</p></div>}
            {workflows.map(wf => (
              <div key={wf.id} className="card" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}><div className="card-title">{wf.name}</div><div className="card-sub">{wf.description || wf.id}</div></div>
                  <span className="badge badge-blue">{wf.nodes?.length || 0} nodes</span>
                  <button className="btn btn-sm btn-primary" onClick={() => setShowRun(showRun === wf.id ? null : wf.id)}>Run</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setDeleteWfId(wf.id)} style={{ color: 'var(--error)' }}>{'删除'}</button>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                  {(wf.nodes || []).map((n: any, i: number) => (
                    <span key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="badge" style={{ background: n.type === 'trigger' ? 'var(--accent-light)' : n.type === 'agent' ? '#ecfdf5' : n.type === 'tool' ? '#fef3c7' : 'var(--bg3)', color: n.type === 'trigger' ? 'var(--accent)' : n.type === 'agent' ? 'var(--success)' : n.type === 'tool' ? 'var(--warning)' : 'var(--text3)', fontSize: 10 }}>
                        {n.type === 'trigger' ? '!' : n.type === 'agent' ? 'AI' : n.type === 'tool' ? 'T' : 'O'} {n.config?.agentId || n.config?.toolName || n.id}
                      </span>
                      {i < wf.nodes.length - 1 && <span style={{ color: 'var(--text4)' }}>{'->'}</span>}
                    </span>
                  ))}
                </div>
                {showRun === wf.id && (
                  <div style={{ marginTop: 8, padding: 8, background: 'var(--bg2)', borderRadius: 8 }}>
                    <textarea rows={2} value={runInput} onChange={e => setRunInput(e.target.value)} placeholder="输入工作流触发内容..." style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: 8, fontSize: 12, resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => handleRunWf(wf.id)} disabled={running === wf.id}>{running === wf.id ? '执行中...' : '执行'}</button>
                    </div>
                    {runResult && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{runResult.success ? '执行成功' : '执行失败'}</div>
                        {runResult.steps?.map((s: any, i: number) => (
                          <div key={i} style={{ fontSize: 11, padding: '4px 0', borderTop: '1px solid var(--border)' }}>
                            <span className="badge" style={{ fontSize: 9, marginRight: 4 }}>{s.type}</span>
                            <span style={{ color: 'var(--text2)' }}>{s.output?.slice(0, 100)}</span>
                            <span style={{ fontSize: 9, color: 'var(--text4)', float: 'right' }}>{s.duration}ms</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* ── 定时任务 ── */}
        {tab === 'cron' && (
          <>
            {jobs.length === 0 && <div className="empty-state"><h3>无定时任务</h3><p>创建定时任务自动化您的工作流</p></div>}
            {jobs.map(j => (
              <div key={j.id} className="card" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: 'var(--accent)', minWidth: 100 }}>{j.schedule || j.cron}</span>
                  <div style={{ flex: 1 }}><div className="card-title">{j.name || j.command}</div><div className="card-sub" style={{ fontFamily: 'var(--mono)' }}>{j.command}</div></div>
                  <span className={'badge ' + (j.enabled ? 'badge-green' : 'badge-yellow')}>{j.enabled ? '启用' : '暂停'}</span>
                  {j.enabled && j.schedule && <span style={{ fontSize: 10, color: 'var(--text4)', fontFamily: 'var(--mono)' }}>下次: {getNextRun(j.schedule)}</span>}
                  <button role="switch" aria-checked={j.enabled} className={'toggle' + (j.enabled ? ' on' : '')} onClick={() => handleToggleCron(j.id, !j.enabled)}></button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setDeleteCronId(j.id)}>&#10005;</button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Modals */}
        {showCreate && (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header"><h3>新建工作流</h3></div>
              <div className="modal-body">
                <div className="form-group"><label>名称</label><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="工作流名称..." /></div>
                <div className="form-group"><label>描述</label><input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="描述..." /></div>
              </div>
              <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowCreate(false)}>取消</button><button className="btn btn-primary" onClick={handleCreateWf}>创建</button></div>
            </div>
          </div>
        )}
        {showAddCron && (
          <div className="modal-overlay" onClick={() => setShowAddCron(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header"><h3>新建定时任务</h3></div>
              <div className="modal-body">
                <div className="form-group"><label>名称</label><input value={cronName} onChange={e => setCronName(e.target.value)} placeholder="任务名称..." /></div>
                <div className="form-group"><label>Cron 表达式</label><input value={cronSchedule} onChange={e => setCronSchedule(e.target.value)} placeholder="0 */6 * * *" style={{ fontFamily: 'var(--mono)' }} /></div>
                <div className="form-group"><label>命令</label><input value={cronCommand} onChange={e => setCronCommand(e.target.value)} placeholder="openclaw run ..." /></div>
              </div>
              <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowAddCron(false)}>取消</button><button className="btn btn-primary" onClick={handleAddCron}>创建</button></div>
            </div>
          </div>
        )}
        {deleteWfId && <ConfirmModal title="删除工作流" message="确定删除此工作流？" onConfirm={doDeleteWf} onCancel={() => setDeleteWfId(null)} danger />}
        {deleteCronId && <ConfirmModal title="删除定时任务" message="确定删除此定时任务？" onConfirm={doDeleteCron} onCancel={() => setDeleteCronId(null)} danger />}
      </div>
    </div>
  )
}
