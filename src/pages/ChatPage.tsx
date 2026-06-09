import { useEffect, useState, useRef, useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'
import DOMPurify from 'dompurify'

function renderMarkdown(text: string): string {
  if (!text) return ''
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `<div class="code-block"><div class="code-header"><span>${lang || 'code'}</span><button onclick="navigator.clipboard.writeText(this.closest('.code-block').querySelector('pre').textContent)">复制</button></div><pre>${code.trim()}</pre></div>`)
    .replace(/`([^`]+)`/g, '<code style="background:var(--bg3);padding:1px 5px;border-radius:3px;font-family:var(--mono);font-size:12px">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:14px;font-weight:600;margin:12px 0 6px">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:15px;font-weight:600;margin:14px 0 8px">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:16px;font-weight:700;margin:16px 0 10px">$1</h1>')
    .replace(/^[-*] (.+)$/gm, '<li style="margin:2px 0;margin-left:16px">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li style="margin:2px 0;margin-left:16px;list-style:decimal">$1</li>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<div class="media-block"><img src="$2" alt="$1" loading="lazy" /></div>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="file-link" href="$2" target="_blank">$1</a>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
  html = '<p>' + html + '</p>'
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'h1', 'h2', 'h3', 'li', 'ul', 'ol', 'a', 'img', 'div', 'span', 'button'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'onclick', 'target', 'loading'],
    ALLOW_DATA_ATTR: false,
  })
}

export function ChatPage() {
  const { currentConvId, setCurrentConvId, messages, setMessages, addMessage, isStreaming, setStreaming, streamBuf, appendToken, thinkBuf, appendThink, toolCalls, addToolCall, resetStream, setTokenUsage, conversations, setConversations } = useAppStore()
  const [input, setInput] = useState('')
  const [models, setModels] = useState<any[]>([])
  const [config, setConfig] = useState<any>({})
  const [currentAgent, setCurrentAgent] = useState<any>(null)
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const [expandedThinks, setExpandedThinks] = useState<Set<string>>(new Set())
  const [gwRunning, setGwRunning] = useState(true)
  const msgEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // New features state
  const [replyingTo, setReplyingTo] = useState<{ idx: number; content: string } | null>(null)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [showPromptLib, setShowPromptLib] = useState(false)
  const [prompts, setPrompts] = useState<any[]>([])
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [showMemoryModal, setShowMemoryModal] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [memoryInput, setMemoryInput] = useState('')
  const [playingTts, setPlayingTts] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)

  useEffect(() => {
    api.getConfig().then(setConfig).catch(console.error)
    api.agentsList().then((a: any[]) => { if (a.length) setCurrentAgent(a[0]) }).catch(console.error)
    api.gatewayStatus().then((s: any) => setGwRunning(s.running)).catch(() => setGwRunning(false))
    api.modelsList().then((m: any[]) => setModels(m.filter(x => x.enabled !== false))).catch(console.error)
    api.promptsList?.().then(setPrompts).catch(() => {})
  }, [])

  useEffect(() => {
    if (currentConvId) {
      api.convMessages(currentConvId).then((msgs: any[]) => {
        setMessages(msgs)
        const total = msgs.reduce((s: number, m: any) => s + (m.tokens || Math.ceil((m.content || '').length / 4)), 0)
        setTokenUsage(total)
      }).catch(console.error)
    } else {
      setMessages([])
      setTokenUsage(0)
    }
  }, [currentConvId])

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamBuf])

  useEffect(() => {
    api.onChatToken((t: string) => appendToken(t))
    api.onChatThinking((t: string) => appendThink(t))
    api.onChatToolCall((d: any) => addToolCall(d))
    api.onChatDone(() => {
      if (streamBuf) addMessage({ role: 'assistant', content: streamBuf, timestamp: new Date().toISOString() })
      setStreaming(false)
      if (currentConvId && messages.length <= 2 && streamBuf) {
        const title = streamBuf.slice(0, 50).replace(/[\n\r]/g, ' ').trim()
        if (title) {
          const convs = useAppStore.getState().conversations
          const conv = convs.find((c: any) => c.id === currentConvId)
          if (conv && (!conv.title || conv.title.length < 5)) {
            conv.title = title
            useAppStore.getState().setConversations([...convs])
          }
        }
      }
    })
    api.onChatError(() => setStreaming(false))
  }, [streamBuf])

  // Drag and drop
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
        const r = await api.capDocExtract((file as any).path)
        if (r.ok) addMessage({ role: 'user', content: `[File] ${r.filename || file.name}\n\n${(r.content || '').slice(0, 3000)}`, timestamp: new Date().toISOString() })
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
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    let convId = currentConvId
    if (!convId) {
      convId = await api.convCreate(msg.slice(0, 50))
      setCurrentConvId(convId)
    }
    let finalMsg = msg
    if (replyingTo) {
      finalMsg = `> ${replyingTo.content}\n\n${msg}`
      setReplyingTo(null)
    }
    addMessage({ role: 'user', content: finalMsg, timestamp: new Date().toISOString() })
    setStreaming(true)
    resetStream()
    const history = messages.slice(-20).map((m: any) => ({ role: m.role, content: m.content }))
    const result = await api.chatSend({ message: finalMsg, history, model: currentAgent?.model || config.ai?.model, convId })
    if (!result?.ok) {
      setStreaming(false)
      addMessage({ role: 'assistant', content: 'Error: ' + (result?.error || 'Unknown'), timestamp: new Date().toISOString() })
    }
  }, [input, isStreaming, currentConvId, messages, config, replyingTo])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    if (e.key === 'Escape' && isStreaming) api.chatCancel()
  }

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px'
  }

  const toggleTool = (id: string) => {
    setExpandedTools(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const copyMessage = (content: string) => navigator.clipboard.writeText(content)

  const handleTts = async (text: string) => {
    setPlayingTts(text.slice(0, 20))
    const r = await api.capTts(text)
    if (r.ok && r.path) {
      const audio = new Audio('file:///' + r.path.replace(/\\/g, '/'))
      audio.play()
      audio.onended = () => setPlayingTts(null)
    } else { setPlayingTts(null) }
  }

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
    const history = newMsgs.filter((m: any) => m.role !== 'system').slice(-20).map((m: any) => ({ role: m.role, content: m.content }))
    const result = await api.chatSend({ message: lastUser.content, history, model: currentAgent?.model || config.ai?.model, convId: currentConvId || undefined })
    if (!result?.ok) { setStreaming(false); addMessage({ role: 'assistant', content: 'Error: ' + (result?.error || 'Unknown'), timestamp: new Date().toISOString() }) }
  }

  const handleFork = async (idx: number) => {
    if (!currentConvId) return
    const newId = await api.convFork?.(currentConvId, idx)
    if (newId) {
      setCurrentConvId(newId)
      api.convMessages(newId).then(setMessages)
      api.convList().then(setConversations)
    }
  }

  const handleEditMessage = (idx: number, content: string) => { setEditingIdx(idx); setEditText(content) }
  const handleSaveEdit = async (idx: number) => {
    if (!editText.trim()) return
    const newMsgs = [...messages]; newMsgs[idx] = { ...newMsgs[idx], content: editText }
    const truncated = newMsgs.slice(0, idx + 1)
    setMessages(truncated); setEditingIdx(null)
    if (messages[idx].role === 'user') {
      setStreaming(true); resetStream()
      const history = truncated.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
      await api.chatSend({ message: editText, history, model: currentAgent?.model || config.ai?.model, convId: currentConvId || undefined })
    }
  }

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      mediaRecorderRef.current = mediaRecorder
      await api.invoke('voice:start')
      mediaRecorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          const reader = new FileReader()
          reader.onloadend = async () => { const base64 = (reader.result as string).split(',')[1]; await api.invoke('voice:chunk', base64) }
          reader.readAsDataURL(e.data)
        }
      }
      mediaRecorder.start(1000)
      setIsRecording(true)
    } catch { alert('Cannot access microphone') }
  }
  const stopRecording = async () => {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop())
    setIsRecording(false)
    const result = await api.invoke('voice:stop')
    if (result.ok && result.text) setInput(prev => prev + result.text)
  }

  const handleInputTool = async (tool: string) => {
    if (tool === '搜索') setShowSearchModal(true)
    else if (tool === '记忆') setShowMemoryModal(true)
    else if (tool === '附件') {
      const el = document.createElement('input'); el.type = 'file'; el.accept = '.txt,.md,.json,.csv,.py,.js,.ts,.html,.css,.pdf'
      el.onchange = async () => { const file = el.files?.[0]; if (!file) return; const r = await api.capDocExtract(file.path); if (r.ok) addMessage({ role: 'user', content: '[File] ' + (r.filename || file.name) + '\n\n' + (r.content || '').slice(0, 2000), timestamp: new Date().toISOString() }) }
      el.click()
    }
  }

  return (
    <div className="page" id="page-chat" style={{ position: 'relative' }}>
      {isDragging && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(79,70,229,0.1)', border: '2px dashed var(--accent)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: 'var(--accent)', fontWeight: 600 }}>
          {'拖放文件到这里'}
        </div>
      )}
      <div id="messages">
        {messages.length === 0 && !streamBuf && (
          <div className="welcome">
            <img src="logo.png" alt="AaronClaw" style={{ width: 48, height: 48, borderRadius: 12, marginBottom: 14, boxShadow: '0 6px 18px rgba(79,70,229,0.18)' }} />
            <h2 style={{ fontSize: 20, fontWeight: 650, marginBottom: 4, letterSpacing: -0.3 }}>AaronClaw AI Agent</h2>
            <p style={{ color: 'var(--text2)', marginBottom: 20, fontSize: 13 }}>{'多模型'} / {'流式渲染'} / {'工具调用'} / {'长记忆'} / {'RAG'} / {'工作流'}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {[{ label: '分析数据', prompt: '帮我分析一份 CSV 数据' }, { label: '调试代码', prompt: '帮我调试这段代码' }, { label: '写文章', prompt: '帮我写一篇文章' }, { label: '搜论文', prompt: '搜索相关论文' }].map((item) => (
                <span key={item.label} onClick={() => setInput(item.prompt)} style={{ padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 16, fontSize: 12.5, cursor: 'pointer', color: 'var(--text2)', transition: 'all 160ms ease' }}>{item.label}</span>
              ))}
            </div>
          </div>
        )}
        {messages.map((m: any, i: number) => (
          <div key={i} className={'msg ' + (m.role === 'user' ? 'user' : 'assistant')}>
            <div className="avatar" style={{ background: m.role === 'user' ? 'linear-gradient(135deg,var(--accent),#6366f1)' : 'var(--text4)' }}>{m.role === 'user' ? 'U' : 'AI'}</div>
            <div style={{ flex: 1, maxWidth: '78%' }}>
              {editingIdx === i ? (
                <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                  <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={3}
                    style={{ width: '100%', border: '1px solid var(--accent)', borderRadius: 8, padding: 8, fontSize: 13, fontFamily: 'var(--font)', resize: 'vertical' }} autoFocus />
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => setEditingIdx(null)}>取消</button>
                    <button className="btn btn-sm btn-primary" onClick={() => handleSaveEdit(i)}>保存并重新生成</button>
                  </div>
                </div>
              ) : (
                <div className="bubble" dangerouslySetInnerHTML={{ __html: m.role === 'user' ? m.content.replace(/\n/g, '<br>') : renderMarkdown(m.content) }}></div>
              )}
              <div className="msg-actions">
                <button className="msg-action-btn" onClick={() => copyMessage(m.content)} title="复制">{'\ud83d\udccb'}</button>
                {m.role === 'user' && <button className="msg-action-btn" onClick={() => handleEditMessage(i, m.content)} title="编辑">{'\u270f\ufe0f'}</button>}
                {m.role === 'assistant' && <button className="msg-action-btn" onClick={() => handleTts(m.content)} title="朗读" disabled={playingTts !== null}>{playingTts === m.content.slice(0, 20) ? '\u23f9' : '\ud83d\udd0a'}</button>}
                <button className="msg-action-btn" onClick={() => setReplyingTo({ idx: i, content: m.content.slice(0, 100) })} title="引用回复">{'\ud83d\udcac'}</button>
                <button className="msg-action-btn" onClick={() => handleFork(i)} title="从此处分叉">{'\ud83d\udd00'}</button>
                {i === messages.length - 1 && m.role === 'assistant' && <button className="msg-action-btn" onClick={regenerate} title="重新生成">{'\u21bb'}</button>}
              </div>
            </div>
          </div>
        ))}
        {thinkBuf && (
          <div className="think-block open">
            <div className="think-header">{'\ud83d\udca1'} {'思考中...'}</div>
            <div className="think-body">{thinkBuf}</div>
          </div>
        )}
        {toolCalls.map((tc: any, i: number) => (
          <div key={i} className={'tool-card' + (expandedTools.has(tc.id || String(i)) ? ' open' : '')}>
            <div className="tool-header" onClick={() => toggleTool(tc.id || String(i))}>
              <span className={'sdot ' + (tc.status || 'running')}></span>
              <span className="tool-name">{tc.name || 'tool_call'}</span>
              {tc.status === 'done' && <span className="badge badge-green" style={{ fontSize: 9 }}>{'完成'}</span>}
              {tc.status === 'error' && <span className="badge badge-red" style={{ fontSize: 9 }}>{'失败'}</span>}
            </div>
            <div className="tool-body">
              {tc.output ? <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, margin: 0 }}>{tc.output}</pre> : (tc.args ? JSON.stringify(tc.args, null, 2) : '无详细信息')}
            </div>
          </div>
        ))}
        {streamBuf && !thinkBuf && (
          <div className="msg assistant">
            <div className="avatar">AI</div>
            <div className="bubble" dangerouslySetInnerHTML={{ __html: renderMarkdown(streamBuf) }}></div>
          </div>
        )}
        <div ref={msgEndRef}></div>
      </div>

      {/* Reply indicator */}
      {replyingTo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--accent-light)', borderLeft: '3px solid var(--accent)', fontSize: 12, color: 'var(--text2)' }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>引用: {replyingTo.content}</span>
          <button className="msg-action-btn" onClick={() => setReplyingTo(null)}>x</button>
        </div>
      )}

      {/* Input tools */}
      <div className="input-tools">
        <button onClick={() => handleInputTool('附件')}>附件</button>
        <button onClick={() => handleInputTool('搜索')}>搜索</button>
        <button onClick={() => handleInputTool('记忆')}>记忆</button>
        <button onClick={() => setShowPromptLib(true)}>Prompt</button>
      </div>

      {/* Input area */}
      <div className="input-area" style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea ref={textareaRef} rows={1} placeholder={isStreaming ? 'AI 思考中...' : '输入消息... (Enter 发送, Shift+Enter 换行)'} value={input} onChange={handleTextareaInput} onKeyDown={handleKeyDown} disabled={isStreaming} style={{ flex: 1 }} />
        <button className="send-btn" onClick={isRecording ? stopRecording : startRecording}
          style={{ background: isRecording ? 'var(--error)' : undefined, width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isRecording ? '\u23f9' : '\ud83c\udfa4'}
        </button>
        <button className="send-btn" onClick={handleSend} disabled={isStreaming || !input.trim() || !gwRunning}>{isStreaming ? '\u25a0' : '\u2191'}</button>
      </div>

      {/* Prompt library modal */}
      {showPromptLib && (
        <div className="modal-overlay" onClick={() => setShowPromptLib(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 500 }}>
            <div className="modal-header"><h3>Prompt 模板库</h3></div>
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

      {/* Search modal */}
      {showSearchModal && (
        <div className="modal-overlay" onClick={() => setShowSearchModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>搜索网页</h3></div>
            <div className="modal-body">
              <div className="form-group"><label>搜索内容</label><input value={searchInput} onChange={e => setSearchInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setShowSearchModal(false); const q = searchInput; setSearchInput(''); addMessage({ role: 'user', content: '搜索: ' + q, timestamp: new Date().toISOString() }); api.capWebSearch(q).then(r => { if (r.ok) addMessage({ role: 'assistant', content: r.results || '无结果', timestamp: new Date().toISOString() }) }) } }} placeholder="输入搜索关键词..." /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSearchModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={() => { setShowSearchModal(false); const q = searchInput; setSearchInput(''); addMessage({ role: 'user', content: '搜索: ' + q, timestamp: new Date().toISOString() }); api.capWebSearch(q).then(r => { if (r.ok) addMessage({ role: 'assistant', content: r.results || '无结果', timestamp: new Date().toISOString() }) }) }}>搜索</button>
            </div>
          </div>
        </div>
      )}

      {/* Memory modal */}
      {showMemoryModal && (
        <div className="modal-overlay" onClick={() => setShowMemoryModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>添加记忆</h3></div>
            <div className="modal-body">
              <div className="form-group"><label>记忆内容</label><textarea rows={3} value={memoryInput} onChange={e => setMemoryInput(e.target.value)} placeholder="输入要保存的记忆..." /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowMemoryModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={() => { if (memoryInput.trim()) { api.memoryAdd(memoryInput, 'general').then(() => addMessage({ role: 'assistant', content: '已添加到记忆: ' + memoryInput.slice(0, 50), timestamp: new Date().toISOString() })); setMemoryInput(''); setShowMemoryModal(false) } }}>添加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}