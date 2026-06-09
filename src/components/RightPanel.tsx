import { useEffect, useState, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'

export function RightPanel() {
  const { currentConvId, gatewayRunning, setGatewayRunning } = useAppStore()
  const [agent, setAgent] = useState<any>(null)
  const [memories, setMemories] = useState<any[]>([])
  const [config, setConfig] = useState<any>({})
  const [messages, setMessages] = useState<any[]>([])

  useEffect(() => {
    api.agentsList().then((a: any[]) => { if (a.length) setAgent(a[0]) }).catch(() => {})
    api.memoryList().then(setMemories).catch(() => {})
    api.getConfig().then(setConfig).catch(() => {})
    api.gatewayStatus().then((s: any) => setGatewayRunning(s.running)).catch(() => {})
    const timer = setInterval(() => {
      api.gatewayStatus().then((s: any) => setGatewayRunning(s.running)).catch(() => {})
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (currentConvId) api.convMessages(currentConvId).then(setMessages).catch(() => {})
    else setMessages([])
  }, [currentConvId])

  const memStats = useMemo(() => {
    const short = memories.filter(m => m.category === 'short' || m.category === 'user_pref' || m.category === 'general').length
    const mid = memories.filter(m => m.category === 'mid' || m.category === 'project' || m.category === 'config').length
    const long = memories.filter(m => m.category === 'long' || m.category === 'architecture').length
    return { short, mid, long, total: memories.length }
  }, [memories])

  const ctxUsage = useMemo(() => {
    const maxCtx = config.ai?.maxTokens || 4096
    const systemTokens = agent?.systemPrompt ? Math.ceil(agent.systemPrompt.length / 4) : 0
    const msgTokens = messages.reduce((sum: number, m: any) => sum + (m.tokens || Math.ceil((m.content || '').length / 4)), 0)
    const used = systemTokens + msgTokens
    const free = Math.max(0, maxCtx - used)
    return {
      system: systemTokens,
      messages: msgTokens,
      tools: 0,
      free,
      total: maxCtx,
      pctSystem: maxCtx > 0 ? Math.round((systemTokens / maxCtx) * 100) : 0,
      pctMessages: maxCtx > 0 ? Math.round((msgTokens / maxCtx) * 100) : 0,
      pctFree: maxCtx > 0 ? Math.round((free / maxCtx) * 100) : 100,
    }
  }, [messages, agent, config])

  const handleExport = () => {
    if (!currentConvId) return
    const text = messages.map((m: any) => `[${m.role}] ${m.content}`).join('\n\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `conversation-${currentConvId.slice(0, 8)}.txt`
    a.click()
  }

  const handleClear = () => {
    if (!currentConvId) return
    if (confirm('确认清空当前对话的所有消息？')) {
      api.convDelete(currentConvId).then(() => {
        setMessages([])
      })
    }
  }

  if (!agent) return <div id="right"><div className="rp-section"><h4>加载中...</h4></div></div>

  return (
    <div id="right">
      <div className="rp-header">
        <div className="rp-avatar">{(agent.name || 'A')[0]}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{agent.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            <span className="gw-dot" style={{ background: gatewayRunning ? 'var(--success)' : 'var(--error)', display: 'inline-block', width: 6, height: 6, borderRadius: '50%', marginRight: 4 }}></span>
            {gatewayRunning ? '运行中' : '未连接'}
          </div>
        </div>
      </div>

      <div className="rp-section">
        <h4>上下文窗口</h4>
        <div className="ctx-bar">
          <div className="ctx-seg" style={{ width: ctxUsage.pctSystem + '%', background: 'var(--accent)' }}></div>
          <div className="ctx-seg" style={{ width: ctxUsage.pctMessages + '%', background: 'var(--success)' }}></div>
          <div className="ctx-seg" style={{ width: (100 - ctxUsage.pctSystem - ctxUsage.pctMessages) + '%', background: 'var(--bg3)' }}></div>
        </div>
        <div className="kv-row"><span className="k">System</span><span className="v">{ctxUsage.system} tokens ({ctxUsage.pctSystem}%)</span></div>
        <div className="kv-row"><span className="k">Messages</span><span className="v">{ctxUsage.messages} tokens ({ctxUsage.pctMessages}%)</span></div>
        <div className="kv-row"><span className="k">Free</span><span className="v">{ctxUsage.free} tokens ({ctxUsage.pctFree}%)</span></div>
        <div className="kv-row"><span className="k">Total</span><span className="v">{ctxUsage.total} tokens</span></div>
      </div>

      <div className="rp-section">
        <h4>记忆</h4>
        <div className="kv-row"><span className="k">短期</span><span className="v">{memStats.short}</span></div>
        <div className="kv-row"><span className="k">中期</span><span className="v">{memStats.mid}</span></div>
        <div className="kv-row"><span className="k">长期</span><span className="v">{memStats.long}</span></div>
        <div className="kv-row"><span className="k">总计</span><span className="v">{memStats.total}</span></div>
      </div>

      <div className="rp-section">
        <h4>快捷操作</h4>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-sm btn-secondary" onClick={handleExport} disabled={!currentConvId}>导出对话</button>
          <button className="btn btn-sm btn-secondary" onClick={handleClear} disabled={!currentConvId}>清空对话</button>
        </div>
      </div>
    </div>
  )
}
