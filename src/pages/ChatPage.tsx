import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'
import { toast } from '../components/Toast'
import { AlertModal } from '../components/ui'
import { MessageBubble } from '../components/MessageBubble'
import { MaxModePanel } from '../components/MaxModePanel'
import { TemplatePanel } from '../components/TemplatePanel'
import { ClipboardPanel } from '../components/ClipboardPanel'
import { MAX_HISTORY_MESSAGES, DEFAULT_AGENT_ID, TIMEOUT_CHAT } from '../constants'

function friendlyError(err: string): string {
  if (!err) return '未知错误，请重试'
  const e = err.toLowerCase()
  // Gateway
  if (e.includes('gateway未运行') || e.includes('gateway not running')) return '⚠️ AI服务未启动，请在设置中启动Gateway'
  if (e.includes('econnrefused') || e.includes('connection refused')) return '⚠️ 无法连接到AI服务，请检查Gateway是否运行'
  // 网络
  if (e.includes('timeout') || e.includes('超时')) return '请求超时，网络不稳定，请重试'
  if (e.includes('enotfound') || e.includes('getaddrinfo')) return '无法解析域名，请检查网络连接'
  if (e.includes('network') || e.includes('fetch failed')) return '网络连接失败，请检查网络'
  // 认证
  if (e.includes('401') || e.includes('unauthorized')) return 'API Key 无效或已过期，请在设置中更新'
  if (e.includes('403') || e.includes('forbidden')) return '访问被拒绝，请检查 API Key 权限'
  // 限流
  if (e.includes('429') || e.includes('rate limit') || e.includes('quota exhausted')) return '⚠️ 模型配额已用完，请在设置中切换其他模型或等待配额重置'
  // 模型/认证
  if (e.includes('all models failed') || e.includes('missing-provider-auth')) return '⚠️ 所有模型均不可用，请在设置中配置至少一个可用的 API Key'
  if (e.includes('no api key') || e.includes('no api_key')) return '⚠️ 未配置 API Key，请在设置中添加'
  // 服务器错误
  if (e.includes('500') || e.includes('502') || e.includes('503')) return '服务器内部错误，请稍后重试'
  // 工具
  if (e.includes('tool') && e.includes('fail')) return '工具执行失败，请重试'
  if (e.includes('not found') && e.includes('tool')) return '该功能暂不可用，请检查Gateway是否已加载对应插件'
  // 其他
  if (e.includes('abort') || e.includes('取消')) return '请求已取消'
  if (e.includes('ipc') || e.includes('invoke')) return '应用通信异常，请重启应用'
  // 截断过长错误
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
  const setLastUsage = useAppStore(s => s.setLastUsage)
  const setLastModel = useAppStore(s => s.setLastModel)
  const conversations = useAppStore(s => s.conversations)
  const setConversations = useAppStore(s => s.setConversations)
  const [input, setInput] = useState('')
  const models = useAppStore(s => s.models)
  const setModels = useAppStore(s => s.setModels)
  const config = useAppStore(s => s.config)
  const setConfig = useAppStore(s => s.setConfig)
  const gwRunning = useAppStore(s => s.gatewayRunning)
  const setGwRunning = useAppStore(s => s.setGatewayRunning)
  const currentAgent = useAppStore(s => s.currentAgent)
  const [hasProvider, setHasProvider] = useState(false)
  const msgEndRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [replyingTo, setReplyingTo] = useState<{ idx: number; content: string } | null>(null)
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [showTemplatePanel, setShowTemplatePanel] = useState(false)
  const [showClipboardPanel, setShowClipboardPanel] = useState(false)

  // Input history: ↑↓ to cycle through last 20 sent messages
  const inputHistoryRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1) // -1 = not browsing, 0 = most recent
  const savedInputRef = useRef('') // what user typed before browsing history

  // Load input history from localStorage on mount
  useEffect(() => {
    try { inputHistoryRef.current = JSON.parse(localStorage.getItem('inputHistory') || '[]') } catch {}
  }, [])

  const [showSearchModal, setShowSearchModal] = useState(false)
  const [showAlert, setShowAlert] = useState<{ message: string } | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const cancelPendingRef = useRef(false)
  const [pastedImages, setPastedImages] = useState<Array<{ dataUrl: string; name: string }>>([])
  const maxMode = useAppStore(s => s.chatMaxMode)
  const toggleMaxMode = useAppStore(s => s.toggleChatMaxMode)
  const [maxModeProposals, setMaxModeProposals] = useState<Array<{ id: number; content: string; thinking?: string; temperature: number; status: 'streaming' | 'done' | 'error' }>>([])
  const [maxModeJudgePick, setMaxModeJudgePick] = useState<number | undefined>()
  const [maxModeJudging, setMaxModeJudging] = useState(false)
  const maxModeBufRef = useRef<Record<number, string>>({})
  const goalJudgeEnabled = useAppStore(s => s.chatGoalJudgeEnabled)
  const toggleGoalJudge = useAppStore(s => s.toggleChatGoalJudge)
  const [goalJudgeResult, setGoalJudgeResult] = useState<{ score: number; complete: boolean; issues: string[]; suggestion: string } | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamStartTimeRef = useRef<number>(0)
  const streamCharCountRef = useRef<number>(0)
  const streamSpeed = useAppStore(s => s.streamSpeed)
  const setStreamSpeed = useAppStore(s => s.setStreamSpeed)
  const appendSpeedHistory = useAppStore(s => s.appendSpeedHistory)
  const resetSpeedHistory = useAppStore(s => s.resetSpeedHistory)
  const speedHistory = useAppStore(s => s.speedHistory)

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
    setGoalJudgeResult(null)
    setMaxModeProposals([])
    if (currentConvId) {
      api.convMessages(currentConvId).then((msgs: any[]) => {
        if (seq !== convLoadSeq.current) return
        setMessages(msgs)
        const total = msgs.reduce((s: number, m: any) => s + (m.tokens || Math.ceil((m.content || '').length / 4)), 0)
        setTokenUsage(total)
        // Auto-resend orphaned user message only if app was interrupted recently (within 5 min)
        // Don't retry old failed tasks — user should explicitly resend
        if (msgs.length > 0 && msgs[msgs.length - 1].role === 'user') {
          const orphanMsg = msgs[msgs.length - 1]
          const msgTime = new Date(orphanMsg.timestamp || 0).getTime()
          const age = msgTime > 0 ? Date.now() - msgTime : Infinity
          if (age < 5 * 60 * 1000) {
            setTimeout(() => {
              if (seq !== convLoadSeq.current) return
              setStreaming(true)
              resetStream()
              const streamMsgId = 'stream_' + Date.now()
              addMessage({ id: streamMsgId, role: 'assistant', content: '', timestamp: new Date().toISOString() })
              useAppStore.setState({ streamingMsgId: streamMsgId })
              const history = msgs.slice(-MAX_HISTORY_MESSAGES).map((m: any) => { const h: any = { role: m.role, content: m.content }; if (m.tool_calls) { try { const parsed = JSON.parse(m.tool_calls); h.tool_calls = Array.isArray(parsed) ? parsed.filter((tc: any) => tc?.function?.name) : parsed } catch {} } if (m.tool_call_id) h.tool_call_id = m.tool_call_id; return h })
              api.chatSend({ message: orphanMsg.content, history, model: config.ai?.model, agentId: currentAgent?.id || DEFAULT_AGENT_ID, convId: currentConvId })
                .then((result: any) => {
                  if (!result?.ok) {
                    const errMsg = friendlyError(result?.error || '服务无响应')
                    useAppStore.getState().updateLastMessage({ content: errMsg, isError: true })
                    setStreaming(false); resetStream()
                  }
                })
                .catch(() => {
                  useAppStore.getState().updateLastMessage({ content: '请求失败' })
                  setStreaming(false); resetStream()
                })
            }, 500)
          }
        }
      }).catch(console.error)
    } else {
      setMessages([])
      setTokenUsage(0)
    }
  }, [currentConvId])

  // Smart auto-scroll: only scroll to bottom if user is already at bottom
  useEffect(() => {
    const el = messagesRef.current
    if (!el) return
    if (isAtBottomRef.current) {
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
    } else if (isStreaming) {
      setShowScrollBtn(true)
    }
  }, [messages, streamBuf, thinkBuf, isStreaming])

  // Track scroll position to detect user scrolling up
  useEffect(() => {
    const el = messagesRef.current
    if (!el) return
    const handleScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      isAtBottomRef.current = atBottom
      if (atBottom) setShowScrollBtn(false)
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToBottom = useCallback(() => {
    const el = messagesRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      isAtBottomRef.current = true
      setShowScrollBtn(false)
    }
  }, [])


  useEffect(() => {
    let mounted = true
    let pendingTokenBuf = ''
    let rafScheduled = false
    api.onChatToken((t: string) => {
      if (!mounted) return
      // Track streaming speed
      if (!streamStartTimeRef.current) streamStartTimeRef.current = Date.now()
      streamCharCountRef.current += t.length
      const elapsed = (Date.now() - streamStartTimeRef.current) / 1000
      if (elapsed > 0.3) {
        const cps = Math.round(streamCharCountRef.current / elapsed)
        setStreamSpeed({ chars: streamCharCountRef.current, elapsed, cps })
        appendSpeedHistory({ time: Date.now(), cps })
      }
      console.log('[ChatPage] onChatToken:', t.length, 'chars')
      streamBufRef.current += t
      pendingTokenBuf += t
      if (!rafScheduled) {
        rafScheduled = true
        requestAnimationFrame(() => {
          if (pendingTokenBuf) {
            const batch = pendingTokenBuf
            pendingTokenBuf = ''
            // Update message in array directly (seamless DOM transition)
            const state = useAppStore.getState()
            if (state.streamingMsgId) {
              const newContent = (state.streamBuf || '') + batch
              state.updateLastMessage({ content: newContent })
            }
            // Also update fast buffer for other consumers
            appendToken(batch)
          }
          rafScheduled = false
        })
      }
    })
    // Batch thinking tokens to reduce re-renders
    let pendingThinkBuf = ''
    let rafThinkScheduled = false
    api.onChatThinking((t: string) => {
      if (!mounted) return
      console.log('[ChatPage] onChatThinking:', t.length, 'chars')
      pendingThinkBuf += t
      if (!rafThinkScheduled) {
        rafThinkScheduled = true
        requestAnimationFrame(() => {
          if (pendingThinkBuf) {
            const batch = pendingThinkBuf
            pendingThinkBuf = ''
            const state = useAppStore.getState()
            const newThink = (state.thinkBuf || '') + batch
            state.setThinkBuf(newThink)
            if (state.streamingMsgId) {
              state.updateLastMessage({ thinking: newThink })
            }
          }
          rafThinkScheduled = false
        })
      }
    })
    api.onToolStatus?.((d: any) => {
      if (!mounted) return
      console.log('[ChatPage] onToolStatus:', d.name, d.status, d.id)
      addToolCall({ id: d.id, name: d.name, status: d.status, output: d.output, error: d.error })
    })
    api.onChatDone((finalText: string, thinking?: string, toolCalls?: any[]) => {
      if (!mounted) return
      // Final speed snapshot
      if (streamStartTimeRef.current && streamCharCountRef.current) {
        const elapsed = (Date.now() - streamStartTimeRef.current) / 1000
        const cps = Math.round(streamCharCountRef.current / elapsed)
        setStreamSpeed({ chars: streamCharCountRef.current, elapsed, cps })
        appendSpeedHistory({ time: Date.now(), cps })
      }
      streamStartTimeRef.current = 0
      streamCharCountRef.current = 0
      // Clear speed after 5s
      setTimeout(() => { setStreamSpeed(null); resetSpeedHistory() }, 5000)
      console.log('[ChatPage] onChatDone: textLen=', finalText?.length, 'thinkingLen=', thinking?.length, 'toolCalls=', toolCalls?.length)
      streamBufRef.current = ''
      const state = useAppStore.getState()
      const streamed = state.streamBuf || ''
      const content = finalText || streamed || ''
      const streamedToolCalls = state.toolCalls || []
      const streamedThinking = state.thinkBuf || ''
      const finalToolCalls = toolCalls?.length ? toolCalls : (streamedToolCalls.length ? streamedToolCalls : undefined)
      if (!content && !finalToolCalls) { state.resetStream(); state.setStreaming(false); return }

      // If we have tool_calls but no final content, keep streaming state active
      // (the backend is executing tools and will send more tokens)
      const hasOnlyToolCalls = finalToolCalls && finalToolCalls.length > 0 && !content
      if (hasOnlyToolCalls) {
        // Update message with tool_calls but keep streaming
        state.updateLastMessage({
          content: '',
          thinking: streamedThinking || thinking || undefined,
          tool_calls: finalToolCalls ? JSON.stringify(finalToolCalls) : undefined,
        })
        // Don't reset stream or set streaming to false - wait for more tokens
        return
      }

      const msgId = state.streamingMsgId || ('stream_' + Date.now())
      // Update the existing streaming message in-place (same DOM element, no flash)
      state.updateLastMessage({
        content,
        thinking: streamedThinking || thinking || undefined,
        tool_calls: finalToolCalls ? JSON.stringify(finalToolCalls) : undefined,
      })
      state.resetStream()
      state.setStreaming(false)
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
      // Goal Judge: verify task completion (only when enabled)
      if (goalJudgeEnabled && content && content.length > 50) {
        const lastUser = state.messages.filter((m: any) => m.role === 'user').pop()
        if (lastUser?.content) {
          const question = lastUser.content
          setGoalJudgeResult(null)
          api.chatGoalJudge({ question, response: content.slice(0, 3000) }).then((verdict: any) => {
            if (verdict?.ok) setGoalJudgeResult(verdict)
          }).catch(() => {})
        }
      }
    })
    api.onChatUsage?.((u: any) => {
      if (!mounted) return
      setLastUsage(u)
      if (u?.total_tokens) {
        setTokenUsage(u.total_tokens)
        useAppStore.getState().addSessionTokens(u.total_tokens)
      }
    })
    api.onChatModel?.((m: string) => {
      if (!mounted) return
      setLastModel(m)
    })
    api.onChatError((err?: string) => {
      if (!mounted) return
      streamStartTimeRef.current = 0
      streamCharCountRef.current = 0
      setStreamSpeed(null)
      resetSpeedHistory()
      const state = useAppStore.getState()
      const errMsg = friendlyError(err || '请求失败')
      if (state.streamingMsgId) {
        const lastMsg = state.messages[state.messages.length - 1]
        if (lastMsg?.id === state.streamingMsgId) {
          state.updateLastMessage({ content: errMsg, isError: true })
        } else {
          state.addMessage({ role: 'assistant', content: errMsg, isError: true, id: 'err_' + Date.now(), timestamp: new Date().toISOString() })
        }
      } else {
        state.addMessage({ role: 'assistant', content: errMsg, isError: true, id: 'err_' + Date.now(), timestamp: new Date().toISOString() })
      }
      setStreaming(false)
      resetStream()
    })

    // MaxMode event listeners
    api.onMaxmodeToken?.((d: { proposalId: number; token: string }) => {
      if (!mounted) return
      const buf = maxModeBufRef.current
      buf[d.proposalId] = (buf[d.proposalId] || '') + d.token
      setMaxModeProposals(prev => prev.map(p => p.id === d.proposalId ? { ...p, content: buf[d.proposalId] } : p))
    })
    api.onMaxmodeDone?.((d: { proposalId: number; text: string; thinking: string; ok: boolean; error?: string }) => {
      if (!mounted) return
      setMaxModeProposals(prev => {
        const updated = prev.map(p => p.id === d.proposalId ? {
          ...p,
          content: d.ok ? d.text : (d.error || '生成失败'),
          thinking: d.thinking || p.thinking,
          status: d.ok ? 'done' as const : 'error' as const,
        } : p)
        // Only show judging when ALL proposals are finished
        if (updated.every(p => p.status !== 'streaming')) setMaxModeJudging(true)
        return updated
      })
    })
    api.onMaxmodeJudge?.((d: { bestId: number }) => {
      if (!mounted) return
      setMaxModeJudgePick(d.bestId)
      setMaxModeJudging(false)
    })

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
            if (!content || /[\x00-\x08\x0E-\x1F]/.test(content.slice(0, 200))) {
              setInput(prev => prev + `[文件: ${file.name}] (二进制文件，无法读取文本内容)`)
              return
            }
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

  // Auto-send pending message when streaming ends
  useEffect(() => {
    if (!isStreaming && pendingMessage) {
      if (cancelPendingRef.current) {
        cancelPendingRef.current = false
        setPendingMessage(null)
        return
      }
      const msg = pendingMessage
      setPendingMessage(null)
      // Use setTimeout to ensure state is settled
      setTimeout(() => {
        setInput(msg)
        // Trigger send on next tick after input is set
        setTimeout(() => {
          const ta = textareaRef.current
          if (ta) {
            ta.style.height = '44px'
            const newHeight = Math.min(ta.scrollHeight, 120)
            ta.style.height = newHeight + 'px'
          }
          // Directly call the send logic
          const doSend = async () => {
            streamBufRef.current = ''
            let convId = useAppStore.getState().currentConvId
            if (!convId) {
              try { convId = await api.convCreate(msg.slice(0, 50), undefined, DEFAULT_AGENT_ID) } catch { return }
              useAppStore.getState().setCurrentConvId(convId)
              localStorage.setItem('lastConvId', convId)
              api.convList().then(useAppStore.getState().setConversations).catch(() => {})
            }
            useAppStore.getState().addMessage({ role: 'user', content: msg, timestamp: new Date().toISOString() })
            const streamMsgId = 'stream_' + Date.now()
            useAppStore.getState().setStreaming(true)
            useAppStore.getState().resetStream()
            useAppStore.getState().addMessage({ id: streamMsgId, role: 'assistant', content: '', timestamp: new Date().toISOString() })
            useAppStore.setState({ streamingMsgId: streamMsgId })
            const currentMsgs = useAppStore.getState().messages
            const history = currentMsgs.slice(-MAX_HISTORY_MESSAGES).map((m: any) => { const h: any = { role: m.role, content: m.content }; if (m.tool_calls) { try { const parsed = JSON.parse(m.tool_calls); h.tool_calls = Array.isArray(parsed) ? parsed.filter((tc: any) => tc?.function?.name) : parsed } catch {} } if (m.tool_call_id) h.tool_call_id = m.tool_call_id; return h })
            try {
              const cfg = useAppStore.getState().config
              const agent = useAppStore.getState().currentAgent
              const result = await api.chatSend({ message: msg, history, model: cfg.ai?.model, agentId: agent?.id || DEFAULT_AGENT_ID, convId })
              if (!result?.ok) {
                const errMsg = friendlyError(result?.error || '服务无响应')
                useAppStore.getState().updateLastMessage({ content: errMsg, isError: true })
                useAppStore.getState().setStreaming(false)
                useAppStore.getState().resetStream()
              }
            } catch (e) {
              const errMsg = friendlyError(e instanceof Error ? e.message : String(e))
              useAppStore.getState().updateLastMessage({ content: errMsg, isError: true })
              useAppStore.getState().setStreaming(false)
              useAppStore.getState().resetStream()
            }
          }
          doSend()
        }, 50)
      }, 100)
    }
  }, [isStreaming, pendingMessage])

  // Ctrl+Shift+V → toggle clipboard panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        e.preventDefault()
        setShowClipboardPanel(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Image paste: Ctrl+V or paste event on textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const blob = item.getAsFile()
          if (!blob) continue
          const reader = new FileReader()
          reader.onload = () => {
            const dataUrl = reader.result as string
            setPastedImages(prev => [...prev, { dataUrl, name: `clipboard-${Date.now()}.png` }])
          }
          reader.readAsDataURL(blob)
          break // only handle first image
        }
      }
    }
    ta.addEventListener('paste', handlePaste)
    return () => ta.removeEventListener('paste', handlePaste)
  }, [])

  const handleSend = useCallback(async () => {
    const msg = input.trim()
    if (!msg && pastedImages.length === 0) return
    // MaxMode: parallel proposals
    if (maxMode && msg && !isStreaming) {
      // Save to history
      const hist = inputHistoryRef.current
      if (hist[0] !== msg) { hist.unshift(msg); if (hist.length > 20) hist.length = 20; localStorage.setItem('inputHistory', JSON.stringify(hist)) }
      historyIndexRef.current = -1; savedInputRef.current = ''
      setInput('')
      if (textareaRef.current) textareaRef.current.style.height = '44px'

      let convId = currentConvId
      if (!convId) {
        try { convId = await api.convCreate(msg.slice(0, 50), undefined, DEFAULT_AGENT_ID) } catch { return }
        skipConvEffectRef.current = true
        setCurrentConvId(convId)
        localStorage.setItem('lastConvId', convId)
        api.convList().then(setConversations).catch(() => {})
      }
      addMessage({ role: 'user', content: msg, timestamp: new Date().toISOString() })

      // Initialize proposals
      const temps = [0.3, 0.7, 1.1]
      const tempLabels: Record<number, string> = { 0.3: '严谨', 0.7: '均衡', 1.1: '创意' }
      maxModeBufRef.current = {}
      setMaxModeProposals(temps.map((t, i) => ({ id: i, content: '', temperature: t, status: 'streaming' as const })))
      setMaxModeJudgePick(undefined)
      setMaxModeJudging(false)

      const history = messages.slice(-MAX_HISTORY_MESSAGES).map((m: any) => { const h: any = { role: m.role, content: m.content }; if (m.tool_calls) { try { const parsed = JSON.parse(m.tool_calls); h.tool_calls = Array.isArray(parsed) ? parsed.filter((tc: any) => tc?.function?.name) : parsed } catch {} } if (m.tool_call_id) h.tool_call_id = m.tool_call_id; return h })

      try {
        const result = await api.chatMaxmode({ message: msg, history, model: config.ai?.model, agentId: currentAgent?.id || DEFAULT_AGENT_ID, convId, proposalCount: 3 })
        if (result?.ok && result.proposals) {
          // Add the best proposal as the assistant message
          const best = result.proposals.find((p: any) => p.id === result.judgePick)
          if (best?.ok && best.text) {
            const otherTexts = result.proposals
              .filter((p: any) => p.id !== result.judgePick && p.ok && p.text)
              .map((p: any) => `**${tempLabels[p.temperature] || 'T' + p.temperature}方案:**\n${p.text.slice(0, 500)}`)
              .join('\n\n---\n\n')

            addMessage({
              role: 'assistant',
              content: best.text,
              timestamp: new Date().toISOString(),
            })
          }
        }
      } catch (e) {
        addMessage({ role: 'assistant', content: 'MaxMode 请求失败', isError: true, timestamp: new Date().toISOString() })
      }
      return
    }
    // If streaming, queue the message (text only, images are lost on queue)
    if (isStreaming) {
      if (!msg) return
      cancelPendingRef.current = false
      setPendingMessage(msg)
      setInput('')
      if (textareaRef.current) textareaRef.current.style.height = '44px'
      // Save to input history even when queuing
      const hist = inputHistoryRef.current
      if (hist[0] !== msg) {
        hist.unshift(msg)
        if (hist.length > 20) hist.length = 20
        localStorage.setItem('inputHistory', JSON.stringify(hist))
      }
      historyIndexRef.current = -1
      savedInputRef.current = ''
      return
    }
    // Build final message with images
    let finalMsg = msg
    if (pastedImages.length > 0) {
      const imgDesc = pastedImages.map((img, i) => `[图片${i + 1}: ${img.name}]`).join(' ')
      finalMsg = finalMsg ? `${finalMsg}\n${imgDesc}` : imgDesc
    }
    setPastedImages([])
    // Save to input history
    if (msg) {
      const hist = inputHistoryRef.current
      if (hist[0] !== msg) {
        hist.unshift(msg)
        if (hist.length > 20) hist.length = 20
        localStorage.setItem('inputHistory', JSON.stringify(hist))
      }
    }
    historyIndexRef.current = -1
    savedInputRef.current = ''
    setInput('')
    setGoalJudgeResult(null)
    streamBufRef.current = ''
    if (textareaRef.current) textareaRef.current.style.height = '44px'
    let convId = currentConvId
    if (!convId) {
      try { convId = await api.convCreate(finalMsg.slice(0, 50), undefined, DEFAULT_AGENT_ID) } catch { setStreaming(false); return }
      skipConvEffectRef.current = true
      setCurrentConvId(convId)
      localStorage.setItem('lastConvId', convId)
      api.convList().then(setConversations).catch(() => {})
    }
    if (replyingTo) {
      finalMsg = '> ' + replyingTo.content + '\n\n' + finalMsg
      setReplyingTo(null)
    }
    addMessage({ role: 'user', content: finalMsg, timestamp: new Date().toISOString() })
    const streamMsgId = 'stream_' + Date.now()
    setStreaming(true)
    resetStream()
    // Add streaming placeholder — this DOM element will become the final message
    addMessage({ id: streamMsgId, role: 'assistant', content: '', timestamp: new Date().toISOString() })
    useAppStore.setState({ streamingMsgId: streamMsgId })
    const history = messages.slice(-MAX_HISTORY_MESSAGES).map((m: any) => { const h: any = { role: m.role, content: m.content }; if (m.tool_calls) { try { const parsed = JSON.parse(m.tool_calls); h.tool_calls = Array.isArray(parsed) ? parsed.filter((tc: any) => tc?.function?.name) : parsed } catch {} } if (m.tool_call_id) h.tool_call_id = m.tool_call_id; return h })
    try {
      const result = await api.chatSend({ message: finalMsg, history, model: config.ai?.model, agentId: currentAgent?.id || DEFAULT_AGENT_ID, convId })
      if (!result?.ok) {
        const errMsg = friendlyError(result?.error || '服务无响应')
        // Update streaming placeholder with error content (no ghost message)
        useAppStore.getState().updateLastMessage({ content: errMsg, isError: true })
        setStreaming(false)
        resetStream()
      }
      // Note: on success, setStreaming(false) is called by chat:done event
    } catch (e) {
      const errMsg = friendlyError(e instanceof Error ? e.message : String(e))
      useAppStore.getState().updateLastMessage({ content: errMsg, isError: true })
      setStreaming(false)
      resetStream()
    }
    // Safety: if streaming is still true after TIMEOUT with no activity, force reset
    const safetyTimer = setTimeout(() => {
      const state = useAppStore.getState()
      if (state.isStreaming) {
        const lastMsg = state.messages[state.messages.length - 1]
        // Only timeout if the message has NO content at all (nothing received)
        // If content is flowing, the task is working — don't kill it
        if (lastMsg?.id === streamMsgId && !lastMsg.content && !state.streamBuf) {
          state.updateLastMessage({ content: '请求超时，请重试' })
          state.setStreaming(false)
          state.resetStream()
        }
        // If content is being received, extend the timeout
        if (state.streamBuf || (lastMsg?.id === streamMsgId && lastMsg.content)) {
          clearTimeout(safetyTimer)
        }
      }
    }, TIMEOUT_CHAT)
  }, [input, isStreaming, currentConvId, messages, config, replyingTo, maxMode])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); return }
    if (e.key === 'Escape') {
      if (isStreaming) api.chatCancel()
      else if (editingIdx !== null) setEditingIdx(null)
      else if (replyingTo) setReplyingTo(null)
      else if (showSearchModal) setShowSearchModal(false)
      return
    }
    // Input history: ↑↓ to cycle
    const ta = e.target as HTMLTextAreaElement
    const hist = inputHistoryRef.current
    if (hist.length === 0) return
    if (e.key === 'ArrowUp') {
      // Only trigger when cursor is on first line
      const cursorPos = ta.selectionStart
      const textBeforeCursor = input.slice(0, cursorPos)
      if (textBeforeCursor.includes('\n')) return // not on first line, let normal cursor move
      e.preventDefault()
      if (historyIndexRef.current === -1) {
        savedInputRef.current = input // save current input
      }
      const next = historyIndexRef.current + 1
      if (next < hist.length) {
        historyIndexRef.current = next
        setInput(hist[next])
      }
    } else if (e.key === 'ArrowDown') {
      if (historyIndexRef.current < 0) return
      // Only trigger when cursor is on last line
      const cursorPos = ta.selectionStart
      const textAfterCursor = input.slice(cursorPos)
      if (textAfterCursor.includes('\n')) return // not on last line
      e.preventDefault()
      const next = historyIndexRef.current - 1
      if (next < 0) {
        historyIndexRef.current = -1
        setInput(savedInputRef.current)
      } else {
        historyIndexRef.current = next
        setInput(hist[next])
      }
    }
  }

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // Reset history browsing when user types manually
    if (historyIndexRef.current >= 0) {
      historyIndexRef.current = -1
      savedInputRef.current = ''
    }
    e.target.style.height = '44px'
    const newHeight = Math.min(e.target.scrollHeight, 120)
    e.target.style.height = newHeight + 'px'
  }

  const copyMessage = (content: string) => navigator.clipboard.writeText(content).catch(() => {})

  const regenerate = async () => {
    if (messages.length < 2 || isStreaming) return
    const lastAsstIdx = [...messages].reverse().findIndex((m: any) => m.role === 'assistant')
    if (lastAsstIdx < 0) return
    const removeIdx = messages.length - 1 - lastAsstIdx
    const newMsgs = messages.filter((_, i) => i !== removeIdx)
    const lastUser = [...newMsgs].reverse().find((m: any) => m.role === 'user')
    if (!lastUser) return
    setMessages(newMsgs)
    setStreaming(true); resetStream()
    const streamMsgId = 'stream_' + Date.now()
    addMessage({ id: streamMsgId, role: 'assistant', content: '', timestamp: new Date().toISOString() })
    useAppStore.setState({ streamingMsgId: streamMsgId })
    const history = newMsgs.filter((m: any) => m.role !== 'system').slice(-MAX_HISTORY_MESSAGES).map((m: any) => { const h: any = { role: m.role, content: m.content }; if (m.tool_calls) { try { const parsed = JSON.parse(m.tool_calls); h.tool_calls = Array.isArray(parsed) ? parsed.filter((tc: any) => tc?.function?.name) : parsed } catch {} } if (m.tool_call_id) h.tool_call_id = m.tool_call_id; return h })
    const result = await api.chatSend({ message: lastUser.content, history, model: config.ai?.model, agentId: currentAgent?.id || DEFAULT_AGENT_ID, convId: currentConvId || undefined })
    if (!result?.ok) {
      const errMsg = friendlyError(result?.error || '生成失败')
      useAppStore.getState().updateLastMessage({ content: errMsg, isError: true })
      setStreaming(false); resetStream()
    }
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
      const streamMsgId = 'stream_' + Date.now()
      addMessage({ id: streamMsgId, role: 'assistant', content: '', timestamp: new Date().toISOString() })
      useAppStore.setState({ streamingMsgId: streamMsgId })
      const history = truncated.slice(0, -1).map(m => { const h: any = { role: m.role, content: m.content }; if (m.tool_calls) { try { const parsed = JSON.parse(m.tool_calls); h.tool_calls = Array.isArray(parsed) ? parsed.filter((tc: any) => tc?.function?.name) : parsed } catch {} } if (m.tool_call_id) h.tool_call_id = m.tool_call_id; return h })
      try {
        await api.chatSend({ message: editText, history, model: config.ai?.model, agentId: currentAgent?.id || DEFAULT_AGENT_ID, convId: currentConvId || undefined })
      } catch {
        useAppStore.getState().updateLastMessage({ content: '请求失败，请重试' })
        setStreaming(false); resetStream()
      }
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
    else if (tool === '附件') {
      const el = document.createElement('input'); el.type = 'file'; el.accept = '.txt,.md,.json,.csv,.py,.js,.ts,.html,.css,.xml,.yaml,.yml,.toml,.ini,.log,.sh,.bat,.sql,.rb,.go,.rs,.java,.c,.cpp,.h,.hpp'
      el.onchange = async () => {
        const file = el.files?.[0]; if (!file) return
        try {
          const reader = new FileReader()
          reader.onload = () => {
            const content = typeof reader.result === 'string' ? reader.result : ''
            if (!content || /[\x00-\x08\x0E-\x1F]/.test(content.slice(0, 200))) {
              setInput(prev => prev + `[文件: ${file.name}] (二进制文件，无法读取文本内容)`)
              return
            }
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
      <div id="messages" ref={messagesRef}>
        {messages.length === 0 && !isStreaming && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, color: 'var(--text4)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, var(--accent), #6366f1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700 }}>A</div>
            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text3)' }}>开始新的对话</p>
            <p style={{ fontSize: 12, color: 'var(--text4)' }}>输入消息开始聊天，或在左侧选择历史对话</p>
          </div>
        )}
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
              key={m.id || i}
              role={m.role}
              content={m.content}
              thinking={m.thinking || undefined}
              tokens={m.tokens}
              toolCalls={(() => {
                // Parse saved tool_calls from message
                let saved: any[] | undefined
                if (m.tool_calls) {
                  try {
                    const parsed = JSON.parse(m.tool_calls)
                    if (Array.isArray(parsed)) saved = parsed.map((tc: any) => ({
                      id: tc.id || 'tc_' + Math.random(),
                      name: tc.name || tc.function?.name || 'unknown',
                      args: tc.args || tc.function?.arguments || '',
                      status: tc.status || 'done',
                    }))
                  } catch {}
                }
                // For the last streaming message, merge live toolCalls from store
                const isLastStreaming = isStreaming && i === messages.length - 1 && m.role === 'assistant'
                if (isLastStreaming && toolCalls.length > 0) {
                  const merged = [...(saved || [])]
                  for (const live of toolCalls) {
                    const idx = merged.findIndex(t => t.id === live.id || t.name === live.name)
                    if (idx >= 0) merged[idx] = { ...merged[idx], ...live }
                    else merged.push(live)
                  }
                  return merged.length > 0 ? merged : undefined
                }
                return saved
              })()}
              isStreaming={isStreaming && i === messages.length - 1 && m.role === 'assistant'}
              isError={!!m.isError}
              model={m.role === 'assistant' && i === messages.length - 1 ? (useAppStore.getState().lastModel || undefined) : undefined}
              onCopy={() => copyMessage(m.content)}
              onEdit={m.role === 'user' ? () => handleEditMessage(i, m.content) : undefined}
              onReplyQuote={() => setReplyingTo({ idx: i, content: m.content.slice(0, 100) })}
              onFork={() => handleFork(i)}
              onRegenerate={i === messages.length - 1 && m.role === 'assistant' ? regenerate : undefined}
            />
          )
        ))}
        {isStreaming && !(messages.length > 0 && messages[messages.length - 1].role === 'assistant') && (
          <MessageBubble
            role="assistant"
            content={streamBuf}
            thinking={thinkBuf || undefined}
            toolCalls={toolCalls.length > 0 ? toolCalls : undefined}
            isStreaming={true}
          />
        )}
        {maxModeProposals.length > 0 && (
          <MaxModePanel
            proposals={maxModeProposals}
            judgeResult={maxModeJudgePick}
            isJudging={maxModeJudging}
            onPick={(id) => setMaxModeJudgePick(id)}
          />
        )}
        {goalJudgeResult && (
          <div style={{
            margin: '8px 0', padding: '10px 14px', borderRadius: 'var(--radius)',
            background: goalJudgeResult.complete ? 'rgba(22,163,74,0.06)' : 'rgba(245,158,11,0.06)',
            border: `1px solid ${goalJudgeResult.complete ? 'rgba(22,163,74,0.2)' : 'rgba(245,158,11,0.2)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: goalJudgeResult.issues.length > 0 || goalJudgeResult.suggestion ? 8 : 0 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 8,
                background: goalJudgeResult.complete ? 'rgba(22,163,74,0.15)' : 'rgba(245,158,11,0.15)',
                color: goalJudgeResult.complete ? 'var(--success)' : 'var(--warning)',
              }}>
                {goalJudgeResult.complete ? '任务完成' : '待改进'}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: goalJudgeResult.score >= 7 ? 'var(--success)' : 'var(--warning)' }}>
                {goalJudgeResult.score}/10
              </span>
              <span style={{ fontSize: 11, color: 'var(--text4)' }}>Goal Judge</span>
              <button
                onClick={() => setGoalJudgeResult(null)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text4)', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}
                title="关闭"
              >✕</button>
            </div>
            {goalJudgeResult.issues.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>
                {goalJudgeResult.issues.map((issue, i) => (
                  <div key={i} style={{ paddingLeft: 8, borderLeft: '2px solid var(--warning)', marginBottom: 2, lineHeight: 1.6 }}>{issue}</div>
                ))}
              </div>
            )}
            {goalJudgeResult.suggestion && (
              <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', paddingLeft: 8, borderLeft: '2px solid var(--accent)' }}>
                {goalJudgeResult.suggestion}
              </div>
            )}
          </div>
        )}
        <div ref={msgEndRef}></div>
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          style={{
            position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
            padding: '6px 16px', borderRadius: 20, border: '1px solid var(--border)',
            background: 'var(--bg)', color: 'var(--text2)', fontSize: 12, fontWeight: 500,
            cursor: 'pointer', boxShadow: 'var(--shadow-md)', zIndex: 10,
            display: 'flex', alignItems: 'center', gap: 6,
            transition: 'opacity 0.2s, transform 0.2s',
          }}
        >
          <span style={{ fontSize: 14 }}>↓</span> 有新消息
        </button>
      )}

      {replyingTo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--accent-light)', borderLeft: '3px solid var(--accent)', fontSize: 12, color: 'var(--text2)' }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>引用: {replyingTo.content}</span>
          <button className="msg-action-btn" onClick={() => setReplyingTo(null)}>x</button>
        </div>
      )}

      {/* Pasted images preview */}
      {pastedImages.length > 0 && (
        <div style={{ display: 'flex', gap: 8, padding: '6px 12px', flexWrap: 'wrap', background: 'var(--bg3)', borderTop: '1px solid var(--border)' }}>
          {pastedImages.map((img, i) => (
            <div key={i} style={{ position: 'relative', width: 64, height: 64, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
              <img src={img.dataUrl} alt={img.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button
                onClick={() => setPastedImages(prev => prev.filter((_, j) => j !== i))}
                style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
              >✕</button>
            </div>
          ))}
          <button
            onClick={() => setPastedImages([])}
            style={{ fontSize: 11, color: 'var(--text4)', background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'center' }}
          >清除全部</button>
        </div>
      )}

      <div className="input-tools">
        <button onClick={() => handleInputTool('附件')}>附件</button>
        <button onClick={() => handleInputTool('搜索')}>搜索</button>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowTemplatePanel(!showTemplatePanel)}>模板</button>
          {showTemplatePanel && <TemplatePanel onSelect={(text) => setInput(prev => prev ? prev + '\n' + text : text)} onClose={() => setShowTemplatePanel(false)} agentId={currentAgent?.id} />}
        </div>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowClipboardPanel(!showClipboardPanel)}>剪贴板</button>
          {showClipboardPanel && <ClipboardPanel onSelect={(text) => setInput(prev => prev ? prev + text : text)} onClose={() => setShowClipboardPanel(false)} />}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text4)', userSelect: 'none' }}>
          {streamSpeed && speedHistory.length > 1 && (() => {
            const w = 120, h = 30
            const maxCps = Math.max(...speedHistory.map(p => p.cps), 1)
            const pts = speedHistory.map((p, i) => {
              const x = (i / (speedHistory.length - 1)) * w
              const y = h - (p.cps / maxCps) * (h - 4) - 2
              return `${x},${y}`
            })
            const line = pts.join(' ')
            const area = `0,${h} ${line} ${w},${h}`
            return (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <svg width={w} height={h} style={{ display: 'block' }}>
                  <defs>
                    <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  <polygon points={area} fill="url(#sparkGrad)" />
                  <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ color: isStreaming ? 'var(--accent)' : 'var(--text4)', fontVariantNumeric: 'tabular-nums', fontWeight: 500, minWidth: 42, textAlign: 'right' }}>
                  {streamSpeed.cps}<span style={{ fontSize: 9, fontWeight: 400 }}> c/s</span>
                </span>
              </span>
            )
          })()}

        </div>
      </div>

      <div className="input-area">
        <textarea ref={textareaRef} rows={1} placeholder={pendingMessage ? '消息排队中...' : isStreaming ? 'AI 思考中，可继续输入...' : maxMode ? 'MaxMode: 并行生成3个方案...' : '输入消息... (Enter 发送, ↑↓ 翻阅历史)'} value={input} onChange={handleTextareaInput} onKeyDown={handleKeyDown} />
        <button
          onClick={() => toggleMaxMode()}
          style={{
            width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: maxMode ? 'var(--accent)' : 'var(--bg3)',
            color: maxMode ? '#fff' : 'var(--text4)',
            fontSize: 11, fontWeight: 700, flexShrink: 0,
            transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title={maxMode ? '关闭 MaxMode' : '开启 MaxMode: 并行3方案+自动Judge'}
        >M</button>
        <button
          onClick={() => toggleGoalJudge()}
          style={{
            width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: goalJudgeEnabled ? 'var(--success)' : 'var(--bg3)',
            color: goalJudgeEnabled ? '#fff' : 'var(--text4)',
            fontSize: 11, fontWeight: 700, flexShrink: 0,
            transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title={goalJudgeEnabled ? '关闭 Goal Judge' : '开启 Goal Judge: 自动验证任务完成度'}
        >G</button>
        <button className="send-btn" onClick={isStreaming ? () => { cancelPendingRef.current = true; api.chatCancel(); setPendingMessage(null) } : handleSend} disabled={!isStreaming && !input.trim() && !pendingMessage} style={isStreaming ? { background: 'var(--error)' } : pendingMessage ? { background: 'var(--warning)' } : undefined}>{isStreaming ? '■' : pendingMessage ? '⏳' : '▲'}</button>
      </div>

      {pendingMessage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', background: 'rgba(245,158,11,0.06)', borderTop: '1px solid rgba(245,158,11,0.2)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)', animation: 'pulse 1.4s ease infinite', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>排队中: {pendingMessage}</span>
          <button className="msg-action-btn" onClick={() => setPendingMessage(null)} title="取消排队">✕</button>
        </div>
      )}

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

      {showAlert && <AlertModal message={showAlert.message} onClose={() => setShowAlert(null)} />}
    </div>
  )
}
