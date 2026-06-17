import { useState, useEffect, useCallback } from 'react'

interface ToastItem { id: number; message: string; type: 'info' | 'success' | 'error' | 'warning' }

let nextId = 0
const listeners = new Set<(t: ToastItem) => void>()

export function toast(message: string, type: ToastItem['type'] = 'info') {
  const item: ToastItem = { id: ++nextId, message, type }
  listeners.forEach(fn => fn(item))
}

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([])

  const add = useCallback((t: ToastItem) => {
    setItems(prev => [...prev, t])
    setTimeout(() => setItems(prev => prev.filter(x => x.id !== t.id)), 3000)
  }, [])

  useEffect(() => {
    listeners.add(add)
    return () => { listeners.delete(add) }
  }, [add])

  if (items.length === 0) return null

  const colors: Record<ToastItem['type'], { bg: string; border: string; text: string }> = {
    info: { bg: 'var(--accent-light)', border: 'var(--accent)', text: 'var(--accent)' },
    success: { bg: 'var(--success-light)', border: 'var(--success)', text: 'var(--success)' },
    error: { bg: 'var(--error-light)', border: 'var(--error)', text: 'var(--error)' },
    warning: { bg: 'var(--warning-light)', border: 'var(--warning)', text: 'var(--warning)' },
  }

  const icons: Record<ToastItem['type'], string> = {
    info: 'i', success: '✓', error: '✗', warning: '!',
  }

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {items.map(t => {
        const c = colors[t.type]
        return (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 16px', borderRadius: 10,
            background: c.bg, border: `1px solid ${c.border}`, color: c.text,
            fontSize: 13, fontWeight: 500, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            animation: 'toastIn 0.25s ease', pointerEvents: 'auto',
            maxWidth: 360, wordBreak: 'break-word',
          }}>
            <span style={{ fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{icons[t.type]}</span>
            <span>{t.message}</span>
          </div>
        )
      })}
    </div>
  )
}
