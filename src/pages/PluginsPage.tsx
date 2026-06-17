import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/ipc'

interface PluginMeta {
  id: string
  slug?: string
  name: string
  description?: string
  version?: string
  author?: string
  authorAvatar?: string
  installed: boolean
  source?: string
  homepage?: string
}

type Tab = 'installed' | 'marketplace' | 'search'

export function PluginsPage() {
  const [installed, setInstalled] = useState<PluginMeta[]>([])
  const [available, setAvailable] = useState<PluginMeta[]>([])
  const [searchResults, setSearchResults] = useState<PluginMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [filter, setFilter] = useState('')
  const [tab, setTab] = useState<Tab>('marketplace')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailReadme, setDetailReadme] = useState('')
  const [installing, setInstalling] = useState<Set<string>>(new Set())
  const [uninstalling, setUninstalling] = useState<Set<string>>(new Set())

  const loadPlugins = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.pluginsList()
      setInstalled(data.installed || [])
      setAvailable(data.available || [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadPlugins() }, [loadPlugins])

  const handleSearch = async (query: string) => {
    setFilter(query)
    if (query.trim().length < 2) { setSearching(false); return }
    if (tab !== 'search') setTab('search')
    setSearching(true)
    try {
      const results = await api.pluginsSearch(query.trim())
      setSearchResults(results)
    } catch { setSearchResults([]) }
    setSearching(false)
  }

  const handleInstall = async (id: string, source?: string) => {
    setInstalling(prev => new Set(prev).add(id))
    try {
      const r = await api.pluginsInstall(id, source)
      if (r.ok) await loadPlugins()
    } catch {}
    setInstalling(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  const handleUninstall = async (id: string) => {
    setUninstalling(prev => new Set(prev).add(id))
    try {
      const r = await api.pluginsUninstall(id)
      if (r.ok) await loadPlugins()
    } catch {}
    setUninstalling(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  const showDetail = async (id: string) => {
    setDetailId(id)
    setDetailReadme('加载中...')
    try {
      const d = await api.pluginsDetails(id)
      setDetailReadme(d?.readme || '暂无详细信息')
    } catch { setDetailReadme('加载失败') }
  }

  const openDir = () => { api.pluginsOpenDir() }

  const installedIds = new Set(installed.map(p => p.id))
  const list = tab === 'installed' ? installed : tab === 'marketplace' ? available : searchResults
  const filtered = tab === 'search' ? list : (filter ? list.filter(p =>
    p.name.toLowerCase().includes(filter.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(filter.toLowerCase())
  ) : list)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '20px 24px', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>插件市场</h2>
          <p style={{ fontSize: 12, color: 'var(--text4)', margin: '4px 0 0' }}>
            {installed.length} 个已安装 · {available.length} 个可用
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-secondary" onClick={loadPlugins}>刷新</button>
          <button className="btn btn-sm btn-secondary" onClick={openDir}>打开目录</button>
        </div>
      </div>

      {/* Tabs + Search */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={'btn btn-sm' + (tab === 'marketplace' ? ' btn-primary' : ' btn-ghost')} onClick={() => { setTab('marketplace'); setFilter('') }}>
            技能市场 ({available.length})
          </button>
          <button className={'btn btn-sm' + (tab === 'installed' ? ' btn-primary' : ' btn-ghost')} onClick={() => { setTab('installed'); setFilter('') }}>
            已安装 ({installed.length})
          </button>
          <button className={'btn btn-sm' + (tab === 'search' ? ' btn-primary' : ' btn-ghost')} onClick={() => setTab('search')}>
            搜索
          </button>
        </div>
        <input
          type="text"
          placeholder={tab === 'search' ? '搜索技能和插件...' : '过滤...'}
          value={filter}
          onChange={e => {
            if (tab === 'search') handleSearch(e.target.value)
            else setFilter(e.target.value)
          }}
          style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, outline: 'none' }}
        />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>加载中...</div>
        ) : tab === 'search' && searching ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>搜索中...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
            {tab === 'installed' ? '暂无已安装插件' : tab === 'search' ? (filter.length < 2 ? '输入关键词搜索技能和插件' : '未找到匹配结果') : '暂无可用技能'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {filtered.map(p => {
              const isInstalling = installing.has(p.id)
              const isUninstalling = uninstalling.has(p.id)
              const isInstalled = p.installed || installedIds.has(p.id)
              return (
                <div
                  key={p.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)', padding: '14px 16px',
                    background: 'var(--bg)', transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    {p.authorAvatar ? (
                      <img src={p.authorAvatar} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />
                    ) : (
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>
                        {(p.name || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }} onClick={() => showDetail(p.id)}>{p.name}</span>
                        {p.version && <span style={{ fontSize: 10, color: 'var(--text4)', fontFamily: 'var(--mono)' }}>v{p.version}</span>}
                      </div>
                      {p.author && <div style={{ fontSize: 11, color: 'var(--text4)' }}>by {p.author}</div>}
                    </div>
                    {p.source === 'clawhub' && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>ClawHub</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5, minHeight: 36, marginBottom: 10 }}>
                    {p.description || '无描述'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    {isInstalled ? (
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={isUninstalling}
                        onClick={() => handleUninstall(p.id)}
                        style={{ fontSize: 11, color: 'var(--error)' }}
                      >{isUninstalling ? '卸载中...' : '卸载'}</button>
                    ) : (
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={isInstalling}
                        onClick={() => handleInstall(p.id, p.source)}
                        style={{ fontSize: 11 }}
                      >{isInstalling ? '安装中...' : '安装'}</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detailId && (
        <div className="modal-overlay" onClick={() => setDetailId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 500, maxWidth: 600, maxHeight: '70vh' }}>
            <div className="modal-header">
              <h3>{detailId}</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setDetailId(null)}>✕</button>
            </div>
            <div className="modal-body">
              <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.7, color: 'var(--text2)', maxHeight: 400, overflowY: 'auto' }}>
                {detailReadme}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
