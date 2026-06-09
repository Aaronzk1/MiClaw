import { useEffect, useState, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'

export function ContextPage() {
  const { currentConvId } = useAppStore()
  const [messages, setMessages] = useState<any[]>([])
  const [config, setConfig] = useState<any>({})
  const [tab, setTab] = useState('timeline')

  useEffect(() => {
    if (currentConvId) api.convMessages(currentConvId).then(setMessages).catch(() => {})
    api.getConfig().then(setConfig).catch(() => {})
  }, [currentConvId])

  const stats = useMemo(() => {
    const total = messages.reduce((s, m) => s + (m.tokens || Math.ceil((m.content || '').length / 4)), 0)
    const userT = messages.filter(m => m.role === 'user').reduce((s, m) => s + (m.tokens || Math.ceil((m.content || '').length / 4)), 0)
    const asstT = messages.filter(m => m.role === 'assistant').reduce((s, m) => s + (m.tokens || Math.ceil((m.content || '').length / 4)), 0)
    const sysT = messages.filter(m => m.role === 'system').reduce((s, m) => s + (m.tokens || Math.ceil((m.content || '').length / 4)), 0)
    const max = config.ai?.maxTokens || 4096
    return { total, userT, asstT, sysT, max, pct: Math.round((total / max) * 100) }
  }, [messages, config])

  const handlePin = (idx: number) => {
    const m = messages[idx]
    if (m) {
      m.pinned = !m.pinned
      setMessages([...messages])
      // Persist pin via IPC if msgPin exists
      if (m.id) api.settingsSet('pin_' + m.id, m.pinned ? '1' : '0').catch(() => {})
    }
  }

  if (!currentConvId) return (
    <div className="page" id="page-context">
      <div className="pg">
        <div className="empty-state"><h3>{'\u8bf7\u5148\u9009\u62e9\u5bf9\u8bdd'}</h3><p>{'\u5728\u5de6\u4fa7\u9009\u62e9\u4e00\u4e2a\u5bf9\u8bdd\u6765\u67e5\u770b\u4e0a\u4e0b\u6587'}</p></div>
      </div>
    </div>
  )

  return (
    <div className="page" id="page-context">
      <div className="pg" style={{ maxWidth: 'none' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{'\u4e0a\u4e0b\u6587\u7ba1\u7406'}</h2>
        <div className="gc-tabs" style={{ marginBottom: 16 }}>
          <button className={'gc-tab' + (tab === 'timeline' ? ' active' : '')} onClick={() => setTab('timeline')}>{'\u65f6\u95f4\u7ebf'}</button>
          <button className={'gc-tab' + (tab === 'stats' ? ' active' : '')} onClick={() => setTab('stats')}>{'\u7edf\u8ba1'}</button>
          <button className={'gc-tab' + (tab === 'compress' ? ' active' : '')} onClick={() => setTab('compress')}>{'\u538b\u7f29'}</button>
        </div>

        {tab === 'stats' && (
          <div className="dash-grid" style={{ marginBottom: 16 }}>
            <div className="dash-card">
              <div className="big-num">{stats.pct}%</div>
              <div className="sub-label">{'\u4e0a\u4e0b\u6587\u7528\u91cf'}</div>
              <div className="ctx-bar" style={{ marginTop: 8 }}>
                <div className="ctx-seg" style={{ width: Math.round(stats.sysT / stats.max * 100) + '%', background: 'var(--accent)' }}></div>
                <div className="ctx-seg" style={{ width: Math.round(stats.userT / stats.max * 100) + '%', background: 'var(--success)' }}></div>
                <div className="ctx-seg" style={{ width: Math.round(stats.asstT / stats.max * 100) + '%', background: 'var(--warning)' }}></div>
              </div>
            </div>
            <div className="dash-card">
              <div className="kv-row"><span className="k">System</span><span className="v">{stats.sysT} tokens</span></div>
              <div className="kv-row"><span className="k">{'\u7528\u6237'}</span><span className="v">{stats.userT} tokens</span></div>
              <div className="kv-row"><span className="k">{'\u52a9\u624b'}</span><span className="v">{stats.asstT} tokens</span></div>
              <div className="kv-row"><span className="k">{'\u603b\u8ba1'} / {'\u4e0a\u9650'}</span><span className="v">{stats.total} / {stats.max}</span></div>
            </div>
            <div className="dash-card">
              <div className="kv-row"><span className="k">{'\u6d88\u606f\u6570'}</span><span className="v">{messages.length}</span></div>
              <div className="kv-row"><span className="k">{'\u5bf9\u8bddID'}</span><span className="v" style={{ fontSize: 10 }}>{currentConvId?.slice(0, 12)}...</span></div>
              <div className="kv-row"><span className="k">{'\u6a21\u578b'}</span><span className="v">{config.ai?.model || 'openclaw'}</span></div>
            </div>
          </div>
        )}

        {tab === 'compress' && (
          <div className="dash-card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>{'\u4e0a\u4e0b\u6587\u538b\u7f29'}</div>
            <div className="kv-row"><span className="k">{'\u7a97\u53e3\u4e0a\u9650'}</span><span className="v">{stats.max} tokens</span></div>
            <div className="kv-row"><span className="k">{'\u89e6\u53d1\u9608\u503c'}</span><span className="v">{config.context?.threshold || 80}%</span></div>
            <div className="kv-row"><span className="k">{'\u76ee\u6807\u538b\u7f29\u7387'}</span><span className="v">{config.context?.targetRatio || 50}%</span></div>
            <div className="kv-row"><span className="k">{'\u7b56\u7565'}</span><span className="v">{config.context?.strategy || '\u6ed1\u52a8\u7a97\u53e3'}</span></div>
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={() => {
                const strategy = config.context?.strategy || 'sliding'
                const threshold = config.context?.threshold || 80
                if (stats.pct < threshold) { alert('\u5f53\u524d\u7528\u91cf ' + stats.pct + '% \u672a\u8fbe\u9608\u503c ' + threshold + '%'); return }
                if (strategy === 'sliding') {
                  const keepCount = Math.floor(messages.length * (config.context?.targetRatio || 50) / 100)
                  const kept = messages.slice(-keepCount)
                  setMessages(kept)
                  alert('\u6ed1\u52a8\u7a97\u53e3\u538b\u7f29\u5b8c\u6210\uff0c\u4fdd\u7559\u6700\u8fd1 ' + keepCount + ' \u6761\u6d88\u606f')
                } else {
                  alert('\u6458\u8981\u538b\u7f29\u9700\u8981 AI \u670d\u52a1\u652f\u6301\uff0c\u5f53\u524d\u4f7f\u7528\u6ed1\u52a8\u7a97\u53e3\u7b56\u7565')
                }
              }}>{'\u6267\u884c\u538b\u7f29'}</button>
              <span style={{ fontSize: 11, color: 'var(--text4)', marginLeft: 8 }}>{'\u5f53\u524d'}: {stats.pct}% | {'\u9608\u503c'}: {config.context?.threshold || 80}%</span>
            </div>
          </div>
        )}

        {tab === 'timeline' && (
          <>
            <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--text3)' }}>{'\u6d88\u606f\u65f6\u95f4\u7ebf'} ({messages.length} {'\u6761'})</div>
            {messages.map((m, i) => (
              <div key={i} className={'ctx-msg ' + m.role} style={{ position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className="badge badge-blue" style={{ fontSize: 10 }}>{m.role}</span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: 'var(--text4)' }}>{m.tokens || Math.ceil((m.content || '').length / 4)} tokens</span>
                    <button className="msg-action-btn" onClick={() => handlePin(i)} style={{ fontSize: 10 }}>{m.pinned ? '\u2b50' : '\u2606'}</button>
                  </div>
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.5, maxHeight: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>{(m.content || '').slice(0, 200)}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
