import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'
import { toast } from '../components/Toast'
import { AlertModal } from '../components/ui'
import { MessageBubble } from '../components/MessageBubble'

function friendlyError(err: string): string {
  if (!err) return '未知错误，请重试'
  const e = err.toLowerCase()
  if (e.includes('timeout') || e.includes('超时')) return '请求超时，网络可能不稳定，请重试'
  if (e.includes('econnrefused') || e.includes('connection refused')) return '无法连接到服务器，请检查 Gateway 是否运行'
  if (e.includes('enotfound') || e.includes('getaddrinfo')) return '无法解析域名，请检查网络连接'
  if (e.includes('401') || e.includes('unauthorized')) return 'API Key 无效或已过期，请在设置中更新'
  if (e.includes('403') || e.includes('forbidden')) return '访问被拒绝，请检查 API Key 权限'
  if (e.includes('429') || e.includes('rate limit')) return '请求太频繁，被限速了，请稍后重试'
  if (e.includes('500') || e.includes('502') || e.includes('503')) return '服务器内部错误，请稍后重试'
  if (e.includes('network') || e.includes('fetch failed')) return '网络连接失败，请检查网络'
  if (e.includes('abort') || e.includes('取消')) return '请求已取消'
  if (e.includes('ipc') || e.includes('invoke')) return '应用通信异常，请重启应用'
  if (e.includes('tool') && e.includes('fail')) return '工具执行失败，正在自动重试...'
  if (err.length > 100) return '执行遇到问题，请发送"继续"重试'
  return err
}

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
  const addMemory = useAppStore(s => s.addMemory)
  const [devMode, setDevMode] = useState<'code' | 'plan' | 'auto'>('code')
  const [gwRunning, setGwRunning] = useState(true)
  const [hasProvider, setHasProvider] = useState(false)
  const msgEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [replyingTo, setReplyingTo] = useState<{ idx: number; content: string } | null>(null)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isRecording, setIsRecording] = useState(false)

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
    api.modelsList().then((m: any[]) => setModels(m.filter(x => x.enabled !== false))).catch(console.error)
    api.gatewayStatus().then((s: any) => setGwRunning(s.running)).catch(() => setGwRunning(false))
    api.providersList().then((p: any[]) => setHasProvider(p.some(x => x.apiKey && x.enabled !== false))).catch(() => {})
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
            api.chatSend({ message: orphanMsg.content, history, model: config.ai?.model, agentId: 'default', convId: currentConvId })
              .then((result: any) => { if (!result?.ok) { setStreaming(false); addMessage({ role: 'assistant', content: friendlyError(result?.error || '服务无响应'), timestamp: new Date().toISOString() }) } })
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
    let mounted = true
    let pendingTokenBuf = ''
    let rafScheduled = false
    api.onChatToken((t: string) => {
      if (!mounted) return
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
    // Batch thinking tokens to reduce re-renders
    let pendingThinkBuf = ''
    let rafThinkScheduled = false
    api.onChatThinking((t: string) => {
      if (!mounted) return
      pendingThinkBuf += t
      if (!rafThinkScheduled) {
        rafThinkScheduled = true
        requestAnimationFrame(() => {
          if (pendingThinkBuf) { appendThink(pendingThinkBuf); pendingThinkBuf = '' }
          rafThinkScheduled = false
        })
      }
    })
    api.onChatStage((stage: string) => {
      if (!mounted) return
      if (stage === 'followup') {
        const state = useAppStore.getState()
        state.setStreamBuf('')
        streamBufRef.current = ''
      } else if (stage.startsWith('pressure-')) {
        const level = parseInt(stage.split('-')[1])
        if (level >= 2) {
          addMessage({ role: 'system', content: `⚠️ 上下文压力较高（${level === 2 ? '70%' : '85%'}+），正在自动压缩...`, timestamp: new Date().toISOString() })
        }
      } else if (stage === 'compacted') {
        addMessage({ role: 'system', content: '✅ 上下文已压缩，旧对话已摘要保存', timestamp: new Date().toISOString() })
      }
    })
    api.onChatToolCall((d: any) => {
      if (!mounted) return
      addToolCall(d)
    })
    api.onChatDone((finalText: string, thinking?: string, toolCalls?: any[]) => {
      if (!mounted) return
      streamBufRef.current = ''
      const state = useAppStore.getState()
      const streamed = state.streamBuf || ''
      const content = finalText || streamed || ''
      // Capture streaming state BEFORE reset
      const streamedToolCalls = state.toolCalls || []
      const streamedThinking = state.thinkBuf || ''
      state.resetStream()
      state.setStreaming(false)
      if (!content) return
      const finalToolCalls = toolCalls?.length ? toolCalls : (streamedToolCalls.length ? streamedToolCalls : undefined)
      state.addMessage({
        id: 'stream_' + Date.now(),
        role: 'assistant', content,
        timestamp: new Date().toISOString(),
        thinking: thinking || streamedThinking || undefined,
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
    api.onChatError(() => { if (mounted) setStreaming(false) })
    return () => { mounted = false }
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
        try {
          const reader = new FileReader()
          reader.onload = () => {
            const content = typeof reader.result === 'string' ? reader.result : ''
            const preview = content.slice(0, 3000)
            setInput(prev => prev + `[文件: ${file.name}]\n\n${preview}${content.length > 3000 ? '\n...(已截断)' : ''}`)
          }
          reader.readAsText(file)
        } catch { setInput(prev => prev + `[文件: ${file.name}]`) }
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
      try {       try { convId = await api.convCreate(msg.slice(0, 50), undefined, 'default') } catch { setStreaming(false); return } } catch { setStreaming(false); return }
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
      const result = await api.chatSend({ message: finalMsg, history, model: config.ai?.model, agentId: 'default', convId, devMode })
      if (!result?.ok) {
        setStreaming(false)
        const errMsg = result?.error || '服务无响应'
        addMessage({ role: 'assistant', content: friendlyError(errMsg), timestamp: new Date().toISOString() })
      }
      // Note: on success, setStreaming(false) is called by chat:done event
    } catch (e) {
      setStreaming(false)
      const errMsg = e instanceof Error ? e.message : String(e)
      addMessage({ role: 'assistant', content: friendlyError(errMsg), timestamp: new Date().toISOString() })
    }
    // Safety: if streaming is still true after 120s, force reset (prevents stuck UI)
    setTimeout(() => {
      const state = useAppStore.getState()
      if (state.isStreaming) { state.setStreaming(false); state.resetStream() }
    }, 180000)
  }, [input, isStreaming, currentConvId, messages, config, replyingTo])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    if (e.key === 'Escape') {
      if (isStreaming) api.chatCancel()
      else if (editingIdx !== null) setEditingIdx(null)
      else if (replyingTo) setReplyingTo(null)
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

  const handleTts = async (text: string, _msgId: string) => {
    try { await api.ttsSpeak(text) } catch {}
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
      const result = await api.chatSend({ message: lastUser.content, history, model: config.ai?.model, agentId: 'default', convId: currentConvId || undefined, devMode })
    if (!result?.ok) { setStreaming(false); addMessage({ role: 'assistant', content: friendlyError(result?.error || '生成失败'), timestamp: new Date().toISOString() }) }
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
      try { await api.chatSend({ message: editText, history, model: config.ai?.model, agentId: 'default', convId: currentConvId || undefined }) } catch { setStreaming(false) }
    }
  }

  const startRecording = async () => {
    try {
      // Use Web Speech API (supported in Electron/Chrome)
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (!SpeechRecognition) {
        setShowAlert({ message: '此浏览器不支持语音识别' })
        return
      }
      const recognition = new SpeechRecognition()
      recognition.lang = 'zh-CN'
      recognition.continuous = false
      recognition.interimResults = true
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results).map((r: any) => r[0].transcript).join('')
        setInput(prev => prev + transcript)
      }
      recognition.onend = () => setIsRecording(false)
      recognition.onerror = (e: any) => {
        setIsRecording(false)
        if (e.error !== 'no-speech') setShowAlert({ message: '语音识别错误: ' + e.error })
      }
      ;(window as any).__recognition = recognition
      recognition.start()
      setIsRecording(true)
    } catch (e: any) {
      setShowAlert({ message: '语音功能不可用: ' + e.message })
    }
  }
  const stopRecording = async () => {
    setIsRecording(false)
    try { (window as any).__recognition?.stop() } catch {}
  }

  const handleInputTool = async (tool: string) => {
    if (tool === '搜索') setShowSearchModal(true)
    else if (tool === '记忆') setShowMemoryModal(true)
    else if (tool === '附件') {
      const el = document.createElement('input'); el.type = 'file'; el.accept = '.txt,.md,.json,.csv,.py,.js,.ts,.html,.css,.pdf'
      el.onchange = async () => {
        const file = el.files?.[0]; if (!file) return
        try {
          const reader = new FileReader()
          reader.onload = () => {
            const content = typeof reader.result === 'string' ? reader.result : ''
            const preview = content.slice(0, 3000)
            setInput(prev => prev + `[文件: ${file.name}]\n\n${preview}${content.length > 3000 ? '\n...(已截断)' : ''}`)
          }
          reader.readAsText(file)
        } catch { setInput(prev => prev + `[文件: ${file.name}]`) }
      }
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
              toolCalls={m.tool_calls ? (() => { try {
                const parsed = JSON.parse(m.tool_calls)
                if (!Array.isArray(parsed)) return undefined
                return parsed.map((tc: any) => ({
                  id: tc.id || 'tc_' + Math.random(),
                  name: tc.name || tc.function?.name || 'unknown',
                  args: tc.args || tc.function?.arguments || '',
                  status: tc.status || 'done',
                }))
              } catch { return undefined } })() : undefined}
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
        <div style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
          {(['plan', 'code', 'auto'] as const).map(m => (
            <button key={m} onClick={() => setDevMode(m)} style={{ padding: '3px 8px', border: devMode === m ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: 10, fontSize: 10, cursor: 'pointer', background: devMode === m ? 'var(--accent-light)' : 'transparent', color: devMode === m ? 'var(--accent)' : 'var(--text3)', fontWeight: devMode === m ? 600 : 400 }}>
              {m === 'plan' ? '📋 方案' : m === 'code' ? '💻 编码' : '⚡ 自动'}
            </button>
          ))}
        </div>
        <button onClick={async () => {
          const templates = await api.templatesForAgent('default')
          if (templates.length > 0) {
            // Show template selector popup
            const popup = document.createElement('div')
            popup.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:8px;z-index:1000;max-width:400px;max-height:300px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.2)'
            popup.innerHTML = templates.map(t =>
              `<div style="padding:8px 12px;cursor:pointer;border-radius:8px;font-size:12px;display:flex;gap:8px;align-items:center" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='transparent'">
                <span style="font-weight:600;min-width:60px">${t.name}</span>
                <span style="color:var(--text3);flex:1">${t.description}</span>
              </div>`
            ).join('')
            // Click handler
            popup.querySelectorAll('div').forEach((div, i) => {
              div.onclick = () => {
                setInput(templates[i].prompt)
                popup.remove()
              }
            })
            // Close on click outside
            const close = (e: Event) => { if (!popup.contains(e.target as Node)) { popup.remove(); document.removeEventListener('click', close) } }
            document.body.appendChild(popup)
            setTimeout(() => document.addEventListener('click', close), 100)
          } else {
            toast('暂无模板', 'info')
          }
        }} style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 12, fontSize: 11, cursor: 'pointer', background: 'transparent', color: 'var(--text2)' }}>📝 模板</button>
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
        <button className="send-btn" onClick={isStreaming ? () => api.chatCancel() : handleSend} disabled={!isStreaming && !input.trim()} style={isStreaming ? { background: 'var(--error)' } : undefined}>{isStreaming ? '■' : '▲'}</button>
      </div>

      {showSearchModal && (
        <div className="modal-overlay" onClick={() => setShowSearchModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>搜索网页</h3></div>
            <div className="modal-body">
              <div className="form-group"><label>搜索内容</label><input value={searchInput} onChange={e => setSearchInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setShowSearchModal(false); const q = searchInput; setSearchInput(''); if (q.trim()) { setInput('搜索: ' + q); setTimeout(() => handleSend(), 100) } } }} placeholder="输入搜索关键词..." /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSearchModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={() => { setShowSearchModal(false); const q = searchInput; setSearchInput(''); if (q.trim()) { setInput('搜索: ' + q); setTimeout(() => handleSend(), 100) } }}>搜索</button>
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
              <button className="btn btn-primary" onClick={() => { if (memoryInput.trim()) { api.memoryAdd(memoryInput, 'general').then((id) => { addMemory({ id, content: memoryInput, category: 'general', createdAt: new Date().toISOString() }); addMessage({ role: 'assistant', content: '已添加到记忆: ' + memoryInput.slice(0, 50), timestamp: new Date().toISOString() }) }).catch(() => {}); setMemoryInput(''); setShowMemoryModal(false) } }}>添加</button>
            </div>
          </div>
        </div>
      )}
      {showAlert && <AlertModal message={showAlert.message} onClose={() => setShowAlert(null)} />}
    </div>
  )
}
