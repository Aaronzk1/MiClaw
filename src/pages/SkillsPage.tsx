import { useEffect, useState, useMemo } from 'react'
import { api } from '../lib/ipc'

export function SkillsPage() {
  const [skills, setSkills] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')

  useEffect(() => { api.skillsList().then(setSkills).catch(() => {}) }, [])

  const categories = useMemo(() => {
    const cats = new Set<string>()
    for (const s of skills) cats.add(s.category || s.source || 'other')
    return ['all', ...Array.from(cats)]
  }, [skills])

  const filtered = useMemo(() => {
    let list = skills
    if (catFilter !== 'all') list = list.filter(s => (s.category || s.source || 'other') === catFilter)
    if (search) { const q = search.toLowerCase(); list = list.filter(s => (s.name || '').toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q)) }
    return list
  }, [skills, search, catFilter])

  const handleToggle = (id: string, enabled: boolean) => {
    api.skillsToggle(id, enabled)
    setSkills(skills.map(s => s.id === id ? { ...s, enabled } : s))
  }

  const catColors: Record<string, string> = {
    search: '#4f46e5', writing: '#ec4899', coding: '#16a34a', design: '#f59e0b',
    tool: '#06b6d4', analysis: '#8b5cf6', other: 'var(--text3)',
  }

  return (
    <div className="page" id="page-skills">
      <div className="pg" style={{ maxWidth: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{'\u6280\u80fd\u4e2d\u5fc3'}</h2>
          <span className="badge badge-blue">{filtered.length} {'\u4e2a\u6280\u80fd'}</span>
        </div>
        <div className="gc-tabs" style={{ marginBottom: 12 }}>
          {categories.slice(0, 8).map(c => (
            <button key={c} className={'gc-tab' + (catFilter === c ? ' active' : '')} onClick={() => setCatFilter(c)}>{c === 'all' ? '\u5168\u90e8' : c}</button>
          ))}
        </div>
        <div className="filter-bar">
          <input type="text" placeholder={'\u641c\u7d22\u6280\u80fd...'} value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
        </div>
        <div className="dash-grid">
          {filtered.map(s => {
            const cat = s.category || s.source || 'other'
            const color = catColors[cat] || 'var(--text3)'
            return (
              <div key={s.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: color + '20', color: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{(s.name || 'S')[0].toUpperCase()}</div>
                    <div>
                      <div className="card-title" style={{ fontFamily: 'var(--mono)' }}>{s.name || s.id}</div>
                      <span className="badge" style={{ background: color + '15', color, fontSize: 9 }}>{cat}</span>
                    </div>
                  </div>
                  <div className={'toggle' + (s.enabled !== false ? ' on' : '')} onClick={() => handleToggle(s.id, s.enabled === false)}></div>
                </div>
                <div className="card-desc">{s.description || '\u65e0\u63cf\u8ff0'}</div>
                {s.version && <span className="tag" style={{ fontSize: 9 }}>v{s.version}</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
