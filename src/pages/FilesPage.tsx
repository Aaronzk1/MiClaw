import { useEffect, useState, useMemo } from 'react'
import { api } from '../lib/ipc'

export function FilesPage() {
  const [files, setFiles] = useState<any[]>([])
  const [currentDir, setCurrentDir] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => { api.filesList().then((f: any[]) => { setFiles(f); if (f.length) setCurrentDir(f[0].path.replace(/\\/g, '/').split('/').slice(0, -1).join('/')) }).catch(() => {}) }, [])

  const loadDir = (dir: string) => {
    api.filesList(dir).then((f: any[]) => { setFiles(f); setCurrentDir(dir) }).catch(() => {})
  }

  const goUp = () => {
    const parts = currentDir.split('/')
    if (parts.length > 1) loadDir(parts.slice(0, -1).join('/'))
  }

  const getType = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || ''
    if (['js','ts','py','java','cpp','c','go','rs','rb','php','swift','kt'].includes(ext)) return 'code'
    if (['md','txt','doc','docx','pdf','rtf'].includes(ext)) return 'docs'
    if (['png','jpg','jpeg','gif','svg','webp','bmp','ico'].includes(ext)) return 'image'
    if (['json','csv','xml','yaml','yml','toml','ini','sql'].includes(ext)) return 'data'
    return 'other'
  }

  const typeIcon = (name: string, isDir: boolean) => {
    if (isDir) return '\ud83d\udcc1'
    const t = getType(name)
    if (t === 'code') return '\ud83d\udcdc'
    if (t === 'image') return '\ud83d\uddbc'
    if (t === 'docs') return '\ud83d\udcc4'
    return '\ud83d\udcc6'
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return files
    return files.filter(f => f.isDir || getType(f.name) === filter)
  }, [files, filter])

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1048576).toFixed(1) + ' MB'
  }

  return (
    <div className="page" id="page-files">
      <div className="pg">
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{'\u6587\u4ef6\u7ba1\u7406'}</h2>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, fontSize: 12, color: 'var(--text3)', alignItems: 'center' }}>
          <button className="btn btn-sm btn-ghost" onClick={goUp}>{'\u2191 \u4e0a\u7ea7'}</button>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{currentDir || '/'}</span>
        </div>
        <div className="gc-tabs" style={{ marginBottom: 12 }}>
          {[['all', '\u5168\u90e8'], ['code', '\u4ee3\u7801'], ['docs', '\u6587\u6863'], ['image', '\u56fe\u7247'], ['data', '\u6570\u636e']].map(([k, v]) => (
            <button key={k} className={'gc-tab' + (filter === k ? ' active' : '')} onClick={() => setFilter(k)}>{v}</button>
          ))}
        </div>
        {filtered.length === 0 && <div className="empty-state"><h3>{'\u7a7a\u76ee\u5f55'}</h3></div>}
        {filtered.map((f, i) => (
          <div key={i} className="card" style={{ marginBottom: 4, padding: '10px 14px', cursor: 'pointer' }} onClick={() => f.isDir ? loadDir(f.path) : api.filesOpen(f.path)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{f.isDir ? '\ud83d\udcc1' : '\ud83d\udcc4'}</span>
              <span style={{ flex: 1, fontSize: 12.5 }}>{f.name}</span>
              <span className="badge badge-gray" style={{ fontSize: 10 }}>{f.isDir ? '\u6587\u4ef6\u5939' : getType(f.name)}</span>
              <span style={{ fontSize: 11, color: 'var(--text4)', minWidth: 60, textAlign: 'right' }}>{f.isDir ? '' : formatSize(f.size)}</span>
              <span style={{ fontSize: 11, color: 'var(--text4)' }}>{f.modified ? new Date(f.modified).toLocaleDateString('zh-CN') : ''}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
