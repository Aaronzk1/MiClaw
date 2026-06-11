import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'
import { AlertModal } from '../components/ui'
import { MessageBubble } from '../components/MessageBubble'

export function ChatPage() {
  const currentConvId = useAppStore(s => s.currentConvId)
  const setCurrentConvId = useAppStore(s => s.setCurrentConvId)
  const messages = useAppStore(s => s.messages)
  const setMessages = useAppStore(s => s.setMessages)
  const addMessage = useAppStore(s => s.addMessage)
  const isStreaming = useAppStore(s => s.isStreaming)
  const setStreaming = useAppStore(s => s.setStreaming)
  const streamBuf = useAppStore(s => s.streamBuf)
  const appendToken = useAppStore(s => s.appendToken)
  const thinkBuf = useAppStore(s => s.thinkBuf)
  const appendThink = useAppStore(s => s.appendThink)
  const toolCalls = useAppStore(s => s.toolCalls)
  const addToolCall = useAppStore(s => s.addToolCall)
  const resetStream = useAppStore(s => s.resetStream)
  const setTokenUsage = useAppStore(s => s.setTokenUsage)
  const conversations = useAppStore(s => s.conversations)
  const setConversations = useAppStore(s => s.setConversations)
  const [input, setInput] = useState('')
  const models = useAppStore(s => s.models)
  const setModels = useAppStore(s => s.setModels)
  const config = useAppStore(s => s.config)
  const setConfig = useAppStore(s => s.setConfig)
  const agents = useAppStore(s => s.agents)
  const setAgents = useAppStore(s => s.setAgents)
  const currentAgent = useAppStore(s => s.currentAgent)
  const setCurrentAgent = useAppStore(s => s.setCurrentAgent)
  const [gwRunning, setGwRunning] = useState(true)
  const msgEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [replyingTo, setReplyingTo] = useState<{ idx: number; content: string } | null>(null)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [showPromptLib, setShowPromptLib] = useState(false)
  const [prompts, setPrompts] = useState<any[]>([])
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [showMemoryModal, setShowMemoryModal] = useState(false)
  const [showAlert, setShowAlert] = useState<{ message: string } | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [memoryInput, setMemoryInput] = useState('')
  const tokenUsage = useAppStore(s => s.tokenUsage)
  const [playingTts, setPlayingTts] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)

  const contextInfo = useMemo(() => {
    const modelId = config.ai?.model || 'openclaw'
    const model = models.find((m: any) => m.id === modelId)
    const total = model?.contextWindow || 128000
    const used = tokenUsage || 0
    const remaining = Math.max(0, total - used)
    const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
    const fmt = (n: number) => n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)
    return { used, total, remaining, pct, fmt }
  }, [tokenUsage, config.ai?.model, models])
  const streamBufRef = useRef('')
  const skipConvEffectRef = useRef(false)
  const convLoadSeq = useRef(0)

  useEffect(() => {
    api.getConfig().then(setConfig).catch(console.error)
    api.agentsList().then((a: any[]) => {
      setAgents(a)
      // Only restore agent if not already set (Sidebar may have already done this)
      const cur = useAppStore.getState().currentAgent
      if (!cur && a.length) {
        const saved = localStorage.getItem('currentAgentId')
        const found = saved ? a.find((x: any) => x.id === saved) : null
        setCurrentAgent(found || a[0])
      }
    }).catch(console.error)
    api.gatewayStatus().then((s: any) => setGwRunning(s.running)).catch(() => setGwRunning(false))
    api.modelsList().then((m: any[]) => setModels(m.filter(x => x.enabled !== false))).catch(console.error)
    api.promptsList?.().then(setPrompts).catch(() => {})
  }, [])

  useEffect(() => {
    if (skipConvEffectRef.current) { skipConvEffectRef.current = false; return }
    const seq = ++convLoadSeq.current
    if (currentConvId) {
      api.convMessages(currentConvId).then((msgs: any[]) => {
        if (seq !== convLoadSeq.current) return
        setMessages(msgs)
        const total = msgs.reduce((s: number, m: any) => s + (m.tokens || Math.ceil((m.content || '').length / 4)), 0)
        setTokenUsage(total)
        // Auto-resend orphaned user message (app closed before response)
        if (msgs.length > 0 && msgs[msgs.length - 1].role === 'user') {
          const orphanMsg = msgs[msgs.length - 1]
          setTimeout(() => {
            if (seq !== convLoadSeq.current) return
            setStreaming(true)
            resetStream()
            const history = msgs.slice(-12).map((m: any) => { const h: any = { role: m.role, content: m.content }; if (m.tool_calls) { try { const parsed = JSON.parse(m.tool_calls); h.tool_calls = Array.isArray(parsed) ? parsed.filter((tc: any) => tc?.function?.name) : parsed } catch {} } if (m.tool_call_id) h.tool_call_id = m.tool_call_id; return h })
            api.chatSend({ message: orphanMsg.content, history, model: config.ai?.model || currentAgent?.model, agentId: currentAgent?.id, convId: currentConvId })
              .then((result: any) => { if (!result?.ok) { setStreaming(false); addMessage({ role: 'assistant', content: 'Error: ' + (result?.error || '服务无响应'), timestamp: new Date().toISOString() }) } })
              .catch(() => setStreaming(false))
          }, 500)
        }
      }).catch(console.error)
    } else {
      setMessages([])
      setTokenUsage(0)
    }
  }, [currentConvId])

  useEffect(() => {
    const el = document.getElementById('messages')
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
  }, [messages, streamBuf, thinkBuf, isStreaming])


  useEffect(() => {
    let pendingTokenBuf = ''
    let rafScheduled = false
    api.onChatToken((t: string) => {
      streamBufRef.current += t
      pendingTokenBuf += t
      if (!rafScheduled) {
        rafScheduled = true
        requestAnimationFrame(() => {
          if (pendingTokenBuf) { appendToken(pendingTokenBuf); pendingTokenBuf = '' }
          rafScheduled = false
        })
      }
    })
    api.onChatThinking((t: string) => appendThink(t))
    api.onChatStage((stage: string) => {
      if (stage === 'followup') {
        // Tool results ready, starting follow-up — clear text buffer only, preserve thinking
        const state = useAppStore.getState()
        state.setStreamBuf('')
        streamBufRef.current = ''
      }
    })
    api.onChatToolCall((d: any) => {
      addToolCall(d)
    })
    api.onChatDone((finalText: string, thinking?: string, toolCalls?: any[]) => {
      streamBufRef.current = ''
      const state = useAppStore.getState()
      const streamed = state.streamBuf || ''
      const content = finalText || streamed || ''
      // Capture streaming tool calls before reset
      const streamedToolCalls = state.toolCalls || []
      state.resetStream()
      state.setStreaming(false)
      if (!content) return
      // Use streaming tool calls if backend didn't return any
      const finalToolCalls = toolCalls?.length ? toolCalls : (streamedToolCalls.length ? streamedToolCalls : undefined)
      state.addMessage({
        id: 'stream_' + Date.now(),
        role: 'assistant', content,
        timestamp: new Date().toISOString(),
        thinking: thinking || undefined,
        tool_calls: finalToolCalls ? JSON.stringify(finalToolCalls) : undefined,
      })
      // Auto-title short conversations
      const cid = state.currentConvId
      if (cid && state.messages.length <= 3 && content) {
        const title = content.slice(0, 50).replace(/[\n\r]/g, ' ').trim()
        if (title) {
          const convs = state.conversations
          const conv = convs.find((c: any) => c.id === cid)
          if (conv && (!conv.title || conv.title.length < 5)) {
            conv.title = title
            state.setConversations([...convs])
          }
        }
      }
    })
    api.onChatError(() => setStreaming(false))
  }, [])

  useEffect(() => {
    const container = document.getElementById('page-chat')
    if (!container) return
    const onDragOver = (e: DragEvent) => { e.preventDefault(); setIsDragging(true) }
    const onDragLeave = () => setIsDragging(false)
    const onDrop = async (e: DragEvent) => {
      e.preventDefault(); setIsDragging(false)
      const files = e.dataTransfer?.files
      if (!files?.length) return
      for (const file of Array.from(files)) {
        try { const r = await api.capDocExtract((file as any).path); if (r.ok) addMessage({ role: 'user', content: '[File] ' + (r.filename || file.name) + '\n\n' + (r.content || '').slice(0, 3000), timestamp: new Date().toISOString() }) } catch {}
      }
    }
    container.addEventListener('dragover', onDragOver)
    container.addEventListener('dragleave', onDragLeave)
    container.addEventListener('drop', onDrop)
    return () => { container.removeEventListener('dragover', onDragOver); container.removeEventListener('dragleave', onDragLeave); container.removeEventListener('drop', onDrop) }
  }, [])

  const handleSend = useCallback(async () => {
    const msg = input.trim()
    if (!msg || isStreaming) return
    setInput('')
    streamBufRef.current = ''
    if (textareaRef.current) textareaRef.current.style.height = '44px'
    let convId = currentConvId
    if (!convId) {
      try {       try { convId = await api.convCreate(msg.slice(0, 50), undefined, currentAgent?.id) } catch { setStreaming(false); return } } catch { setStreaming(false); return }
      skipConvEffectRef.current = true
      setCurrentConvId(convId)
      localStorage.setItem('lastConvId', convId)
      api.convList().then(setConversations).catch(() => {})
    }
    let finalMsg = msg
    if (replyingTo) {
      finalMsg = '> ' + replyingTo.content + '\n\n' + msg
      setReplyingTo(null)
    }
    addMessage({ role: 'user', content: finalMsg, timestamp: new Date().toISOString() })
    setStreaming(true)
    resetStream()
    const history = messages.slice(-12).map((m: any) => { const h: any = { role: m.role, content: m.content }; if (m.tool_calls) { try { const parsed = JSON.parse(m.tool_calls); h.tool_calls = Array.isArray(parsed) ? parsed.filter((tc: any) => tc?.function?.name) : parsed } catch {} } if (m.tool_call_id) h.tool_call_id = m.tool_call_id; return h })
    try {
      const result = await api.chatSend({ message: finalMsg, history, model: config.ai?.model || currentAgent?.model, agentId: currentAgent?.id, convId })
      if (!result?.ok) {
        setStreaming(false)
        const errMsg = result?.error || '服务无响应 — 请检查 OpenClaw Gateway 是否运行'
        addMessage({ role: 'assistant', content: 'Error: ' + errMsg, timestamp: new Date().toISOString() })
      }
      // Note: on success, setStreaming(false) is called by chat:done event
    } catch (e) {
      setStreaming(false)
      const errMsg = e instanceof Error ? e.message : String(e)
      addMessage({ role: 'assistant', content: 'Error: ' + (errMsg || 'IPC通信失败 — 请重启应用'), timestamp: new Date().toISOString() })
    }
    // Safety: if streaming is still true after 120s, force reset (prevents stuck UI)
    setTimeout(() => {
      const state = useAppStore.getState()
      if (state.isStreaming) { state.setStreaming(false); state.resetStream() }
    }, 120000)
  }, [input, isStreaming, currentConvId, messages, config, replyingTo])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    if (e.key === 'Escape') {
      if (isStreaming) api.chatCancel()
      else if (editingIdx !== null) setEditingIdx(null)
      else if (replyingTo) setReplyingTo(null)
      else if (showPromptLib) setShowPromptLib(false)
      else if (showSearchModal) setShowSearchModal(false)
      else if (showMemoryModal) setShowMemoryModal(false)
    }
  }

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = '44px'
    const newHeight = Math.min(e.target.scrollHeight, 120)
    e.target.style.height = newHeight + 'px'
  }

  const copyMessage = (content: string) => navigator.clipboard.writeText(content).catch(() => {})

  const handleTts = async (text: string, msgId: string) => {
    setPlayingTts(msgId)
    try {
      const r = await api.capTts(text)
      if (r.ok && r.path) {
        const audio = new Audio('file:///' + r.path.replace(/\\/g, '/'))
        audio.play()
        audio.onended = () => setPlayingTts(null)
      } else { setPlayingTts(null) }
    } catch { setPlayingTts(null) }
  }

  const regenerate = async () => {
    if (messages.length < 2 || isStreaming) return
    const lastAsstIdx = [...messages].reverse().findIndex((m: any) => m.role === 'assistant')
    if (lastAsstIdx < 0) return
    const removeIdx = messages.length - 1 - lastAsstIdx
    const newMsgs = messages.filter((_, i) => i !== removeIdx)
    const lastUser = [...newMsgs].reverse().find((m: any) => m.role === 'user')
    if (!lastUser) return
    // P2-5: Send feedback signal for regeneration
    api.chatFeedback?.({ type: 'regenerate', convId: currentConvId || undefined }).catch(() => {})
    setMessages(newMsgs)
    setStreaming(true); resetStream()
    const history = newMsgs.filter((m: any) => m.role !== 'system').slice(-12).map((m: any) => { const h: any = { role: m.role, content: m.content }; if (m.tool_calls) { try { const parsed = JSON.parse(m.tool_calls); h.tool_calls = Array.isArray(parsed) ? parsed.filter((tc: any) => tc?.function?.name) : parsed } catch {} } if (m.tool_call_id) h.tool_call_id = m.tool_call_id; return h })
    const result = await api.chatSend({ message: lastUser.content, history, model: config.ai?.model || currentAgent?.model, agentId: currentAgent?.id, convId: currentConvId || undefined })
    if (!result?.ok) { setStreaming(false); addMessage({ role: 'assistant', content: 'Error: ' + (result?.error || 'Unknown'), timestamp: new Date().toISOString() }) }
  }

  const handleFork = async (idx: number) => {
    if (!currentConvId) return
    try {
      const newId = await api.convFork?.(currentConvId, idx)
      if (newId) {
        setCurrentConvId(newId)
        api.convMessages(newId).then(setMessages).catch(() => {})
        api.convList().then(setConversations).catch(() => {})
      }
    } catch {}
  }

  const handleEditMessage = (idx: number, content: string) => { setEditingIdx(idx); setEditText(content) }
  const handleSaveEdit = async (idx: number) => {
    if (!editText.trim()) return
    const newMsgs = [...messages]; newMsgs[idx] = { ...newMsgs[idx], content: editText }
    const truncated = newMsgs.slice(0, idx + 1)
    setMessages(truncated); setEditingIdx(null)
    if (messages[idx].role === 'user') {
      setStreaming(true); resetStream()
      const history = truncated.slice(0, -1).map(m => { const h: any = { role: m.role, content: m.content }; if (m.tool_calls) { try { const parsed = JSON.parse(m.tool_calls); h.tool_calls = Array.isArray(parsed) ? parsed.filter((tc: any) => tc?.function?.name) : parsed } catch {} } if (m.tool_call_id) h.tool_call_id = m.tool_call_id; return h })
      try { await api.chatSend({ message: editText, history, model: config.ai?.model || currentAgent?.model, agentId: currentAgent?.id, convId: currentConvId || undefined }) } catch { setStreaming(false) }
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      mediaRecorderRef.current = mediaRecorder
      await api.voiceStart()
      mediaRecorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          const reader = new FileReader()
          reader.onloadend = async () => { const base64 = (reader.result as string).split(',')[1]; try { await api.voiceChunk(base64) } catch {} }
          reader.readAsDataURL(e.data)
        }
      }
      mediaRecorder.start(1000)
      setIsRecording(true)
    } catch { setShowAlert({ message: '无法访问麦克风，请检查权限设置' }) }
  }
  const stopRecording = async () => {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop())
    setIsRecording(false)
    try {
      const result = await api.voiceStop()
      if (result.ok && result.text) setInput(prev => prev + result.text)
    } catch {}
  }

  const handleInputTool = async (tool: string) => {
    if (tool === '搜索') setShowSearchModal(true)
    else if (tool === '记忆') setShowMemoryModal(true)
    else if (tool === '附件') {
      const el = document.createElement('input'); el.type = 'file'; el.accept = '.txt,.md,.json,.csv,.py,.js,.ts,.html,.css,.pdf'
      el.onchange = async () => { const file = el.files?.[0]; if (!file) return; try { const r = await api.capDocExtract(file.path); if (r.ok) addMessage({ role: 'user', content: '[File] ' + (r.filename || file.name) + '\n\n' + (r.content || '').slice(0, 2000), timestamp: new Date().toISOString() }) } catch {} }
      el.click()
    }
  }

  return (
    <div className="page" id="page-chat">
      {isDragging && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(79,70,229,0.1)', border: '2px dashed var(--accent)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: 'var(--accent)', fontWeight: 600 }}>
          {'拖放文件到这里'}
        </div>
      )}
      <div id="messages">
        {messages.filter((m: any) => m.role !== 'tool').map((m: any, i: number) => (
          editingIdx === i ? (
            <div key={i} className="message-bubble user">
              <div className="message-avatar">U</div>
              <div className="message-content-wrapper">
                <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                  <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={3}
                    style={{ width: '100%', border: '1px solid var(--accent)', borderRadius: 8, padding: 8, fontSize: 13, fontFamily: 'var(--font)', resize: 'vertical' }} autoFocus />
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => setEditingIdx(null)}>取消</button>
                    <button className="btn btn-sm btn-primary" onClick={() => handleSaveEdit(i)}>保存并重新生成</button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <MessageBubble
              key={i}
              role={m.role}
              content={m.content}
              thinking={m.thinking}
              toolCalls={m.tool_calls ? (() => { try { return JSON.parse(m.tool_calls) } catch { return undefined } })() : undefined}
              isStreaming={false}
              onCopy={() => copyMessage(m.content)}
              onEdit={m.role === 'user' ? () => handleEditMessage(i, m.content) : undefined}
              onTts={m.role === 'assistant' ? () => handleTts(m.content, 'msg-' + i) : undefined}
              onReplyQuote={() => setReplyingTo({ idx: i, content: m.content.slice(0, 100) })}
              onFork={() => handleFork(i)}
              onRegenerate={i === messages.length - 1 && m.role === 'assistant' ? regenerate : undefined}
              ttsPlaying={playingTts === 'msg-' + i}
            />
          )
        ))}
        {isStreaming && (
          <MessageBubble
            role="assistant"
            content={streamBuf}
            thinking={thinkBuf || undefined}
            toolCalls={toolCalls.length > 0 ? toolCalls : undefined}
            isStreaming={true}
          />
        )}
        <div ref={msgEndRef}></div>
      </div>

      {replyingTo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--accent-light)', borderLeft: '3px solid var(--accent)', fontSize: 12, color: 'var(--text2)' }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>引用: {replyingTo.content}</span>
          <button className="msg-action-btn" onClick={() => setReplyingTo(null)}>x</button>
        </div>
      )}

      <div className="input-tools">
        <button onClick={() => handleInputTool('附件')}>附件</button>
        <button onClick={() => handleInputTool('搜索')}>搜索</button>
        <button onClick={() => handleInputTool('记忆')}>记忆</button>
        <button onClick={() => setShowPromptLib(true)}>提示词</button>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text4)', userSelect: 'none' }}>
          <span>{contextInfo.fmt(contextInfo.used)} / {contextInfo.fmt(contextInfo.total)}</span>
          <div style={{ width: 60, height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: contextInfo.pct + '%', height: '100%', borderRadius: 2, background: contextInfo.pct > 80 ? 'var(--error)' : contextInfo.pct > 50 ? 'var(--warning)' : 'var(--accent)', transition: 'width 0.3s' }} />
          </div>
          <span>剩余 {contextInfo.fmt(contextInfo.remaining)}</span>
        </div>
      </div>

      <div className="input-area">
        <textarea ref={textareaRef} rows={1} placeholder={isStreaming ? 'AI 思考中...' : '输入消息... (Enter 发送, Shift+Enter 换行)'} value={input} onChange={handleTextareaInput} onKeyDown={handleKeyDown} disabled={isStreaming} />
        <button className="send-btn" onClick={isRecording ? stopRecording : startRecording}
          style={{ background: isRecording ? 'var(--error)' : 'var(--bg3)', color: isRecording ? '#fff' : 'var(--text2)', fontSize: 16 }}>
          {isRecording ? '■' : '🎤'}
        </button>
        <button className="send-btn" onClick={isStreaming ? () => api.chatCancel() : handleSend} disabled={!isStreaming && (!input.trim() || !gwRunning)} style={isStreaming ? { background: 'var(--error)' } : undefined}>{isStreaming ? '■' : '➤'}</button>
      </div>

      {showPromptLib && (
        <div className="modal-overlay" onClick={() => setShowPromptLib(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 500 }}>
            <div className="modal-header"><h3>提示词模板库</h3></div>
            <div className="modal-body" style={{ maxHeight: 400, overflow: 'auto' }}>
              {prompts.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text4)', fontSize: 12 }}>无模板</div>}
              {prompts.map(p => (
                <div key={p.id} className="card" style={{ marginBottom: 8, padding: '10px 14px', cursor: 'pointer' }}
                  onClick={() => { setInput(p.content); setShowPromptLib(false) }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <strong style={{ fontSize: 13 }}>{p.name}</strong>
                    {p.category && <span className="badge badge-blue">{p.category}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>{p.content.slice(0, 100)}...</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showSearchModal && (
        <div className="modal-overlay" onClick={() => setShowSearchModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>搜索网页</h3></div>
            <div className="modal-body">
              <div className="form-group"><label>搜索内容</label><input value={searchInput} onChange={e => setSearchInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setShowSearchModal(false); const q = searchInput; setSearchInput(''); addMessage({ role: 'user', content: '搜索: ' + q, timestamp: new Date().toISOString() }); api.capWebSearch(q).then(r => { if (r.ok) addMessage({ role: 'assistant', content: r.results || '无结果', timestamp: new Date().toISOString() }) }).catch(() => {}) } }} placeholder="输入搜索关键词..." /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSearchModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={() => { setShowSearchModal(false); const q = searchInput; setSearchInput(''); addMessage({ role: 'user', content: '搜索: ' + q, timestamp: new Date().toISOString() }); api.capWebSearch(q).then(r => { if (r.ok) addMessage({ role: 'assistant', content: r.results || '无结果', timestamp: new Date().toISOString() }) }).catch(() => {}) }}>搜索</button>
            </div>
          </div>
        </div>
      )}

      {showMemoryModal && (
        <div className="modal-overlay" onClick={() => setShowMemoryModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>添加记忆</h3></div>
            <div className="modal-body">
              <div className="form-group"><label>记忆内容</label><textarea rows={3} value={memoryInput} onChange={e => setMemoryInput(e.target.value)} placeholder="输入要保存的记忆..." /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowMemoryModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={() => { if (memoryInput.trim()) { api.memoryAdd(memoryInput, 'general').then(() => addMessage({ role: 'assistant', content: '已添加到记忆: ' + memoryInput.slice(0, 50), timestamp: new Date().toISOString() })).catch(() => {}); setMemoryInput(''); setShowMemoryModal(false) } }}>添加</button>
            </div>
          </div>
        </div>
      )}
      {showAlert && <AlertModal message={showAlert.message} onClose={() => setShowAlert(null)} />}
    </div>
  )
}
