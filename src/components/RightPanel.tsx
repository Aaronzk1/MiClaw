import { useEffect, useState, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'
import { ConfirmModal } from './ui'

export function RightPanel() {
  const currentConvId = useAppStore(s => s.currentConvId)
  const gatewayRunning = useAppStore(s => s.gatewayRunning)
  const agents = useAppStore(s => s.agents)
  const setAgents = useAppStore(s => s.setAgents)
  const currentAgent = useAppStore(s => s.currentAgent)
  const setCurrentAgent = useAppStore(s => s.setCurrentAgent)
  const memories = useAppStore(s => s.memories)
  const setMemories = useAppStore(s => s.setMemories)
  const [config, setConfig] = useState<any>({})
  const [models, setModels] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  useEffect(() => {
    if (!agents.length) api.agentsList().then(setAgents).catch(() => {})
    api.memoryList().then(setMemories).catch(() => {})
    api.getConfig().then(setConfig).catch(() => {})
    api.modelsList().then(setModels).catch(() => {})
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
    const modelId = currentAgent?.model || config.ai?.model || 'openclaw'
    const model = models.find((m: any) => m.id === modelId)
    const maxCtx = model?.contextWindow || 128000
    const systemTokens = currentAgent?.systemPrompt ? Math.ceil(currentAgent.systemPrompt.length / 4) : 0
    const msgTokens = messages.reduce((sum: number, m: any) => sum + (m.tokens || Math.ceil((m.content || '').length / 4)), 0)
    const used = systemTokens + msgTokens
    const free = Math.max(0, maxCtx - used)
    return {
      system: systemTokens,
      messages: msgTokens,
      tools: 0,
      free,
      total: maxCtx,
      pctSystem: maxCtx > 0 ? Math.min(100, Math.round((systemTokens / maxCtx) * 100)) : 0,
      pctMessages: maxCtx > 0 ? Math.min(100 - Math.min(100, Math.round((systemTokens / maxCtx) * 100)), Math.round((msgTokens / maxCtx) * 100)) : 0,
      pctFree: maxCtx > 0 ? Math.max(0, 100 - Math.min(100, Math.round((systemTokens / maxCtx) * 100)) - Math.min(100, Math.round((msgTokens / maxCtx) * 100))) : 100,
    }
  }, [messages, currentAgent, config, models])

  const handleExport = () => {
    if (!currentConvId) return
    const text = messages.map((m: any) => `[${m.role}] ${m.content}`).join('\n\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `conversation-${currentConvId.slice(0, 8)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClear = () => {
    if (!currentConvId) return
    setShowClearConfirm(true)
  }

  const confirmClear = () => {
    if (currentConvId) {
      const cid = currentConvId
      api.convDelete(cid).then(() => {
        setMessages([])
        useAppStore.setState(s => ({
          messages: [],
          currentConvId: null,
          conversations: s.conversations.filter((c: any) => c.id !== cid),
        }))
      })
    }
    setShowClearConfirm(false)
  }

  const agent = currentAgent || agents[0]
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const colorPresets = ['#4f46e5', '#ec4899', '#16a34a', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#a855f7']

  if (!agent) return <div id="right"><div className="rp-section"><h4>加载中...</h4></div></div>

  const startEdit = () => { setEditing(true); setEditName(agent.name || ''); setEditColor(agent.color || '#4f46e5') }
  const saveEdit = () => {
    if (!editName.trim()) return
    const updated = { ...agent, name: editName.trim(), color: editColor, identity: editName.trim() }
    api.agentsSave(updated).then(() => {
      useAppStore.getState().setCurrentAgent(updated)
      setEditing(false)
    }).catch(() => {})
  }

  return (
    <div id="right" role="complementary" aria-label="智能体信息面板">
      <div className="rp-header">
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0', width: '100%' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {colorPresets.map(c => <div key={c} onClick={() => setEditColor(c)} style={{ width: 22, height: 22, borderRadius: 6, background: c, cursor: 'pointer', border: editColor === c ? '2px solid var(--text)' : '2px solid transparent' }}></div>)}
            </div>
            <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
              style={{ width: '100%', padding: '4px 8px', fontSize: 12, border: '1px solid var(--accent)', borderRadius: 4, outline: 'none' }} placeholder="Agent 名称" />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-sm btn-primary" onClick={saveEdit}>保存</button>
              <button className="btn btn-sm btn-ghost" onClick={() => setEditing(false)}>取消</button>
            </div>
          </div>
        ) : (
          <>
            <div className="rp-avatar" style={{ background: agent.color || 'var(--accent)', cursor: 'pointer' }} onClick={startEdit} title="点击编辑名称和颜色">{(agent.name || 'A')[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                {agent.name}
                <span style={{ fontSize: 10, color: 'var(--text4)', cursor: 'pointer' }} onClick={startEdit}>✎</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                <span className="gw-dot" style={{ background: gatewayRunning ? 'var(--success)' : 'var(--error)', display: 'inline-block', width: 6, height: 6, borderRadius: '50%', marginRight: 4 }}></span>
                {gatewayRunning ? '运行中' : '未连接'}
              </div>
            </div>
          </>
        )}
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
        <h4>当前智能体</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: agent.color || 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{(agent.name || 'A')[0]}</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{agent.name}</div>
            <div style={{ fontSize: 10, color: 'var(--text4)' }}>{agent.description || ''}</div>
          </div>
        </div>
        {agent.skills?.length > 0 && (
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 8 }}>
            {agent.skills.slice(0, 10).map((s: string) => <span key={s} className="badge badge-blue" style={{ fontSize: 9 }}>{s}</span>)}
            {agent.skills.length > 10 && <span className="badge" style={{ fontSize: 9 }}>+{agent.skills.length - 10}</span>}
          </div>
        )}
      </div>

      <div className="rp-section">
        <h4>快捷操作</h4>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-sm btn-secondary" onClick={handleExport} disabled={!currentConvId}>导出对话</button>
          <button className="btn btn-sm btn-secondary" onClick={handleClear} disabled={!currentConvId}>清空对话</button>
        </div>
      </div>
      {showClearConfirm && <ConfirmModal title="清空对话" message="确认清空当前对话的所有消息？" onConfirm={confirmClear} onCancel={() => setShowClearConfirm(false)} danger />}
    </div>
  )
}
