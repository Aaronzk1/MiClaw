import { useState, useEffect, useMemo } from 'react'
import { api } from '../lib/ipc'
import { toast } from './Toast'

interface Template {
  id: string
  name: string
  content: string
  category?: string
  agentId?: string
  vars?: string[]
}

interface TemplatePanelProps {
  onSelect: (text: string) => void
  onClose: () => void
  agentId?: string
}

export function TemplatePanel({ onSelect, onClose, agentId }: TemplatePanelProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [editing, setEditing] = useState<Template | null>(null)
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('')
  const [tab, setTab] = useState<'use' | 'manage'>('use')
  const [search, setSearch] = useState('')
  const [varTemplate, setVarTemplate] = useState<Template | null>(null)
  const [varValues, setVarValues] = useState<Record<string, string>>({})

  useEffect(() => {
    loadTemplates()
  }, [agentId])

  const loadTemplates = async () => {
    try {
      const list = agentId ? await api.templatesForAgent(agentId) : await api.templatesList()
      setTemplates(list || [])
    } catch {}
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return templates
    const q = search.toLowerCase()
    return templates.filter(t => t.name.toLowerCase().includes(q) || (t.category || '').toLowerCase().includes(q))
  }, [templates, search])

  const handleSave = async () => {
    if (!name.trim() || !content.trim()) return
    const tpl: Partial<Template> = {
      ...(editing || {}),
      name: name.trim(),
      content: content.trim(),
      category: category.trim() || undefined,
      agentId: agentId || undefined,
    }
    await api.templatesSave(tpl)
    toast('模板已保存', 'success')
    setName(''); setContent(''); setCategory(''); setEditing(null)
    loadTemplates()
  }

  const handleDelete = async (id: string) => {
    await api.templatesDelete(id)
    toast('模板已删除', 'success')
    loadTemplates()
  }

  const handleSelect = (tpl: Template) => {
    const vars = tpl.vars || []
    if (vars.length > 0) {
      setVarTemplate(tpl)
      setVarValues(Object.fromEntries(vars.map(v => [v, ''])))
    } else {
      onSelect(tpl.content)
      onClose()
    }
  }

  const handleVarSubmit = () => {
    if (!varTemplate) return
    let result = varTemplate.content
    for (const [k, v] of Object.entries(varValues)) {
      result = result.replaceAll(`{{${k}}}`, v)
    }
    onSelect(result)
    setVarTemplate(null)
    setVarValues({})
    onClose()
  }

  const startEdit = (tpl: Template) => {
    setEditing(tpl)
    setName(tpl.name)
    setContent(tpl.content)
    setCategory(tpl.category || '')
    setTab('manage')
  }

  // Variable fill form
  if (varTemplate) {
    return (
      <div style={{
        position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
        width: 360, background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
        padding: 12, zIndex: 100,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>填写变量 - {varTemplate.name}</div>
        {(varTemplate.vars || []).map(v => (
          <div key={v} style={{ marginBottom: 6 }}>
            <label style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2, display: 'block' }}>{'{{' + v + '}}'}</label>
            <input value={varValues[v] || ''} onChange={e => setVarValues(prev => ({ ...prev, [v]: e.target.value }))}
              style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, fontFamily: 'var(--font)', background: 'var(--bg2)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-sm btn-ghost" onClick={() => { setVarTemplate(null); setVarValues({}) }}>取消</button>
          <button className="btn btn-sm btn-primary" onClick={handleVarSubmit}>插入</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
      width: 420, maxHeight: 400, background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 100,
    }}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => setTab('use')} style={{ flex: 1, padding: '8px 0', border: 'none', background: tab === 'use' ? 'var(--accent-light)' : 'transparent', color: tab === 'use' ? 'var(--accent)' : 'var(--text3)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>使用模板</button>
        <button onClick={() => setTab('manage')} style={{ flex: 1, padding: '8px 0', border: 'none', background: tab === 'manage' ? 'var(--accent-light)' : 'transparent', color: tab === 'manage' ? 'var(--accent)' : 'var(--text3)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>管理模板</button>
      </div>

      {tab === 'use' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '6px 8px' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索模板..."
              style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, fontFamily: 'var(--font)', background: 'var(--bg2)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text4)', fontSize: 12 }}>{search ? '无匹配模板' : '暂无模板，切换到"管理模板"创建'}</div>
            ) : (
              filtered.map(tpl => (
                <div key={tpl.id} onClick={() => handleSelect(tpl)} style={{
                  padding: '8px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  marginBottom: 4, border: '1px solid var(--border)', transition: 'all 0.1s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{tpl.name}</span>
                    {tpl.category && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--bg3)', color: 'var(--text4)' }}>{tpl.category}</span>}
                    {tpl.vars && tpl.vars.length > 0 && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--accent-light)', color: 'var(--accent)' }}>{tpl.vars.length}个变量</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', maxHeight: 32, overflow: 'hidden' }}>{tpl.content.slice(0, 80)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="模板名称" style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, marginBottom: 6, fontFamily: 'var(--font)', background: 'var(--bg2)', color: 'var(--text)', outline: 'none' }} />
          <input value={category} onChange={e => setCategory(e.target.value)} placeholder="分类（可选）" style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, marginBottom: 6, fontFamily: 'var(--font)', background: 'var(--bg2)', color: 'var(--text)', outline: 'none' }} />
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="模板内容，支持 {{变量}} 占位符" rows={5} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, fontFamily: 'var(--font)', background: 'var(--bg2)', color: 'var(--text)', outline: 'none', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="btn btn-sm btn-primary" onClick={handleSave}>{editing ? '更新' : '保存'}</button>
            {editing && <button className="btn btn-sm btn-ghost" onClick={() => { setEditing(null); setName(''); setContent(''); setCategory('') }}>取消</button>}
          </div>
          {templates.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--text4)', marginBottom: 6 }}>已有模板</div>
              {templates.map(tpl => (
                <div key={tpl.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 12 }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tpl.name}</span>
                  <button className="btn btn-sm btn-ghost" onClick={() => startEdit(tpl)} style={{ fontSize: 10 }}>编辑</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(tpl.id)} style={{ fontSize: 10, color: 'var(--error)' }}>删</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
