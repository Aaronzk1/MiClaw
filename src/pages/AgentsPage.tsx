import { useEffect, useState, useMemo } from 'react'
import { api } from '../lib/ipc'
import { useAppStore } from '../stores/appStore'
import { ConfirmModal } from '../components/ui'

const ALL_SKILLS = [
  { id: 'search', label: '搜索', desc: '网络搜索' },
  { id: 'code_execute', label: '代码执行', desc: '运行 Python/JS' },
  { id: 'read_file', label: '读文件', desc: '读取文件内容' },
  { id: 'write_file', label: '写文件', desc: '写入文件' },
  { id: 'terminal', label: '终端', desc: '执行 Shell 命令' },
  { id: 'browser', label: '浏览器', desc: '打开网页' },
  { id: 'translate', label: '翻译', desc: '多语言翻译' },
  { id: 'memory_save', label: '记忆', desc: '保存长期记忆' },
  { id: 'data_analyze', label: '数据分析', desc: '数据处理与分析' },
  { id: 'chart_generate', label: '图表', desc: '生成可视化图表' },
  { id: 'read_url', label: '读网页', desc: '抓取网页内容' },
  { id: 'list_directory', label: '列目录', desc: '列出文件夹' },
  { id: 'memory_search', label: '搜记忆', desc: '搜索已保存记忆' },
  { id: 'stock_quote', label: '实时行情', desc: 'A股实时行情' },
  { id: 'stock_kline', label: 'K线', desc: '日K线数据' },
  { id: 'stock_finance', label: '财务指标', desc: 'PE/PB/ROE' },
  { id: 'stock_screener', label: '选股', desc: '条件筛选股票' },
  { id: 'data_profile', label: '数据探查', desc: '数据集结构分析' },
  { id: 'sys_info', label: '系统状态', desc: 'CPU/内存/磁盘' },
  { id: 'text_stats', label: '文本统计', desc: '字数/词数/段落' },
  { id: 'code_review', label: '代码审查', desc: '代码质量检查' },
  { id: 'project_scan', label: '项目扫描', desc: '项目结构分析' },
  { id: 'csv_clean', label: 'CSV清洗', desc: '数据清洗去重' },
  { id: 'md_format', label: 'MD格式化', desc: 'Markdown格式化' },
  { id: 'word_freq', label: '词频统计', desc: '中英文词频分析' },
  { id: 'summarize', label: '摘要', desc: '长文本摘要提取' },
  { id: 'citation_extract', label: '引用提取', desc: '提取参考文献' },
]

