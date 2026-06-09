import { useEffect, useState, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'

export function HistoryPage() {
  const { setPage, setCurrentConvId, setMessages } = useAppStore()
  const [convs, setConvs] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [timeFilter, setTimeFilter] = useState('all')

  useEffect(() => { api.convList().then(setConvs).catch(() => {}) }, [])

  const filtered = useMemo(() => {
    let list = [...convs]
    if (search) { const q = search.toLowerCase(); list = list.filter(c => (c.title || '').toLowerCase().includes(q)) }
    if (timeFilter !== 'all') {
      const now = Date.now()
      const ms = timeFilter === 'today' ? 86400000 : timeFilter === 'week' ? 604800000 : 2592000000
      list = list.filter(c => now - new Date(c.updatedAt || c.createdAt).getTime() < ms)
    }
    list.sort((a, b) => sortBy === 'newest' ? (b.updatedAt || '').localeCompare(a.updatedAt || '') : (a.updatedAt || '').localeCompare(b.updatedAt || ''))
    return list
  }, [convs, search, sortBy, timeFilter])

  const handleOpen = (c: any) => { setCurrentConvId(c.id); api.convMessages(c.id).then(setMessages); setPage('chat') }
  const handleDelete = (id: string) => { api.convDelete(id).then(() => setConvs(convs.filter(c => c.id !== id))) }
  const handleArchive = (id: string) => { api.settingsSet('archived_' + id, '1'); setConvs(convs.filter(c => c.id !== id)) }

  return (
    <div className="page" id="page-history">
      <div className="pg">
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>历史对话</h2>
        <div className="filter-bar">
          <input type="text" placeholder="搜索对话..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          <select value={timeFilter} onChange={e => setTimeFilter(e.target.value)}>
            <option value="all">全部时间</option>
            <option value="today">今天</option>
            <option value="week">本周</option>
            <option value="month">本月</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="newest">最新</option>
            <option value="oldest">最早</option>
          </select>
        </div>
        {filtered.length === 0 && <div className="empty-state"><h3>无历史对话</h3><p>开始一个新对话吧</p></div>}
        {filtered.map((c: any) => (
          <div key={c.id} className="card" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => handleOpen(c)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div className="card-title">{c.title || '新建对话'}</div>
                <div className="card-sub">{c.model || 'openclaw'} · {new Date(c.updatedAt || c.createdAt).toLocaleString('zh-CN')}</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-sm btn-ghost" onClick={e => { e.stopPropagation(); handleArchive(c.id) }}>归档</button>
                <button className="btn btn-sm btn-danger" onClick={e => { e.stopPropagation(); handleDelete(c.id) }}>删除</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
