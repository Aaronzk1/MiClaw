import { useEffect, useState, useMemo } from 'react'
import { api } from '../lib/ipc'
import { toast } from '../components/Toast'

interface GatewayInfo {
  running: boolean
  port?: number
  sessions?: any[]
  providers?: any[]
  tools?: any[]
}

interface ChannelStatus {
  running: boolean
  channels: Record<string, string>
}

export function GatewayPage() {
  const [info, setInfo] = useState<GatewayInfo | null>(null)
  const [channels, setChannels] = useState<ChannelStatus>({ running: false, channels: {} })
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [restarting, setRestarting] = useState(false)

  const fetchData = async () => {
    try {
      const [gwInfo, chStatus] = await Promise.all([
        api.gatewayInfo(),
        api.channelStatus(),
      ])
      setInfo(gwInfo as GatewayInfo)
      setChannels(chStatus as ChannelStatus)
      setLastRefresh(new Date())
    } catch {}
  }

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, 10000)
    return () => clearInterval(timer)
  }, [])

  const handleRestart = async () => {
    setRestarting(true)
    toast('正在重启 Gateway...', 'info')
    try {
      await api.gatewayStart()
      setTimeout(() => {
        fetchData()
        setRestarting(false)
        toast('Gateway 重启完成', 'success')
      }, 4000)
    } catch {
      setRestarting(false)
      toast('重启失败', 'error')
    }
  }

  const toolsByServer = useMemo(() => {
    if (!info?.tools?.length) return {}
    const groups: Record<string, any[]> = {}
    for (const tool of info.tools) {
      const server = tool.server || tool.source || 'unknown'
      if (!groups[server]) groups[server] = []
      groups[server].push(tool)
    }
    return groups
  }, [info?.tools])

  const channelNames: Record<string, string> = {
    weixin: 'WeChat',
    wechat: 'WeChat',
    telegram: 'Telegram',
    discord: 'Discord',
    slack: 'Slack',
    dingtalk: 'DingTalk',
    feishu: 'Feishu',
    matrix: 'Matrix',
  }

  const channelColors: Record<string, string> = {
    connected: 'var(--success)',
    ready: 'var(--success)',
    active: 'var(--success)',
    connecting: 'var(--warning)',
    pending: 'var(--warning)',
    disconnected: 'var(--error)',
    disabled: 'var(--text4)',
    error: 'var(--error)',
  }

  const channelDotClass = (state: string) => {
    if (['connected', 'ready', 'active'].includes(state)) return 'dash-dot dash-dot-green'
    if (['connecting', 'pending'].includes(state)) return 'dash-dot dash-dot-yellow'
    if (['disconnected', 'error'].includes(state)) return 'dash-dot dash-dot-red'
    return 'dash-dot dash-dot-gray'
  }

  return (
    <div className="page" id="page-gateway">
      <div className="dash-page" style={{ maxWidth: 'none' }}>
        {/* Status Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div className={`dash-status-icon ${info?.running ? 'green' : 'red'}`}>
            <div className={`dash-dot ${info?.running ? 'dash-dot-green' : 'dash-dot-red'}`} style={{ width: 16, height: 16 }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{info?.running ? 'Gateway 运行中' : 'Gateway 未连接'}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              {info?.running ? `端口 ${info.port} | 最后刷新 ${lastRefresh.toLocaleTimeString('zh-CN')}` : '服务不可用，请检查网关状态'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-secondary" onClick={fetchData}>刷新</button>
            <button className="btn btn-sm btn-primary" onClick={handleRestart} disabled={restarting}>{restarting ? '重启中...' : '重启 Gateway'}</button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="dash-grid-4">
          <div className="dash-stat" data-color="accent">
            <div className="stat-value">{info?.providers?.length || 0}</div>
            <div className="stat-label">Providers</div>
          </div>
          <div className="dash-stat" data-color="success">
            <div className="stat-value">{info?.tools?.length || 0}</div>
            <div className="stat-label">MCP Tools</div>
          </div>
          <div className="dash-stat" data-color="warning">
            <div className="stat-value">{info?.sessions?.length || 0}</div>
            <div className="stat-label">Sessions</div>
          </div>
          <div className="dash-stat" data-color="info">
            <div className="stat-value">{Object.keys(channels.channels || {}).length}</div>
            <div className="stat-label">Channels</div>
          </div>
        </div>

        {/* Providers + Channels row */}
        <div className="dash-grid-2" style={{ alignItems: 'stretch' }}>
          {/* Provider Grid */}
          <div className="dash-section" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Providers</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(info?.providers || []).length === 0 && (
                <div className="dash-item" style={{ textAlign: 'center', color: 'var(--text4)', fontSize: 12, minHeight: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>无 Provider 数据</div>
              )}
              {(info?.providers || []).map((p: any, i: number) => (
                <div key={p.id || i} className="dash-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                      {(p.name || p.id || 'P')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name || p.id || 'Unknown'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {p.models?.length || 0} 模型{p.type ? ` | ${p.type}` : ''}
                      </div>
                    </div>
                    <div className={`dash-dot ${p.enabled !== false ? 'dash-dot-green' : 'dash-dot-gray'}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Channel Status */}
          <div className="dash-section" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Channels</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.keys(channels.channels || {}).length === 0 && (
                <div className="dash-item" style={{ textAlign: 'center', color: 'var(--text4)', fontSize: 12, minHeight: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>无 Channel 数据</div>
              )}
              {Object.entries(channels.channels || {}).map(([id, state]) => (
                <div key={id} className="dash-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--info-light)', color: 'var(--info)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {(channelNames[id] || id).slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{channelNames[id] || id}</div>
                      <div style={{ fontSize: 11, color: channelColors[state] || 'var(--text3)' }}>{state}</div>
                    </div>
                    <div className={channelDotClass(state)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* MCP Tools Inventory */}
        <div className="dash-section">
          <div className="dash-section-header">
            <span className="dash-section-title">MCP Tools ({info?.tools?.length || 0})</span>
          </div>
          {Object.keys(toolsByServer).length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text4)', fontSize: 12, padding: 20 }}>无 MCP Tool 数据</div>
          )}
          {Object.entries(toolsByServer).map(([server, tools]) => (
            <div key={server} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', marginBottom: 6, padding: '4px 0' }}>{server} ({tools.length})</div>
              <div className="dash-grid-auto">
                {tools.map((tool: any, i: number) => (
                  <div key={tool.name || i} className="dash-item">
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{tool.name || 'unnamed'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tool.description || '无描述'}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Active Sessions */}
        <div className="dash-section">
          <div className="dash-section-header">
            <span className="dash-section-title">Sessions ({info?.sessions?.length || 0})</span>
          </div>
          {(info?.sessions || []).length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text4)', fontSize: 12, padding: 20 }}>无活跃 Session</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(info?.sessions || []).map((s: any, i: number) => (
              <div key={s.id || i} className="dash-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="dash-dot dash-dot-green" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.id || s.name || `Session ${i + 1}`}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {s.model ? `模型: ${s.model}` : ''}{s.agent ? ` | Agent: ${s.agent}` : ''}{s.createdAt ? ` | ${new Date(s.createdAt).toLocaleString('zh-CN')}` : ''}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
