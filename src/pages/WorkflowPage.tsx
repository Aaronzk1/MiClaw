import { useEffect, useState } from 'react'
import { api } from '../lib/ipc'

export function WorkflowPage() {
  const [workflows, setWorkflows] = useState<any[]>([])
  const [presets, setPresets] = useState<any[]>([])
  const [running, setRunning] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<any>(null)
  const [runInput, setRunInput] = useState('')
  const [showRun, setShowRun] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  useEffect(() => {
    api.wfList?.().then(setWorkflows).catch(() => {})
    api.wfPresets?.().then(setPresets).catch(() => {})
  }, [])

  const handleRun = async (wfId: string) => {
    if (!runInput.trim()) return
    setRunning(wfId)
    setRunResult(null)
    const result = await api.wfExecute?.(wfId, runInput)
    setRunResult(result)
    setRunning(null)
  }

  const handleImportPreset = async (preset: any) => {
    await api.wfSave?.(preset)
    const list = await api.wfList?.()
    if (list) setWorkflows(list)
  }

  const handleDelete = async (id: string) => {
    await api.wfDelete?.(id)
    setWorkflows(workflows.filter(w => w.id !== id))
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    const wf = {
      id: 'wf-' + Date.now(), name: newName, description: newDesc,
      enabled: true, createdAt: new Date().toISOString(),
      nodes: [
        { id: 'trigger', type: 'trigger', config: {}, next: ['agent'] },
        { id: 'agent', type: 'agent', config: { agentId: 'default', systemPrompt: 'Process the input.' }, next: ['output'] },
        { id: 'output', type: 'output', config: { template: '{input}' }, next: [] },
      ],
    }
    await api.wfSave?.(wf)
    const list = await api.wfList?.()
    if (list) setWorkflows(list)
    setNewName(''); setNewDesc(''); setShowCreate(false)
  }

  return (
    <div className="page" id="page-workflow">
      <div className="pg" style={{ maxWidth: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{'工作流 (Workflow)'}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowCreate(true)}>+ 新建</button>
          </div>
        </div>

        {/* Presets */}
        {presets.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>预置模板</h4>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {presets.map(p => (
                <button key={p.id} className="btn btn-sm btn-secondary" onClick={() => handleImportPreset(p)}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Workflow list */}
        {workflows.length === 0 && (
          <div className="empty-state"><h3>无工作流</h3><p>创建多Agent协作的自动化流程</p></div>
        )}
        {workflows.map(wf => (
          <div key={wf.id} className="card" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div className="card-title">{wf.name}</div>
                <div className="card-sub">{wf.description || wf.id}</div>
              </div>
              <span className="badge badge-blue">{wf.nodes?.length || 0} nodes</span>
              {wf.runCount && <span style={{ fontSize: 10, color: 'var(--text4)' }}>run {wf.runCount}x</span>}
              <button className="btn btn-sm btn-primary" onClick={() => setShowRun(showRun === wf.id ? null : wf.id)}>Run</button>
              <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(wf.id)} style={{ color: 'var(--error)' }}>{'删除'}</button>
            </div>
            {/* Node pipeline visualization */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
              {(wf.nodes || []).map((n: any, i: number) => (
                <span key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="badge" style={{
                    background: n.type === 'trigger' ? 'var(--accent-light)' : n.type === 'agent' ? '#ecfdf5' : n.type === 'tool' ? '#fef3c7' : n.type === 'condition' ? '#fce7f3' : 'var(--bg3)',
                    color: n.type === 'trigger' ? 'var(--accent)' : n.type === 'agent' ? 'var(--success)' : n.type === 'tool' ? 'var(--warning)' : n.type === 'condition' ? '#ec4899' : 'var(--text3)',
                    fontSize: 10,
                  }}>
                    {n.type === 'trigger' ? '!' : n.type === 'agent' ? 'AI' : n.type === 'tool' ? 'T' : n.type === 'condition' ? '?' : 'O'} {n.config?.agentId || n.config?.toolName || n.id}
                  </span>
                  {i < wf.nodes.length - 1 && <span style={{ color: 'var(--text4)' }}>{'->'}</span>}
                </span>
              ))}
            </div>
            {/* Run panel */}
            {showRun === wf.id && (
              <div style={{ marginTop: 8, padding: 8, background: 'var(--bg2)', borderRadius: 8 }}>
                <textarea rows={2} value={runInput} onChange={e => setRunInput(e.target.value)}
                  placeholder="输入工作流触发内容..." style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: 8, fontSize: 12, fontFamily: 'var(--font)', resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-sm btn-primary" onClick={() => handleRun(wf.id)} disabled={running === wf.id}>
                    {running === wf.id ? '执行中...' : '执行'}
                  </button>
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
                    <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{runResult.output}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Create modal */}
        {showCreate && (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header"><h3>新建工作流</h3></div>
              <div className="modal-body">
                <div className="form-group"><label>名称</label><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="工作流名称..." /></div>
                <div className="form-group"><label>描述</label><input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="描述..." /></div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>取消</button>
                <button className="btn btn-primary" onClick={handleCreate}>创建</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}