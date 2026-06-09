import { useEffect, useState, useMemo, useRef } from 'react'
import { api } from '../lib/ipc'

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
  const [search, setSearch] = useState('')
  const [config, setConfig] = useState<any>({})
  const msgEndRef = useRef<HTMLDivElement>(null)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showCreateAgent, setShowCreateAgent] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newAgentName, setNewAgentName] = useState('')
  const [newAgentColor, setNewAgentColor] = useState('#4f46e5')
  const [showInvite, setShowInvite] = useState(false)
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
  const [invitePrompt, setInvitePrompt] = useState('')
  const [allModels, setAllModels] = useState<any[]>([])

  useEffect(() => { api.modelsList().then((m: any[]) => setAllModels(m.filter(x => x.enabled !== false))).catch(console.error) }, [])
  useEffect(() => { api.gcGroups().then(setGroups).catch(console.error); api.agentsList().then(setAgents).catch(console.error); api.getConfig().then(setConfig).catch(console.error) }, [])
  useEffect(() => { if (selectedGroup) { api.gcMessages(selectedGroup.id).then(setMessages).catch(console.error); api.gcMembers(selectedGroup.id).then(setMembers).catch(console.error); api.gcBookmarks(selectedGroup.id).then(setBookmarks).catch(console.error) } }, [selectedGroup])

  const handleSend = () => {
    if (!input.trim() || !selectedGroup) return
    const msg = input; setInput('')
    setMessages(prev => [...prev, { role: 'user', senderName: 'User', content: msg, timestamp: new Date().toISOString() }])
    api.gcSend(selectedGroup.id, msg).then((r: any) => {
      if (r.ok) { setMessages(prev => [...prev, { role: 'agent', senderName: r.agentName, content: r.reply, timestamp: new Date().toISOString() }]); setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100) }
    })
  }
  const handleBookmark = (id: string) => { api.gcBookmark(id) }
  const handleCreateGroup = () => { if (!newGroupName.trim()) return; const g = { id: 'gc-' + Date.now(), name: newGroupName, members: [], createdAt: new Date().toISOString() }; api.gcSave(g).then(() => { setGroups([...groups, g]); setNewGroupName(''); setShowCreateGroup(false) }) }
  const filteredAgents = useMemo(() => { if (!search) return agents; const q = search.toLowerCase(); return agents.filter(a => (a.name || '').toLowerCase().includes(q)) }, [agents, search])

  const inviteRoles = ['\u5de5\u7a0b\u5e08', '\u5206\u6790\u5e08', '\u5199\u4f5c\u5bb6', '\u7814\u7a76\u5458', '\u4ea7\u54c1\u7ecf\u7406', '\u8bbe\u8ba1\u5e08', '\u8fd0\u7ef4', '\u81ea\u5b9a\u4e49']
  const inviteStyles = ['\u4e13\u4e1a\u4e25\u8c28', '\u53cb\u597d\u4eb2\u5207', '\u5e7d\u9ed8\u8da3\u5473', '\u7b80\u6d01\u76f4\u63a5', '\u8be6\u7ec6\u5168\u9762', '\u521b\u65b0\u5927\u80c6']
  const inviteSkillList = ['\u5bf9\u8bdd', '\u4ee3\u7801', '\u5206\u6790', '\u5199\u4f5c', '\u641c\u7d22', '\u7ffb\u8bd1', '\u5de5\u5177\u8c03\u7528']
  const colorPresets = ['#4f46e5', '#ec4899', '#16a34a', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#a855f7']

  const handleInvite = () => {
    if (inviteMode === 'existing') { if (inviteExistingId) { api.gcAddMember(selectedGroup.id, inviteExistingId); api.gcMembers(selectedGroup.id).then(setMembers); setShowInvite(false) } }
    else { if (!inviteName.trim()) return; const prompt = invitePrompt || `\u4f60\u662f\u4e00\u4e2a${inviteRole}\u3002${inviteExpertise || '\u64c5\u957f\u5404\u79cd\u4efb\u52a1'}\u3002\u4f60\u7684\u98ce\u683c\u662f${inviteStyle}\u3002`; const agent = { id: 'ag-invite-' + Date.now(), name: inviteName, short: inviteShort, color: inviteColor, enabled: true, model: inviteModel, systemPrompt: prompt, skills: inviteSkills, temperature: inviteTemp, maxTokens: inviteMaxTokens }; api.agentsSave(agent).then(() => { api.gcAddMember(selectedGroup.id, agent.id); api.gcMembers(selectedGroup.id).then(setMembers); setShowInvite(false) }) }
  }

  return (
    <div className="page" id="page-group">
      <div style={{ display: 'flex', height: '100%' }}>
        <div style={{ width: 260, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
          <div className="gc-tabs" style={{ margin: 8 }}>
            <button className={'gc-tab' + (leftTab === 'groups' ? ' active' : '')} onClick={() => setLeftTab('groups')}>{'\u7fa4\u7ec4'}</button>
            <button className={'gc-tab' + (leftTab === 'agents' ? ' active' : '')} onClick={() => setLeftTab('agents')}>Agents</button>
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
              <div className="gc-search-bar"><input placeholder={'\u641c\u7d22 Agents...'} value={search} onChange={e => setSearch(e.target.value)} /></div>
              {filteredAgents.map(a => <div key={a.id} className="card" style={{ margin: '4px 0', padding: '8px 10px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 24, height: 24, borderRadius: 6, background: a.color || 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{(a.name || 'A')[0]}</div><div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 600 }}>{a.name}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>{a.model || 'openclaw'}</div></div><span className={'sdot ' + (a.enabled ? 'done' : 'error')}></span></div></div>)}
              <button className="btn btn-sm btn-secondary" style={{ margin: 8, width: 'calc(100% - 16px)' }} onClick={() => setShowCreateAgent(true)}>+ {'\u65b0\u5efa Agent'}</button>
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
                <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{selectedGroup.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{members.length} {'\u6210\u5458'}</span>
                <button className="btn btn-sm btn-secondary" onClick={() => setShowInvite(true)}>+{'\u9080\u8bf7'}</button>
                <button className="btn btn-sm btn-ghost" onClick={() => { if (confirm('\u786e\u8ba4\u89e3\u6563\u7fa4\u7ec4\uff1f')) { api.convDelete(selectedGroup.id).then(() => { setGroups(groups.filter(g => g.id !== selectedGroup.id)); setSelectedGroup(null) }) } }} style={{ color: 'var(--error)', fontSize: 11 }}>{'\u89e3\u6563'}</button>
              </div>
              {messages.filter((m: any) => !search || (m.content || '').toLowerCase().includes(search.toLowerCase())).map((m: any, i: number) => (
                <div key={i} className={'gc-msg ' + (m.role === 'user' ? 'user' : '')} style={{ padding: '8px 16px', position: 'relative' }}>
                  <div className="gc-avatar" style={{ background: m.role === 'user' ? 'var(--accent)' : 'var(--text4)' }}>{(m.senderName || 'U')[0]}</div>
                  <div style={{ flex: 1 }}><div className="gc-sender">{m.senderName || 'User'}</div><div style={{ fontSize: 13, lineHeight: 1.6 }}>{m.content}</div></div>
                  <div className="msg-hover-actions">
                    <button className="msg-action-btn" onClick={() => handleBookmark(m.id)} title={'\u4e66\u7b7e'}>&#128278;</button>
                    <button className="msg-action-btn" onClick={() => navigator.clipboard.writeText(m.content)} title={'\u590d\u5236'}>&#128203;</button>
                    <button className="msg-action-btn" title={'\u5f15\u7528'}>&#128172;</button>
                  </div>
                </div>
              ))}
              <div ref={msgEndRef}></div>
              <div style={{ marginTop: 'auto' }}>
                <div className="input-tools"><button>{'\u9644\u4ef6'}</button><button>{'\u4ee3\u7801\u5757'}</button><button>{'\u56fe\u7247'}</button><button>Markdown</button></div>
                <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end', background: 'var(--bg)' }}>
                  <textarea rows={1} style={{ flex: 1, resize: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'var(--font)', outline: 'none', minHeight: 36, maxHeight: 80 }} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }} placeholder={'\u8f93\u5165\u6d88\u606f...'} />
                  <button className="send-btn" onClick={handleSend} disabled={!input.trim()}>&#9650;</button>
                </div>
                <div style={{ padding: '4px 16px', borderTop: '1px solid var(--bg2)', fontSize: 10.5, color: 'var(--text4)', display: 'flex', justifyContent: 'space-between' }}><span>{config?.ai?.model || 'openclaw'}</span><span>Ctrl+Enter {'\u53d1\u9001'}</span></div>
              </div>
            </>
          ) : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="empty-state"><h3>{'\u9009\u62e9\u4e00\u4e2a\u7fa4\u7ec4'}</h3><p>{'\u5728\u5de6\u4fa7\u9009\u62e9\u7fa4\u7ec4\u5f00\u59cb\u804a\u5929'}</p></div></div>}
        </div>
        {selectedGroup && (
          <div style={{ width: 220, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'auto' }}>
            <div className="gc-tabs" style={{ margin: 8 }}>
              {['info', 'members', 'files', 'context', 'settings'].map(t => <button key={t} className={'gc-tab' + (rightTab === t ? ' active' : '')} onClick={() => setRightTab(t)}>{{ info: '\u4fe1\u606f', members: '\u6210\u5458', files: '\u6587\u4ef6', context: '\u4e0a\u4e0b\u6587', settings: '\u8bbe\u7f6e' }[t]}</button>)}
            </div>
            {rightTab === 'info' && <div style={{ padding: '0 10px' }}><div className="kv-row"><span className="k">{'\u540d\u79f0'}</span><span className="v">{selectedGroup.name}</span></div><div className="kv-row"><span className="k">{'\u6210\u5458'}</span><span className="v">{members.length}</span></div><div className="kv-row"><span className="k">{'\u6d88\u606f'}</span><span className="v">{messages.length}</span></div><div className="kv-row"><span className="k">{'\u4e66\u7b7e'}</span><span className="v">{bookmarks.length}</span></div></div>}
            {rightTab === 'members' && <div style={{ padding: '0 10px' }}>{members.map((m: any, i: number) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--bg2)' }}><div style={{ width: 24, height: 24, borderRadius: 6, background: m.color || 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{(m.name || 'A')[0]}</div><span style={{ fontSize: 12 }}>{m.name}</span></div>)}</div>}
            {rightTab === 'files' && <div style={{ padding: '10px' }}><div className="empty-state" style={{ padding: 16 }}><p>{'\u6682\u65e0\u5171\u4eab\u6587\u4ef6'}</p></div></div>}
            {rightTab === 'context' && <div style={{ padding: '0 10px' }}><div className="kv-row"><span className="k">{'\u6d88\u606f\u6570'}</span><span className="v">{messages.length}</span></div><div className="kv-row"><span className="k">{'\u6210\u5458\u6570'}</span><span className="v">{members.length}</span></div><div className="ctx-bar" style={{ margin: '8px 0' }}><div className="ctx-seg" style={{ width: '100%', background: 'var(--accent)' }}></div></div></div>}
            {rightTab === 'settings' && <div style={{ padding: '0 10px' }}><div className="setting-row"><span className="label">{'\u901a\u77e5'}</span><div className="toggle on"></div></div><div className="setting-row"><span className="label">{'\u81ea\u52a8\u56de\u590d'}</span><div className="toggle"></div></div><div className="setting-row"><span className="label">{'\u4ee3\u7801\u6267\u884c'}</span><div className="toggle"></div></div></div>}
          </div>
        )}
      </div>
      {showCreateGroup && <div className="modal-overlay" onClick={() => setShowCreateGroup(false)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><h3>{'\u65b0\u5efa\u7fa4\u7ec4'}</h3></div><div className="modal-body"><div className="form-group"><label>{'\u7fa4\u7ec4\u540d\u79f0'}</label><input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder={'\u8f93\u5165\u7fa4\u7ec4\u540d\u79f0...'} onKeyDown={e => { if (e.key === 'Enter') handleCreateGroup() }} /></div></div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowCreateGroup(false)}>{'\u53d6\u6d88'}</button><button className="btn btn-primary" onClick={handleCreateGroup}>{'\u521b\u5efa'}</button></div></div></div>}
      {showCreateAgent && <div className="modal-overlay" onClick={() => setShowCreateAgent(false)}><div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 440 }}><div className="modal-header"><h3>{'\u65b0\u5efa Agent'}</h3></div><div className="modal-body"><div className="form-group"><label>{'\u540d\u79f0'}</label><input value={newAgentName} onChange={e => setNewAgentName(e.target.value)} placeholder="Agent {'\u540d\u79f0'}..." /></div><div className="form-group"><label>{'\u989c\u8272'}</label><div style={{ display: 'flex', gap: 6 }}>{colorPresets.map(c => <div key={c} onClick={() => setNewAgentColor(c)} style={{ width: 28, height: 28, borderRadius: 6, background: c, cursor: 'pointer', border: newAgentColor === c ? '2px solid var(--text)' : '2px solid transparent' }}></div>)}</div></div></div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowCreateAgent(false)}>{'\u53d6\u6d88'}</button><button className="btn btn-primary" onClick={() => { if (newAgentName) { api.agentsSave({ id: 'ag-' + Date.now(), name: newAgentName, color: newAgentColor, enabled: true }); api.agentsList().then(setAgents); setNewAgentName(''); setShowCreateAgent(false) } }}>{'\u521b\u5efa'}</button></div></div></div>}
      {showInvite && (
        <div className="modal-overlay" onClick={() => setShowInvite(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 520, maxHeight: '85vh', overflow: 'auto' }}>
            <div className="modal-header"><h3>{'\u9080\u8bf7\u6210\u5458'}</h3></div>
            <div className="modal-body">
              <div className="gc-tabs" style={{ marginBottom: 16 }}>
                <button className={'gc-tab' + (inviteMode === 'existing' ? ' active' : '')} onClick={() => setInviteMode('existing')}>{'\u9009\u62e9\u5df2\u6709 Agent'}</button>
                <button className={'gc-tab' + (inviteMode === 'custom' ? ' active' : '')} onClick={() => setInviteMode('custom')}>{'\u81ea\u5b9a\u4e49\u65b0 Agent'}</button>
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
                  <div className="form-group"><label>{'\u89d2\u8272\u5b9a\u4e49'} (System Prompt)</label><textarea rows={3} value={invitePrompt} onChange={e => setInvitePrompt(e.target.value)} placeholder={'\u4f60\u662f\u4e00\u4e2a' + inviteRole + '\u3002' + (inviteExpertise || '\u64c5\u957f\u5404\u79cd\u4efb\u52a1') + '\u3002\u4f60\u7684\u98ce\u683c\u662f' + inviteStyle + '\u3002'} /></div>
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
    </div>
  )
}
