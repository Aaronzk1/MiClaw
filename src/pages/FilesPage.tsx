import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '../lib/ipc'

const TEXT_EXTS = /\.(txt|md|json|js|ts|jsx|tsx|py|css|html|xml|yaml|yml|toml|ini|sh|bat|cmd|sql|rb|go|rs|java|c|cpp|h|hpp|log|csv|env|gitignore|dockerfile|makefile)$/i
const IMG_EXTS = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i

const LANG_MAP: Record<string, string> = {
  js: 'JavaScript', ts: 'TypeScript', py: 'Python', json: 'JSON', md: 'Markdown',
  html: 'HTML', css: 'CSS', sh: 'Shell', sql: 'SQL', yaml: 'YAML', yml: 'YAML',
  xml: 'XML', toml: 'TOML', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java',
  c: 'C', cpp: 'C++', h: 'C Header', hpp: 'C++ Header', txt: '文本', log: '日志',
  csv: 'CSV', env: 'ENV', tsx: 'TSX', jsx: 'JSX',
}

function getFileLang(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return LANG_MAP[ext] || ext.toUpperCase() || '文件'
}

function formatSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

function getIcon(name: string, isDir: boolean): string {
  if (isDir) return '📁'
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['js', 'ts', 'jsx', 'tsx'].includes(ext)) return '📜'
  if (['py'].includes(ext)) return '🐍'
  if (['json', 'yaml', 'yml', 'toml', 'ini'].includes(ext)) return '⚙️'
  if (['md', 'txt', 'log'].includes(ext)) return '📝'
  if (['html', 'css'].includes(ext)) return '🌐'
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return '🖼'
  if (['sh', 'bat', 'cmd'].includes(ext)) return '⚡'
  if (['sql', 'db', 'sqlite'].includes(ext)) return '🗄'
  return '📄'
}

export function FilesPage() {
  const [files, setFiles] = useState<any[]>([])
  const [currentDir, setCurrentDir] = useState('')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ content: string; name: string; size: number } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const listRef = useRef<HTMLDivElement>(null)

  const loadDir = useCallback((dir: string) => {
    api.filesList(dir).then((f: any[]) => {
      setFiles(f)
      setCurrentDir(dir)
      setSelectedFile(null)
      setPreview(null)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    // Start from home directory
    api.filesList().then((f: any[]) => {
      setFiles(f)
      if (f.length) {
        const first = f[0]
        const dir = first.isDir ? first.path : first.path.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
        setCurrentDir(dir)
      }
    }).catch(() => {})
  }, [])

  const navigateTo = (dir: string) => {
    setHistory(prev => [...prev, currentDir])
    loadDir(dir)
  }

  const goBack = () => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    loadDir(prev)
  }

  const goUp = () => {
    const normalized = currentDir.replace(/\\/g, '/')
    const parts = normalized.split('/')
    if (parts.length > 1) navigateTo(parts.slice(0, -1).join('/'))
  }

  const handleFileClick = (file: any) => {
    if (file.isDir) {
      navigateTo(file.path)
      return
    }
    setSelectedFile(file.path)
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (IMG_EXTS.test(file.name)) {
      setPreview({ content: `[图片文件] ${file.name}`, name: file.name, size: file.size })
      return
    }
    if (!TEXT_EXTS.test(file.name)) {
      setPreview({ content: `[${getFileLang(file.name)}] 无法预览此文件类型`, name: file.name, size: file.size })
      return
    }
    setPreviewLoading(true)
    api.filesRead(file.path).then((result: any) => {
      if (result.ok) {
        setPreview({ content: result.content, name: file.name, size: result.size })
      } else {
        setPreview({ content: `读取失败: ${result.error}`, name: file.name, size: 0 })
      }
    }).catch(() => {
      setPreview({ content: '读取失败', name: file.name, size: 0 })
    }).finally(() => setPreviewLoading(false))
  }

  const breadcrumbs = currentDir.replace(/\\/g, '/').split('/').filter(Boolean)

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left: file list */}
      <div style={{ width: 320, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* Navigation bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <button className="btn btn-sm btn-ghost" onClick={goBack} disabled={history.length === 0} title="返回">←</button>
          <button className="btn btn-sm btn-ghost" onClick={goUp} title="上级目录">↑</button>
          <div style={{ flex: 1, fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>
            {breadcrumbs.length > 3 ? '.../' + breadcrumbs.slice(-2).join('/') : currentDir}
          </div>
        </div>

        {/* File list */}
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {files.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text4)', fontSize: 12 }}>空目录</div>
          ) : (
            files.map((f, i) => (
              <div key={i} onClick={() => handleFileClick(f)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', cursor: 'pointer',
                background: selectedFile === f.path ? 'var(--accent-light)' : 'transparent',
                borderLeft: selectedFile === f.path ? '2px solid var(--accent)' : '2px solid transparent',
                fontSize: 12.5, transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (selectedFile !== f.path) (e.currentTarget as HTMLElement).style.background = 'var(--bg2)' }}
              onMouseLeave={e => { if (selectedFile !== f.path) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <span style={{ fontSize: 14, width: 18, textAlign: 'center', flexShrink: 0 }}>{getIcon(f.name, f.isDir)}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: f.isDir ? 500 : 400 }}>{f.name}</span>
                {!f.isDir && <span style={{ fontSize: 10, color: 'var(--text4)', flexShrink: 0 }}>{formatSize(f.size)}</span>}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: preview */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!preview ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text4)', fontSize: 13 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
              <div>选择文件预览内容</div>
            </div>
          </div>
        ) : (
          <>
            {/* Preview header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <span style={{ fontSize: 14 }}>{getIcon(preview.name, false)}</span>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.name}</span>
              <span style={{ fontSize: 10, color: 'var(--text4)', padding: '2px 8px', background: 'var(--bg3)', borderRadius: 10 }}>{getFileLang(preview.name)}</span>
              {preview.size > 0 && <span style={{ fontSize: 10, color: 'var(--text4)' }}>{formatSize(preview.size)}</span>}
              <button className="btn btn-sm btn-ghost" onClick={() => { if (selectedFile) api.filesOpen(selectedFile) }} title="用外部程序打开">打开</button>
              <button className="btn btn-sm btn-ghost" onClick={() => { if (preview.content) navigator.clipboard.writeText(preview.content) }} title="复制内容">复制</button>
            </div>

            {/* Preview content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
              {previewLoading ? (
                <div style={{ color: 'var(--text4)', fontSize: 12 }}>加载中...</div>
              ) : IMG_EXTS.test(preview.name) ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <span style={{ fontSize: 13, color: 'var(--text3)' }}>{preview.content}</span>
                </div>
              ) : (
                <pre style={{
                  margin: 0, fontSize: 12.5, lineHeight: 1.65, fontFamily: 'var(--mono)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text)',
                  tabSize: 2,
                }}>{preview.content}</pre>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
