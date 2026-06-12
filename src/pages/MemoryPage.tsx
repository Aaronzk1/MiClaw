import { useEffect, useState, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'
import { ConfirmModal } from '../components/ui'

const CATS = [
  { value: 'all', label: '全部' },
  { value: 'general', label: '通用' },
  { value: 'user_pref', label: '用户偏好' },
  { value: 'project', label: '项目' },
  { value: 'architecture', label: '架构' },
  { value: 'config', label: '配置' },
]

const CAT_COLORS: Record<string, string> = {
  general: 'var(--text3)', user_pref: 'var(--accent)', project: 'var(--success)',
  architecture: 'var(--warning)', config: '#8b5cf6',
}

export function MemoryPage() {
  const { currentConvId, memories, setMemories } = useAppStore()
  const [tab, setTab] = useState<'overview' | 'memory' | 'context' | 'rag'>('overview')
  const [messages, setMessages] = useState<any[]>([])
  const [config, setConfig] = useState<any>({})
  const [models, setModels] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState('general')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [ragDocs, setRagDocs] = useState<any[]>([])
  const [ragQuery, setRagQuery] = useState('')
  const [ragResults, setRagResults] = useState<any[]>([])
  const [ragSearching, setRagSearching] = useState(false)
  const [ragImporting, setRagImporting] = useState(false)

  useEffect(() => {
    api.memoryList().then(setMemories).catch(() => {})
    api.getConfig().then(setConfig).catch(() => {})
    api.modelsList().then(setModels).catch(() => {})
    api.ragList?.().then(setRagDocs).catch(() => {})
  }, [])

  useEffect(() => {
    if (currentConvId) api.convMessages(currentConvId).then(setMessages).catch(() => {})
    else setMessages([])
  }, [currentConvId])

  // Memory stats
  const memStats = useMemo(() => {
    const short = memories.filter(m => ['short', 'user_pref', 'general'].includes(m.category)).length
    const mid = memories.filter(m => ['mid', 'project', 'config'].includes(m.category)).length
    const long = memories.filter(m => ['long', 'architecture'].includes(m.category)).length
    return { short, mid, long, total: memories.length }
  }, [memories])

  // Memory clusters
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
      color: CAT_COLORS[cat] || 'var(--text3)',
    }))
  }, [memories])

  // Filtered memories
  const filtered = useMemo(() => {
    let list = memories
    if (catFilter !== 'all') list = list.filter(m => m.category === catFilter)
    if (search) { const q = search.toLowerCase(); list = list.filter(m => m.content.toLowerCase().includes(q)) }
    return list
  }, [memories, catFilter, search])

  // Context stats
  const ctxStats = useMemo(() => {
    const est = (m: any) => m.tokens != null ? m.tokens : Math.ceil((m.content || '').length / 4)
    const total = messages.reduce((s, m) => s + est(m), 0)
    const userT = messages.filter(m => m.role === 'user').reduce((s, m) => s + est(m), 0)
    const asstT = messages.filter(m => m.role === 'assistant').reduce((s, m) => s + est(m), 0)
    const sysT = messages.filter(m => m.role === 'system').reduce((s, m) => s + est(m), 0)
    const modelId = config.ai?.model || 'openclaw'
    const model = models.find((m: any) => m.id === modelId)
    const max = model?.contextWindow || 128000
    return { total, userT, asstT, sysT, max, pct: Math.min(100, Math.round((total / max) * 100)) }
  }, [messages, config, models])

  // SVG visualization nodes
  const vizNodes = useMemo(() => {
    if (memories.length === 0) return []
    const nodes: { x: number; y: number; r: number; color: string; label: string; cat: string }[] = []
    const spacing = Math.min(120, 500 / Math.max(1, clusters.length))
    const startX = Math.max(60, (600 - (clusters.length - 1) * spacing) / 2)
    clusters.forEach((c, ci) => {
      const cx = startX + ci * spacing
      const cy = 120
      nodes.push({ x: cx, y: cy, r: Math.min(30, 20 + c.count * 2), color: c.color, label: c.category, cat: c.category })
      c.items.slice(0, 5).forEach((_, mi) => {
        const angle = (mi / Math.min(c.items.length, 5)) * Math.PI * 2
        const dist = 40 + (mi * 7) % 25
        nodes.push({ x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist, r: 6, color: c.color + '88', label: '', cat: c.category })
      })
    })
    return nodes
  }, [clusters, memories])

  const handleAdd = () => {
    if (!newContent.trim()) return
    api.memoryAdd(newContent, newCategory).then((id: string) => {
      setMemories([...memories, { id, content: newContent, category: newCategory, importance: 0.5, createdAt: new Date().toISOString() }])
      setNewContent(''); setShowAdd(false)
    }).catch(console.error)
  }

  const doDelete = () => {
    if (!deleteId) return
    api.memoryDelete(deleteId).then(() => setMemories(memories.filter(m => m.id !== deleteId))).catch(console.error)
    setDeleteId(null)
  }

  const handleRagImport = () => {
    const el = document.createElement('input')
    el.type = 'file'; el.accept = '.txt,.md,.json,.csv,.py,.js,.ts,.html,.css'; el.multiple = true
    el.onchange = async () => {
      if (!el.files?.length) return
      setRagImporting(true)
      for (const file of Array.from(el.files)) {
        const r = await api.ragImport?.((file as any).path)
        if (r?.ok) { const list = await api.ragList?.(); if (list) setRagDocs(list) }
      }
      setRagImporting(false)
    }
    el.click()
  }
  const handleRagSearch = async () => {
    if (!ragQuery.trim()) return
    setRagSearching(true); try { setRagResults(await api.ragSearch?.(ragQuery, 5) || []) } catch { setRagResults([]) }; setRagSearching(false)
  }
  const handleRagDelete = async (id: string) => { await api.ragDelete?.(id); setRagDocs(ragDocs.filter(d => d.id !== id)) }

  return (
    <div className="page" id="page-memory">
      <div className="pg" style={{ maxWidth: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>记忆 & 上下文</h2>
          {tab === 'memory' && <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ 添加记忆</button>}
        </div>

        <div className="gc-tabs" style={{ marginBottom: 16 }}>
          <button className={'gc-tab' + (tab === 'overview' ? ' active' : '')} onClick={() => setTab('overview')}>概览</button>
          <button className={'gc-tab' + (tab === 'memory' ? ' active' : '')} onClick={() => setTab('memory')}>记忆 ({memStats.total})</button>
          <button className={'gc-tab' + (tab === 'context' ? ' active' : '')} onClick={() => setTab('context')}>上下文</button>
          <button className={'gc-tab' + (tab === 'rag' ? ' active' : '')} onClick={() => setTab('rag')}>知识库 ({ragDocs.length})</button>
        </div>

        {/* ── 概览 ── */}
        {tab === 'overview' && (
          <>
            <div className="dash-grid" style={{ marginBottom: 16 }}>
              <div className="dash-card"><div className="big-num">{memStats.short}</div><div className="sub-label">短期记忆</div></div>
              <div className="dash-card"><div className="big-num">{memStats.mid}</div><div className="sub-label">中期记忆</div></div>
              <div className="dash-card"><div className="big-num">{memStats.long}</div><div className="sub-label">长期记忆</div></div>
              <div className="dash-card">
                {currentConvId ? (
                  <>
                    <div className="big-num">{ctxStats.pct}%</div>
                    <div className="sub-label">上下文用量</div>
                    <div className="ctx-bar" style={{ marginTop: 8 }}>
                      <div className="ctx-seg" style={{ width: Math.round(ctxStats.sysT / ctxStats.max * 100) + '%', background: 'var(--accent)' }}></div>
                      <div className="ctx-seg" style={{ width: Math.round(ctxStats.userT / ctxStats.max * 100) + '%', background: 'var(--success)' }}></div>
                      <div className="ctx-seg" style={{ width: Math.round(ctxStats.asstT / ctxStats.max * 100) + '%', background: 'var(--warning)' }}></div>
                    </div>
                  </>
                ) : (
                  <div style={{ color: 'var(--text4)', fontSize: 13, padding: '12px 0' }}>选择对话后显示上下文用量</div>
                )}
              </div>
            </div>

            {memories.length > 0 && (
              <div className="dash-card" style={{ marginBottom: 16, padding: 20, textAlign: 'center' }}>
                <svg width="100%" height="280" viewBox="0 0 600 280" style={{ maxWidth: 600 }}>
                  {vizNodes.filter(n => n.r > 10).map((n, i) => {
                    const next = vizNodes.filter(n2 => n2.r > 10)[i + 1]
                    if (!next) return null
                    return <line key={'l' + i} x1={n.x} y1={n.y} x2={next.x} y2={next.y} stroke="var(--border)" strokeWidth="1" strokeDasharray="4,4" />
                  })}
                  {vizNodes.map((n, i) => (
                    <g key={i}>
                      <circle cx={n.x} cy={n.y} r={n.r} fill={n.color} opacity={n.r > 10 ? 0.9 : 0.5} />
                      {n.label && <text x={n.x} y={n.y + n.r + 14} textAnchor="middle" fontSize="10" fill="var(--text2)">{n.label}</text>}
                      {n.r > 10 && <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="600">{vizNodes.filter(nn => nn.cat === n.cat).length - 1}</text>}
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

            {currentConvId && (
              <div className="dash-grid">
                <div className="dash-card">
                  <div className="kv-row"><span className="k">System</span><span className="v">{ctxStats.sysT} tokens</span></div>
                  <div className="kv-row"><span className="k">用户</span><span className="v">{ctxStats.userT} tokens</span></div>
                  <div className="kv-row"><span className="k">助手</span><span className="v">{ctxStats.asstT} tokens</span></div>
                  <div className="kv-row"><span className="k">总计 / 上限</span><span className="v">{ctxStats.total} / {ctxStats.max}</span></div>
                </div>
                <div className="dash-card">
                  <div className="kv-row"><span className="k">消息数</span><span className="v">{messages.length}</span></div>
                  <div className="kv-row"><span className="k">对话ID</span><span className="v" style={{ fontSize: 10 }}>{currentConvId?.slice(0, 12)}...</span></div>
                  <div className="kv-row"><span className="k">模型</span><span className="v">{config.ai?.model || 'openclaw'}</span></div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── 记忆 ── */}
        {tab === 'memory' && (
          <>
            <div className="filter-bar" style={{ marginBottom: 12 }}>
              <input type="text" placeholder="搜索记忆..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
              <span className="badge badge-blue">{filtered.length} 条</span>
            </div>
            <div className="gc-tabs" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
              {CATS.map(c => (
                <button key={c.value} className={'gc-tab' + (catFilter === c.value ? ' active' : '')} onClick={() => setCatFilter(c.value)} style={{ fontSize: 11 }}>{c.label}</button>
              ))}
            </div>

            {clusters.map((c, i) => (
              <div key={i} className="card" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.color }}></span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{c.category}</span>
                  </div>
                  <span className="badge badge-green">{c.count} 条</span>
                </div>
                <div className="ctx-bar" style={{ marginBottom: 6 }}>
                  <div className="ctx-seg" style={{ width: Math.round(c.avgImportance * 100) + '%', background: c.color }}></div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>平均重要性: {(c.avgImportance * 100).toFixed(0)}%</div>
                {c.items.slice(0, 3).map((m: any) => (
                  <div key={m.id} style={{ fontSize: 12, color: 'var(--text2)', padding: '4px 0', borderTop: '1px solid var(--bg2)', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.content}</span>
                    <button className="btn btn-sm btn-ghost" onClick={() => setDeleteId(m.id)} style={{ fontSize: 10 }}>{'✕'}</button>
                  </div>
                ))}
              </div>
            ))}

            {catFilter !== 'all' && filtered.map((m: any) => (
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
                  <button className="btn btn-sm btn-ghost" onClick={() => setDeleteId(m.id)}>{'✕'}</button>
                </div>
              </div>
            ))}

            {memories.length === 0 && <div className="empty-state"><h3>暂无记忆</h3><p>Agent 会在对话中自动积累记忆，您也可以手动添加</p></div>}
          </>
        )}

        {/* ── 上下文 ── */}
        {tab === 'context' && (
          <>
            {!currentConvId ? (
              <div className="empty-state"><h3>请先选择对话</h3><p>在左侧选择一个对话来查看上下文信息</p></div>
            ) : (
              <>
                <div className="dash-grid" style={{ marginBottom: 16 }}>
                  <div className="dash-card">
                    <div className="big-num">{ctxStats.pct}%</div>
                    <div className="sub-label">上下文用量</div>
                    <div className="ctx-bar" style={{ marginTop: 8 }}>
                      <div className="ctx-seg" style={{ width: Math.round(ctxStats.sysT / ctxStats.max * 100) + '%', background: 'var(--accent)' }}></div>
                      <div className="ctx-seg" style={{ width: Math.round(ctxStats.userT / ctxStats.max * 100) + '%', background: 'var(--success)' }}></div>
                      <div className="ctx-seg" style={{ width: Math.round(ctxStats.asstT / ctxStats.max * 100) + '%', background: 'var(--warning)' }}></div>
                    </div>
                  </div>
                  <div className="dash-card">
                    <div className="kv-row"><span className="k">System</span><span className="v">{ctxStats.sysT} tokens</span></div>
                    <div className="kv-row"><span className="k">用户</span><span className="v">{ctxStats.userT} tokens</span></div>
                    <div className="kv-row"><span className="k">助手</span><span className="v">{ctxStats.asstT} tokens</span></div>
                    <div className="kv-row"><span className="k">总计 / 上限</span><span className="v">{ctxStats.total} / {ctxStats.max}</span></div>
                  </div>
                  <div className="dash-card">
                    <div className="kv-row"><span className="k">消息数</span><span className="v">{messages.length}</span></div>
                    <div className="kv-row"><span className="k">对话ID</span><span className="v" style={{ fontSize: 10 }}>{currentConvId?.slice(0, 12)}...</span></div>
                    <div className="kv-row"><span className="k">模型</span><span className="v">{config.ai?.model || 'openclaw'}</span></div>
                  </div>
                </div>

                <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--text3)' }}>消息时间线 ({messages.length} 条)</div>
                {messages.filter(m => m.role !== 'tool').map((m, i) => (
                  <div key={i} className={'ctx-msg ' + m.role}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span className="badge badge-blue" style={{ fontSize: 10 }}>{m.role}</span>
                      <span style={{ fontSize: 10, color: 'var(--text4)' }}>{m.tokens != null ? m.tokens : Math.ceil((m.content || '').length / 4)} tokens</span>
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.5, maxHeight: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>{(m.content || '').slice(0, 200)}</div>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* ── 知识库 ── */}
        {tab === 'rag' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input type="text" placeholder="语义搜索知识库..." value={ragQuery} onChange={e => setRagQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleRagSearch() }} style={{ flex: 1 }} />
              <button className="btn btn-secondary btn-sm" onClick={handleRagSearch} disabled={ragSearching}>{ragSearching ? '搜索中...' : '搜索'}</button>
              <button className="btn btn-primary btn-sm" onClick={handleRagImport} disabled={ragImporting}>{ragImporting ? '导入中...' : '+ 导入文档'}</button>
            </div>
            {ragResults.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>搜索结果 ({ragResults.length})</h4>
                {ragResults.map((r, i) => (
                  <div key={i} className="card" style={{ marginBottom: 6, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span className="badge badge-green">{(r.score * 100).toFixed(0)}%</span>
                      <span style={{ fontSize: 10, color: 'var(--text4)' }}>{r.docId}</span>
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>{r.text.slice(0, 300)}</div>
                  </div>
                ))}
              </div>
            )}
            {ragDocs.length === 0 && <div className="empty-state"><h3>知识库为空</h3><p>导入文档后，AI 可以在对话中自动检索相关知识</p></div>}
            <div className="dash-grid">
              {ragDocs.map(d => (
                <div key={d.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div><div className="card-title">{d.filename}</div><div className="card-sub">{d.chunkCount} chunks</div></div>
                    <button className="btn btn-sm btn-ghost" onClick={() => handleRagDelete(d.id)} style={{ color: 'var(--error)' }}>{'删除'}</button>
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text4)' }}>{d.createdAt ? new Date(d.createdAt).toLocaleDateString('zh-CN') : ''}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Modals ── */}
        {showAdd && (
          <div className="modal-overlay" onClick={() => setShowAdd(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header"><h3>添加记忆</h3><button className="btn btn-sm btn-ghost" onClick={() => setShowAdd(false)}>{'✕'}</button></div>
              <div className="modal-body">
                <div className="form-group"><label>内容</label><textarea rows={3} value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="输入记忆内容..." /></div>
                <div className="form-group"><label>分类</label><select value={newCategory} onChange={e => setNewCategory(e.target.value)}>{CATS.filter(c => c.value !== 'all').map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
              </div>
              <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowAdd(false)}>取消</button><button className="btn btn-primary" onClick={handleAdd}>添加</button></div>
            </div>
          </div>
        )}
        {deleteId && <ConfirmModal title="删除记忆" message="确定删除此记忆？删除后无法恢复。" onConfirm={doDelete} onCancel={() => setDeleteId(null)} danger />}
      </div>
    </div>
  )
}
