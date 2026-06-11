import { useEffect, useState, useMemo, useRef } from 'react'
import { api } from '../lib/ipc'
import { ConfirmModal } from '../components/ui'

export function GroupPage() {
  const [groups, setGroups] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [selectedGroup, setSelectedGroup] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [leftTab, setLeftTab] = useState('groups')
  const [rightTab, setRightTab] = useState('info')
  const [bookmarks, setBookmarks] = useState<any[]>([])
  const [agentSearch, setAgentSearch] = useState('')
  const [msgSearch, setMsgSearch] = useState('')
  const [config, setConfig] = useState<any>({})
  const msgEndRef = useRef<HTMLDivElement>(null)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showCreateAgent, setShowCreateAgent] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newAgentName, setNewAgentName] = useState('')
  const [newAgentColor, setNewAgentColor] = useState('#4f46e5')
  const [showInvite, setShowInvite] = useState(false)
  const [showDissolveConfirm, setShowDissolveConfirm] = useState(false)
  const [inviteMode, setInviteMode] = useState<'existing' | 'custom'>('existing')
  const [inviteExistingId, setInviteExistingId] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteShort, setInviteShort] = useState('')
  const [inviteColor, setInviteColor] = useState('#4f46e5')
  const [inviteRole, setInviteRole] = useState('\u5de5\u7a0b\u5e08')
  const [inviteExpertise, setInviteExpertise] = useState('')
  const [inviteStyle, setInviteStyle] = useState('\u4e13\u4e1a\u4e25\u8c28')
  const [inviteModel, setInviteModel] = useState('openclaw')
  const [inviteSkills, setInviteSkills] = useState<string[]>(['\u5bf9\u8bdd', '\u4ee3\u7801'])
  const [inviteTemp, setInviteTemp] = useState(0.7)
  const [inviteMaxTokens, setInviteMaxTokens] = useState(4096)
  const [allModels, setAllModels] = useState<any[]>([])

  useEffect(() => { api.modelsList().then((m: any[]) => setAllModels(m.filter(x => x.enabled !== false))).catch(console.error) }, [])
  useEffect(() => { api.gcGroups().then(setGroups).catch(console.error); api.agentsList().then(setAgents).catch(console.error); api.getConfig().then(setConfig).catch(console.error) }, [])
  useEffect(() => { if (selectedGroup) { api.gcMessages(selectedGroup.id).then(setMessages).catch(console.error); api.gcMembers(selectedGroup.id).then(setMembers).catch(console.error); api.gcBookmarks(selectedGroup.id).then(setBookmarks).catch(console.error) } }, [selectedGroup])

  const handleSend = () => {
    if (!input.trim() || !selectedGroup) return
    const msg = input; setInput('')
    const optimisticMsg = { role: 'user', senderName: 'User', content: msg, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, optimisticMsg])
    api.gcSend(selectedGroup.id, msg).then((r: any) => {
      if (r.ok && r.replies) {
        const newMsgs = r.replies.map((rep: any) => ({ role: 'agent', senderName: rep.agentName, content: rep.reply || rep.error || '', timestamp: new Date().toISOString() }))
        setMessages(prev => [...prev, ...newMsgs])
        setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      }
    }).catch(() => {
      // Rollback optimistic update on failure
      setMessages(prev => prev.filter(m => m !== optimisticMsg))
      setInput(msg) // Restore input
    })
  }
  const handleBookmark = (id: string) => { api.gcBookmark(id).catch(() => {}) }
  const handleCreateGroup = () => { if (!newGroupName.trim()) return; const g = { id: 'gc-' + Date.now(), name: newGroupName, members: [], createdAt: new Date().toISOString() }; api.gcSave(g).then(() => { setGroups([...groups, g]); setNewGroupName(''); setShowCreateGroup(false) }).catch(console.error) }
  const filteredAgents = useMemo(() => { if (!agentSearch) return agents; const q = agentSearch.toLowerCase(); return agents.filter(a => (a.name || '').toLowerCase().includes(q)) }, [agents, agentSearch])

  const inviteRoles = ['\u5de5\u7a0b\u5e08', '\u5206\u6790\u5e08', '\u5199\u4f5c\u5bb6', '\u7814\u7a76\u5458', '\u4ea7\u54c1\u7ecf\u7406', '\u8bbe\u8ba1\u5e08', '\u8fd0\u7ef4', '\u81ea\u5b9a\u4e49']
  const inviteStyles = ['\u4e13\u4e1a\u4e25\u8c28', '\u53cb\u597d\u4eb2\u5207', '\u5e7d\u9ed8\u8da3\u5473', '\u7b80\u6d01\u76f4\u63a5', '\u8be6\u7ec6\u5168\u9762', '\u521b\u65b0\u5927\u80c6']
  const inviteSkillList = ['\u5bf9\u8bdd', '\u4ee3\u7801', '\u5206\u6790', '\u5199\u4f5c', '\u641c\u7d22', '\u7ffb\u8bd1', '\u5de5\u5177\u8c03\u7528']
  const colorPresets = ['#4f46e5', '#ec4899', '#16a34a', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#a855f7']

  const handleInvite = () => {
    if (inviteMode === 'existing') { if (inviteExistingId) { api.gcAddMember(selectedGroup.id, inviteExistingId).catch(() => {}); api.gcMembers(selectedGroup.id).then(setMembers).catch(() => {}); setShowInvite(false) } }
    else { if (!inviteName.trim()) return; const agent = { id: 'ag-invite-' + Date.now(), name: inviteName, short: inviteShort, color: inviteColor, enabled: true, model: inviteModel, identity: inviteRole, expertise: inviteExpertise || inviteRole, style: inviteStyle, skills: inviteSkills, temperature: inviteTemp, maxTokens: inviteMaxTokens }; api.agentsSave(agent).then(() => { api.gcAddMember(selectedGroup.id, agent.id).catch(() => {}); api.gcMembers(selectedGroup.id).then(setMembers).catch(() => {}); setShowInvite(false) }).catch(console.error) }
  }

  return (
    <div className="page" id="page-group">
      <div style={{ display: 'flex', height: '100%' }}>
        <div style={{ width: 260, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
          <div className="gc-tabs" style={{ margin: 8 }}>
            <button className={'gc-tab' + (leftTab === 'groups' ? ' active' : '')} onClick={() => setLeftTab('groups')}>{'\u7fa4\u7ec4'}</button>
            <button className={'gc-tab' + (leftTab === 'agents' ? ' active' : '')} onClick={() => setLeftTab('agents')}>智能体</button>
            <button className={'gc-tab' + (leftTab === 'bookmarks' ? ' active' : '')} onClick={() => setLeftTab('bookmarks')}>{'\u4e66\u7b7e'}</button>
          </div>
          {leftTab === 'groups' && (
            <div style={{ flex: 1, overflow: 'auto', padding: '0 8px' }}>
              {groups.map(g => <div key={g.id} className={'conv-item' + (selectedGroup?.id === g.id ? ' active' : '')} onClick={() => setSelectedGroup(g)}><span className="title">{g.name}</span><span className="badge badge-green" style={{ fontSize: 9 }}>{(g.members || []).length}</span></div>)}
              <button className="btn btn-sm btn-secondary" style={{ margin: 8, width: 'calc(100% - 16px)' }} onClick={() => setShowCreateGroup(true)}>+ {'\u65b0\u5efa\u7fa4\u7ec4'}</button>
            </div>
          )}
          {leftTab === 'agents' && (
            <div style={{ flex: 1, overflow: 'auto', padding: '0 8px' }}>
              <div className="gc-search-bar"><input placeholder={'\u641c\u7d22\u667a\u80fd\u4f53...'} value={agentSearch} onChange={e => setAgentSearch(e.target.value)} /></div>
              {filteredAgents.map(a => <div key={a.id} className="card" style={{ margin: '4px 0', padding: '8px 10px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 24, height: 24, borderRadius: 6, background: a.color || 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{(a.name || 'A')[0]}</div><div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 600 }}>{a.name}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>{a.model || 'openclaw'}</div></div><span className={'sdot ' + (a.enabled ? 'done' : 'error')}></span></div></div>)}
              <button className="btn btn-sm btn-secondary" style={{ margin: 8, width: 'calc(100% - 16px)' }} onClick={() => setShowCreateAgent(true)}>+ {'\u65b0\u5efa\u667a\u80fd\u4f53'}</button>
            </div>
          )}
          {leftTab === 'bookmarks' && (
            <div style={{ flex: 1, overflow: 'auto', padding: '0 8px' }}>
              {bookmarks.length === 0 && <div className="empty-state" style={{ padding: 20 }}><p>{'\u65e0\u4e66\u7b7e'}</p></div>}
              {bookmarks.map(b => <div key={b.id} className="card" style={{ margin: '4px 0', padding: '8px 10px' }}><div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>{b.senderName}</div><div style={{ fontSize: 11.5, lineHeight: 1.5 }}>{b.content?.slice(0, 100)}</div></div>)}
            </div>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {selectedGroup ? (
            <>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{selectedGroup.name}</span>
                <input type="text" placeholder={'\u641c\u7d22\u6d88\u606f...'} value={msgSearch} onChange={e => setMsgSearch(e.target.value)} style={{ flex: 1, fontSize: 12, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, outline: 'none' }} />
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{members.length} {'\u6210\u5458'}</span>
                <button className="btn btn-sm btn-secondary" onClick={() => setShowInvite(true)}>+{'\u9080\u8bf7'}</button>
                <button className="btn btn-sm btn-ghost" onClick={() => setShowDissolveConfirm(true)} style={{ color: 'var(--error)', fontSize: 11 }}>{'\u89e3\u6563'}</button>
              </div>
              {messages.filter((m: any) => !msgSearch || (m.content || '').toLowerCase().includes(msgSearch.toLowerCase())).map((m: any, i: number) => (
                <div key={i} className={'gc-msg ' + (m.role === 'user' ? 'user' : '')} style={{ padding: '8px 16px', position: 'relative' }}>
                  <div className="gc-avatar" style={{ background: m.role === 'user' ? 'var(--accent)' : 'var(--text4)' }}>{(m.senderName || 'U')[0]}</div>
                  <div style={{ flex: 1 }}><div className="gc-sender">{m.senderName || 'User'}</div><div style={{ fontSize: 13, lineHeight: 1.6 }}>{m.content}</div></div>
                  <div className="msg-hover-actions">
                    <button className="msg-action-btn" onClick={() => handleBookmark(m.id)} title={'\u4e66\u7b7e'}>&#128278;</button>
                    <button className="msg-action-btn" onClick={() => navigator.clipboard.writeText(m.content)} title={'\u590d\u5236'}>&#128203;</button>
                    <button className="msg-action-btn" onClick={() => setInput(prev => (prev ? prev + '\n' : '') + `> ${m.senderName}: ${(m.content || '').slice(0, 200)}\n\n`)} title={'\u5f15\u7528'}>&#128172;</button>
                  </div>
                </div>
              ))}
              <div ref={msgEndRef}></div>
              <div style={{ marginTop: 'auto' }}>
                <div className="input-tools">
                  <button onClick={() => { const el = document.createElement('input'); el.type = 'file'; el.onchange = () => { const f = el.files?.[0]; if (!f) return; const reader = new FileReader(); reader.onload = () => { const content = typeof reader.result === 'string' ? reader.result : ''; setInput(prev => prev + `\n\n[file: ${f.name}]\n\`\`\`\n${content.slice(0, 5000)}\n\`\`\``) }; reader.readAsText(f) }; el.click() }}>{'\u9644\u4ef6'}</button>
                  <button onClick={() => setInput(prev => prev + '\n```\n\n```')}>{'\u4ee3\u7801\u5757'}</button>
                  <button onClick={() => { const el = document.createElement('input'); el.type = 'file'; el.accept = 'image/*'; el.onchange = () => { const f = el.files?.[0]; if (!f) return; const reader = new FileReader(); reader.onload = () => { setInput(prev => prev + `\n[image: ${f.name}]\n${reader.result}`) }; reader.readAsDataURL(f) }; el.click() }}>{'\u56fe\u7247'}</button>
                  <button onClick={() => setInput(prev => prev + '\n**\u7c97\u4f53** *\u659c\u4f53* `\u4ee3\u7801`')}>Markdown</button>
                </div>
                <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end', background: 'var(--bg)' }}>
                  <textarea rows={1} style={{ flex: 1, resize: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'var(--font)', outline: 'none', minHeight: 36, maxHeight: 80 }} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }} placeholder={'\u8f93\u5165\u6d88\u606f...'} />
                  <button className="send-btn" onClick={handleSend} disabled={!input.trim()}>&#9650;</button>
                </div>
                <div style={{ padding: '4px 16px', borderTop: '1px solid var(--bg2)', fontSize: 10.5, color: 'var(--text4)', display: 'flex', justifyContent: 'space-between' }}><span>{config?.ai?.model || 'openclaw'}</span><span>Enter {'\u53d1\u9001'} | Shift+Enter {'\u6362\u884c'}</span></div>
              </div>
            </>
          ) : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="empty-state"><h3>{'\u9009\u62e9\u4e00\u4e2a\u7fa4\u7ec4'}</h3><p>{'\u5728\u5de6\u4fa7\u9009\u62e9\u7fa4\u7ec4\u5f00\u59cb\u804a\u5929'}</p></div></div>}
        </div>
        {selectedGroup && (
          <div style={{ width: 220, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'auto' }}>
            <div className="gc-tabs" style={{ margin: 8 }}>
              {['info', 'members', 'context'].map(t => <button key={t} className={'gc-tab' + (rightTab === t ? ' active' : '')} onClick={() => setRightTab(t)}>{{ info: '\u4fe1\u606f', members: '\u6210\u5458', context: '\u4e0a\u4e0b\u6587' }[t]}</button>)}
            </div>
            {rightTab === 'info' && <div style={{ padding: '0 10px' }}><div className="kv-row"><span className="k">{'\u540d\u79f0'}</span><span className="v">{selectedGroup.name}</span></div><div className="kv-row"><span className="k">{'\u6210\u5458'}</span><span className="v">{members.length}</span></div><div className="kv-row"><span className="k">{'\u6d88\u606f'}</span><span className="v">{messages.length}</span></div><div className="kv-row"><span className="k">{'\u4e66\u7b7e'}</span><span className="v">{bookmarks.length}</span></div></div>}
            {rightTab === 'members' && <div style={{ padding: '0 10px' }}>{members.map((m: any, i: number) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--bg2)' }}><div style={{ width: 24, height: 24, borderRadius: 6, background: m.color || 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{(m.name || 'A')[0]}</div><span style={{ fontSize: 12 }}>{m.name}</span></div>)}</div>}
            {rightTab === 'context' && <div style={{ padding: '0 10px' }}><div className="kv-row"><span className="k">{'\u6d88\u606f\u6570'}</span><span className="v">{messages.length}</span></div><div className="kv-row"><span className="k">{'\u6210\u5458\u6570'}</span><span className="v">{members.length}</span></div></div>}
          </div>
        )}
      </div>
      {showCreateGroup && <div className="modal-overlay" onClick={() => setShowCreateGroup(false)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><h3>{'\u65b0\u5efa\u7fa4\u7ec4'}</h3></div><div className="modal-body"><div className="form-group"><label>{'\u7fa4\u7ec4\u540d\u79f0'}</label><input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder={'\u8f93\u5165\u7fa4\u7ec4\u540d\u79f0...'} onKeyDown={e => { if (e.key === 'Enter') handleCreateGroup() }} /></div></div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowCreateGroup(false)}>{'\u53d6\u6d88'}</button><button className="btn btn-primary" onClick={handleCreateGroup}>{'\u521b\u5efa'}</button></div></div></div>}
      {showCreateAgent && <div className="modal-overlay" onClick={() => setShowCreateAgent(false)}><div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 440 }}><div className="modal-header"><h3>{'\u65b0\u5efa\u667a\u80fd\u4f53'}</h3></div><div className="modal-body"><div className="form-group"><label>{'\u540d\u79f0'}</label><input value={newAgentName} onChange={e => setNewAgentName(e.target.value)} placeholder="\u667a\u80fd\u4f53\u540d\u79f0..." /></div><div className="form-group"><label>{'\u989c\u8272'}</label><div style={{ display: 'flex', gap: 6 }}>{colorPresets.map(c => <div key={c} onClick={() => setNewAgentColor(c)} style={{ width: 28, height: 28, borderRadius: 6, background: c, cursor: 'pointer', border: newAgentColor === c ? '2px solid var(--text)' : '2px solid transparent' }}></div>)}</div></div></div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowCreateAgent(false)}>{'\u53d6\u6d88'}</button><button className="btn btn-primary" onClick={() => { if (newAgentName) { api.agentsSave({ id: 'ag-' + Date.now(), name: newAgentName, color: newAgentColor, enabled: true }).catch(console.error); api.agentsList().then(setAgents).catch(console.error); setNewAgentName(''); setShowCreateAgent(false) } }}>{'\u521b\u5efa'}</button></div></div></div>}
      {showInvite && (
        <div className="modal-overlay" onClick={() => setShowInvite(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 520, maxHeight: '85vh', overflow: 'auto' }}>
            <div className="modal-header"><h3>{'\u9080\u8bf7\u6210\u5458'}</h3></div>
            <div className="modal-body">
              <div className="gc-tabs" style={{ marginBottom: 16 }}>
                <button className={'gc-tab' + (inviteMode === 'existing' ? ' active' : '')} onClick={() => setInviteMode('existing')}>{'\u9009\u62e9\u5df2\u6709\u667a\u80fd\u4f53'}</button>
                <button className={'gc-tab' + (inviteMode === 'custom' ? ' active' : '')} onClick={() => setInviteMode('custom')}>{'\u81ea\u5b9a\u4e49\u65b0\u667a\u80fd\u4f53'}</button>
              </div>
              {inviteMode === 'existing' && (
                <div>{agents.filter(a => !members.find((m: any) => m.id === a.id)).map(a => <div key={a.id} className="card" style={{ marginBottom: 6, padding: '8px 12px', cursor: 'pointer', border: inviteExistingId === a.id ? '2px solid var(--accent)' : undefined }} onClick={() => setInviteExistingId(a.id)}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 28, height: 28, borderRadius: 6, background: a.color || 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{(a.name || 'A')[0]}</div><div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 600 }}>{a.name}</div><div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{a.model || 'openclaw'}</div></div>{inviteExistingId === a.id && <span className="badge badge-green">{'\u5df2\u9009\u62e9'}</span>}</div></div>)}</div>
              )}
              {inviteMode === 'custom' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div className="form-group"><label>{'\u540d\u79f0'}</label><input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder={'\u4f8b\uff1a\u4ee3\u7801\u5927\u5e08'} /></div><div className="form-group"><label>{'\u7b80\u79f0'}</label><input value={inviteShort} onChange={e => setInviteShort(e.target.value)} placeholder={'\u4f8b\uff1a\u7801\u519c'} /></div></div>
                  <div className="form-group"><label>{'\u89d2\u8272'}</label><select value={inviteRole} onChange={e => setInviteRole(e.target.value)}>{inviteRoles.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                  <div className="form-group"><label>{'\u4e13\u957f\u63cf\u8ff0'}</label><input value={inviteExpertise} onChange={e => setInviteExpertise(e.target.value)} placeholder={'\u4f8b\uff1a\u64c5\u957f Python \u6570\u636e\u5206\u6790'} /></div>
                  <div className="form-group"><label>{'\u6027\u683c\u98ce\u683c'}</label><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{inviteStyles.map(s => <span key={s} onClick={() => setInviteStyle(s)} style={{ padding: '4px 10px', border: inviteStyle === s ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: 12, fontSize: 12, cursor: 'pointer', background: inviteStyle === s ? 'var(--accent-light)' : 'transparent', color: inviteStyle === s ? 'var(--accent)' : 'var(--text2)' }}>{s}</span>)}</div></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div className="form-group"><label>{'\u6a21\u578b'}</label><select value={inviteModel} onChange={e => setInviteModel(e.target.value)}><option value="openclaw">OpenClaw</option>{allModels.map(m => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}</select></div><div className="form-group"><label>{'\u989c\u8272'}</label><div style={{ display: 'flex', gap: 4 }}>{colorPresets.map(c => <div key={c} onClick={() => setInviteColor(c)} style={{ width: 24, height: 24, borderRadius: 6, background: c, cursor: 'pointer', border: inviteColor === c ? '2px solid var(--text)' : '2px solid transparent' }}></div>)}</div></div></div>
                  <div className="form-group"><label>{'\u80fd\u529b\u6807\u7b7e'}</label><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{inviteSkillList.map(s => <span key={s} onClick={() => setInviteSkills(inviteSkills.includes(s) ? inviteSkills.filter(x => x !== s) : [...inviteSkills, s])} style={{ padding: '4px 10px', border: inviteSkills.includes(s) ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: 12, fontSize: 12, cursor: 'pointer', background: inviteSkills.includes(s) ? 'var(--accent-light)' : 'transparent', color: inviteSkills.includes(s) ? 'var(--accent)' : 'var(--text2)' }}>{s}</span>)}</div></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div className="form-group"><label>{'\u6e29\u5ea6'} ({inviteTemp})</label><input type="range" min="0" max="2" step="0.1" value={inviteTemp} onChange={e => setInviteTemp(parseFloat(e.target.value))} style={{ width: '100%' }} /></div><div className="form-group"><label>{'\u6700\u5927\u8f93\u51fa'} (tokens)</label><input type="number" value={inviteMaxTokens} onChange={e => setInviteMaxTokens(parseInt(e.target.value))} /></div></div>
                  <div style={{ fontSize: 11, color: 'var(--text4)', padding: '4px 0' }}>\u57fa\u5ea7\u4eba\u683c\u5c06\u81ea\u52a8\u5e94\u7528\uff0c\u53ea\u9700\u5b9a\u4e49\u8eab\u4efd\u548c\u64c5\u957f\u9886\u57df\u3002</div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowInvite(false)}>{'\u53d6\u6d88'}</button>
              <button className="btn btn-primary" onClick={handleInvite}>{inviteMode === 'existing' ? '\u9080\u8bf7\u52a0\u5165' : '\u521b\u5efa\u5e76\u9080\u8bf7'}</button>
            </div>
          </div>
        </div>
      )}
      {showDissolveConfirm && <ConfirmModal title="解散群组" message="确认解散群组？此操作不可撤销。" onConfirm={() => { api.gcDelete(selectedGroup.id).then(() => { setGroups(groups.filter(g => g.id !== selectedGroup.id)); setSelectedGroup(null) }).catch(console.error); setShowDissolveConfirm(false) }} onCancel={() => setShowDissolveConfirm(false)} danger />}
    </div>
  )
}
