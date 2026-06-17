import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/ipc'
import { toast } from '../components/Toast'
import { Modal } from '../components/ui'

type ChannelDef = {
  id: string; name: string; icon: string; color: string; description: string
  category: 'china' | 'enterprise' | 'global' | 'dev'
  connectType: 'form' | 'env' | 'plugin' | 'qr' | 'coming'
  fields?: { key: string; label: string; placeholder: string; secret?: boolean }[]
  envVars?: string[]
  plugin?: string
  setupUrl?: string
  setupSteps?: string[]
}

const CHANNELS: ChannelDef[] = [
  { id: 'weixin', name: '个人微信', icon: '💚', color: '#07c160', description: '个人微信号接入，扫码登录，支持私聊和群聊', category: 'china', connectType: 'qr', setupSteps: ['点击下方"生成二维码"按钮', '用手机微信扫描二维码', '在手机上确认登录'] },
  { id: 'wecom', name: '企业微信', icon: '🔵', color: '#1989fa', description: '企业微信应用消息，支持工作群、审批、日程', category: 'china', connectType: 'form', fields: [{ key: 'corpId', label: '企业ID', placeholder: '在企业微信管理后台获取' }, { key: 'agentId', label: '应用AgentId', placeholder: '自建应用的AgentId' }, { key: 'appSecret', label: '应用Secret', placeholder: '自建应用的Secret', secret: true }], setupUrl: 'https://work.weixin.qq.com/', setupSteps: ['登录企业微信管理后台 → 应用管理 → 创建自建应用', '复制企业ID、AgentId、Secret', '在应用详情中设置可信域名和回调URL', '填写上方表单并点击连接'] },
  { id: 'dingtalk', name: '钉钉', icon: '🔷', color: '#0082ef', description: '钉钉企业IM，支持工作群、机器人', category: 'china', connectType: 'coming' },
  { id: 'qqbot', name: 'QQ', icon: '🐧', color: '#12b7f5', description: 'QQ 机器人，支持群聊和私聊', category: 'china', connectType: 'form', fields: [{ key: 'QQBOT_APP_ID', label: 'App ID', placeholder: '在QQ开放平台获取' }, { key: 'QQBOT_APP_SECRET', label: 'App Secret', placeholder: '应用的Secret', secret: true }], setupUrl: 'https://q.qq.com/', setupSteps: ['登录 QQ开放平台 → 创建机器人应用', '获取 App ID 和 App Secret', '填写上方表单并点击连接'] },
  { id: 'feishu', name: '飞书', icon: '🐦', color: '#3370ff', description: '飞书/Lark 企业消息，支持文档、知识库、云盘', category: 'china', connectType: 'form', fields: [{ key: 'appId', label: 'App ID', placeholder: 'cli_xxxxxxxxxx' }, { key: 'appSecret', label: 'App Secret', placeholder: '从飞书开放平台获取', secret: true }, { key: 'verificationToken', label: '验证 Token', placeholder: '事件订阅验证token' }], setupUrl: 'https://open.feishu.cn', setupSteps: ['登录飞书开放平台 → 创建企业自建应用', '开启机器人能力，配置权限: im:message', '事件订阅 → 选WebSocket → 添加 im.message.receive_v1', '复制 App ID、App Secret、验证 Token', '填写上方表单并点击连接'] },
  { id: 'telegram', name: 'Telegram', icon: '✈️', color: '#26a5e4', description: 'Telegram Bot，全球覆盖', category: 'global', connectType: 'form', fields: [{ key: 'TELEGRAM_BOT_TOKEN', label: 'Bot Token', placeholder: '从 @BotFather 获取', secret: true }], setupUrl: 'https://t.me/BotFather', setupSteps: ['Telegram 搜索 @BotFather → /newbot', '按提示设置名称 → 复制 Bot Token', '填写上方表单并点击连接'] },
  { id: 'discord', name: 'Discord', icon: '🎮', color: '#5865f2', description: 'Discord Bot，游戏和开发者社区', category: 'global', connectType: 'form', fields: [{ key: 'DISCORD_BOT_TOKEN', label: 'Bot Token', placeholder: '从 Discord Developer Portal 获取', secret: true }], setupUrl: 'https://discord.com/developers/applications', setupSteps: ['打开 Discord Developer Portal → 创建应用', 'Bot → 复制 Token', '填写上方表单并点击连接'] },
  { id: 'slack', name: 'Slack', icon: '💬', color: '#e01e5a', description: 'Slack App，企业协作', category: 'enterprise', connectType: 'form', fields: [{ key: 'SLACK_APP_TOKEN', label: 'App Token', placeholder: 'xapp-...', secret: true }, { key: 'SLACK_BOT_TOKEN', label: 'Bot Token', placeholder: 'xoxb-...', secret: true }], setupUrl: 'https://api.slack.com/apps', setupSteps: ['打开 api.slack.com/apps → 创建 App', '安装到工作区 → 复制 Bot Token 和 App Token', '填写上方表单并点击连接'] },
  { id: 'whatsapp', name: 'WhatsApp', icon: '📱', color: '#25d366', description: 'WhatsApp Business', category: 'global', connectType: 'form', fields: [{ key: 'WHATSAPP_ACCESS_TOKEN', label: 'Access Token', placeholder: '从 Meta Business 获取', secret: true }], setupUrl: 'https://business.whatsapp.com/', setupSteps: ['打开 Meta Business → WhatsApp → Getting Started', '复制 Access Token', '填写上方表单并点击连接'] },
  { id: 'msteams', name: 'Teams', icon: '🟣', color: '#6264a7', description: 'Microsoft Teams', category: 'enterprise', connectType: 'form', fields: [{ key: 'TEAMS_APP_ID', label: 'App ID', placeholder: '从 Azure Portal 获取' }, { key: 'TEAMS_APP_PASSWORD', label: 'App Password', placeholder: '客户端密码', secret: true }], setupUrl: 'https://dev.teams.microsoft.com/', setupSteps: ['打开 Azure Portal → App registrations', '复制 Application (client) ID 和客户端密码', '填写上方表单并点击连接'] },
  { id: 'line', name: 'LINE', icon: '🟢', color: '#00b900', description: 'LINE Messaging API', category: 'global', connectType: 'form', fields: [{ key: 'LINE_CHANNEL_ACCESS_TOKEN', label: 'Channel Access Token', placeholder: '从 LINE Developers 获取', secret: true }], setupUrl: 'https://developers.line.biz/', setupSteps: ['打开 LINE Developers → 创建 Provider + Channel', 'Messaging API → 复制 Channel Access Token', '填写上方表单并点击连接'] },
  { id: 'matrix', name: 'Matrix', icon: '🔗', color: '#0dbd8b', description: '去中心化开源通讯', category: 'dev', connectType: 'form', fields: [{ key: 'MATRIX_ACCESS_TOKEN', label: 'Access Token', placeholder: '从 Element 设置中获取', secret: true }], setupUrl: 'https://matrix.org/', setupSteps: ['打开 Element → 设置 → 帮助与关于', '复制 Access Token', '填写上方表单并点击连接'] },
  { id: 'signal', name: 'Signal', icon: '🔒', color: '#3a76f0', description: '加密通讯', category: 'dev', connectType: 'form', fields: [{ key: 'SIGNAL_NUMBER', label: '手机号', placeholder: '+86xxxxxxxxxxx' }], setupUrl: 'https://signal.org/', setupSteps: ['安装 Signal CLI 并注册手机号', '填写手机号并点击连接'] },
]

