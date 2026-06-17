import { useState, useEffect, useRef, useCallback, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../lib/ipc'
import { useAppStore } from '../stores/appStore'
import type { Agent, Group, GcMessage } from '../types/ipc-api'
import { MessageBubble } from '../components/MessageBubble'
import { ThinkingCard } from '../components/ThinkingCard'
import { ToolCallCard } from '../components/ToolCallCard'
import { WorkflowPanel } from '../components/WorkflowPanel'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { healMarkdown } from '../lib/healMarkdown'

export function GroupPage(): JSX.Element {
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<Agent[]>([])
  const [messages, setMessages] = useState<GcMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [bookmarks, setBookmarks] = useState<any[]>([])
  const [pinned, setPinned] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [inviteName, setInviteName] = useState('')
  const [inviteExistingId, setInviteExistingId] = useState('')
  const [inviteMode, setInviteMode] = useState<'existing' | 'create'>('existing')
  const [newAgentIdentity, setNewAgentIdentity] = useState('')
  const [newAgentExpertise, setNewAgentExpertise] = useState('')
  const [newAgentSkills, setNewAgentSkills] = useState<string[]>([])
  // Mention dropdown state
  const [showMention, setShowMention] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const [inputReady, setInputReady] = useState(false)
  const agents = useAppStore(s => s.agents)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  // Streaming state
  const [streamingText, setStreamingText] = useState('')
  const [streamingThinking, setStreamingThinking] = useState('')
  const [streamingToolCalls, setStreamingToolCalls] = useState<Array<{ id: string; name: string; args?: string; output?: string; status: 'running' | 'done' | 'error' }>>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const streamingGroupId = useRef<string | null>(null)
  const [decompositionSteps, setDecompositionSteps] = useState<Array<{ id: string; agentId: string; agentName: string; task: string }> | null>(null)
  const [currentSpeaker, setCurrentSpeaker] = useState<{ agentId: string; agentName: string } | null>(null)

  useEffect(() => { api.gcGroups().then(setGroups).catch(() => {}) }, [])
  useEffect(() => { if (!agents.length) api.agentsList().then(a => useAppStore.getState().setAgents(a)).catch(() => {}) }, [])
  useEffect(() => {
    if (selectedGroup) {
      api.gcMessages(selectedGroup.id).then(setMessages).catch(() => {})
      api.gcMembers(selectedGroup.id).then(setMembers).catch(() => {})
      api.gcBookmarks(selectedGroup.id).then(setBookmarks).catch(() => {})
      api.gcPinned?.(selectedGroup.id).then(setPinned).catch(() => {})
    }
  }, [selectedGroup])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  // Streaming event listeners
  useEffect(() => {
    api.onGcStreamToken((d) => {
      if (d.groupId !== streamingGroupId.current) return
      setStreamingText(prev => prev + d.token)
    })
    api.onGcStreamThinking((d) => {
      if (d.groupId !== streamingGroupId.current) return
      setStreamingThinking(prev => prev + d.text)
    })
    api.onGcStreamTool((d) => {
      if (d.groupId !== streamingGroupId.current) return
      setStreamingToolCalls(prev => {
        const idx = prev.findIndex(t => t.id === d.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = { ...next[idx], status: d.status as any, args: d.args || next[idx].args, output: d.output || next[idx].output }
          return next
        }
        return [...prev, { id: d.id, name: d.name, args: d.args, output: d.output, status: d.status as any }]
      })
    })
    api.onGcStreamDone((d) => {
      if (d.groupId !== streamingGroupId.current) return
      setIsStreaming(false)
      streamingGroupId.current = null
      api.gcMessages(d.groupId).then(setMessages).catch(() => {})
      setStreamingText('')
      setStreamingThinking('')
      setStreamingToolCalls([])
      setDecompositionSteps(null)
      setCurrentSpeaker(null)
      setSending(false)
    })
    api.onGcStreamError((d) => {
      if (d.groupId !== streamingGroupId.current) return
      setIsStreaming(false)
      streamingGroupId.current = null
      setStreamingText('')
      setStreamingThinking('')
      setStreamingToolCalls([])
      setDecompositionSteps(null)
      setCurrentSpeaker(null)
      setSending(false)
    })
    api.onGcStreamDecomposition?.((d) => {
      if (d.groupId !== streamingGroupId.current) return
      setDecompositionSteps(d.steps)
    })
    api.onGcStreamSpeaker?.((d) => {
      if (d.groupId !== streamingGroupId.current) return
      setCurrentSpeaker({ agentId: d.agentId, agentName: d.agentName })
      // Reset per-speaker streaming state for visual separation
      setStreamingText('')
      setStreamingThinking('')
      setStreamingToolCalls([])
    })
  }, [])

  const handleSend = async () => {
    if (!input.trim() || !selectedGroup || sending) return
    const msg = input.trim()
    setInput('')
    setSending(true)
    setMessages(prev => [...prev, { id: 'temp', groupId: selectedGroup.id, senderId: 'user', senderName: 'User', role: 'user', content: msg, timestamp: new Date().toISOString() }])

    // @mention → use non-streaming gcSend for specific agent reply
    const mentionMatch = msg.match(/@(\S+)/g)
    if (mentionMatch) {
      try {
        const result = await api.gcSend(selectedGroup.id, msg)
        if (result.ok && result.replies) {
          for (const r of result.replies) {
            setMessages(prev => [...prev, { id: `r-${Date.now()}-${r.agentId}`, groupId: selectedGroup.id, senderId: r.agentId, senderName: r.agentName, role: 'assistant', content: r.reply || r.error || '(no reply)', timestamp: new Date().toISOString() }])
          }
        }
        api.gcMessages(selectedGroup.id).then(setMessages).catch(() => {})
      } catch {}
      setSending(false)
      return
    }

    // Normal message → streaming pass-through to gateway
    setIsStreaming(true)
    setStreamingText('')
    setStreamingThinking('')
    setStreamingToolCalls([])
    setDecompositionSteps(null)
    setCurrentSpeaker(null)
    streamingGroupId.current = selectedGroup.id
    try {
      await api.gcStreamSend(selectedGroup.id, msg)
    } catch {
      setIsStreaming(false)
      streamingGroupId.current = null
      setSending(false)
    }
  }

  const handleCreateGroup = async () => {
    if (!newName.trim()) return
    const group: Group = { id: 'gc-' + Date.now(), name: newName.trim(), members: [], createdAt: new Date().toISOString() }
    await api.gcSave(group)
    setGroups(prev => [...prev, group])
    setNewName('')
    setShowCreate(false)
    setSelectedGroup(group)
  }

  const handleInvite = async () => {
    if (!selectedGroup) return
    if (inviteMode === 'existing' && inviteExistingId) {
      await api.gcAddMember(selectedGroup.id, inviteExistingId)
    } else if (inviteMode === 'create' && inviteName.trim()) {
      const a: Agent = {
        id: 'ag-' + Date.now(), name: inviteName.trim(), enabled: true,
        identity: newAgentIdentity.trim() || undefined,
        expertise: newAgentExpertise.trim() || undefined,
        skills: newAgentSkills.length > 0 ? newAgentSkills : undefined,
      }
      await api.agentsSave(a)
      await api.gcAddMember(selectedGroup.id, a.id)
    }
    api.gcMembers(selectedGroup.id).then(setMembers)
    setShowInvite(false)
    setInviteName('')
    setInviteExistingId('')
    setInviteMode('existing')
    setNewAgentIdentity('')
    setNewAgentExpertise('')
    setNewAgentSkills([])
  }

  const handleDeleteGroup = async (gid: string) => {
    await api.gcDelete(gid)
    setGroups(prev => prev.filter(g => g.id !== gid))
    if (selectedGroup?.id === gid) { setSelectedGroup(null); setMessages([]); setMembers([]) }
  }

  const handleExport = () => {
    if (!messages.length) return
    const text = messages.map(m => `[${m.senderName}] ${m.content}`).join('\n\n')
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${selectedGroup?.name || 'group'}-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
  }

  // Mention detection: find last @ and extract query
  const detectMention = useCallback((value: string, cursorPos: number) => {
    const beforeCursor = value.slice(0, cursorPos)
    const atIndex = beforeCursor.lastIndexOf('@')
    if (atIndex === -1) { setShowMention(false); return }
    // @ must be at start or preceded by whitespace
    if (atIndex > 0 && !/\s/.test(beforeCursor[atIndex - 1])) { setShowMention(false); return }
    const query = beforeCursor.slice(atIndex + 1)
    // Don't show if query contains spaces (already past the mention)
    if (/\s/.test(query)) { setShowMention(false); return }
    setMentionQuery(query)
    setMentionIndex(0)
    setShowMention(true)
  }, [])

  const filteredMembers = showMention
    ? members.filter(m => m.name?.toLowerCase().includes(mentionQuery.toLowerCase()))
    : []

  // When mention is active but group has no members, show a hint
  const showMentionHint = showMention && members.length === 0

  const insertMention = useCallback((name: string) => {
    const el = inputRef.current
    if (!el) return
    const cursorPos = el.selectionStart || input.length
    const beforeCursor = input.slice(0, cursorPos)
    const atIndex = beforeCursor.lastIndexOf('@')
    if (atIndex === -1) return
    const before = input.slice(0, atIndex)
    const after = input.slice(cursorPos)
    const newVal = `${before}@${name} ${after}`
    setInput(newVal)
    setShowMention(false)
    // Focus and set cursor after the inserted mention
    setTimeout(() => {
      el.focus()
      const pos = before.length + name.length + 2
      el.setSelectionRange(pos, pos)
    }, 0)
  }, [input])

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showMention && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, filteredMembers.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(filteredMembers[mentionIndex].name || ''); return }
      if (e.key === 'Escape') { e.preventDefault(); setShowMention(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }, [showMention, filteredMembers, mentionIndex, insertMention, handleSend])

  return (
    <div className="page" id="page-group" style={{ display: 'flex', flexDirection: 'row' as any, height: '100%', gap: 12, padding: 12, overflow: 'hidden' }}>
      {/* Left: group list */}
      <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border)', paddingRight: 12, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>群组</h3>
          <button onClick={() => setShowCreate(true)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>+ 新建</button>
        </div>
        {[...groups].map(g => {
          return (
          <div key={g.id} onClick={() => setSelectedGroup(g)} style={{ padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: selectedGroup?.id === g.id ? 'var(--accent-bg)' : 'transparent', border: selectedGroup?.id === g.id ? '1px solid var(--accent)' : '1px solid transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
            </div>
            <button onClick={e => { e.stopPropagation(); handleDeleteGroup(g.id) }} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>X</button>
          </div>
          )
        })}
        {groups.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 12, textAlign: 'center', padding: 20 }}>暂无群组</div>}
      </div>

      {/* Center: chat area */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
        {selectedGroup ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{selectedGroup.name}</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowInvite(true)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>邀请成员</button>
                <button onClick={handleExport} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>导出</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {messages.map(m => {
                const senderAgent = m.role !== 'user' ? members.find(mem => mem.id === m.senderId) : null
                const agentColor = senderAgent?.color || 'var(--bg3)'
                const isUser = m.role === 'user'
                const isButler = m.senderName === '管家'
                // Parse toolCalls from DB (stored as JSON string)
                let parsedToolCalls: any[] | undefined
                if (m.toolCalls) {
                  try { parsedToolCalls = typeof m.toolCalls === 'string' ? JSON.parse(m.toolCalls) : m.toolCalls } catch {}
                }
                return (
                <div key={m.id} style={{ marginBottom: 10, display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row', gap: 8 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    background: isUser ? 'var(--accent)' : isButler ? '#6366f1' : agentColor,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: '#fff',
                    boxShadow: !isUser && senderAgent?.color ? `0 0 6px ${senderAgent.color}40` : 'none',
                  }}>
                    {isUser ? '你' : m.senderName?.[0] || '?'}
                  </div>
                  <div style={{ maxWidth: '70%', minWidth: 0 }}>
                    <div style={{
                      fontSize: 11, marginBottom: 2, textAlign: isUser ? 'right' : 'left',
                      color: isUser ? 'var(--text3)' : isButler ? '#6366f1' : agentColor,
                      fontWeight: 600,
                    }}>
                      {isUser ? '你' : m.senderName}
                      {senderAgent?.identity && <span style={{ fontWeight: 400, color: 'var(--text3)', marginLeft: 6, fontSize: 10 }}>{senderAgent.identity}</span>}
                    </div>
                    {isUser ? (
                      <div style={{
                        padding: '8px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                        background: 'var(--accent)', color: '#fff',
                      }}>{m.content}</div>
                    ) : (
                      <div style={{
                        padding: '8px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.5,
                        background: isButler ? '#f0f0ff' : 'var(--bg2)',
                        color: 'var(--text)',
                        border: senderAgent?.color ? `1px solid ${senderAgent.color}15` : 'none',
                      }}>
                        {m.thinking && <ThinkingCard content={m.thinking} />}
                        {parsedToolCalls && parsedToolCalls.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                            {parsedToolCalls.map((tc: any) => (
                              <ToolCallCard key={tc.id || tc.name} name={tc.name} args={tc.args} output={tc.output} status={tc.status || 'done'} />
                            ))}
                          </div>
                        )}
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
                )
              })}
              {/* Streaming message bubble */}
              {isStreaming && selectedGroup && (() => {
                const speakerAgent = currentSpeaker ? members.find(m => m.id === currentSpeaker.agentId) : null
                const speakerName = currentSpeaker?.agentName || '管家'
                const speakerColor = speakerAgent?.color || '#6366f1'
                const speakerInitial = speakerName[0]
                return (
                <div style={{ marginBottom: 10, display: 'flex', gap: 8 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    background: speakerColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: '#fff',
                    boxShadow: speakerAgent?.color ? `0 0 6px ${speakerAgent.color}40` : 'none',
                  }}>
                    {speakerInitial}
                  </div>
                  <div style={{ maxWidth: '70%', minWidth: 0 }}>
                    <div style={{ fontSize: 11, marginBottom: 2, color: speakerColor, fontWeight: 600 }}>
                      {speakerName}
                      {speakerAgent?.identity && <span style={{ fontWeight: 400, color: 'var(--text3)', marginLeft: 6, fontSize: 10 }}>{speakerAgent.identity}</span>}
                    </div>
                    <div style={{
                      padding: '8px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.5,
                      background: speakerColor + '10', color: 'var(--text)',
                      border: `1px solid ${speakerColor}20`,
                    }}>
                      {streamingThinking && <ThinkingCard content={streamingThinking} isStreaming />}
                      {decompositionSteps && decompositionSteps.length > 0 && (
                        <WorkflowPanel type="decompose" data={{ steps: decompositionSteps.map((s, i) => ({ id: i + 1, description: `[${s.agentName}] ${s.task}`, category: s.agentName })), totalMinutes: 0 }} />
                      )}
                      {streamingToolCalls.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                          {streamingToolCalls.map(tc => (
                            <ToolCallCard key={tc.id} name={tc.name} args={tc.args} output={tc.output} status={tc.status} isStreaming />
                          ))}
                        </div>
                      )}
                      {streamingToolCalls.some(t => t.status === 'running') && !streamingText && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text3)', fontSize: 12, padding: '4px 0' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: speakerColor, animation: 'pulse 1.4s ease infinite' }} />
                          <span>正在执行工具...</span>
                        </div>
                      )}
                      {streamingText && (
                        <div style={{ position: 'relative' }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{healMarkdown(streamingText)}</ReactMarkdown>
                          <span style={{ display: 'inline-block', width: 2, height: 14, background: speakerColor, marginLeft: 1, animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom' }} />
                        </div>
                      )}
                      {!streamingText && !streamingThinking && streamingToolCalls.length === 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text3)', fontSize: 12 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: speakerColor, animation: 'pulse 1.4s ease infinite' }} />
                          <span>思考中...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                )
              })()}
              <div ref={messagesEndRef} />
            </div>
            <div style={{ position: 'relative', display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              {showMention && filteredMembers.length > 0 && inputReady && inputRef.current && (() => {
                const rect = inputRef.current.getBoundingClientRect()
                return createPortal(
                  <div style={{
                    position: 'fixed', bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width - 80,
                    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
                    boxShadow: '0 -4px 16px rgba(0,0,0,0.08)', maxHeight: 200, overflowY: 'auto',
                    zIndex: 9999,
                  }}>
                    {filteredMembers.slice(0, 6).map((m, i) => (
                      <div
                        key={m.id}
                        onMouseDown={e => { e.preventDefault(); insertMention(m.name || '') }}
                        onMouseEnter={() => setMentionIndex(i)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                          cursor: 'pointer', borderRadius: i === 0 ? '8px 8px 0 0' : i === Math.min(filteredMembers.length, 6) - 1 ? '0 0 8px 8px' : 0,
                          background: i === mentionIndex ? 'var(--accent-light)' : 'transparent',
                          transition: 'background 0.1s',
                        }}
                      >
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                          background: m.color || 'var(--accent)',
                        }} />
                        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{m.name}</span>
                        {m.identity && <span style={{ fontSize: 10, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.identity}</span>}
                      </div>
                    ))}
                  </div>,
                  document.body
                )
              })()}
              {showMentionHint && inputReady && (() => {
                const rect = inputRef.current!.getBoundingClientRect()
                return createPortal(
                  <div style={{
                    position: 'fixed', bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width - 80,
                    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
                    boxShadow: '0 -4px 16px rgba(0,0,0,0.08)', padding: '10px 14px', zIndex: 9999,
                    fontSize: 12, color: 'var(--text3)',
                  }}>
                    该群组暂无成员，请先点击右侧「邀请成员」添加
                  </div>,
                  document.body
                )
              })()}
              <input
                ref={el => { (inputRef as any).current = el; if (el && !inputReady) setInputReady(true) }}
                value={input}
                onChange={e => { setInput(e.target.value); detectMention(e.target.value, e.target.selectionStart || 0) }}
                onKeyDown={handleInputKeyDown}
                onBlur={() => setTimeout(() => setShowMention(false), 150)}
                placeholder="输入消息，@名字 可指定成员..."
                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                disabled={sending}
              />
              <button onClick={handleSend} disabled={sending || !input.trim()} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{sending ? '...' : '发送'}</button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 14 }}>选择或创建一个群组开始协作</div>
        )}
      </div>

      {/* Right: members / pinned / bookmarks */}
      {selectedGroup && (
        <div style={{ width: 200, flexShrink: 0, borderLeft: '1px solid var(--border)', paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>成员 ({members.length})</h4>
          {members.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: m.color || 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{m.name?.[0] || '?'}</div>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{m.name}</span>
            </div>
          ))}
          {pinned.length > 0 && (
            <>
              <h4 style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 700, color: 'var(--text3)' }}>置顶</h4>
              {pinned.map((p: any) => <div key={p.id} style={{ fontSize: 11, color: 'var(--text2)', padding: '2px 0' }}>{p.content?.slice(0, 50)}</div>)}
            </>
          )}
          {bookmarks.length > 0 && (
            <>
              <h4 style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 700, color: 'var(--text3)' }}>收藏</h4>
              {bookmarks.map((b: any) => <div key={b.id} style={{ fontSize: 11, color: 'var(--text2)', padding: '2px 0' }}>{b.content?.slice(0, 50)}</div>)}
            </>
          )}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowCreate(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 12, padding: 24, width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>创建群组</h3>
            <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreateGroup()} placeholder="群组名称" autoFocus style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setShowCreate(false)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12 }}>取消</button>
              <button onClick={handleCreateGroup} disabled={!newName.trim()} style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>创建</button>
            </div>
          </div>
        </div>
      )}
      {showInvite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowInvite(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 12, padding: 24, width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>邀请成员</h3>
            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 14, background: 'var(--bg2)', borderRadius: 8, padding: 2 }}>
              <button onClick={() => setInviteMode('existing')} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: inviteMode === 'existing' ? 'var(--bg)' : 'transparent', color: inviteMode === 'existing' ? 'var(--text)' : 'var(--text3)', boxShadow: inviteMode === 'existing' ? 'var(--shadow-sm)' : 'none', transition: 'all 0.15s' }}>选择已有</button>
              <button onClick={() => setInviteMode('create')} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: inviteMode === 'create' ? 'var(--bg)' : 'transparent', color: inviteMode === 'create' ? 'var(--text)' : 'var(--text3)', boxShadow: inviteMode === 'create' ? 'var(--shadow-sm)' : 'none', transition: 'all 0.15s' }}>创建新专家</button>
            </div>
            {inviteMode === 'existing' ? (
              <select value={inviteExistingId} onChange={e => setInviteExistingId(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }}>
                <option value="">选择已有 Agent...</option>
                {agents.filter(a => !members.find(m => m.id === a.id)).map(a => <option key={a.id} value={a.id}>{a.name}{a.identity ? ` — ${a.identity}` : ''}</option>)}
              </select>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="名称（必填）" autoFocus style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
                <input value={newAgentIdentity} onChange={e => setNewAgentIdentity(e.target.value)} placeholder="角色（如: 股票分析师）" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
                <input value={newAgentExpertise} onChange={e => setNewAgentExpertise(e.target.value)} placeholder="专长（如: 技术面分析和趋势判断）" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
                {/* Skills tags */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>技能标签（可选）</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {['web_search', 'read_url', 'data_analyze', 'code_execute', 'translate'].map(s => (
                      <button key={s} onClick={() => setNewAgentSkills(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])} style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 10, cursor: 'pointer',
                        border: '1px solid ' + (newAgentSkills.includes(s) ? 'var(--accent)' : 'var(--border)'),
                        background: newAgentSkills.includes(s) ? 'var(--accent-light)' : 'var(--bg2)',
                        color: newAgentSkills.includes(s) ? 'var(--accent)' : 'var(--text3)',
                        transition: 'all 0.15s',
                      }}>{s}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setShowInvite(false)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12 }}>取消</button>
              <button onClick={handleInvite} disabled={inviteMode === 'existing' ? !inviteExistingId : !inviteName.trim()} style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{inviteMode === 'existing' ? '邀请' : '创建并加入'}</button>
            </div>
          </div>
        </div>
      )}
      {/* Keyframe animations */}
      <style>{`
        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  )
}
