import { useState, useEffect } from 'react'
import { api } from '../lib/ipc'

interface ClipboardPanelProps {
  onSelect: (text: string) => void
  onClose: () => void
}

export function ClipboardPanel({ onSelect, onClose }: ClipboardPanelProps) {
  const [items, setItems] = useState<Array<{ text: string; timestamp: number }>>([])
  const [filter, setFilter] = useState('')

  useEffect(() => {
    api.clipboardHistory?.().then(setItems).catch(() => {})
  }, [])

  const filtered = filter
    ? items.filter(i => i.text.toLowerCase().includes(filter.toLowerCase()))
    : items

  const handleSelect = async (text: string) => {
    await api.clipboardPick?.(text)
    onSelect(text)
    onClose()
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{
      position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
      width: 380, maxHeight: 350, background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 100,
    }}>
      {/* Header */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="搜索剪贴板..."
          autoFocus
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, background: 'transparent', color: 'var(--text)', fontFamily: 'var(--font)' }}
        />
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text4)', fontSize: 14 }}>X</button>
      </div>

      {/* Items */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text4)', fontSize: 12 }}>
            {items.length === 0 ? '剪贴板历史为空' : '无匹配结果'}
          </div>
        ) : (
          filtered.map((item, i) => (
            <div
              key={i}
              onClick={() => handleSelect(item.text)}
              style={{
                padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-light, rgba(0,0,0,0.04))',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ fontSize: 11, color: 'var(--text4)', marginBottom: 2 }}>{formatTime(item.timestamp)}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4, maxHeight: 36, overflow: 'hidden', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {item.text.slice(0, 120)}{item.text.length > 120 ? '...' : ''}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={async () => { await api.clipboardClear?.(); setItems([]) }} style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--text4)', cursor: 'pointer' }}>清空历史</button>
        </div>
      )}
    </div>
  )
}
