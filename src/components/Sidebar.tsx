import { useEffect, useState, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'
import { ConfirmModal } from './ui'

const navSections = [
  {
    title: '协作', key: 'collab', items: [
      { id: 'group', label: '群组协作', color: 'var(--success)' },
    ]
  },
  {
    title: '工具', key: 'tools', items: [
      { id: 'calendar', label: '日程规划', color: 'var(--warning)' },
      { id: 'plugins', label: '插件市场', color: 'var(--info)' },
      { id: 'mcp', label: 'MCP Servers', color: 'var(--accent)' },
      { id: 'analytics', label: '活跃分析', color: 'var(--info)' },
      { id: 'tokenStats', label: 'Token 经济', color: 'var(--success)' },
      { id: 'tree', label: '关系图谱', color: 'var(--accent)' },
    ]
  },
  {
    title: '系统', key: 'system', items: [
      { id: 'gateway', label: 'Gateway 监控', color: 'var(--success)' },
      { id: 'settings', label: '设置', color: 'var(--text3)' },
    ]
  },
]

export function Sidebar() {
  const sidebarCollapsed = useAppStore(s => s.sidebarCollapsed)
  const currentPage = useAppStore(s => s.currentPage)
  const setPage = useAppStore(s => s.setPage)
  const conversations = useAppStore(s => s.conversations)
  const setConversations = useAppStore(s => s.setConversations)
  const currentConvId = useAppStore(s => s.currentConvId)
  const setCurrentConvId = useAppStore(s => s.setCurrentConvId)
  const setMessages = useAppStore(s => s.setMessages)
  const gatewayRunning = useAppStore(s => s.gatewayRunning)
  const setGatewayRunning = useAppStore(s => s.setGatewayRunning)
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ collab: true, tools: true, system: true })
  const [reminderCount, setReminderCount] = useState(0)

  // Load conversations
  useEffect(() => {
    api.convList().then((convs: any[]) => {
      setConversations(convs)
      if (!currentConvId && convs.length > 0) {
        const lastId = localStorage.getItem('lastConvId')
        const conv = lastId ? convs.find((c: any) => c.id === lastId) : null
        if (conv) {
          setCurrentConvId(conv.id)
          api.convMessages(conv.id).then(setMessages).catch(() => {})
        }
      }
    }).catch(() => {})
    api.gatewayStatus().then((s: any) => setGatewayRunning(s.running)).catch(() => {})
    api.calendarReminders?.(60).then((r: any[]) => setReminderCount(r?.length || 0)).catch(() => {})
    const timer = setInterval(() => {
      api.gatewayStatus().then((s: any) => setGatewayRunning(s.running)).catch(() => {})
      api.calendarReminders?.(60).then((r: any[]) => setReminderCount(r?.length || 0)).catch(() => {})
    }, 60000)
    return () => clearInterval(timer)
  }, [])

  const filteredConvs = useMemo(() => {
    if (!searchQuery) return conversations
    const q = searchQuery.toLowerCase()
    return conversations.filter((c: any) => (c.title || '').toLowerCase().includes(q))
  }, [conversations, searchQuery])

  // Group by time
  const timeGroupedConvs = useMemo(() => {
    const now = new Date()
    const todayStr = now.toDateString()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toDateString()

    const groups: { label: string; items: any[] }[] = [
      { label: '今天', items: [] },
      { label: '昨天', items: [] },
      { label: '更早', items: [] },
    ]

    for (const c of filteredConvs) {
      const d = new Date(c.updatedAt || c.createdAt).toDateString()
      if (d === todayStr) groups[0].items.push(c)
      else if (d === yesterdayStr) groups[1].items.push(c)
      else groups[2].items.push(c)
    }
    return groups.filter(g => g.items.length > 0)
  }, [filteredConvs])

  const selectConv = (conv: any) => {
    setCurrentConvId(conv.id)
    localStorage.setItem('lastConvId', conv.id)
    setPage('chat')
    api.convMessages(conv.id).then(setMessages).catch(() => {})
  }

  const handleDelete = (e: any, id: string) => {
    e.stopPropagation()
    setDeleteConfirm(id)
  }

  const confirmDelete = () => {
    if (deleteConfirm) {
      api.convDelete(deleteConfirm).then(() => {
        setConversations(conversations.filter((c: any) => c.id !== deleteConfirm))
        if (currentConvId === deleteConfirm) {
          setCurrentConvId(null)
          setMessages([])
          localStorage.removeItem('lastConvId')
        }
      }).catch(() => {})
      setDeleteConfirm(null)
    }
  }

  const handleRename = (id: string, title: string) => {
    if (title.trim()) {
      api.convUpdateTitle(id, title.trim()).catch(() => {})
      setConversations(conversations.map((c: any) => c.id === id ? { ...c, title: title.trim() } : c))
      setEditTitle(null)
    }
  }

  const formatTime = (dateStr: string) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <>
      <div id="left" className={sidebarCollapsed ? 'collapsed' : ''} role="navigation" aria-label="主导航">
        {/* Logo */}
        <div className="left-header">
          <div className="logo-mark">
            <img src="logo.png" alt="MiClaw" style={{ width: 28, height: 28, borderRadius: 7 }} />
            <span className="logo-text">MiClaw</span>
          </div>
        </div>

        {/* Search */}
        <div className="left-search" role="search">
          <input
            type="text"
            placeholder="搜索对话..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="搜索对话"
          />
        </div>

        {/* Conversations */}
        <div className="conv-list">
          {timeGroupedConvs.map(group => (
            <div key={group.label} className="conv-group">
              <div className="conv-group-header">
                <span className="conv-group-name" style={{ fontSize: 11, color: 'var(--text4)', fontWeight: 600 }}>{group.label}</span>
                <span className="conv-group-count">{group.items.length}</span>
              </div>
              {group.items.map((c: any) => (
                <div
                  key={c.id}
                  className={'conv-item' + (currentConvId === c.id ? ' active' : '')}
                  onClick={() => { if (editTitle !== c.id) selectConv(c) }}
                >
                  {editTitle === c.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => handleRename(c.id, editValue)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(c.id, editValue); if (e.key === 'Escape') setEditTitle(null) }}
                      onClick={e => e.stopPropagation()}
                      style={{ flex: 1, fontSize: 12, padding: '2px 4px', border: '1px solid var(--accent)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
                    />
                  ) : (
                    <>
                      <span className="title" onDoubleClick={e => { e.stopPropagation(); setEditTitle(c.id); setEditValue(c.title || '') }}>
                        {c.parentConvId && <span style={{ fontSize: 9, color: 'var(--accent)', marginRight: 4 }} title={`分叉自对话`}>⑂</span>}
                        {c.title || '新建对话'}
                      </span>
                      <span className="time">{formatTime(c.updatedAt)}</span>
                      <button className="del" onClick={e => handleDelete(e, c.id)}>✕</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
          {filteredConvs.length === 0 && (
            <div style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text4)', fontSize: 12 }}>
              {searchQuery ? '未找到匹配的对话' : '暂无对话'}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ borderTop: '2px solid var(--border)', margin: '0 8px' }} />

        {/* Navigation Sections */}
        {navSections.map(section => (
          <div key={section.key} className="nav-section">
            <div className="nav-section-header" onClick={() => toggleSection(section.key)}>
              <span>{section.title}</span>
              <span className={'arrow' + (openSections[section.key] ? ' open' : '')}>▶</span>
            </div>
            <div className="nav-items" style={{ maxHeight: openSections[section.key] ? 500 : 0 }}>
              {section.items.map(item => (
                <div
                  key={item.id}
                  className={'nav-item' + (currentPage === item.id ? ' active' : '')}
                  onClick={() => setPage(item.id)}
                >
                  <span className="nav-dot" style={{ background: item.color }} />
                  <span style={{ fontSize: 13, flex: 1 }}>{item.label}</span>
                  {item.id === 'calendar' && reminderCount > 0 && <span style={{ fontSize: 9, background: 'var(--error)', color: '#fff', padding: '0 5px', borderRadius: 8, fontWeight: 700, lineHeight: '16px' }}>{reminderCount}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Gateway Status */}
        <div
          className="gw-status"
          onClick={() => {
            if (!gatewayRunning) {
              api.gatewayStart().then((r: any) => {
                if (r.ok) {
                  // Wait for gateway to be healthy before updating status
                  setTimeout(() => {
                    api.gatewayStatus().then((s: any) => setGatewayRunning(s.running)).catch(() => {})
                  }, 3000)
                }
              })
            }
          }}
          style={{ cursor: gatewayRunning ? 'default' : 'pointer' }}
          title={gatewayRunning ? 'Gateway 运行中' : '点击启动 Gateway'}
        >
          <span className={'gw-dot' + (gatewayRunning ? ' on' : ' off')} />
          <span>网关 {gatewayRunning ? '运行中' : '未连接 · 点击启动'}</span>
        </div>
      </div>

      {deleteConfirm && (
        <ConfirmModal
          title="删除对话"
          message="确定删除此对话？删除后无法恢复。"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
          danger
        />
      )}
    </>
  )
}
