import { useEffect, useState, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'

const navSections = [
  { title: 'Agent', key: 'agent', items: [
    { id: 'agents', label: 'Agent 管理', color: 'var(--accent)' },
    { id: 'providers', label: '供应商管理', color: 'var(--success)' },
  ]},
  { title: '工具', key: 'tools', items: [
    { id: 'skills', label: '技能中心', color: 'var(--text)' },
    { id: 'memory', label: '记忆管理', color: 'var(--warning)' },
    { id: 'context', label: '上下文管理', color: '#6366f1' },
    { id: 'rag', label: '知识库 (RAG)', color: '#0ea5e9' },
    { id: 'workflow', label: '工作流', color: '#8b5cf6' },
    { id: 'cron', label: '定时任务', color: 'var(--success)' },
    { id: 'mcp', label: 'MCP 服务器', color: 'var(--error)' },
  ]},
  { title: '协作', key: 'collab', items: [
    { id: 'group', label: '群聊', color: '#8b5cf6' },
  ]},
  { title: '市场', key: 'market', items: [
    { id: 'agent-market', label: 'Agent 市场', color: '#ec4899' },
    { id: 'workspace', label: '工作区管理', color: '#8b5cf6' },
    { id: 'analytics', label: '对话分析', color: '#f97316' },
  ]},
  { title: '设置', key: 'settings', items: [
    { id: 'models-providers', label: '模型配置', color: 'var(--accent)' },
    { id: 'backup', label: '备份管理', color: '#16a34a' },
    { id: 'logs', label: '日志查看', color: '#64748b' },
    { id: 'settings', label: '通用设置', color: 'var(--text4)' },
    { id: 'about', label: '关于', color: 'var(--text4)' },
  ]},
]

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, currentPage, setPage, conversations, setConversations, currentConvId, setCurrentConvId, setMessages, gatewayRunning, setGatewayRunning } = useAppStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ agent: true, tools: true, collab: true, market: true, settings: true })

  useEffect(() => {
    api.convList().then(setConversations).catch(() => {})
    api.gatewayStatus().then((s: any) => setGatewayRunning(s.running)).catch(() => {})
  }, [currentPage, currentConvId])

  const filteredConvs = useMemo(() => {
    if (!searchQuery) return conversations
    const q = searchQuery.toLowerCase()
    return conversations.filter((c: any) => (c.title || '').toLowerCase().includes(q))
  }, [conversations, searchQuery])

  const handleConvClick = (id: string) => {
    setCurrentConvId(id)
    setPage('chat')
    api.convMessages(id).then(setMessages).catch(() => {})
  }

  const handleDeleteConv = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    api.convDelete(id).then(() => {
      setConversations(conversations.filter((c: any) => c.id !== id))
      if (currentConvId === id) { setCurrentConvId(null); setMessages([]) }
    })
  }

  const formatTime = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  const toggleSection = (key: string) => {
    setOpenSections(s => ({ ...s, [key]: !s[key] }))
  }

  return (
    <>
      <div id="left" className={sidebarCollapsed ? 'collapsed' : ''}>
        <div className="left-header">
          <div className="logo-mark">
            <img src="logo.png" alt="AC" style={{width:28,height:28,borderRadius:7}} />
            <span className="logo-text">AaronClaw</span>
          </div>
        </div>
        <div className="left-search">
          <input type="text" placeholder="搜索对话..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <div className="conv-list">
          {filteredConvs.map((c: any) => (
            <div key={c.id} className={'conv-item' + (currentConvId === c.id ? ' active' : '')} onClick={() => handleConvClick(c.id)}>
              <span className="title">{c.title || '新建对话'}</span>
              <span className="time">{formatTime(c.updatedAt)}</span>
              <button className="del" onClick={e => handleDeleteConv(e, c.id)}>&#10005;</button>
            </div>
          ))}
          {filteredConvs.length === 0 && (
            <div style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text4)', fontSize: 12 }}>
              {searchQuery ? '未找到匹配的对话' : '暂无对话'}
            </div>
          )}
        </div>
        {navSections.map(section => (
          <div key={section.key} className="nav-section">
            <div className="nav-section-header" onClick={() => toggleSection(section.key)}>
              <span>{section.title}</span>
              <span className={'arrow' + (openSections[section.key] ? ' open' : '')}>&#9654;</span>
            </div>
            <div className="nav-items" style={{ maxHeight: openSections[section.key] ? 500 : 0 }}>
              {section.items.map(item => (
                <div key={item.id} className={'nav-item' + (currentPage === item.id ? ' active' : '')} onClick={() => setPage(item.id)}>
                  <span className="nav-dot" style={{ background: item.color }}></span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="gw-status">
          <span className={'gw-dot' + (gatewayRunning ? ' on' : ' off')}></span>
          <span>Gateway {gatewayRunning ? '运行中' : '未连接'} :18789</span>
        </div>
      </div>
      {sidebarCollapsed && (
        <button className="left-expand" onClick={toggleSidebar} title="展开侧边栏">&#9654;</button>
      )}
    </>
  )
}