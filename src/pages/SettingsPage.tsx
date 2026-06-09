import { useEffect, useState } from 'react'
import { api } from '../lib/ipc'

export function SettingsPage() {
  const [tab, setTab] = useState('general')
  const [config, setConfig] = useState<any>({})
  const [saved, setSaved] = useState(false)
  const [backups, setBackups] = useState<any[]>([])
  const [logFiles, setLogFiles] = useState<string[]>([])
  const [selectedLog, setSelectedLog] = useState<string | null>(null)
  const [logContent, setLogContent] = useState('')

  useEffect(() => { api.getConfig().then(setConfig).catch(() => {}) }, [])

  const handleSave = () => {
    api.saveConfig(config).then(() => { setSaved(true); setTimeout(() => setSaved(false), 2000) })
  }

  const update = (path: string, value: any) => {
    const c = { ...config }
    const keys = path.split('.')
    let obj: any = c
    for (let i = 0; i < keys.length - 1; i++) { if (!obj[keys[i]]) obj[keys[i]] = {}; obj = obj[keys[i]] }
    obj[keys[keys.length - 1]] = value
    setConfig(c)
  }

  const applyTheme = (theme: string) => {
    update('theme', theme)
    api.saveConfig({ ...config, theme }).catch(() => {})
    const root = document.documentElement
    if (theme === 'dark') root.setAttribute('data-theme', 'dark')
    else if (theme === 'light') root.setAttribute('data-theme', 'light')
    else root.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    update('theme', theme)
  }

  const tabs = [
    { id: 'general', label: '通用' }, { id: 'ai', label: 'AI' }, { id: 'gateway', label: 'Gateway' },
    { id: 'context', label: '上下文' }, { id: 'performance', label: '性能' }, { id: 'notifications', label: '通知' },
    { id: 'data', label: '数据' }, { id: 'api', label: 'API' }, { id: 'about', label: '关于' },
  ]

  return (
    <div className="page" id="page-settings">
      <div className="pg" style={{ maxWidth: 'none' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>设置</h2>
        <div className="gc-tabs" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          {tabs.map(t => (
            <button key={t.id} className={'gc-tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {tab === 'general' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="setting-group">
              <h4>显示</h4>
              <div className="setting-row"><span className="label">应用名称</span><input value={config.appName || 'AaronClaw'} onChange={e => update('appName', e.target.value)} /></div>
              <div className="setting-row"><span className="label">语言</span><select value={config.language || 'zh-CN'} onChange={e => update('language', e.target.value)}><option value="zh-CN">中文</option><option value="en">English</option></select></div>
              <div className="setting-row"><span className="label">主题</span>
                <select value={config.theme || 'system'} onChange={e => applyTheme(e.target.value)}>
                  <option value="light">浅色</option><option value="dark">深色</option><option value="system">跟随系统</option>
                </select>
              </div>
            </div>
            <div className="setting-group">
              <h4>快捷键</h4>
              <div className="kv-row"><span className="k">Ctrl+B</span><span className="v">切换侧边栏</span></div>
              <div className="kv-row"><span className="k">Ctrl+,</span><span className="v">打开设置</span></div>
              <div className="kv-row"><span className="k">Ctrl+K</span><span className="v">命令面板</span></div>
              <div className="kv-row"><span className="k">Ctrl+1-9</span><span className="v">切换页面</span></div>
            </div>
          </div>
        )}

        {tab === 'ai' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="setting-group">
              <h4>模型设置</h4>
              <div className="setting-row"><span className="label">默认模型</span><input value={config.ai?.model || ''} onChange={e => update('ai.model', e.target.value)} /></div>
              <div className="setting-row"><span className="label">Temperature</span><input type="number" step="0.1" min="0" max="2" value={config.ai?.temperature || 0.7} onChange={e => update('ai.temperature', parseFloat(e.target.value))} /></div>
              <div className="setting-row"><span className="label">Max Tokens</span><input type="number" value={config.ai?.maxTokens || 4096} onChange={e => update('ai.maxTokens', parseInt(e.target.value))} /></div>
            </div>
            <div className="setting-group">
              <h4>推理参数</h4>
              <div className="kv-row"><span className="k">当前模型</span><span className="v">{config.ai?.model || 'openclaw'}</span></div>
              <div className="kv-row"><span className="k">上下文窗口</span><span className="v">{config.ai?.maxTokens || 4096}</span></div>
            </div>
          </div>
        )}

        {tab === 'gateway' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="setting-group">
              <h4>Gateway 配置</h4>
              <div className="setting-row"><span className="label">Host</span><input value={config.gateway?.host || '127.0.0.1'} onChange={e => update('gateway.host', e.target.value)} /></div>
              <div className="setting-row"><span className="label">Port</span><input type="number" value={config.gateway?.port || 18789} onChange={e => update('gateway.port', parseInt(e.target.value))} /></div>
            </div>
            <div className="setting-group">
              <h4>状态</h4>
              <div className="kv-row"><span className="k">地址</span><span className="v">{config.gateway?.host || '127.0.0.1'}:{config.gateway?.port || 18789}</span></div>
              <div className="setting-row"><span className="label">健康检查</span><button className="btn btn-sm btn-secondary" onClick={() => api.healthCheck().then((r: any) => alert(r.gateway ? 'Gateway 正常 端口: ' + r.port : 'Gateway 未运行'))}>检查</button></div>
            </div>
          </div>
        )}

        {tab === 'context' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="setting-group">
              <h4>上下文压缩</h4>
              <div className="setting-row"><span className="label">窗口上限 (tokens)</span><input type="number" value={config.context?.maxTokens || 4096} onChange={e => update('context.maxTokens', parseInt(e.target.value))} /></div>
              <div className="setting-row"><span className="label">触发阈值 (%)</span><input type="number" value={config.context?.threshold || 80} onChange={e => update('context.threshold', parseInt(e.target.value))} /></div>
              <div className="setting-row"><span className="label">目标压缩率 (%)</span><input type="number" value={config.context?.targetRatio || 50} onChange={e => update('context.targetRatio', parseInt(e.target.value))} /></div>
              <div className="setting-row"><span className="label">策略</span><select value={config.context?.strategy || 'sliding'} onChange={e => update('context.strategy', e.target.value)}><option value="sliding">滑动窗口</option><option value="summary">摘要压缩</option><option value="smart">智能裁剪</option></select></div>
            </div>
            <div className="setting-group"><h4>说明</h4><div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.8 }}><p>上下文压缩在对话达到窗口上限的阈值百分比时自动触发。</p><p>滑动窗口：保留最近的消息</p><p>摘要压缩：将旧消息压缩为摘要</p><p>智能裁剪：根据重要性裁剪旧消息</p></div></div>
          </div>
        )}

        {tab === 'performance' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="setting-group">
              <h4>性能设置</h4>
              <div className="setting-row"><span className="label">命令超时 (秒)</span><input type="number" value={config.perf?.timeout || 30} onChange={e => update('perf.timeout', parseInt(e.target.value))} /></div>
              <div className="setting-row"><span className="label">流式延迟 (ms)</span><input type="number" value={config.perf?.streamDelay || 30} onChange={e => update('perf.streamDelay', parseInt(e.target.value))} /></div>
              <div className="setting-row"><span className="label">最大并发</span><input type="number" value={config.perf?.maxConcurrent || 3} onChange={e => update('perf.maxConcurrent', parseInt(e.target.value))} /></div>
            </div>
            <div className="setting-group">
              <h4>当前状态</h4>
              <div className="kv-row"><span className="k">超时</span><span className="v">{config.perf?.timeout || 30}s</span></div>
              <div className="kv-row"><span className="k">延迟</span><span className="v">{config.perf?.streamDelay || 30}ms</span></div>
              <div className="kv-row"><span className="k">并发</span><span className="v">{config.perf?.maxConcurrent || 3}</span></div>
            </div>
          </div>
        )}

        {tab === 'notifications' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="setting-group">
              <h4>通知设置</h4>
              <div className="setting-row"><span className="label">桌面通知</span><div className={'toggle' + (config.notifications?.desktop ? ' on' : '')} onClick={() => update('notifications.desktop', !config.notifications?.desktop)}></div></div>
              <div className="setting-row"><span className="label">声音提醒</span><div className={'toggle' + (config.notifications?.sound ? ' on' : '')} onClick={() => update('notifications.sound', !config.notifications?.sound)}></div></div>
            </div>
            <div className="setting-group"><h4>测试</h4><div className="setting-row"><span className="label">通知测试</span><button className="btn btn-sm btn-secondary" onClick={() => api.notify('AaronClaw', '通知测试成功')}>测试</button></div></div>
          </div>
        )}

        {tab === 'data' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="setting-group">
              <h4>数据管理</h4>
              <div className="setting-row"><span className="label">导出数据备份</span><button className="btn btn-sm btn-secondary" onClick={() => api.dataExport().then((r: any) => { if (r.ok) alert('已导出到: ' + r.path) })}>导出</button></div>
              <div className="setting-row"><span className="label">创建备份</span><button className="btn btn-sm btn-secondary" onClick={() => api.backupCreate?.().then((r: any) => { if (r) alert('备份已创建: ' + r.timestamp) })}>备份</button></div>
              <div className="setting-row"><span className="label">健康检查</span><button className="btn btn-sm btn-secondary" onClick={() => api.healthCheck().then((r: any) => alert(r.gateway ? 'Gateway 正常' : 'Gateway 未运行'))}>检查</button></div>
              <div className="setting-row"><span className="label">Agent 诊断</span><button className="btn btn-sm btn-secondary" onClick={() => api.capDoctor().then((r: any) => alert(r.ok ? r.data : '诊断失败'))}>诊断</button></div>
            </div>
            <div className="setting-group">
              <h4>存储信息</h4>
              <div className="kv-row"><span className="k">数据库</span><span className="v">SQLite (WAL)</span></div>
              <div className="kv-row"><span className="k">加密</span><span className="v">AES-256-GCM / Electron safeStorage</span></div>
              <div className="kv-row"><span className="k">位置</span><span className="v" style={{ fontSize: 10 }}>用户数据目录/data/</span></div>
            </div>
          </div>
        )}

        {tab === 'api' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="setting-group">
              <h4>HTTP API Server</h4>
              <div className="setting-row"><span className="label">启用</span><div className={'toggle' + (config.apiServer?.enabled ? ' on' : '')} onClick={() => update('apiServer.enabled', !config.apiServer?.enabled)}></div></div>
              <div className="setting-row"><span className="label">端口</span><input type="number" value={config.apiServer?.port || 18800} onChange={e => update('apiServer.port', parseInt(e.target.value))} /></div>
              <div className="setting-row"><span className="label">API Key</span><input type="password" value={config.apiServer?.apiKey || ''} onChange={e => update('apiServer.apiKey', e.target.value)} placeholder="可选" /></div>
            </div>
            <div className="setting-group">
              <h4>端点</h4>
              <div className="kv-row"><span className="k">GET /api/health</span><span className="v">健康检查</span></div>
              <div className="kv-row"><span className="k">GET /api/agents</span><span className="v">Agent列表</span></div>
              <div className="kv-row"><span className="k">POST /api/chat</span><span className="v">对话</span></div>
              <div className="kv-row"><span className="k">GET /api/memory</span><span className="v">记忆列表</span></div>
              <div className="kv-row"><span className="k">GET /api/conversations</span><span className="v">对话列表</span></div>
            </div>
          </div>
        )}

        {tab === 'about' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="setting-group">
              <h4>关于</h4>
              <div className="kv-row"><span className="k">版本</span><span className="v">3.0.0</span></div>
              <div className="kv-row"><span className="k">引擎</span><span className="v">OpenClaw + Hermes</span></div>
              <div className="kv-row"><span className="k">许可证</span><span className="v">MIT</span></div>
            </div>
            <div className="setting-group">
              <h4>技术栈</h4>
              <div className="kv-row"><span className="k">前端</span><span className="v">React 19 + Zustand 5</span></div>
              <div className="kv-row"><span className="k">后端</span><span className="v">Electron 35 + SQLite</span></div>
              <div className="kv-row"><span className="k">构建</span><span className="v">Vite 6 + TypeScript 5</span></div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={handleSave}>{saved ? '已保存' : '保存设置'}</button>
        </div>
      </div>
    </div>
  )
}