const CAT_LABELS: Record<string, string> = { china: '中国市场', enterprise: '企业协作', global: '全球IM', dev: '开发者' }

export function ChannelsPage() {
  const [configs, setConfigs] = useState<Record<string, any>>({})
  const [connStatus, setConnStatus] = useState<Record<string, string>>({})
  const [wizard, setWizard] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState(0)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [qrUuid, setQrUuid] = useState<string | null>(null)
  const [qrStatus, setQrStatus] = useState<'idle' | 'loading' | 'ready' | 'scanned' | 'confirmed' | 'expired' | 'error'>('idle')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    load()
    const t = setInterval(loadStatus, 10000)
    return () => clearInterval(t)
  }, [])

  const load = async () => {
    try { const cfg = await api.getConfig(); setConfigs(cfg?.channels || {}) } catch {}
    loadStatus()
  }

  const loadStatus = async () => {
    try { const s = await api.channelStatus(); if (s?.channels) setConnStatus(s.channels) } catch {}
  }

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  useEffect(() => () => stopPolling(), [])

  const generateQr = async () => {
    setQrStatus('loading')
    try {
      const res = await api.channelWeixinQr()
      if (res.ok && res.uuid && res.qrUrl) {
        setQrUuid(res.uuid); setQrUrl(res.qrUrl); setQrStatus('ready'); startPolling(res.uuid)
      } else { setQrStatus('error'); toast(res.message || '生成二维码失败', 'error') }
    } catch { setQrStatus('error'); toast('网络错误', 'error') }
  }

  const startPolling = (uuid: string) => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.channelWeixinPoll(uuid)
        if (res.status === 'scanned') setQrStatus('scanned')
        else if (res.status === 'confirmed') { setQrStatus('confirmed'); stopPolling(); toast('微信登录成功!', 'success'); setTimeout(() => { setWizard(null); load() }, 1500) }
        else if (res.status === 'expired') { setQrStatus('expired'); stopPolling() }
      } catch {}
    }, 2000)
  }

  const openWizard = (ch: ChannelDef) => {
    setWizard(ch.id); setForm({}); setStep(0); setQrUrl(null); setQrUuid(null); setQrStatus('idle'); stopPolling()
  }

  const handleConnect = async (ch: ChannelDef) => {
    setSaving(true)
    try {
      const res = await api.channelSetup(ch.id, Object.keys(form).length > 0 ? form : undefined)
      if (res.ok) { toast(`${ch.name} 已连接!`, 'success'); setWizard(null); load() }
      else toast('连接失败: ' + (res.message || ''), 'error')
    } catch (e) { toast('错误: ' + (e as Error).message, 'error') }
    setSaving(false)
  }

  const handleDisconnect = async (ch: ChannelDef) => {
    try { await api.channelDisconnect(ch.id); toast(`${ch.name} 已断开`, 'success'); load() } catch {}
  }

  const grouped = CHANNELS.reduce((acc, ch) => { (acc[ch.category] ??= []).push(ch); return acc }, {} as Record<string, ChannelDef[]>)
  const activeCount = CHANNELS.filter(ch => configs[ch.id]?.enabled === true).length
  const wizCh = wizard ? CHANNELS.find(c => c.id === wizard) : null

  return (
    <div className="page" id="page-channels">
      <div className="pg" style={{ maxWidth: 'none' }}>
        <div className="page-header">
          <div>
            <h2 className="page-title">通道管理</h2>
            <p className="page-subtitle">{activeCount > 0 ? `已连接 ${activeCount} 个通道` : '点击"连接"按钮开始配置消息通道'}</p>
          </div>
        </div>

        {(['china', 'enterprise', 'global', 'dev'] as const).map(cat => (
          <div key={cat} style={{ marginBottom: 24 }}>
            <div className="section-title">{CAT_LABELS[cat]}</div>
            <div className="card-grid">
              {(grouped[cat] || []).map(ch => {
                const isEnabled = configs[ch.id]?.enabled === true
                const isConnected = connStatus[ch.id] === 'connected'
                return (
                  <div key={ch.id} className="channel-card" style={{ opacity: ch.connectType === 'coming' ? 0.5 : 1 }}>
                    <div className="channel-card-top">
                      <div className="channel-icon" style={{ background: ch.color + '18', color: ch.color }}>{ch.icon}</div>
                      <div className="channel-info">
                        <div className="channel-name">
                          {ch.name}
                          {isConnected && <span className="status-dot connected">已连接</span>}
                          {isEnabled && !isConnected && <span className="status-dot pending">启动中</span>}
                          {ch.connectType === 'coming' && <span className="status-dot pending">即将支持</span>}
                        </div>
                        <p className="channel-desc">{ch.description}</p>
                      </div>
                      {ch.connectType !== 'coming' && (
                        <div className={'toggle' + (isEnabled ? ' on' : '')} onClick={() => isEnabled ? handleDisconnect(ch) : openWizard(ch)} />
                      )}
                    </div>
                    <div className="channel-actions">
                      {!isEnabled && ch.connectType !== 'coming' && (
                        <button className="btn btn-sm btn-primary" style={{ background: ch.color, borderColor: ch.color }} onClick={() => openWizard(ch)}>连接</button>
                      )}
                      {isEnabled && (
                        <button className="btn btn-sm btn-secondary" onClick={() => openWizard(ch)}>设置</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Wizard Modal */}
      {wizCh && (
        <div className="modal-overlay" onClick={() => setWizard(null)}>
          <div className="modal" style={{ minWidth: 520, maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="channel-icon lg" style={{ background: wizCh.color + '18', color: wizCh.color }}>{wizCh.icon}</div>
                <div>
                  <h3 style={{ margin: 0 }}>连接 {wizCh.name}</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text3)' }}>{wizCh.description}</p>
                </div>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => setWizard(null)}>✕</button>
            </div>

            <div className="modal-body">
              {/* Steps */}
              {wizCh.setupSteps && (
                <div className="steps-block">
                  {wizCh.setupSteps.map((s, i) => (
                    <div key={i} className="step-item">
                      <div className="step-num" style={{ background: wizCh.color }}>{i + 1}</div>
                      <span className="step-text">{s}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Form */}
              {wizCh.connectType === 'form' && wizCh.fields && (
                <div className="form-stack">
                  {wizCh.fields.map(f => (
                    <div key={f.key} className="form-group">
                      <label>{f.label}</label>
                      <input type={f.secret ? 'password' : 'text'} value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} />
                    </div>
                  ))}
                </div>
              )}

              {/* Plugin */}
              {wizCh.connectType === 'plugin' && (
                <div className="code-block">
                  <div className="code-hint"># 安装插件</div>
                  <code>npm install -g {wizCh.plugin}</code>
                </div>
              )}

              {/* Env vars */}
              {wizCh.connectType === 'env' && wizCh.envVars && (
                <div className="env-block">
                  <div className="env-title">需要设置环境变量:</div>
                  {wizCh.envVars.map(v => (
                    <div key={v} className="env-row">
                      <code>{v}</code>
                      <button className="btn btn-sm btn-ghost" onClick={() => { navigator.clipboard.writeText(v); toast('已复制', 'success') }}>复制</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Coming soon */}
              {wizCh.connectType === 'coming' && (
                <div className="empty-state"><p>此通道正在开发中，敬请期待</p></div>
              )}

              {/* QR Code */}
              {wizCh.connectType === 'qr' && (
                <div className="qr-section">
                  {qrStatus === 'idle' && <button className="btn btn-primary" style={{ background: wizCh.color, borderColor: wizCh.color }} onClick={generateQr}>生成二维码</button>}
                  {qrStatus === 'loading' && <p className="meta-text">正在生成二维码...</p>}
                  {(qrStatus === 'ready' || qrStatus === 'scanned') && qrUrl && (
                    <>
                      <div className="qr-frame"><img src={qrUrl} alt="扫码" /></div>
                      <p style={{ fontWeight: 600, color: qrStatus === 'scanned' ? 'var(--success)' : 'var(--text)' }}>{qrStatus === 'scanned' ? '已扫码，请在手机上确认' : '请用微信扫描二维码'}</p>
                      <button className="btn btn-sm btn-secondary" onClick={generateQr}>刷新二维码</button>
                    </>
                  )}
                  {qrStatus === 'confirmed' && <p style={{ color: 'var(--success)', fontWeight: 700, fontSize: 16 }}>登录成功!</p>}
                  {qrStatus === 'expired' && (<><p style={{ color: 'var(--error)' }}>二维码已过期</p><button className="btn btn-primary" style={{ background: wizCh.color, borderColor: wizCh.color }} onClick={generateQr}>重新生成</button></>)}
                  {qrStatus === 'error' && (<><p style={{ color: 'var(--error)' }}>生成失败</p><button className="btn btn-primary" style={{ background: wizCh.color, borderColor: wizCh.color }} onClick={generateQr}>重试</button></>)}
                </div>
              )}
            </div>

            <div className="modal-footer">
              {wizCh.setupUrl && <a href={wizCh.setupUrl} target="_blank" rel="noopener" className="btn btn-secondary">打开 {wizCh.name}</a>}
              <div style={{ flex: 1 }} />
              <button className="btn btn-secondary" onClick={() => setWizard(null)}>取消</button>
              {wizCh.connectType !== 'coming' && (
                <button className="btn btn-primary" style={{ background: wizCh.color, borderColor: wizCh.color }} onClick={() => handleConnect(wizCh)} disabled={saving}>{saving ? '连接中...' : '连接'}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
