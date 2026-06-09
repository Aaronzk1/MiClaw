import { useEffect, useState } from 'react'
import { api } from '../lib/ipc'

export function LogsPage() {
  const [files, setFiles] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [logDir, setLogDir] = useState('')

  useEffect(() => {
    api.logsList?.().then(setFiles).catch(() => {})
    api.logsDir?.().then(setLogDir).catch(() => {})
  }, [])

  const loadLog = async (filename: string) => {
    setSelected(filename)
    const text = await api.logsRead?.(filename) || ''
    setContent(text)
  }

  const openLogDir = () => { if (logDir) api.filesOpen?.(logDir) }

  return (
    <div className="page" id="page-logs">
      <div style={{ display: 'flex', height: '100%' }}>
        <div style={{ width: 240, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
          <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600 }}>日志文件</h3>
            <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 4, wordBreak: 'break-all' }}>{logDir}</div>
            <button className="btn btn-sm btn-secondary" onClick={openLogDir} style={{ marginTop: 8, width: '100%' }}>打开目录</button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '4px 8px' }}>
            {files.map(f => (
              <div key={f} className={'conv-item' + (selected === f ? ' active' : '')} onClick={() => loadLog(f)}>
                <span className="title" style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>{f}</span>
              </div>
            ))}
            {files.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text4)', fontSize: 12 }}>无日志文件</div>}
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {selected ? (
            <>
              <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{selected}</span>
                <button className="btn btn-sm btn-ghost" onClick={() => loadLog(selected)}>&#8634; 刷新</button>
              </div>
              <pre style={{ flex: 1, margin: 0, padding: 16, fontSize: 11.5, lineHeight: 1.6, fontFamily: 'var(--mono)', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {content || '无内容'}
              </pre>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="empty-state"><h3>选择日志文件</h3><p>在左侧选择一个日志文件查看</p></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}