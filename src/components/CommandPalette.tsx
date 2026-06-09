import { useState, useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const { setPage, setCurrentConvId, setMessages, conversations, setConversations } = useAppStore()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') { e.preventDefault(); setOpen(o => !o); setQuery(''); setSelected(0) }
      if (e.key === 'Escape' && open) { setOpen(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
      api.convList().then(setConversations).catch(() => {})
    }
  }, [open])

  const commands = useMemo(() => {
    const items: { id: string; label: string; desc: string; action: () => void }[] = [
      { id: 'new-conv', label: '\u65b0\u5efa\u5bf9\u8bdd', desc: 'Ctrl+N', action: () => { setPage('chat'); setOpen(false) } },
      { id: 'settings', label: '\u6253\u5f00\u8bbe\u7f6e', desc: 'Ctrl+,', action: () => { setPage('settings'); setOpen(false) } },
      { id: 'toggle-sidebar', label: '\u5207\u6362\u4fa7\u8fb9\u680f', desc: 'Ctrl+B', action: () => { useAppStore.getState().toggleSidebar(); setOpen(false) } },
      { id: 'dashboard', label: '\u4eea\u8868\u76d8', desc: '', action: () => { setPage('dashboard'); setOpen(false) } },
      { id: 'agents', label: 'Agent \u7ba1\u7406', desc: '', action: () => { setPage('agents'); setOpen(false) } },
      { id: 'memory', label: '\u8bb0\u5fc6\u7ba1\u7406', desc: '', action: () => { setPage('memory'); setOpen(false) } },
      { id: 'skills', label: '\u6280\u80fd\u7ba1\u7406', desc: '', action: () => { setPage('skills'); setOpen(false) } },
      { id: 'models', label: '\u6a21\u578b\u7ba1\u7406', desc: '', action: () => { setPage('models'); setOpen(false) } },
      { id: 'providers', label: '\u4f9b\u5e94\u5546\u7ba1\u7406', desc: '', action: () => { setPage('providers'); setOpen(false) } },
      { id: 'files', label: '\u6587\u4ef6\u7ba1\u7406', desc: '', action: () => { setPage('files'); setOpen(false) } },
      { id: 'cron', label: '\u5b9a\u65f6\u4efb\u52a1', desc: '', action: () => { setPage('cron'); setOpen(false) } },
      { id: 'mcp', label: 'MCP \u670d\u52a1\u5668', desc: '', action: () => { setPage('mcp'); setOpen(false) } },
      { id: 'history', label: '\u5386\u53f2\u5bf9\u8bdd', desc: '', action: () => { setPage('history'); setOpen(false) } },
      { id: 'about', label: '\u5173\u4e8e AaronClaw', desc: '', action: () => { setPage('about'); setOpen(false) } },
      { id: 'session-search', label: '\u641c\u7d22\u5386\u53f2\u4f1a\u8bdd', desc: 'Hermes', action: async () => { const r = await api.capSessions(query); if (r.ok) alert(r.data?.slice(0, 500) || '\u65e0\u7ed3\u679c'); setOpen(false) } },
      { id: 'doctor', label: 'Agent \u8bca\u65ad', desc: 'Hermes', action: async () => { const r = await api.capDoctor(); if (r.ok) alert(r.data?.slice(0, 500) || '\u65e0\u95ee\u9898'); setOpen(false) } },
      { id: 'insights', label: '\u5bf9\u8bdd\u5206\u6790', desc: 'Hermes', action: async () => { const r = await api.capInsights(7); if (r.ok) alert(r.data?.slice(0, 500) || '\u65e0\u6570\u636e'); setOpen(false) } },
    ]
    for (const c of conversations) {
      items.push({ id: 'conv-' + c.id, label: c.title || '\u65b0\u5efa\u5bf9\u8bdd', desc: '\u5bf9\u8bdd', action: () => { setCurrentConvId(c.id); api.convMessages(c.id).then(setMessages); setPage('chat'); setOpen(false) } })
    }
    if (!query) return items
    const q = query.toLowerCase()
    return items.filter(i => i.label.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q))
  }, [query, conversations])

  useEffect(() => { setSelected(0) }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, commands.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && commands[selected]) { commands[selected].action() }
  }

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={() => setOpen(false)} style={{ alignItems: 'flex-start', paddingTop: '15vh' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 480, maxWidth: 520 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKeyDown} placeholder="\u8f93\u5165\u547d\u4ee4\u6216\u641c\u7d22..." style={{ width: '100%', border: 'none', outline: 'none', fontSize: 14, fontFamily: 'var(--font)', background: 'transparent', color: 'var(--text)' }} />
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: '4px 0' }}>
          {commands.length === 0 && <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text4)', fontSize: 12 }}>\u65e0\u7ed3\u679c</div>}
          {commands.slice(0, 15).map((c, i) => (
            <div key={c.id} style={{ padding: '8px 16px', cursor: 'pointer', background: i === selected ? 'var(--accent-light)' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={c.action} onMouseEnter={() => setSelected(i)}>
              <span style={{ fontSize: 13 }}>{c.label}</span>
              {c.desc && <span style={{ fontSize: 11, color: 'var(--text4)', fontFamily: 'var(--mono)' }}>{c.desc}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
