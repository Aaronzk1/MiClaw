import { useEffect, useState, useMemo } from 'react'
import { api } from '../lib/ipc'
import { toast } from '../components/Toast'
import { useAppStore } from '../stores/appStore'
import { ConfirmModal } from '../components/ui'

function LogsTab() {
  const { debugLogs, clearDebugLogs } = useAppStore()
  return (
    <div className="setting-group">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4>终端日志 ({debugLogs.length})</h4>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm btn-secondary" onClick={clearDebugLogs}>清空</button>
          <button className="btn btn-sm btn-secondary" onClick={() => {
            const text = debugLogs.map(l => `[${l.t}] [${l.level}] ${l.msg}`).join('\n')
            navigator.clipboard.writeText(text)
          }}>复制全部</button>
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text3)', margin: '6px 0 8px' }}>记录应用运行时的错误和警告信息，用于排查问题。复制后可发给开发者分析。</p>
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 400, overflow: 'auto', padding: '4px 8px', fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.6 }}>
        {debugLogs.length === 0 && <div style={{ color: 'var(--text4)', padding: 8 }}>暂无日志</div>}
        {debugLogs.map((l, i) => (
          <div key={i} style={{ color: l.level === 'error' ? 'var(--error)' : l.level === 'warn' ? 'var(--warning)' : 'var(--text2)', wordBreak: 'break-all' }}>
            <span style={{ color: 'var(--text4)' }}>[{l.t}]</span> <span style={{ fontWeight: 600 }}>[{l.level}]</span> {l.msg}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SettingsPage() {
  const [tab, setTab] = useState('general')
  const config = useAppStore(s => s.config)
  const setConfig = useAppStore(s => s.setConfig)
  const models = useAppStore(s => s.models)
  const setModels = useAppStore(s => s.setModels)
  const [saved, setSaved] = useState(false)
  const [providers, setProviders] = useState<any[]>([])
  const [editId, setEditId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newKey, setNewKey] = useState('')
  const [providerModels, setProviderModels] = useState<any[]>([])
  const [editingModel, setEditingModel] = useState<number | null>(null)
  const [mId, setMId] = useState('')
  const [mName, setMName] = useState('')
  const [mUrl, setMUrl] = useState('')
  const [mApiId, setMApiId] = useState('')
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, boolean>>({})
  const [modelSearch, setModelSearch] = useState('')
  const [modelCategory, setModelCategory] = useState('all')
  const [backups, setBackups] = useState<any[]>([])
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)
  const [logFiles, setLogFiles] = useState<any[]>([])
  const [selectedLog, setSelectedLog] = useState<string | null>(null)
  const [logContent, setLogContent] = useState('')
  const [logDir, setLogDir] = useState('')
  const [aboutInfo, setAboutInfo] = useState<any>({})

  useEffect(() => {
    if (!config.ai) api.getConfig().then(setConfig).catch(() => {})
    if (!models.length) api.modelsList().then(setModels).catch(() => {})
    api.providersList().then(async (provs) => {
      setProviders(provs)
      // Auto-fetch models for providers with API keys but no models in store
      const curModels = models.length ? models : await api.modelsList().catch(() => [])
      for (const p of provs) {
        if (!p.apiKey || p.enabled === false) continue
        if (curModels.some((m: any) => m.provider === p.id)) continue
        await fetchProviderModels(p)
      }
    }).catch(() => {})
    api.backupList?.().then(setBackups).catch(() => {})
    api.logsList?.().then(setLogFiles).catch(() => {})
    api.logsDir?.().then(setLogDir).catch(() => {})
    api.systemInfo().then(setAboutInfo).catch(() => {})
  }, [])

  const handleSave = () => {
    api.saveConfig(config).then(() => { setSaved(true); setTimeout(() => setSaved(false), 2000) }).catch(() => { toast('保存失败', 'error') })
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
    setConfig((prev: any) => {
      const updated = { ...prev, theme }
      api.saveConfig(updated).catch(() => {})
      return updated
    })
    const root = document.documentElement
    if (theme === 'dark') root.setAttribute('data-theme', 'dark')
    else if (theme === 'light') root.setAttribute('data-theme', 'light')
    else root.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    window.dispatchEvent(new CustomEvent('theme-change', { detail: theme }))
  }

  const currentModel = models.find(m => m.id === (config.ai?.model || 'openclaw'))
  const configuredProviders = useMemo(() => providers.filter(p => p.apiKey), [providers])
  const unconfiguredProviders = useMemo(() => providers.filter(p => !p.apiKey), [providers])
  const modelCategories = useMemo(() => {
    const cats: { id: string; label: string; count: number }[] = [{ id: 'all', label: '全部', count: models.length }]
    for (const p of providers) {
      const count = models.filter(m => m.provider === p.id).length
      if (count > 0) cats.push({ id: p.id, label: p.name, count })
    }
    // 自定义: models not tied to any known provider
    const knownIds = new Set(providers.map(p => p.id))
    const customCount = models.filter(m => !m.provider || !knownIds.has(m.provider)).length
    if (customCount > 0) cats.push({ id: '_custom', label: '自定义', count: customCount })
    return cats
  }, [models, providers])

  const filteredModels = useMemo(() => {
    let list = models
    if (modelCategory !== 'all') {
      if (modelCategory === '_custom') {
        const knownIds = new Set(providers.map(p => p.id))
        list = list.filter(m => !m.provider || !knownIds.has(m.provider))
      } else {
        list = list.filter(m => m.provider === modelCategory)
      }
    }
    if (modelSearch) { const q = modelSearch.toLowerCase(); list = list.filter(m => (m.name || m.id || '').toLowerCase().includes(q)) }
    return list
  }, [models, modelSearch, modelCategory, providers])

  const providerColors: Record<string, string> = {
    openai: '#10a37f', anthropic: '#d97706', google: '#4285f4', meta: '#1877f2',
    deepseek: '#6366f1', qwen: '#f97316', mistral: '#ef4444', openclaw: '#4f46e5',
    xiaomi: '#ff6700', zai: '#8b5cf6', moonshot: '#6366f1', minimax: '#06b6d4',
    stepfun: '#16a34a', groq: '#f59e0b', ollama: '#22c55e',
  }
  const getProviderColor = (id: string) => { for (const [key, color] of Object.entries(providerColors)) { if (id.toLowerCase().includes(key)) return color }; return 'var(--accent)' }
  const maskKey = (key: string) => { if (!key || key.length < 10) return key || '未配置'; return key.slice(0, 5) + '...' + key.slice(-4) }

  const fetchProviderModels = async (p: any) => {
    const url = (p.baseUrl || '').replace(/\/+$/, '')
    if (!url || !p.apiKey) return
    try {
      const resp = await fetch(`${url}/models`, { headers: { 'Authorization': `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000) })
      if (!resp.ok) return
      const data = await resp.json()
      const list = (data.data || data.models || []).map((m: any) => ({
        id: m.id, name: m.id, provider: p.id, enabled: true,
        contextWindow: m.context_window || 128000, maxTokens: 4096
      }))
      if (list.length === 0) return
      // Merge: keep existing (may have user customizations), add new
      const existing = models.filter(m => m.provider === p.id)
      const existingIds = new Set(existing.map(m => m.id))
      const newModels = list.filter((m: any) => !existingIds.has(m.id))
      for (const m of newModels) api.modelsSave(m)
      const updated = [...models.filter(m => m.provider !== p.id), ...existing, ...newModels]
      setModels(updated)
      toast(`已同步 ${list.length} 个模型（新增 ${newModels.length}）`, 'success')
    } catch { /* ignore */ }
  }

  const handleTestProvider = async (p: any) => {
    setTesting(p.id)
    try {
      const url = (p.baseUrl || '').replace(/\/+$/, '')
      if (!url) { setTestResult(r => ({ ...r, [p.id]: false })); setTesting(null); return }
      const resp = await fetch(`${url}/models`, { headers: { 'Authorization': `Bearer ${p.apiKey || ''}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000) })
      const ok = resp.ok
      setTestResult(r => ({ ...r, [p.id]: ok }))
      if (ok) await fetchProviderModels(p)
    } catch { setTestResult(r => ({ ...r, [p.id]: false })) }
    setTesting(null)
  }
  const handleSaveProvider = async () => {
    if (!newName.trim()) return
    const provId = editId || 'prov-' + Date.now()
    const key = newKey || providers.find(p => p.id === editId)?.apiKey || ''
    const provObj = { id: provId, name: newName, baseUrl: newUrl, apiKey: key, enabled: true }
    if (editId) {
      const updated = providers.map(p => p.id === editId ? { ...p, ...provObj } : p)
      api.providersSave(updated.find(p => p.id === editId)).catch(console.error)
      setProviders(updated)
    } else {
      api.providersSave(provObj).catch(console.error)
      setProviders([...providers, provObj])
    }
    // Save manually added models
    for (const m of providerModels) {
      api.modelsSave({ ...m, provider: provId }).catch(() => {})
    }
    const others = models.filter(m => m.provider !== provId)
    setModels([...others, ...providerModels.map(m => ({ ...m, provider: provId }))])
    setNewName(''); setNewUrl(''); setNewKey(''); setShowAdd(false); setEditId(null)
    window.dispatchEvent(new CustomEvent('providers-changed'))
    // Auto-fetch available models from API
    if (key && newUrl) {
      await fetchProviderModels({ ...provObj })
    }
  }
  const handleDeleteProvider = (id: string) => {
    api.providersDelete(id).then(() => setProviders(providers.filter(p => p.id !== id))).catch(console.error)
    // Also delete models for this provider
    models.filter(m => m.provider === id).forEach(m => api.modelsDelete?.(m.id).catch(() => {}))
    setModels(models.filter(m => m.provider !== id))
  }
  const handleAddModel = () => {
    if (!mId.trim()) return
    const data = { id: mId, name: mName || mId, baseUrl: mUrl || undefined, apiId: mApiId || undefined, enabled: true }
    if (editingModel !== null) {
      const updated = [...providerModels]
      updated[editingModel] = { ...updated[editingModel], ...data }
      setProviderModels(updated)
    } else {
      if (providerModels.some(m => m.id === mId)) return
      setProviderModels([...providerModels, data])
    }
    setEditingModel(null); setMId(''); setMName(''); setMUrl(''); setMApiId('')
  }
  const handleEditModel = (i: number) => {
    const m = providerModels[i]; setEditingModel(i); setMId(m.id); setMName(m.name || ''); setMUrl(m.baseUrl || ''); setMApiId(m.apiId || '')
  }
  const handleDeleteModel = (i: number) => { setProviderModels(providerModels.filter((_, idx) => idx !== i)) }
  const handleEditProvider = (p: any) => {
    setEditId(p.id); setNewName(p.name || ''); setNewUrl(p.baseUrl || ''); setNewKey('')
    setProviderModels(models.filter(m => m.provider === p.id).map(m => ({ ...m })))
    setEditingModel(null); setMId(''); setMName(''); setMUrl(''); setMApiId('')
    setShowAdd(true)
  }
  const formatSize = (bytes: number) => { if (!bytes) return '-'; if (bytes < 1024) return bytes + ' B'; if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'; return (bytes / 1048576).toFixed(1) + ' MB' }
  const handleCreateBackup = async () => { setCreating(true); const result = await api.backupCreate?.(); if (result) { const list = await api.backupList?.(); if (list) setBackups(list) }; setCreating(false) }
  const doRestoreBackup = async (path: string) => { setConfirmRestore(null); setRestoring(path); const ok = await api.backupRestore?.(path); setRestoring(null); toast(ok ? '恢复成功，请重启应用' : '恢复失败', ok ? 'success' : 'error') }
  const loadLog = async (filename: string) => { setSelectedLog(filename); setLogContent(await api.logsRead?.(filename) || '') }

  const tabs = [
    { id: 'general', label: '通用' },
    { id: 'ai', label: 'AI' },
    { id: 'models', label: '模型' },
    { id: 'data', label: '数据' },
    { id: 'backup', label: '备份' },
    { id: 'logs', label: '日志' },
    { id: 'about', label: '关于' },
  ]

  return (
    <div className="page" id="page-settings">
      <div className="pg" style={{ maxWidth: 'none' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>设置</h2>
        <div className="gc-tabs" style={{ marginBottom: 16 }}>
          {tabs.map(t => (
            <button key={t.id} className={'gc-tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {tab === 'general' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="setting-group">
              <h4>外观</h4>
              <div className="setting-row">
                <span className="label">主题</span>
                <select value={config.theme || 'system'} onChange={e => applyTheme(e.target.value)}>
                  <option value="light">浅色</option><option value="dark">深色</option><option value="system">跟随系统</option>
                </select>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text4)', margin: '-4px 0 8px' }}>切换应用的明暗主题。"跟随系统"会自动匹配操作系统的主题设置。</p>
              <div className="setting-row">
                <span className="label">桌面通知</span>
                <button role="switch" aria-checked={config.notifications?.desktop !== false} className={'toggle' + (config.notifications?.desktop !== false ? ' on' : '')} onClick={() => update('notifications.desktop', config.notifications?.desktop === false ? true : false)}></button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text4)', margin: '-4px 0 8px' }}>开启后，AI 回复完成、任务执行完毕等事件会弹出系统通知。关闭后不再弹出。</p>
            </div>
            <div className="setting-group">
              <h4>快捷键</h4>
              <div className="kv-row"><span className="k">Ctrl+N</span><span className="v">新建对话</span></div>
              <div className="kv-row"><span className="k">Ctrl+B</span><span className="v">切换侧边栏</span></div>
              <div className="kv-row"><span className="k">Ctrl+,</span><span className="v">打开设置</span></div>
              <div className="kv-row"><span className="k">Ctrl+K</span><span className="v">命令面板</span></div>
              <div className="kv-row"><span className="k">Ctrl+1-9</span><span className="v">快速切换页面</span></div>
              <div className="kv-row"><span className="k">Escape</span><span className="v">关闭弹窗 / 取消生成</span></div>
              <div className="kv-row"><span className="k">Enter</span><span className="v">发送消息</span></div>
              <div className="kv-row"><span className="k">Shift+Enter</span><span className="v">换行</span></div>
            </div>
          </div>
        )}

        {tab === 'ai' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="setting-group">
              <h4>推理参数</h4>
              <div className="setting-row">
                <span className="label">Temperature</span>
                <input type="number" step="0.1" min="0" max="2" value={config.ai?.temperature ?? 0.7} onChange={e => update('ai.temperature', parseFloat(e.target.value))} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text4)', margin: '-4px 0 8px' }}>控制 AI 回复的随机性。0 = 每次回复几乎一样（适合代码生成），1 = 适度随机（适合日常对话），2 = 最大随机（适合创意写作）。推荐 0.7。</p>
              <div className="setting-row">
                <span className="label">Max Tokens（输出上限）</span>
                <input type="number" step="1024" min="1024" max="131072" value={config.ai?.maxTokens ?? 16384} onChange={e => update('ai.maxTokens', Math.min(131072, Math.max(1024, parseInt(e.target.value))))} />
                {currentModel && <button className="btn btn-sm btn-ghost" onClick={() => update('ai.maxTokens', currentModel.maxTokens || 16384)} style={{ fontSize: 10, marginLeft: 8 }}>用模型最大值 ({((currentModel.maxTokens || 16384) / 1000).toFixed(0)}K)</button>}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text4)', margin: '-4px 0 8px' }}>AI 单次回复的最大 token 数。设太小会截断长回复。推荐设为模型最大值。上下文窗口（模型能读多少）由模型本身决定，无需手动设置。</p>
            </div>
            <div className="setting-group">
              <h4>当前模型</h4>
              {currentModel ? (
                <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                  <div className="kv-row"><span className="k">模型</span><span className="v">{currentModel.name || currentModel.id}</span></div>
                  <div className="kv-row"><span className="k">上下文窗口</span><span className="v">{((currentModel.contextWindow || 128000) / 1000).toFixed(0)}K tokens</span></div>
                  <div className="kv-row"><span className="k">最大输出</span><span className="v">{((currentModel.maxTokens || 4096) / 1000).toFixed(0)}K tokens</span></div>
                  <p style={{ color: 'var(--text4)', marginTop: 8 }}>在「模型配置」页面可查看所有模型的参数限制。</p>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--text3)' }}>未找到当前模型信息，请在「模型配置」页面添加模型。</p>
              )}
              <h4 style={{ marginTop: 12 }}>说明</h4>
              <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.8 }}>
                <p><b>Temperature</b>: 越低越确定，越高越随机。写代码用 0，聊天用 0.7，创作用 1+。</p>
                <p><b>Max Tokens</b>: AI 单次回复的最长长度，不是上下文窗口。超出模型上限会自动截断。</p>
                <p><b>上下文窗口</b>: 模型能"看到"的总内容量，由模型决定，不可调。</p>
              </div>
            </div>
          </div>
        )}

        {tab === 'data' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="setting-group">
              <h4>数据管理</h4>
              <div className="setting-row"><span className="label">导出数据</span><button className="btn btn-sm btn-secondary" onClick={() => api.dataExport().then((r: any) => { if (r.ok) toast('已导出到: ' + r.path, 'success') }).catch(() => { toast('导出失败', 'error') })}>导出</button></div>
              <p style={{ fontSize: 11, color: 'var(--text4)', margin: '-4px 0 8px' }}>将所有对话、记忆、Agent 配置导出为 JSON 文件，保存到桌面。可用于迁移到其他设备或手动备份。</p>
              <div className="setting-row"><span className="label">创建备份</span><button className="btn btn-sm btn-secondary" onClick={() => api.backupCreate?.().then((r: any) => { if (r) toast('备份已创建', 'success') }).catch(() => { toast('备份失败', 'error') })}>备份</button></div>
              <p style={{ fontSize: 11, color: 'var(--text4)', margin: '-4px 0 8px' }}>创建一份完整的数据库快照。如果数据丢失或损坏，可以在"备份管理"页面恢复到备份时的状态。</p>
            </div>
            <div className="setting-group">
              <h4>诊断工具</h4>
              <div className="setting-row"><span className="label">Gateway 状态</span><button className="btn btn-sm btn-secondary" onClick={() => api.healthCheck().then((r: any) => toast(r.gateway ? 'Gateway 正常 端口: ' + r.port : 'Gateway 未运行', r.gateway ? 'success' : 'error')).catch(() => { toast('检查失败', 'error') })}>检查</button></div>
              <p style={{ fontSize: 11, color: 'var(--text4)', margin: '-4px 0 8px' }}>检查 OpenClaw Gateway（AI 推理网关）是否正常运行。如果显示"未运行"，对话功能将不可用，需要先启动 Gateway。</p>
            </div>
          </div>
        )}

        {/* ── 模型配置 ── */}
        {tab === 'models' && (
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start', height: 'calc(100vh - 140px)' }}>
            {/* 左侧：供应商列表 */}
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>供应商</span>
                <button className="btn btn-primary btn-sm" onClick={() => { setEditId(null); setNewName(''); setNewUrl(''); setNewKey(''); setShowAdd(true) }}>+ 添加</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, overflowY: 'auto', paddingRight: 4 }}>
                {providers.map(p => {
                  const hasKey = !!p.apiKey
                  const modelCount = models.filter(m => m.provider === p.id).length
                  const color = getProviderColor(p.id)
                  const isTesting = testing === p.id
                  const tr = testResult[p.id]
                  return (
                    <div key={p.id} className="card" style={{ padding: '10px 12px', opacity: hasKey ? 1 : 0.5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: color + '18', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{(p.name || 'P')[0].toUpperCase()}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text4)' }}>{hasKey ? `${modelCount} 模型 · ${maskKey(p.apiKey)}` : '未配置 API Key'}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                          {hasKey && (
                            <button className="btn-icon-sm" onClick={() => handleTestProvider(p)} disabled={isTesting} title="测试连接">
                              {isTesting ? '...' : tr === true ? '✓' : tr === false ? '✗' : '⚡'}
                            </button>
                          )}
                          <button className="btn-icon-sm" onClick={() => handleEditProvider(p)} title="编辑">✎</button>
                          <button className="btn-icon-sm" onClick={() => handleDeleteProvider(p.id)} title="删除" style={{ color: 'var(--error)' }}>✕</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {providers.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text4)', fontSize: 12 }}>无供应商，点击上方添加</div>}
              </div>
            </div>

            {/* 右侧：模型列表 */}
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>可用模型 <span style={{ fontWeight: 400, color: 'var(--text4)' }}>({filteredModels.length})</span></span>
                <input type="text" placeholder="搜索..." value={modelSearch} onChange={e => setModelSearch(e.target.value)} style={{ width: 180, padding: '4px 10px', fontSize: 12 }} />
              </div>
              {/* 分类标签 */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                {modelCategories.map(cat => (
                  <button key={cat.id} onClick={() => setModelCategory(cat.id)}
                    style={{ padding: '3px 10px', fontSize: 11, borderRadius: 12, border: '1px solid ' + (modelCategory === cat.id ? 'var(--accent)' : 'var(--border)'), background: modelCategory === cat.id ? 'var(--accent)' : 'var(--bg1)', color: modelCategory === cat.id ? '#fff' : 'var(--text2)', cursor: 'pointer', fontWeight: modelCategory === cat.id ? 600 : 400 }}>
                    {cat.label} {cat.count}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, overflowY: 'auto', paddingRight: 4 }}>
                {filteredModels.map(m => {
                  const isActive = m.id === (config.ai?.model || 'openclaw')
                  const prov = providers.find(p => p.id === m.provider)
                  const color = getProviderColor(m.provider || '')
                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: isActive ? 'var(--accent-light)' : 'var(--bg1)', borderColor: isActive ? 'var(--accent)' : 'var(--border)' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: m.enabled !== false ? color : 'var(--text4)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: isActive ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name || m.id}</div>
                        <div style={{ fontSize: 10, color: 'var(--text4)' }}>{prov?.name || m.provider || '自定义'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>
                        <span title="上下文窗口">{((m.contextWindow || 0) / 1000).toFixed(0)}K ctx</span>
                        <span title="最大输出">{((m.maxTokens || 0) / 1000).toFixed(0)}K out</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        {isActive && <span className="badge badge-green" style={{ fontSize: 9 }}>当前</span>}
                      </div>
                    </div>
                  )
                })}
                {filteredModels.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text4)', fontSize: 12 }}>无匹配模型</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── 备份 ── */}
        {tab === 'backup' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span className="badge badge-blue">{backups.length} 个备份</span>
              <button className="btn btn-primary btn-sm" onClick={handleCreateBackup} disabled={creating}>
                {creating ? '创建中...' : '+ 创建备份'}
              </button>
            </div>
            {backups.length === 0 && <div className="empty-state"><h3>无备份</h3><p>系统每小时自动备份一次，也可手动创建</p></div>}
            {backups.map((b, i) => (
              <div key={b.path || b.timestamp || i} className="card" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                    {i === 0 ? '最新' : '#' + (i + 1)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="card-title">{new Date(b.timestamp).toLocaleString('zh-CN')}</div>
                    <div className="card-sub">{b.conversations} 个对话 / {b.messages} 条消息 / {formatSize(b.size)}</div>
                  </div>
                  <button className="btn btn-sm btn-secondary" onClick={() => setConfirmRestore(b.path)} disabled={restoring === b.path}>
                    {restoring === b.path ? '恢复中...' : '恢复'}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── 日志 ── */}
        {tab === 'logs' && (
          <>
            <div className="setting-group" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4>终端日志 ({useAppStore.getState().debugLogs.length})</h4>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => useAppStore.getState().clearDebugLogs()}>清空</button>
                  <button className="btn btn-sm btn-secondary" onClick={() => {
                    const text = useAppStore.getState().debugLogs.map(l => `[${l.t}] [${l.level}] ${l.msg}`).join('\n')
                    navigator.clipboard.writeText(text)
                  }}>复制全部</button>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text3)', margin: '6px 0 8px' }}>记录应用运行时的错误和警告信息。</p>
              <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 200, overflow: 'auto', padding: '4px 8px', fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.6 }}>
                {useAppStore.getState().debugLogs.length === 0 && <div style={{ color: 'var(--text4)', padding: 8 }}>暂无日志</div>}
                {useAppStore.getState().debugLogs.slice(-50).map((l, i) => (
                  <div key={i} style={{ color: l.level === 'error' ? 'var(--error)' : l.level === 'warn' ? 'var(--warning)' : 'var(--text2)', wordBreak: 'break-all' }}>
                    <span style={{ color: 'var(--text4)' }}>[{l.t}]</span> <span style={{ fontWeight: 600 }}>[{l.level}]</span> {l.msg}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', height: 400, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ width: 200, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
                <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600 }}>日志文件</h4>
                  <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 4, wordBreak: 'break-all' }}>{logDir}</div>
                  <button className="btn btn-sm btn-secondary" onClick={() => { if (logDir) api.filesOpen?.(logDir).catch(() => {}) }} style={{ marginTop: 8, width: '100%' }}>打开目录</button>
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: '4px 8px' }}>
                  {logFiles.map(f => (
                    <div key={f.name} className={'conv-item' + (selectedLog === f.name ? ' active' : '')} onClick={() => loadLog(f.name)}>
                      <span className="title" style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>{f.name}</span>
                      {f.size > 0 && <span style={{ fontSize: 10, color: 'var(--text4)' }}>{formatSize(f.size)}</span>}
                    </div>
                  ))}
                  {logFiles.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text4)', fontSize: 12 }}>无日志文件</div>}
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {selectedLog ? (
                  <>
                    <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{selectedLog}</span>
                      <button className="btn btn-sm btn-ghost" onClick={() => loadLog(selectedLog)}>&#8634; 刷新</button>
                    </div>
                    <pre style={{ flex: 1, margin: 0, padding: 16, fontSize: 11.5, lineHeight: 1.6, fontFamily: 'var(--mono)', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {logContent || '无内容'}
                    </pre>
                  </>
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="empty-state"><h3>选择日志文件</h3><p>在左侧选择一个日志文件查看</p></div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── 关于 ── */}
        {tab === 'about' && (
          <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ marginBottom: 24 }}>
              <img src="logo.png" alt="AaronClaw" style={{ width: 56, height: 56, borderRadius: 14, boxShadow: '0 6px 20px rgba(79,70,229,0.18)' }} />
              <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 10, marginBottom: 4 }}>AaronClaw</h2>
              <p style={{ color: 'var(--text3)', fontSize: 13 }}>AI Agent Desktop Client v3.0.0</p>
            </div>
            <div className="about-table" style={{ textAlign: 'left' }}>
              <div className="about-row"><span>Electron</span><span style={{ fontFamily: 'var(--mono)' }}>{aboutInfo.electron || '-'}</span></div>
              <div className="about-row"><span>Chrome</span><span style={{ fontFamily: 'var(--mono)' }}>{aboutInfo.chrome || '-'}</span></div>
              <div className="about-row"><span>Node.js</span><span style={{ fontFamily: 'var(--mono)' }}>{aboutInfo.node || '-'}</span></div>
              <div className="about-row"><span>平台</span><span>{aboutInfo.platform} / {aboutInfo.arch}</span></div>
              <div className="about-row"><span>数据目录</span><span style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{aboutInfo.userData || '-'}</span></div>
            </div>
          </div>
        )}

        {(tab === 'general' || tab === 'ai') && (
          <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={handleSave}>{saved ? '已保存' : '保存设置'}</button>
            {saved && <span style={{ fontSize: 12, color: 'var(--success)' }}>设置已保存</span>}
          </div>
        )}
      </div>
      {showAdd && (
        <div className="modal-overlay" onClick={e => { e.stopPropagation(); e.preventDefault() }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header"><h3>{editId ? '编辑供应商' : '添加供应商'}</h3></div>
            <div className="modal-body">
              <div className="form-group"><label>名称</label><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="OpenAI, DeepSeek, Anthropic..." /></div>
              <div className="form-group"><label>Base URL（默认）</label><input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://api.openai.com/v1" /></div>
              <div className="form-group"><label>API Key</label><input type="password" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder={editId ? "留空表示不修改" : "sk-..."} /></div>

              <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, display: 'block' }}>模型列表</label>
                <p style={{ fontSize: 11, color: 'var(--text4)', margin: '0 0 8px' }}>添加此供应商支持的模型。不同模型可配置不同 URL（如 coding/plan 套餐用不同端点）。</p>
                {providerModels.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                    {providerModels.map((m, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}>
                        <span style={{ fontWeight: 600, flex: '0 0 auto' }}>{m.id}</span>
                        {m.apiId && <span style={{ color: 'var(--accent)', fontSize: 10 }}>→ {m.apiId}</span>}
                        {m.baseUrl && <span style={{ color: 'var(--text4)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.baseUrl}</span>}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                          <button className="btn-icon-sm" onClick={() => handleEditModel(i)} title="编辑">✎</button>
                          <button className="btn-icon-sm" onClick={() => handleDeleteModel(i)} title="删除" style={{ color: 'var(--error)' }}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 120px' }}>
                    <input value={mId} onChange={e => setMId(e.target.value)} placeholder="模型 ID（如 mimo-pro）" style={{ width: '100%', fontSize: 12 }} />
                  </div>
                  <div style={{ flex: '1 1 100px' }}>
                    <input value={mName} onChange={e => setMName(e.target.value)} placeholder="显示名称" style={{ width: '100%', fontSize: 12 }} />
                  </div>
                  <div style={{ flex: '1 1 120px' }}>
                    <input value={mApiId} onChange={e => setMApiId(e.target.value)} placeholder="API 映射名（可选）" style={{ width: '100%', fontSize: 12 }} />
                  </div>
                  <div style={{ flex: '1 1 150px' }}>
                    <input value={mUrl} onChange={e => setMUrl(e.target.value)} placeholder="自定义 URL（可选）" style={{ width: '100%', fontSize: 12 }} />
                  </div>
                  <button className="btn btn-sm btn-primary" onClick={handleAddModel} style={{ whiteSpace: 'nowrap' }}>
                    {editingModel !== null ? '更新' : '添加'}
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowAdd(false); setEditId(null) }}>取消</button>
              <button className="btn btn-primary" onClick={handleSaveProvider}>保存</button>
            </div>
          </div>
        </div>
      )}
      {confirmRestore && <ConfirmModal title="恢复备份" message="确认从此备份恢复？当前数据将被备份后覆盖。" onConfirm={() => doRestoreBackup(confirmRestore)} onCancel={() => setConfirmRestore(null)} danger />}
    </div>
  )
}
