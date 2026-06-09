import { ReactNode, useState, useEffect, useRef } from 'react'

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>{title}</h3><button className="btn btn-sm btn-ghost" onClick={onClose}>&#10005;</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return <div className={'toggle' + (value ? ' on' : '')} onClick={() => onChange(!value)}></div>
}

export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input type="text" placeholder={placeholder || '\u641c\u7d22...'} value={value} onChange={e => onChange(e.target.value)} />
}

export function EmptyState({ title, desc }: { title: string; desc?: string }) {
  return <div className="empty-state"><h3>{title}</h3>{desc && <p>{desc}</p>}</div>
}

export function Badge({ variant, children }: { variant?: 'green' | 'blue' | 'yellow' | 'red'; children: ReactNode }) {
  return <span className={'badge' + (variant ? ' badge-' + variant : '')}>{children}</span>
}

export function ErrorBoundary({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const [error, setError] = useState<Error | null>(null)
  useEffect(() => {
    const handler = (e: ErrorEvent) => { setError(new Error(e.message)); e.preventDefault() }
    window.addEventListener('error', handler)
    return () => window.removeEventListener('error', handler)
  }, [])
  if (error) return <>{fallback || <div style={{ padding: 20, textAlign: 'center', color: 'var(--error)' }}><h3>\u51fa\u9519\u4e86</h3><p style={{ fontSize: 12, color: 'var(--text3)' }}>{error.message}</p><button className="btn btn-sm btn-secondary" onClick={() => setError(null)} style={{ marginTop: 8 }}>\u91cd\u8bd5</button></div>}</>
  return <>{children}</>
}
