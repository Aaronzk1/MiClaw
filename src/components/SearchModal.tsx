import { useState, useRef, useEffect, useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'

interface SearchResult {
  convId: string
  role: string
  content: string
  timestamp: string
  convTitle: string
}

export function SearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const setPage = useAppStore(s => s.setPage)
  const setCurrentConvId = useAppStore(s => s.setCurrentConvId)
  const setMessages = useAppStore(s => s.setMessages)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => { inputRef.current?.focus() }, [])

  const doSearch = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!q.trim()) { setResults([]); return }
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await api.searchMessages(q.trim(), 30)
        setResults(res || [])
      } catch { setResults([]) }
      setLoading(false)
    }, 300)
  }, [])

  const handleResultClick = (r: SearchResult) => {
    setCurrentConvId(r.convId)
    setPage('chat')
    api.convMessages(r.convId).then(setMessages).catch(() => {})
    onClose()
  }

  const highlightMatch = (text: string, q: string) => {
    if (!q.trim()) return text
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx < 0) return text
    const before = text.slice(0, idx)
    const match = text.slice(idx, idx + q.length)
    const after = text.slice(idx + q.length)
    return before + '【' + match + '】' + after
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
        width: 560, maxHeight: '70vh', background: 'var(--bg)', borderRadius: 'var(--radius-xl)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Search input */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--text4)', fontSize: 16 }}>&#128269;</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); doSearch(e.target.value) }}
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
            placeholder="搜索所有对话内容..."
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, background: 'transparent', color: 'var(--text)', fontFamily: 'var(--font)' }}
          />
          {loading && <span style={{ fontSize: 11, color: 'var(--text4)' }}>搜索中...</span>}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text4)', fontSize: 16 }}>X</button>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {results.length === 0 && query.trim() && !loading && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text4)', fontSize: 13 }}>未找到匹配结果</div>
          )}
          {results.map((r, i) => (
            <div
              key={i}
              onClick={() => handleResultClick(r)}
              style={{
                padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border-light, rgba(0,0,0,0.04))',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                  {r.convTitle}
                </span>
                <span style={{
                  fontSize: 9, padding: '1px 5px', borderRadius: 3,
                  background: r.role === 'user' ? 'var(--accent-light)' : 'var(--bg3)',
                  color: r.role === 'user' ? 'var(--accent)' : 'var(--text3)',
                }}>
                  {r.role === 'user' ? '用户' : 'AI'}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text4)', marginLeft: 'auto' }}>
                  {r.timestamp ? new Date(r.timestamp).toLocaleDateString() : ''}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5, maxHeight: 40, overflow: 'hidden' }}>
                {highlightMatch(r.content.slice(0, 150), query)}
              </div>
            </div>
          ))}
          {results.length === 0 && !query.trim() && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text4)', fontSize: 13 }}>
              输入关键词搜索所有对话
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
