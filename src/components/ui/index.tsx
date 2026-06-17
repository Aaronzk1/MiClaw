import { ReactNode, useState, useEffect, useRef, Component, type ErrorInfo } from 'react'

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const modalRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    modalRef.current?.focus()
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" ref={modalRef} tabIndex={-1} onClick={e => e.stopPropagation()} style={{ outline: 'none' }}>
        <div className="modal-header"><h3>{title}</h3><button className="btn btn-sm btn-ghost" onClick={onClose}>&#10005;</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

export function AlertModal({ title, message, onClose }: { title?: string; message: string; onClose: () => void }) {
  return (
    <Modal title={title || '提示'} onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>确定</button>}>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text2)' }}>{message}</p>
    </Modal>
  )
}

export function ConfirmModal({ title, message, onConfirm, onCancel, danger }: { title?: string; message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean }) {
  return (
    <Modal title={title || '确认'} onClose={onCancel} footer={
      <>
        <button className="btn btn-secondary" onClick={onCancel}>取消</button>
        <button className={'btn ' + (danger ? 'btn-danger' : 'btn-primary')} onClick={onConfirm}>确定</button>
      </>
    }>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text2)' }}>{message}</p>
    </Modal>
  )
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return <button role="switch" aria-checked={value} className={'toggle' + (value ? ' on' : '')} onClick={() => onChange(!value)}></button>
}

export function EmptyState({ title, desc, icon }: { title: string; desc?: string; icon?: string }) {
  return (
    <div className="empty-state">
      {icon && <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.6 }}>{icon}</div>}
      <h3>{title}</h3>
      {desc && <p>{desc}</p>}
    </div>
  )
}

export function Badge({ variant, children }: { variant?: 'green' | 'blue' | 'yellow' | 'red'; children: ReactNode }) {
  return <span className={'badge' + (variant ? ' badge-' + variant : '')}>{children}</span>
}

interface EBState { hasError: boolean; error?: Error }
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, EBState> {
  state: EBState = { hasError: false }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[ErrorBoundary]', error, info.componentStack) }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--error)' }}>
          <h3>{'\u51fa\u9519\u4e86'}</h3>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>{this.state.error?.message}</p>
          <button className="btn btn-sm btn-secondary" onClick={() => this.setState({ hasError: false })} style={{ marginTop: 12 }}>{'\u91cd\u8bd5'}</button>
        </div>
      )
    }
    return this.props.children
  }
}
