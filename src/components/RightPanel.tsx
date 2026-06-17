import { useEffect, useState, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'
import { ConfirmModal } from './ui'

const fmt = (n: number) => n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)

const MODEL_PRICES: Array<{ pattern: RegExp; input: number; output: number }> = [
  { pattern: /gpt-4o-mini/i, input: 0.15, output: 0.60 },
  { pattern: /gpt-4o/i, input: 2.50, output: 10 },
  { pattern: /gpt-4-turbo/i, input: 10, output: 30 },
  { pattern: /claude-3\.5-sonnet|claude-sonnet-3\.5|sonnet/i, input: 3, output: 15 },
  { pattern: /claude-3\.5-haiku|claude-haiku-3\.5|haiku/i, input: 0.80, output: 4 },
  { pattern: /opus/i, input: 15, output: 75 },
  { pattern: /deepseek-r1/i, input: 0.55, output: 2.19 },
  { pattern: /deepseek/i, input: 0.27, output: 1.10 },
  { pattern: /qwen-max/i, input: 2.40, output: 9.60 },
  { pattern: /qwen-plus/i, input: 0.40, output: 1.20 },
  { pattern: /qwen-turbo/i, input: 0.05, output: 0.20 },
  { pattern: /gemini-1\.5-pro|gemini-pro/i, input: 1.25, output: 5 },
  { pattern: /gemini.*flash/i, input: 0.075, output: 0.30 },
]

function estimateCost(model: string | null, usage: { prompt_tokens: number; completion_tokens: number } | null): number | null {
  if (!model || !usage) return null
  const m = model.toLowerCase()
  const price = MODEL_PRICES.find(p => p.pattern.test(m))
  if (!price) return null
  return (usage.prompt_tokens * price.input + usage.completion_tokens * price.output) / 1_000_000
}

function useCollapsed(key: string, defaultCollapsed = false) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('rp_' + key) === '1' } catch { return defaultCollapsed }
  })
  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem('rp_' + key, next ? '1' : '0') } catch {}
  }
  return { collapsed, toggle }
}

function Section({ id, title, children, defaultCollapsed }: { id: string; title: string; children: React.ReactNode; defaultCollapsed?: boolean }) {
  const { collapsed, toggle } = useCollapsed(id, defaultCollapsed)
  return (
    <div className="rp-section">
      <div className="rp-collapse-trigger" onClick={toggle}>
        <span className={`rp-arrow${collapsed ? '' : ' open'}`}>▸</span>
        <span className="rp-section-label">{title}</span>
      </div>
      {!collapsed && <div className="rp-section-body">{children}</div>}
    </div>
  )
}

