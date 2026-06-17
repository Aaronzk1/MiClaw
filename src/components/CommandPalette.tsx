import { useState, useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [result, setResult] = useState<string | null>(null)
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
      { id: 'agents', label: 'Agent \u7ba1\u7406', desc: '', action: () => { setPage('agents'); setOpen(false) } },
      { id: 'files', label: '\u6587\u4ef6\u7ba1\u7406', desc: '', action: () => { setPage('files'); setOpen(false) } },
      { id: 'search', label: '\u5168\u5c40\u641c\u7d22', desc: 'Ctrl+Shift+F', action: () => { window.dispatchEvent(new CustomEvent('open-search')); setOpen(false) } },
      { id: 'plugins', label: '\u63d2\u4ef6\u5e02\u573a', desc: '', action: () => { setPage('plugins'); setOpen(false) } },
      { id: 'tokenStats', label: 'Token \u7ecf\u6d4e\u5206\u6790', desc: '', action: () => { setPage('tokenStats'); setOpen(false) } },
      { id: 'gateway', label: 'Gateway \u76d1\u63a7', desc: '', action: () => { setPage('gateway'); setOpen(false) } },
      { id: 'analytics', label: '\u6d3b\u8dc3\u5ea6\u5206\u6790', desc: '', action: () => { setPage('analytics'); setOpen(false) } },
      { id: 'tree', label: '\u5bf9\u8bdd\u5173\u7cfb\u56fe', desc: '', action: () => { setPage('tree'); setOpen(false) } },
    ]
    for (const c of conversations) {
      items.push({ id: 'conv-' + c.id, label: c.title || '\u65b0\u5efa\u5bf9\u8bdd', desc: '\u5bf9\u8bdd', action: () => { setCurrentConvId(c.id); api.convMessages(c.id).then(setMessages).catch(() => {}); setPage('chat'); setOpen(false) } })
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

  if (!open && !result) return null
  if (result) return (
    <div className="modal-overlay" onClick={() => setResult(null)}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 500, maxHeight: '70vh' }}>
        <div className="modal-header"><h3>{'结果'}</h3><button className="btn btn-sm btn-ghost" onClick={() => setResult(null)}>{'✕'}</button></div>
        <div className="modal-body"><pre style={{ fontSize: 12, fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--text2)' }}>{result}</pre></div>
      </div>
    </div>
  )
  if (!open) return null

  return (
    <div className="modal-overlay" onClick={() => setOpen(false)} style={{ alignItems: 'flex-start', paddingTop: '15vh' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 480, maxWidth: 520 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKeyDown} placeholder="\u8f93\u5165\u547d\u4ee4\u6216\u641c\u7d22..." style={{ width: '100%', border: 'none', outline: 'none', fontSize: 14, fontFamily: 'var(--font)', background: 'transparent', color: 'var(--text)' }} />
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: '4px 0' }}>
          {commands.length === 0 && <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text4)', fontSize: 12 }}>无结果</div>}
          {commands.slice(0, 15).map((c, i) => (
            <div key={c.id} style={{ padding: '8px 16px', cursor: 'pointer', background: i === selected ? 'var(--accent-light)' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={c.action} onMouseEnter={() => setSelected(i)}>
              <span style={{ fontSize: 13 }}>{c.label}</span>
              {c.desc && <span style={{ fontSize: 11, color: 'var(--text4)', fontFamily: 'var(--mono)' }}>{c.desc}</span>}
            </div>
          ))}
        </div>
        <div style={{ padding: '6px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 16, fontSize: 10, color: 'var(--text4)' }}>
          <span>↑↓ 导航</span>
          <span>Enter 选择</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  )
}
