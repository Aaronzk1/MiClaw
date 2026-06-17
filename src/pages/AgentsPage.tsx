import { useEffect, useState, useMemo } from 'react'
import { api } from '../lib/ipc'
import { useAppStore } from '../stores/appStore'
import { ConfirmModal } from '../components/ui'

export function AgentsPage() {
  const agents = useAppStore(s => s.agents)
  const setAgents = useAppStore(s => s.setAgents)
  const models = useAppStore(s => s.models)
  const setModels = useAppStore(s => s.setModels)
  const config = useAppStore(s => s.config)
  const [mcpServers, setMcpServers] = useState<any[]>([])
  const [availableSkills, setAvailableSkills] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editAgent, setEditAgent] = useState<any>(null)
  const [name, setName] = useState('')
  const [model, setModel] = useState('')
  const [identity, setIdentity] = useState('')
  const [expertise, setExpertise] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#4f46e5')
  const [skills, setSkills] = useState<string[]>([])
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(4096)
  const [mcpServerIds, setMcpServerIds] = useState<string[]>([])
  const [agentCategory, setAgentCategory] = useState('自定义')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 12
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [viewAgent, setViewAgent] = useState<any>(null)

  const currentModelMaxTokens = useMemo(() => {
    const modelId = config?.ai?.model || 'openclaw'
    const m = models.find((x: any) => x.id === modelId)
    return m?.maxTokens || 16384
  }, [models, config?.ai?.model])

  useEffect(() => {
    if (!agents.length) api.agentsList().then(setAgents).catch(console.error)
    if (!models.length) api.modelsList().then(setModels).catch(console.error)
    api.mcpList().then(setMcpServers).catch(() => {})
    api.skillsList().then(setAvailableSkills).catch(() => {})
  }, [])

  const PREDEFINED_CATEGORIES = ['默认', '金融', '技术', '内容', '职场', '生活', '学习', '专业', '自定义']

  const agentCategories = useMemo(() => {
    const cats: { id: string; label: string; count: number }[] = [{ id: 'all', label: '全部', count: agents.length }]
    const catCount: Record<string, number> = {}
    for (const a of agents) {
      const c = (a as any).category || '自定义'
      catCount[c] = (catCount[c] || 0) + 1
    }
    for (const c of PREDEFINED_CATEGORIES) {
      cats.push({ id: c, label: c, count: catCount[c] || 0 })
    }
    return cats
  }, [agents])

  const filtered = useMemo(() => {
    let list = agents
    if (category !== 'all') {
      if (category === '自定义') list = list.filter(a => !(a as any).category || (a as any).category === '自定义')
      else list = list.filter(a => (a as any).category === category)
    }
    if (search) { const q = search.toLowerCase(); list = list.filter(a => (a.name || '').toLowerCase().includes(q)) }
    return list
  }, [agents, search, category])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const openCreate = () => {
    setEditAgent(null); setName(''); setModel(''); setIdentity(''); setExpertise(''); setDescription('')
    setColor('#4f46e5'); setSkills([]); setTemperature(0.7); setMaxTokens(currentModelMaxTokens); setMcpServerIds([])
    setAgentCategory('自定义'); setShowModal(true)
  }

  const openEdit = (a: any) => {
    setEditAgent(a); setName(a.name || ''); setModel(a.model || ''); setIdentity(a.identity || '')
    setExpertise(a.expertise || ''); setDescription(a.description || ''); setColor(a.color || '#4f46e5')
    setSkills(a.skills || []); setTemperature(a.temperature ?? 0.7); setMaxTokens(a.maxTokens ?? 4096)
    setMcpServerIds(a.mcpServers || []); setAgentCategory(a.category || '自定义'); setShowModal(true)
  }

  const isBuiltIn = (id: string) => !id.startsWith('ag-')
  const builtInSkillIds = editAgent && isBuiltIn(editAgent.id) ? (editAgent.skills || []) : []

  const handleSave = () => {
    if (!name.trim()) return
    const agent = {
      ...(editAgent || {}),
      id: editAgent?.id || 'ag-' + Date.now(),
      name, model, identity, expertise, description, color, enabled: true,
      skills, temperature, maxTokens, mcpServers: mcpServerIds, category: agentCategory,
    }
    api.agentsSave(agent).then(() => {
      if (editAgent) setAgents(agents.map(a => a.id === agent.id ? agent : a))
      else setAgents([...agents, agent])
      setShowModal(false)
    }).catch(console.error)
  }

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id)
  }

  const doDelete = () => {
    if (!deleteConfirmId) return
    api.agentsDelete(deleteConfirmId).then(() => setAgents(agents.filter(a => a.id !== deleteConfirmId))).catch(console.error)
    setDeleteConfirmId(null)
  }

  const toggleSkill = (sid: string) => {
    if (editAgent && isBuiltIn(editAgent.id) && builtInSkillIds.includes(sid)) return
    setSkills(prev => prev.includes(sid) ? prev.filter(s => s !== sid) : [...prev, sid])
  }

  const toggleMcp = (sid: string) => {
    setMcpServerIds(prev => prev.includes(sid) ? prev.filter(s => s !== sid) : [...prev, sid])
  }

  const colorPresets = ['#4f46e5', '#ec4899', '#16a34a', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#a855f7']

  return (
    <div className="page" id="page-agents">
      <div className="pg" style={{ maxWidth: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>智能体管理</h2>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>+ 新建智能体</button>
        </div>

        <div className="filter-bar">
          <input type="text" placeholder="搜索智能体..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} style={{ flex: 1 }} />
          <span className="badge badge-blue">{filtered.length} 个智能体</span>
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          {agentCategories.map(cat => (
            <button key={cat.id} onClick={() => { setCategory(cat.id); setPage(1) }}
              style={{ padding: '3px 10px', fontSize: 11, borderRadius: 12, border: '1px solid ' + (category === cat.id ? 'var(--accent)' : 'var(--border)'), background: category === cat.id ? 'var(--accent)' : 'var(--bg)', color: category === cat.id ? '#fff' : 'var(--text2)', cursor: 'pointer', fontWeight: category === cat.id ? 600 : 400 }}>
              {cat.label} {cat.count}
            </button>
          ))}
        </div>
        <div className="dash-grid">
          {paged.map(a => (
            <div key={a.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: a.color || 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 }}>{(a.name || 'A')[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="card-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>{a.name}{isBuiltIn(a.id) && <span style={{ fontSize: 9, color: 'var(--text4)', background: 'var(--bg3)', padding: '1px 5px', borderRadius: 4 }}>内置</span>}</div>
                    <div className="card-sub">{a.description || '自定义智能体'}</div>
                  </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5, marginBottom: 10, height: 36, overflow: 'hidden' }}>{a.identity ? `${a.identity} · ${a.expertise || ''}`.slice(0, 60) : a.description || '自定义智能体'}</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10, minHeight: 22 }}>
                {a.skills?.map((s: string) => {
                  const sk = availableSkills.find(x => x.id === s)
                  return <span key={s} className="badge badge-blue">{sk?.label || s}</span>
                })}
                {a.mcpServers?.map((sid: string) => {
                  const srv = mcpServers.find((x: any) => x.id === sid)
                  return <span key={sid} className="badge badge-purple">{srv?.name || sid}</span>
                })}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 'auto' }}>
                {isBuiltIn(a.id) ? (
                  <button className="btn btn-sm btn-secondary" onClick={() => setViewAgent(a)} style={{ flex: 1, justifyContent: 'center' }}>查看能力</button>
                ) : (
                  <button className="btn btn-sm btn-secondary" onClick={() => openEdit(a)} style={{ flex: 1, justifyContent: 'center' }}>编辑</button>
                )}
                {!isBuiltIn(a.id) && <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(a.id)}>{'✕'}</button>}
              </div>
            </div>
          ))}
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <button className="btn btn-sm btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
            <span style={{ fontSize: 13, color: 'var(--text3)', lineHeight: '28px' }}>{page} / {totalPages}</span>
            <button className="btn btn-sm btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
          </div>
        )}

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 520, maxHeight: '85vh', overflow: 'auto' }}>
              <div className="modal-header"><h3>{editAgent ? '编辑智能体' : '新建智能体'}</h3></div>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group"><label>名称</label><input value={name} onChange={e => setName(e.target.value)} placeholder="智能体名称..." disabled={editAgent && isBuiltIn(editAgent.id)} /></div>
                  <div className="form-group"><label>模型</label><input value={model} onChange={e => setModel(e.target.value)} placeholder="openclaw" /></div>
                </div>
                <div className="form-group"><label>描述</label><input value={description} onChange={e => setDescription(e.target.value)} placeholder="简短描述 Agent 的用途..." disabled={editAgent && isBuiltIn(editAgent.id)} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group"><label>分类</label>
                    <select value={agentCategory} onChange={e => setAgentCategory(e.target.value)} style={{ width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }} disabled={editAgent && isBuiltIn(editAgent.id)}>
                      {['默认', '金融', '技术', '内容', '职场', '生活', '学习', '专业', '自定义'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label>颜色</label><div style={{ display: 'flex', gap: 6, marginTop: 6 }}>{colorPresets.map(c => <div key={c} onClick={() => { if (!editAgent || !isBuiltIn(editAgent.id)) setColor(c) }} style={{ width: 28, height: 28, borderRadius: 6, background: c, cursor: editAgent && isBuiltIn(editAgent.id) ? 'default' : 'pointer', border: color === c ? '2px solid var(--text)' : '2px solid transparent', opacity: editAgent && isBuiltIn(editAgent.id) && color !== c ? 0.4 : 1 }}></div>)}</div></div>
                </div>
                <div className="form-group">
                  <label>能力标签 (Skills)</label>
                  {editAgent && isBuiltIn(editAgent.id) && <p style={{ fontSize: 11, color: 'var(--text4)', margin: '0 0 6px' }}>内置技能已锁定，不可移除。可额外添加新技能。</p>}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {availableSkills.map(s => {
                      const locked = editAgent && isBuiltIn(editAgent.id) && builtInSkillIds.includes(s.id)
                      return (
                        <span key={s.id} onClick={() => toggleSkill(s.id)} title={locked ? '内置技能，不可移除' : s.desc}
                          style={{ padding: '4px 10px', border: skills.includes(s.id) ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: 12, fontSize: 12, cursor: locked ? 'default' : 'pointer', background: locked ? 'var(--bg3)' : skills.includes(s.id) ? 'var(--accent-light)' : 'transparent', color: locked ? 'var(--text3)' : skills.includes(s.id) ? 'var(--accent)' : 'var(--text2)', transition: 'all 0.15s', opacity: locked ? 0.7 : 1 }}>
                          {locked && '🔒 '}{s.label}
                        </span>
                      )
                    })}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Temperature ({temperature})</label>
                    <input type="range" min="0" max="2" step="0.1" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} style={{ width: '100%' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text4)' }}><span>精确</span><span>创意</span></div>
                  </div>
                  <div className="form-group">
                    <label>Max Tokens</label>
                    <input type="number" step="1024" min="1024" max="1048576" value={maxTokens} onChange={e => setMaxTokens(Math.min(1048576, Math.max(1024, parseInt(e.target.value) || currentModelMaxTokens)))} />
                    <button className="btn btn-sm btn-ghost" onClick={() => setMaxTokens(currentModelMaxTokens)} style={{ fontSize: 10, marginTop: 4 }}>用模型最大值 ({(currentModelMaxTokens / 1000).toFixed(0)}K)</button>
                  </div>
                </div>
                {mcpServers.length > 0 && (
                  <div className="form-group">
                    <label>MCP 服务器</label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {mcpServers.map((s: any) => (
                        <span key={s.id} onClick={() => toggleMcp(s.id)}
                          style={{ padding: '4px 10px', border: mcpServerIds.includes(s.id) ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: 12, fontSize: 12, cursor: 'pointer', background: mcpServerIds.includes(s.id) ? 'var(--accent-light)' : 'transparent', color: mcpServerIds.includes(s.id) ? 'var(--accent)' : 'var(--text2)' }}>
                          {s.name}
                        </span>
                      ))}
                    </div>
                    <p style={{ fontSize: 10, color: 'var(--text4)', margin: '4px 0 0' }}>绑定后 Agent 可调用该 MCP 服务器的工具</p>
                  </div>
                )}
                <div className="form-group"><label>身份 (Identity)</label><input value={identity} onChange={e => setIdentity(e.target.value)} placeholder="例：资深股票分析师" disabled={editAgent && isBuiltIn(editAgent.id)} /></div>
                <div className="form-group"><label>专业领域 (Expertise)</label><textarea rows={3} value={expertise} onChange={e => setExpertise(e.target.value)} placeholder="例：A股/港股/美股分析，基本面/技术面/资金面..." disabled={editAgent && isBuiltIn(editAgent.id)} /></div>
              </div>
              <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowModal(false)}>取消</button><button className="btn btn-primary" onClick={handleSave}>保存</button></div>
            </div>
          </div>
        )}
        {deleteConfirmId && <ConfirmModal title="删除 Agent" message="确定删除此 Agent？删除后无法恢复。" onConfirm={doDelete} onCancel={() => setDeleteConfirmId(null)} danger />}
        {viewAgent && (
          <div className="modal-overlay" onClick={() => setViewAgent(null)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 620, maxHeight: '85vh', overflow: 'auto' }}>
              {/* Hero */}
              <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: viewAgent.color || 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, flexShrink: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>{(viewAgent.name || 'A')[0]}</div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: 18 }}>{viewAgent.name}</h2>
                  <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>{viewAgent.description}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <span className="badge badge-blue">{viewAgent.category || '自定义'}</span>
                    <span className="badge" style={{ background: 'var(--bg3)', color: 'var(--text3)' }}>{viewAgent.model || 'openclaw'}</span>
                  </div>
                </div>
              </div>

              <div className="modal-body" style={{ padding: '16px 24px 24px' }}>
                {/* 身份 */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>身份</div>
                  <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{viewAgent.identity || '—'}</div>
                </div>

                {/* 专业领域 */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>专业能力</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 2, whiteSpace: 'pre-wrap', background: 'var(--bg2)', padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)', fontFamily: 'var(--font)' }}>
                    {(viewAgent.expertise || '—').replace(/(\d+\))/g, '\n$1').replace(/；/g, '；\n').trim()}
                  </div>
                </div>

                {/* 技能详情 */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>技能清单</div>
                  {/* 基础技能 */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>基础技能（所有 Agent 自动拥有）</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['搜索', '读文件', '写文件', '读网页', '保存记忆'].map(s => (
                        <span key={s} style={{ padding: '3px 8px', background: 'var(--bg3)', borderRadius: 10, fontSize: 10, color: 'var(--text3)' }}>{s}</span>
                      ))}
                    </div>
                  </div>
                  {/* 专业技能 */}
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>专业技能</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {(viewAgent.skills || []).map((s: string) => {
                        const sk = availableSkills.find(x => x.id === s)
                        return (
                          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}></div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{sk?.label || s}</div>
                              <div style={{ fontSize: 10, color: 'var(--text4)' }}>{sk?.desc || s}</div>
                            </div>
                          </div>
                        )
                      })}
                      {(!viewAgent.skills || viewAgent.skills.length === 0) && <div style={{ fontSize: 12, color: 'var(--text4)', gridColumn: '1 / -1', padding: 8 }}>无专业技能</div>}
                    </div>
                  </div>
                </div>

                {/* 参数配置 */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>运行参数</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg2)', borderRadius: 8 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{viewAgent.temperature ?? 0.7}</div>
                      <div style={{ fontSize: 10, color: 'var(--text4)' }}>Temperature</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg2)', borderRadius: 8 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{((viewAgent.maxTokens || currentModelMaxTokens) / 1000).toFixed(0)}K</div>
                      <div style={{ fontSize: 10, color: 'var(--text4)' }}>Max Tokens</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg2)', borderRadius: 8 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{(viewAgent.mcpServers || []).length}</div>
                      <div style={{ fontSize: 10, color: 'var(--text4)' }}>MCP 服务器</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer" style={{ padding: '12px 24px' }}>
                <button className="btn btn-primary" onClick={() => { setViewAgent(null); useAppStore.getState().setPage('chat'); useAppStore.getState().setCurrentAgent(viewAgent); localStorage.setItem('currentAgentId', viewAgent.id) }}>使用此智能体</button>
                <button className="btn btn-secondary" onClick={() => setViewAgent(null)}>关闭</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