export function AgentsPage() {
  const agents = useAppStore(s => s.agents)
  const setAgents = useAppStore(s => s.setAgents)
  const [mcpServers, setMcpServers] = useState<any[]>([])
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

  useEffect(() => {
    if (!agents.length) api.agentsList().then(setAgents).catch(console.error)
    api.mcpList().then(setMcpServers).catch(console.error)
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
    setColor('#4f46e5'); setSkills([]); setTemperature(0.7); setMaxTokens(4096); setMcpServerIds([])
    setAgentCategory('自定义'); setShowModal(true)
  }

  const openEdit = (a: any) => {
    setEditAgent(a); setName(a.name || ''); setModel(a.model || ''); setIdentity(a.identity || '')
    setExpertise(a.expertise || ''); setDescription(a.description || ''); setColor(a.color || '#4f46e5')
    setSkills(a.skills || []); setTemperature(a.temperature ?? 0.7); setMaxTokens(a.maxTokens ?? 4096)
    setMcpServerIds(a.mcpServers || []); setAgentCategory(a.category || '自定义'); setShowModal(true)
  }

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
              style={{ padding: '3px 10px', fontSize: 11, borderRadius: 12, border: '1px solid ' + (category === cat.id ? 'var(--accent)' : 'var(--border)'), background: category === cat.id ? 'var(--accent)' : 'var(--bg1)', color: category === cat.id ? '#fff' : 'var(--text2)', cursor: 'pointer', fontWeight: category === cat.id ? 600 : 400 }}>
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
                  <div className="card-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                  <div className="card-sub">{a.description || '自定义智能体'}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5, marginBottom: 10, height: 36, overflow: 'hidden' }}>{a.identity ? `${a.identity} · ${a.expertise || ''}`.slice(0, 60) : a.description || '自定义智能体'}</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10, minHeight: 22 }}>
                {a.skills?.map((s: string) => {
                  const sk = ALL_SKILLS.find(x => x.id === s)
                  return <span key={s} className="badge badge-blue">{sk?.label || s}</span>
                })}
                {a.mcpServers?.map((sid: string) => {
                  const srv = mcpServers.find((x: any) => x.id === sid)
                  return <span key={sid} className="badge badge-purple">{srv?.name || sid}</span>
                })}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 'auto' }}>
                <button className="btn btn-sm btn-secondary" onClick={() => openEdit(a)} style={{ flex: 1, justifyContent: 'center' }}>编辑</button>
                <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(a.id)}>{'✕'}</button>
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
                  <div className="form-group"><label>名称</label><input value={name} onChange={e => setName(e.target.value)} placeholder="智能体名称..." /></div>
                  <div className="form-group"><label>模型</label><input value={model} onChange={e => setModel(e.target.value)} placeholder="openclaw" /></div>
                </div>
                <div className="form-group"><label>描述</label><input value={description} onChange={e => setDescription(e.target.value)} placeholder="简短描述 Agent 的用途..." /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group"><label>分类</label>
                    <select value={agentCategory} onChange={e => setAgentCategory(e.target.value)} style={{ width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg1)', color: 'var(--text)' }}>
                      {['默认', '金融', '技术', '内容', '职场', '生活', '学习', '专业', '自定义'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label>颜色</label><div style={{ display: 'flex', gap: 6, marginTop: 6 }}>{colorPresets.map(c => <div key={c} onClick={() => setColor(c)} style={{ width: 28, height: 28, borderRadius: 6, background: c, cursor: 'pointer', border: color === c ? '2px solid var(--text)' : '2px solid transparent' }}></div>)}</div></div>
                </div>
                <div className="form-group">
                  <label>能力标签 (Skills)</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {ALL_SKILLS.map(s => (
                      <span key={s.id} onClick={() => toggleSkill(s.id)} title={s.desc}
                        style={{ padding: '4px 10px', border: skills.includes(s.id) ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: 12, fontSize: 12, cursor: 'pointer', background: skills.includes(s.id) ? 'var(--accent-light)' : 'transparent', color: skills.includes(s.id) ? 'var(--accent)' : 'var(--text2)', transition: 'all 0.15s' }}>
                        {s.label}
                      </span>
                    ))}
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
                    <input type="number" step="1024" min="1024" max="131072" value={maxTokens} onChange={e => setMaxTokens(Math.min(131072, Math.max(1024, parseInt(e.target.value) || 4096)))} />
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
                <div className="form-group"><label>身份 (Identity)</label><input value={identity} onChange={e => setIdentity(e.target.value)} placeholder="例：资深股票分析师" /></div>
                <div className="form-group"><label>专业领域 (Expertise)</label><textarea rows={3} value={expertise} onChange={e => setExpertise(e.target.value)} placeholder="例：A股/港股/美股分析，基本面/技术面/资金面..." /></div>
              </div>
              <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowModal(false)}>取消</button><button className="btn btn-primary" onClick={handleSave}>保存</button></div>
            </div>
          </div>
        )}
        {deleteConfirmId && <ConfirmModal title="删除 Agent" message="确定删除此 Agent？删除后无法恢复。" onConfirm={doDelete} onCancel={() => setDeleteConfirmId(null)} danger />}
      </div>
    </div>
  )
}
