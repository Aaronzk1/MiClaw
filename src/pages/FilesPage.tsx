import { useEffect, useState, useMemo } from 'react'
import { api } from '../lib/ipc'

const FILE_CATEGORIES: Record<string, { label: string; icon: string; exts: RegExp }> = {
  image: { label: '图片', icon: '🖼', exts: /\.(png|jpe?g|svg|gif|webp|bmp|ico)$/i },
  code: { label: '代码', icon: '📄', exts: /\.(py|js|ts|jsx|tsx|html|css|json|yaml|yml|toml|xml|sh|bat|cmd|sql|cpp|c|h|java|go|rs|rb|php)$/i },
  data: { label: '数据', icon: '📊', exts: /\.(csv|xlsx|xls|parquet|db|sqlite|tsv)$/i },
  docs: { label: '文档', icon: '📝', exts: /\.(txt|md|pdf|doc|docx|rtf|log)$/i },
}

function categorizeFile(name: string): string {
  for (const [cat, def] of Object.entries(FILE_CATEGORIES)) {
    if (def.exts.test(name)) return cat
  }
  return 'other'
}

export function FilesPage() {
  const [generatedFiles, setGeneratedFiles] = useState<any[]>([])
  const [files, setFiles] = useState<any[]>([])
  const [currentDir, setCurrentDir] = useState('')
  const [filter, setFilter] = useState('all')
  const [view, setView] = useState<'generated' | 'browse'>('generated')
  const [genFilter, setGenFilter] = useState('all')

  useEffect(() => {
    api.filesList().then((f: any[]) => {
      setFiles(f)
      if (f.length) {
        const first = f[0]
        setCurrentDir(first.isDir ? first.path : first.path.replace(/\\/g, '/').split('/').slice(0, -1).join('/'))
      }
    }).catch(() => {})
    api.generatedFilesList?.().then(setGeneratedFiles).catch(() => {})
  }, [])

  const loadDir = (dir: string) => {
    const normalized = dir.replace(/\\/g, '/')
    api.filesList(dir).then((f: any[]) => { setFiles(f); setCurrentDir(normalized) }).catch(() => {})
  }

  const goUp = () => {
    const normalized = currentDir.replace(/\\/g, '/')
    const parts = normalized.split('/')
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

  const filtered = useMemo(() => {
    if (filter === 'all') return files
    return files.filter(f => f.isDir || getType(f.name) === filter)
  }, [files, filter])

  const categorizedFiles = useMemo(() => {
    if (genFilter === 'all') return generatedFiles
    return generatedFiles.filter((f: any) => categorizeFile(f.name) === genFilter)
  }, [generatedFiles, genFilter])

  const fileCounts = useMemo(() => {
    const counts: Record<string, number> = { all: generatedFiles.length }
    for (const cat of Object.keys(FILE_CATEGORIES)) {
      counts[cat] = generatedFiles.filter((f: any) => categorizeFile(f.name) === cat).length
    }
    return counts
  }, [generatedFiles])

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1048576).toFixed(1) + ' MB'
  }

  return (
    <div className="page" id="page-files">
      <div className="pg">
        {/* View toggle */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          <button onClick={() => setView('generated')} style={{
            padding: '6px 16px', borderRadius: 20, fontSize: 13, cursor: 'pointer', fontWeight: view === 'generated' ? 600 : 400,
            border: view === 'generated' ? '1px solid var(--accent)' : '1px solid var(--border)',
            background: view === 'generated' ? 'var(--accent-light)' : 'transparent',
            color: view === 'generated' ? 'var(--accent)' : 'var(--text3)',
          }}>
            📁 生成文件{generatedFiles.length > 0 && <span style={{ fontSize: 11, marginLeft: 4 }}>({generatedFiles.length})</span>}
          </button>
          <button onClick={() => setView('browse')} style={{
            padding: '6px 16px', borderRadius: 20, fontSize: 13, cursor: 'pointer', fontWeight: view === 'browse' ? 600 : 400,
            border: view === 'browse' ? '1px solid var(--accent)' : '1px solid var(--border)',
            background: view === 'browse' ? 'var(--accent-light)' : 'transparent',
            color: view === 'browse' ? 'var(--accent)' : 'var(--text3)',
          }}>
            🗂 文件浏览
          </button>
        </div>

        {view === 'generated' ? (
          <>
            {/* Category filter */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
              {[{ id: 'all', label: '全部', icon: '📂' }, ...Object.entries(FILE_CATEGORIES).map(([id, v]) => ({ id, label: v.label, icon: v.icon }))].map(cat => (
                <button key={cat.id} onClick={() => setGenFilter(cat.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                  border: genFilter === cat.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: genFilter === cat.id ? 'var(--accent-light)' : 'transparent',
                  color: genFilter === cat.id ? 'var(--accent)' : 'var(--text3)',
                  fontWeight: genFilter === cat.id ? 600 : 400,
                }}>
                  {cat.icon} {cat.label}
                  {(fileCounts[cat.id] || 0) > 0 && <span style={{ fontSize: 10, opacity: 0.7 }}>({fileCounts[cat.id]})</span>}
                </button>
              ))}
            </div>

            {/* Generated file list */}
            {categorizedFiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text4)', fontSize: 13 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
                {generatedFiles.length === 0 ? '暂无生成文件' : '该分类下暂无文件'}
                <div style={{ fontSize: 12, marginTop: 8, color: 'var(--text4)' }}>对话中 AI 产生的文件会自动出现在这里</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {categorizedFiles.map((f: any, i: number) => {
                  const cat = categorizeFile(f.name)
                  const catDef = FILE_CATEGORIES[cat] || { icon: '📎', label: '其他' }
                  return (
                    <div key={i} onClick={() => api.filesOpen(f.path).catch(() => {})} className="card" style={{
                      padding: '10px 14px', cursor: 'pointer', marginBottom: 0,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 18, width: 24, textAlign: 'center', flexShrink: 0 }}>{catDef.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text4)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path}</div>
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text4)', padding: '2px 8px', background: 'var(--bg3)', borderRadius: 10, flexShrink: 0 }}>{catDef.label}</span>
                        {f.size > 0 && <span style={{ fontSize: 11, color: 'var(--text4)', flexShrink: 0, minWidth: 50, textAlign: 'right' }}>{formatSize(f.size)}</span>}
                        <span style={{ fontSize: 11, color: 'var(--text4)', flexShrink: 0 }}>{f.time ? new Date(f.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Directory browser */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, fontSize: 12, color: 'var(--text3)', alignItems: 'center' }}>
              <button className="btn btn-sm btn-ghost" onClick={goUp}>↑ 上级</button>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{currentDir || '/'}</span>
            </div>
            <div className="gc-tabs" style={{ marginBottom: 12 }}>
              {[['all', '全部'], ['code', '代码'], ['docs', '文档'], ['image', '图片'], ['data', '数据']].map(([k, v]) => (
                <button key={k} className={'gc-tab' + (filter === k ? ' active' : '')} onClick={() => setFilter(k)}>{v}</button>
              ))}
            </div>
            {filtered.length === 0 && <div className="empty-state"><h3>空目录</h3></div>}
            {filtered.map((f, i) => (
              <div key={i} className="card" style={{ marginBottom: 4, padding: '10px 14px', cursor: 'pointer' }} onClick={() => f.isDir ? loadDir(f.path) : api.filesOpen(f.path).catch(() => {})}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{f.isDir ? '📁' : '📄'}</span>
                  <span style={{ flex: 1, fontSize: 12.5 }}>{f.name}</span>
                  <span className="badge badge-gray" style={{ fontSize: 10 }}>{f.isDir ? '文件夹' : getType(f.name)}</span>
                  <span style={{ fontSize: 11, color: 'var(--text4)', minWidth: 60, textAlign: 'right' }}>{f.isDir ? '' : formatSize(f.size)}</span>
                  <span style={{ fontSize: 11, color: 'var(--text4)' }}>{f.modified ? new Date(f.modified).toLocaleDateString('zh-CN') : ''}</span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
