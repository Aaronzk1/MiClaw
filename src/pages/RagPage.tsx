import { useEffect, useState } from 'react'
import { api } from '../lib/ipc'

export function RagPage() {
  const [docs, setDocs] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [importing, setImporting] = useState(false)
  const [searching, setSearching] = useState(false)

  useEffect(() => { api.ragList?.().then(setDocs).catch(() => {}) }, [])

  const handleImport = () => {
    const el = document.createElement('input')
    el.type = 'file'
    el.accept = '.txt,.md,.json,.csv,.py,.js,.ts,.html,.css'
    el.multiple = true
    el.onchange = async () => {
      if (!el.files?.length) return
      setImporting(true)
      for (const file of Array.from(el.files)) {
        const r = await api.ragImport?.((file as any).path)
        if (r?.ok) {
          const list = await api.ragList?.()
          if (list) setDocs(list)
        }
      }
      setImporting(false)
    }
    el.click()
  }

  const handleDelete = async (id: string) => {
    await api.ragDelete?.(id)
    setDocs(docs.filter(d => d.id !== id))
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    const results = await api.ragSearch?.(searchQuery, 5) || []
    setSearchResults(results)
    setSearching(false)
  }

  return (
    <div className="page" id="page-rag">
      <div className="pg" style={{ maxWidth: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{'知识库 (RAG)'}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="badge badge-blue">{docs.length} documents</span>
            <button className="btn btn-primary btn-sm" onClick={handleImport} disabled={importing}>
              {importing ? '导入中...' : '+ 导入文档'}
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input type="text" placeholder="语义搜索知识库..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
            style={{ flex: 1 }} />
          <button className="btn btn-secondary btn-sm" onClick={handleSearch} disabled={searching}>
            {searching ? '搜索中...' : '搜索'}
          </button>
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>搜索结果 ({searchResults.length})</h4>
            {searchResults.map((r, i) => (
              <div key={i} className="card" style={{ marginBottom: 6, padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className="badge badge-green">{(r.score * 100).toFixed(0)}%</span>
                  <span style={{ fontSize: 10, color: 'var(--text4)' }}>{r.docId}</span>
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>
                  {r.text.slice(0, 300)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Document list */}
        {docs.length === 0 && (
          <div className="empty-state">
            <h3>知识库为空</h3>
            <p>导入文档后，AI可以在对话中自动检索相关知识</p>
          </div>
        )}
        <div className="dash-grid">
          {docs.map(d => (
            <div key={d.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div className="card-title">{d.filename}</div>
                  <div className="card-sub">{d.chunkCount} chunks</div>
                </div>
                <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(d.id)} style={{ color: 'var(--error)' }}>
                  {'删除'}
                </button>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text4)' }}>
                {d.createdAt ? new Date(d.createdAt).toLocaleDateString('zh-CN') : ''}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}