export function RightPanel() {
  const currentConvId = useAppStore(s => s.currentConvId)
  const gatewayRunning = useAppStore(s => s.gatewayRunning)
  const currentAgent = useAppStore(s => s.currentAgent)
  const lastUsage = useAppStore(s => s.lastUsage)
  const lastModel = useAppStore(s => s.lastModel)
  const maxMode = useAppStore(s => s.chatMaxMode)
  const toggleMaxMode = useAppStore(s => s.toggleChatMaxMode)
  const goalJudgeEnabled = useAppStore(s => s.chatGoalJudgeEnabled)
  const toggleGoalJudge = useAppStore(s => s.toggleChatGoalJudge)
  const streamSpeed = useAppStore(s => s.streamSpeed)
  const speedHistory = useAppStore(s => s.speedHistory)
  const isStreaming = useAppStore(s => s.isStreaming)
  const [config, setConfig] = useState<any>({})
  const [models, setModels] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [convTitle, setConvTitle] = useState('')

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => {})
    api.modelsList().then(setModels).catch(() => {})
  }, [])

  useEffect(() => {
    if (currentConvId) {
      api.convMessages(currentConvId).then(setMessages).catch(() => {})
      api.convList().then((convs: any[]) => {
        const conv = convs.find((c: any) => c.id === currentConvId)
        setConvTitle(conv?.title || '')
      }).catch(() => {})
    } else {
      setMessages([])
      setConvTitle('')
    }
  }, [currentConvId])

  const ctx = useMemo(() => {
    const modelId = currentAgent?.model || config.ai?.model || 'openclaw'
    const model = models.find((m: any) => m.id === modelId)
    const max = model?.contextWindow || 128000
    const sys = currentAgent?.systemPrompt ? Math.ceil(currentAgent.systemPrompt.length / 4) : 0
    const msg = messages.reduce((s: number, m: any) => s + (m.tokens || Math.ceil((m.content || '').length / 4)), 0)
    const used = sys + msg
    const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0
    return { used, max, pct, free: Math.max(0, max - used), modelId, model }
  }, [messages, currentAgent, config, models])

  const stats = useMemo(() => {
    if (!messages.length) return null
    const user = messages.filter((m: any) => m.role === 'user').length
    const ai = messages.filter((m: any) => m.role === 'assistant').length
    const tokens = messages.reduce((s: number, m: any) => s + (m.tokens || Math.ceil((m.content || '').length / 4)), 0)
    const times: number[] = []
    for (let i = 0; i < messages.length - 1; i++) {
      if (messages[i].role === 'user' && messages[i + 1]?.role === 'assistant') {
        const t1 = new Date(messages[i].timestamp || 0).getTime()
        const t2 = new Date(messages[i + 1].timestamp || 0).getTime()
        if (t1 > 0 && t2 > t1) times.push(t2 - t1)
      }
    }
    const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0
    const first = new Date(messages[0].timestamp || 0).getTime()
    const last = new Date(messages[messages.length - 1].timestamp || 0).getTime()
    const dur = first > 0 && last > first ? Math.round((last - first) / 60000) : 0
    const toolMsgs = messages.filter((m: any) => m.tool_calls).length
    const convCost = lastModel ? (() => {
      const m = lastModel.toLowerCase()
      const price = MODEL_PRICES.find(p => p.pattern.test(m))
      if (!price) return null
      const totalInput = messages.filter((x: any) => x.role === 'user').reduce((s: number, x: any) => s + (x.tokens || Math.ceil((x.content || '').length / 4)), 0)
      const totalOutput = messages.filter((x: any) => x.role === 'assistant').reduce((s: number, x: any) => s + (x.tokens || Math.ceil((x.content || '').length / 4)), 0)
      return (totalInput * price.input + totalOutput * price.output) / 1_000_000
    })() : null
    return { total: messages.length, user, ai, tokens, avg, dur, toolMsgs, convCost }
  }, [messages, lastModel])

  const toolSummary = useMemo(() => {
    const tools: Record<string, { calls: number; successes: number }> = {}
    for (const m of messages) {
      if (!m.tool_calls) continue
      try {
        const tcs = JSON.parse(m.tool_calls)
        const arr = Array.isArray(tcs) ? tcs : []
        for (const tc of arr) {
          const name = tc?.function?.name || tc?.name || 'unknown'
          if (!tools[name]) tools[name] = { calls: 0, successes: 0 }
          tools[name].calls++
          if (!tc.error) tools[name].successes++
        }
      } catch {}
    }
    return Object.entries(tools).sort((a, b) => b[1].calls - a[1].calls).slice(0, 8)
  }, [messages])

  const tokenSparkline = useMemo(() => {
    const pts = messages.filter((m: any) => m.role === 'assistant' && m.tokens).map((m: any) => m.tokens || Math.ceil((m.content || '').length / 4))
    if (pts.length < 2) return null
    const max = Math.max(...pts, 1)
    const w = 120, h = 28
    const coords = pts.map((v, i) => {
      const x = (i / (pts.length - 1)) * w
      const y = h - (v / max) * (h - 4) - 2
      return `${x},${y}`
    })
    return { line: coords.join(' '), area: `0,${h} ${coords.join(' ')} ${w},${h}`, w, h, max, last: pts[pts.length - 1] }
  }, [messages])

  const runningCost = useMemo(() => {
    if (!messages.length) return null
    const m = (lastModel || '').toLowerCase()
    const price = MODEL_PRICES.find(p => p.pattern.test(m))
    if (!price) return null
    let total = 0
    for (const msg of messages) {
      const tokens = msg.tokens || Math.ceil((msg.content || '').length / 4)
      total += tokens * (msg.role === 'user' ? price.input : price.output) / 1_000_000
    }
    return total
  }, [messages, lastModel])

  const handleExport = () => {
    if (!currentConvId) return
    const ts = new Date().toLocaleString()
    const parts: string[] = [`# ${convTitle || '对话'}\n\n导出时间: ${ts}\n\n---\n\n`]
    for (const m of messages) {
      const role = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System'
      parts.push(`## ${role}\n\n${m.content}\n\n`)
      if (m.thinking) parts.push(`<details><summary>思考过程</summary>\n\n${m.thinking}\n\n</details>\n\n`)
      if (m.tool_calls) {
        try {
          const tcs = JSON.parse(m.tool_calls)
          if (Array.isArray(tcs) && tcs.length > 0) parts.push(`> 使用了 ${tcs.length} 个工具\n\n`)
        } catch {}
      }
    }
    const blob = new Blob([parts.join('')], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${convTitle || currentConvId.slice(0, 8)}.md`; a.click()
    URL.revokeObjectURL(url)
  }

  const confirmClear = () => {
    if (currentConvId) {
      const cid = currentConvId
      api.convDelete(cid).then(() => {
        setMessages([])
        useAppStore.setState(s => ({ messages: [], currentConvId: null, conversations: s.conversations.filter((c: any) => c.id !== cid) }))
      })
    }
    setShowClearConfirm(false)
  }

  const agent = currentAgent

  if (!agent) return (
    <div id="right">
      <div style={{ padding: 16, fontSize: 12, color: 'var(--text3)' }}>暂无智能体</div>
    </div>
  )

  return (
    <div id="right">
      {/* Agent + Gateway status */}
      <div className="rp-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: agent.color || 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{(agent.name || 'A')[0]}</div>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</div>
          <span style={{ fontSize: 10, color: gatewayRunning ? 'var(--success)' : 'var(--error)', fontWeight: 500 }}>{gatewayRunning ? '● 已连接' : '○ 未连接'}</span>
        </div>
      </div>

      {/* Conversation info */}
      {currentConvId && (
        <div className="rp-section">
          <div style={{ fontSize: 10, color: 'var(--text4)', marginBottom: 2 }}>当前对话</div>
          <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{convTitle || currentConvId.slice(0, 12)}</div>
        </div>
      )}

      {/* Context bar */}
      <Section id="ctx" title="上下文">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text4)' }}>{fmt(ctx.used)} / {fmt(ctx.max)}</span>
          <span style={{ fontSize: 10, color: ctx.pct > 80 ? 'var(--error)' : 'var(--text4)' }}>{ctx.pct}%</span>
        </div>
        <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: ctx.pct + '%', height: '100%', borderRadius: 2, background: ctx.pct > 80 ? 'var(--error)' : ctx.pct > 50 ? 'var(--warning)' : 'var(--accent)', transition: 'width 0.3s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 10, color: 'var(--text4)' }}>
          <span>剩余 {fmt(ctx.free)}</span>
          <span>{(lastModel || ctx.modelId || 'openclaw').split('/').pop()}</span>
        </div>
      </Section>

      {/* Stats */}
      {stats && (
        <Section id="stats" title="统计">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px', fontSize: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text4)' }}>消息</span><span style={{ fontWeight: 600 }}>{stats.total}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text4)' }}>Tokens</span><span style={{ fontWeight: 600 }}>{fmt(stats.tokens)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text4)' }}>用户</span><span style={{ fontWeight: 600 }}>{stats.user}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text4)' }}>AI</span><span style={{ fontWeight: 600 }}>{stats.ai}</span></div>
            {stats.toolMsgs > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text4)' }}>工具</span><span style={{ fontWeight: 600 }}>{stats.toolMsgs}</span></div>}
            {stats.avg > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text4)' }}>响应</span><span style={{ fontWeight: 600 }}>{(stats.avg / 1000).toFixed(1)}s</span></div>}
            {stats.dur > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text4)' }}>时长</span><span style={{ fontWeight: 600 }}>{stats.dur >= 60 ? `${Math.floor(stats.dur / 60)}h${stats.dur % 60}m` : `${stats.dur}m`}</span></div>}
            {lastUsage && (() => {
              const cost = estimateCost(lastModel, lastUsage)
              return cost !== null ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', gridColumn: '1/-1' }}>
                  <span style={{ color: 'var(--text4)' }}>费用</span>
                  <span style={{ fontWeight: 600, color: cost > 0.1 ? 'var(--warning)' : 'var(--text)' }}>${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(3)}</span>
                </div>
              ) : null
            })()}
          </div>
        </Section>
      )}

      {/* Quick actions */}
      <Section id="actions" title="快捷操作">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className={`rp-toggle-btn${maxMode ? ' on' : ''}`}
              onClick={toggleMaxMode}
              title="MaxMode: 并行生成3个方案+自动Judge"
              style={{ flex: 1, background: maxMode ? 'var(--accent)' : 'var(--bg3)', color: maxMode ? '#fff' : 'var(--text3)' }}
            >M MaxMode</button>
            <button
              className={`rp-toggle-btn${goalJudgeEnabled ? ' on' : ''}`}
              onClick={toggleGoalJudge}
              title="Goal Judge: 自动验证任务完成度"
              style={{ flex: 1, background: goalJudgeEnabled ? 'var(--success)' : 'var(--bg3)', color: goalJudgeEnabled ? '#fff' : 'var(--text3)' }}
            >G Judge</button>
          </div>
        </div>
      </Section>

      {/* Token sparkline */}
      {tokenSparkline && (
        <Section id="tokens" title="Token 消耗趋势" defaultCollapsed>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width={tokenSparkline.w} height={tokenSparkline.h} style={{ flex: 1 }}>
              <defs>
                <linearGradient id="rpSparkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <polygon points={tokenSparkline.area} fill="url(#rpSparkGrad)" />
              <polyline points={tokenSparkline.line} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', minWidth: 40, textAlign: 'right' }}>{fmt(tokenSparkline.last)}</div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 2 }}>峰值 {fmt(tokenSparkline.max)} / 消息</div>
        </Section>
      )}

      {/* Streaming speed */}
      {streamSpeed && speedHistory.length > 1 && (
        <Section id="speed" title="实时流速">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width={120} height={28} style={{ flex: 1 }}>
              <defs>
                <linearGradient id="rpSpeedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isStreaming ? 'var(--success)' : 'var(--text4)'} stopOpacity="0.25" />
                  <stop offset="100%" stopColor={isStreaming ? 'var(--success)' : 'var(--text4)'} stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {(() => {
                const w = 120, h = 28
                const maxCps = Math.max(...speedHistory.map(p => p.cps), 1)
                const pts = speedHistory.map((p, i) => {
                  const x = (i / (speedHistory.length - 1)) * w
                  const y = h - (p.cps / maxCps) * (h - 4) - 2
                  return `${x},${y}`
                })
                const line = pts.join(' ')
                const area = `0,${h} ${line} ${w},${h}`
                return (
                  <>
                    <polygon points={area} fill="url(#rpSpeedGrad)" />
                    <polyline points={line} fill="none" stroke={isStreaming ? 'var(--success)' : 'var(--text4)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </>
                )
              })()}
            </svg>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: isStreaming ? 'var(--success)' : 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{streamSpeed.cps}</div>
              <div style={{ fontSize: 9, color: 'var(--text4)' }}>c/s</div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 2 }}>{streamSpeed.chars} 字符 / {streamSpeed.elapsed.toFixed(1)}s</div>
        </Section>
      )}

      {/* Tool calls summary */}
      {toolSummary.length > 0 && (
        <Section id="tools" title="工具调用" defaultCollapsed>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {toolSummary.map(([name, data]) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text2)' }}>{name}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{data.calls}x</span>
                {data.successes < data.calls && (
                  <span style={{ fontSize: 9, color: 'var(--error)' }}>{data.calls - data.successes} fail</span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Running cost */}
      {runningCost !== null && runningCost > 0 && (
        <Section id="cost" title="费用累计">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: runningCost > 0.5 ? 'var(--warning)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>${runningCost < 0.01 ? runningCost.toFixed(4) : runningCost.toFixed(3)}</span>
            <span style={{ fontSize: 10, color: 'var(--text4)' }}>本次对话</span>
          </div>
        </Section>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Actions */}
      <div style={{ padding: '8px 12px', display: 'flex', gap: 6, borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-sm btn-secondary" onClick={handleExport} disabled={!currentConvId}>导出</button>
        <button className="btn btn-sm btn-secondary" onClick={() => setShowClearConfirm(true)} disabled={!currentConvId}>清空</button>
      </div>

      {showClearConfirm && <ConfirmModal title="清空对话" message="确认清空当前对话的所有消息？" onConfirm={confirmClear} onCancel={() => setShowClearConfirm(false)} danger />}
    </div>
  )
}
