import { ipcMain, BrowserWindow } from 'electron'
import { kvList, kvGet, kvUpsert, kvDelete, gcMsgList, gcMsgAdd, gcMsgBookmark, gcMsgBookmarked, gcMsgPin, gcMsgPinned, gcMsgDeleteByGroup } from '../../storage/db'
import { scanGatewayPort, gatewayChat } from '../gateway'
import { DEFAULT_MODEL, API_PATH_CHAT, TIMEOUT_GATEWAY_SCAN, TIMEOUT_CHAT } from '../../constants'

export function registerGroupChatIpc() {
  ipcMain.handle('gc:groups', () => kvList('groups'))
  ipcMain.handle('gc:members', (_, gid) => {
    const group = kvGet('groups', gid) as any
    if (!group?.members) return []
    return group.members.map((mid: string) => kvGet('agents', mid)).filter(Boolean)
  })
  ipcMain.handle('gc:addMember', (_, gid, aid) => {
    const group = kvGet('groups', gid) as any
    if (!group) return
    const members = group.members || []
    if (!members.includes(aid)) { members.push(aid); kvUpsert('groups', gid, { ...group, members }) }
  })
  ipcMain.handle('gc:save', (_, group) => { kvUpsert('groups', group.id, group) })
  ipcMain.handle('gc:messages', (_, gid) => gcMsgList(gid))
  ipcMain.handle('gc:sendMessage', async (_, gid, message) => {
    const group = kvGet('groups', gid) as any
    if (!group) return { ok: false, error: '群组不存在' }
    const members = (group.members || []).map((mid: string) => kvGet('agents', mid)).filter(Boolean)
    if (members.length === 0) return { ok: false, error: '群组没有成员' }

    gcMsgAdd(gid, 'user', 'User', 'user', message)

    // @mention routing
    const mentionMatch = message.match(/@(\S+)/g)
    const butlerId = group.leader?.endsWith('_butler') ? group.leader : null
    let targets = members
    if (mentionMatch) {
      const names = mentionMatch.map((m: string) => m.slice(1).toLowerCase())
      targets = members.filter((a: any) => names.includes(a.name?.toLowerCase()) || names.includes(a.id?.toLowerCase()))
      if (targets.length === 0) targets = members
      console.log(`[GroupChat] @mention: names=${names.join(',')} targets=${targets.map((a: any) => a.name).join(',')}`)
    } else if (butlerId) {
      // No @mention → exclude butler (only reply when explicitly mentioned)
      targets = members.filter((a: any) => a.id !== butlerId)
    }

    // 端口只解析一次
    const port = await scanGatewayPort()

    // Task mode: if leader exists and message has task keywords (skip if explicit @mention)
    const hasExplicitMention = !!mentionMatch
    const leader = group.leader ? kvGet('agents', group.leader) as any : null
    const taskKw = /任务|分解|帮我|执行|完成|计划|步骤|todo|task/i
    if (leader && taskKw.test(message) && !hasExplicitMention) {
      try {
        const subtasks = await decomposeTask(message, leader, targets, port)
        if (subtasks && subtasks.length > 0) {
          const replies: Array<{ agentId: string; agentName: string; reply?: string; error?: string }> = []
          for (const st of subtasks) {
            const agent = targets.find((a: any) => a.id === st.agentId) || targets[0]
            try {
              const reply = await agentReply(agent, st.task, gid, undefined, port, group)
              replies.push({ agentId: agent.id, agentName: agent.name, reply })
            } catch (e: any) {
              replies.push({ agentId: agent.id, agentName: agent.name, error: e?.message })
            }
          }
          return { ok: true, replies }
        }
      } catch (e) { console.warn('[GroupChat] 任务分解失败，切换到讨论模式:', (e as Error).message) }
    }

    // Discussion mode: all targeted agents reply (并行)
    const replies: Array<{ agentId: string; agentName: string; reply?: string; error?: string }> = []
    const memberNames = members.map((a: any) => a.name)
    const replyPromises = targets.map(async (agent: any) => {
      try {
        const reply = await agentReply(agent, message, gid, memberNames, port, group)
        return { agentId: agent.id, agentName: agent.name, reply }
      } catch (e: any) {
        return { agentId: agent.id, agentName: agent.name, error: e?.message }
      }
    })
    const results = await Promise.all(replyPromises)
    replies.push(...results)
    return { ok: true, replies }
  })

  // ── Streaming group chat: direct pass-through to Gateway ──
  ipcMain.handle('gc:stream:send', async (_, gid: string, message: string) => {
    const mw = BrowserWindow.getAllWindows()[0]
    const group = kvGet('groups', gid) as any
    if (!group) { mw?.webContents.send('gc:stream:error', { groupId: gid, error: '群组不存在' }); return }
    const members = (group.members || []).map((mid: string) => kvGet('agents', mid)).filter(Boolean)

    gcMsgAdd(gid, 'user', 'User', 'user', message)

    // Build context: butler identity + member list
    const butlerId = group.leader
    const butler = butlerId ? kvGet('agents', butlerId) as any : null
    const systemParts: string[] = []
    if (butler) {
      systemParts.push(`你是「${butler.name}」，${butler.identity || '群组管家'}。${butler.expertise || ''}\n\n你可以直接回答用户问题，也可以使用 sessions_spawn 工具创建子会话让其他专家协助完成复杂任务。完成后调用 sessions_yield 等待结果，再综合回复。`)
    }
    if (members.length > 0) {
      const memberLines = members.map((a: any) => `- ${a.name}：${a.identity || a.expertise || '专家'}`).join('\n')
      systemParts.push(`## 群组专家\n${memberLines}`)
    }

    // ── Task decomposition mode ──
    const taskKw = /任务|分解|帮我|执行|完成|计划|步骤|todo|task/i
    const mentionMatch = message.match(/@(\S+)/g)
    if (butler && taskKw.test(message) && !mentionMatch) {
      try {
        const port = await scanGatewayPort()
        const subtasks = await decomposeTask(message, butler, members, port)
        if (subtasks && subtasks.length > 0) {
          // Emit decomposition result to frontend
          mw?.webContents.send('gc:stream:decomposition', {
            groupId: gid,
            steps: subtasks.map((st, i) => ({
              id: `step_${i}`,
              agentId: st.agentId,
              agentName: members.find((a: any) => a.id === st.agentId)?.name || '未知',
              task: st.task,
            })),
          })

          // Execute each subtask with streaming
          let fullResult = ''
          const allToolCalls: any[] = []
          for (const st of subtasks) {
            const agent = members.find((a: any) => a.id === st.agentId) || members[0]
            const agentLabel = `[${agent.name}] `
            mw?.webContents.send('gc:stream:token', { groupId: gid, token: `\n\n${agentLabel}` })

            const subMsgs: any[] = []
            if (systemParts.length > 0) subMsgs.push({ role: 'system', content: systemParts.join('\n\n') })
            subMsgs.push({ role: 'user', content: st.task })

            const subResult = await streamAgentReply(mw, gid, agent, subMsgs, port)
            fullResult += `\n\n${agentLabel}${subResult.text}`
            if (subResult.toolCalls.length > 0) allToolCalls.push(...subResult.toolCalls)
          }

          // Save and finish
          const senderName = butler?.name || '管家'
          gcMsgAdd(gid, butlerId || 'butler', senderName, 'assistant', fullResult.trim(), undefined, allToolCalls.length > 0 ? JSON.stringify(allToolCalls) : undefined)
          mw?.webContents.send('gc:stream:done', {
            groupId: gid, text: fullResult.trim(),
            toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
          })
          return
        }
      } catch (e) {
        console.warn('[GroupChat:Stream] Task decomposition failed, falling back:', (e as Error).message)
        // Fall through to normal mode
      }
    }

    // ── Roundtable mode: agents discuss in turns ──
    const port = await scanGatewayPort()

    // Select participants (2-3 agents, exclude butler)
    const candidates = butler ? members.filter((a: any) => a.id !== butlerId) : members
    const participants = selectParticipants(message, candidates, 3)

    if (participants.length >= 2) {
      // Multi-agent roundtable
      const previousReplies: Array<{ agentName: string; reply: string }> = []

      for (const agent of participants) {
        // Notify frontend: speaker change
        mw?.webContents.send('gc:stream:speaker', { groupId: gid, agentId: agent.id, agentName: agent.name })

        const agentMsgs: any[] = []
        agentMsgs.push({ role: 'system', content: `你是「${agent.name}」，${agent.identity || '专家'}。${agent.expertise || ''}\n\n你正在参与一场团队讨论。直接表达你的观点，简洁有力，不要重复别人说过的内容。如果需要补充或反驳，请明确指出。` })

        // Build discussion context
        let discussionContext = `## 讨论话题\n${message}\n\n`
        if (previousReplies.length > 0) {
          discussionContext += `## 已有发言\n${previousReplies.map(r => `**${r.agentName}**：${r.reply}`).join('\n\n')}\n\n`
        }
        discussionContext += `请从你的专业角度发表观点。要求：\n1. 直接给出核心观点\n2. 如果同意/不同意前面的人，说明理由\n3. 提出你的独特见解或补充\n4. 控制在300字以内`
        agentMsgs.push({ role: 'user', content: discussionContext })

        const result = await streamAgentReply(mw, gid, agent, agentMsgs, port)
        previousReplies.push({ agentName: agent.name, reply: result.text })

        // Save each agent's reply as separate message
        gcMsgAdd(gid, agent.id, agent.name, 'assistant', result.text, result.thinking || undefined, result.toolCalls.length > 0 ? JSON.stringify(result.toolCalls) : undefined)
      }

      // Butler summarizes
      if (butler) {
        mw?.webContents.send('gc:stream:speaker', { groupId: gid, agentId: butlerId, agentName: butler.name })

        const summaryMsgs: any[] = []
        summaryMsgs.push({ role: 'system', content: `你是「${butler.name}」，${butler.identity || '群组管家'}。你需要综合各位专家的讨论，给出最终结论。` })
        const discussion = previousReplies.map(r => `**${r.agentName}**：${r.reply}`).join('\n\n')
        summaryMsgs.push({ role: 'user', content: `## 讨论话题\n${message}\n\n## 专家讨论\n${discussion}\n\n请综合各位专家的观点，给出：\n1. 核心共识（大家一致认同的）\n2. 分歧点（有不同意见的）\n3. 你的最终建议\n4. 后续可行动的步骤` })

        const summaryResult = await streamAgentReply(mw, gid, butler, summaryMsgs, port)
        gcMsgAdd(gid, butlerId, butler.name, 'assistant', summaryResult.text, summaryResult.thinking || undefined, summaryResult.toolCalls.length > 0 ? JSON.stringify(summaryResult.toolCalls) : undefined)

        mw?.webContents.send('gc:stream:done', {
          groupId: gid, text: summaryResult.text, thinking: summaryResult.thinking || undefined,
          toolCalls: summaryResult.toolCalls.length > 0 ? summaryResult.toolCalls : undefined,
        })
      } else {
        // No butler, just finish with last agent's reply
        const last = previousReplies[previousReplies.length - 1]
        mw?.webContents.send('gc:stream:done', { groupId: gid, text: last.reply })
      }
    } else {
      // Single agent or no candidates — fall back to simple streaming
      const agent = participants[0] || butler || { id: 'butler', name: '管家', model: DEFAULT_MODEL }
      mw?.webContents.send('gc:stream:speaker', { groupId: gid, agentId: agent.id, agentName: agent.name })

      const msgs: any[] = []
      if (systemParts.length > 0) msgs.push({ role: 'system', content: systemParts.join('\n\n') })
      const history = gcMsgList(gid).slice(-20) as any[]
      for (const h of history) {
        if (h.role === 'user') msgs.push({ role: 'user', content: h.content })
        else if (h.role === 'assistant') msgs.push({ role: 'assistant', content: h.content })
      }
      msgs.push({ role: 'user', content: message })

      const result = await streamAgentReply(mw, gid, agent, msgs, port)
      gcMsgAdd(gid, agent.id, agent.name, 'assistant', result.text, result.thinking || undefined, result.toolCalls.length > 0 ? JSON.stringify(result.toolCalls) : undefined)

      mw?.webContents.send('gc:stream:done', {
        groupId: gid, text: result.text, thinking: result.thinking || undefined,
        toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
      })
    }
  })

  ipcMain.handle('gc:bookmark', (_, id) => { gcMsgBookmark(id, true) })
  ipcMain.handle('gc:unbookmark', (_, id) => { gcMsgBookmark(id, false) })
  ipcMain.handle('gc:bookmarks', (_, gid) => gcMsgBookmarked(gid))
  ipcMain.handle('gc:pin', (_, id) => { gcMsgPin(id, true) })
  ipcMain.handle('gc:pinned', (_, gid) => gcMsgPinned(gid))
  ipcMain.handle('gc:delete', (_, gid) => { kvDelete('groups', gid); gcMsgDeleteByGroup(gid) })
  ipcMain.handle('gc:clearMessages', (_, gid) => { gcMsgDeleteByGroup(gid); return true })
}

async function agentReply(agent: any, message: string, groupId: string, memberNames?: string[], port?: number, group?: any): Promise<string> {
  const p = port || await scanGatewayPort()
  const msgs: any[] = []

  // Butler context: if this agent is the leader and group has butlerContext
  if (group?.butlerContext && group.leader === agent.id) {
    msgs.push({
      role: 'system',
      content: `你是该群组的管家。之前的协作话题是"${group.butlerTopic || ''}"，综合结论如下：\n\n${group.butlerContext}\n\n请基于以上结论回答用户的后续问题。如果问题超出已有分析范围，建议用户发起新的协作。`,
    })
  }

  if (memberNames && memberNames.length > 0) {
    msgs.push({ role: 'system', content: `## 群组成员\n${memberNames.join(', ')}` })
  }
  msgs.push({ role: 'user', content: message })
  const result = await gatewayChat(p, agent.model || DEFAULT_MODEL, msgs, TIMEOUT_CHAT)
  gcMsgAdd(groupId, agent.id, agent.name, 'assistant', result)
  return result
}

async function decomposeTask(message: string, leader: any, targets: any[], port?: number): Promise<Array<{ agentId: string; task: string }> | null> {
  const p = port || await scanGatewayPort()
  const memberList = targets.map(a => `${a.id}(${a.name}): ${a.expertise || a.description || ''}`).join('\n')
  const prompt = `你是任务分解器。根据以下团队成员，将用户任务分解为子任务分配给最合适的人。\n\n团队成员:\n${memberList}\n\n用户任务: ${message}\n\n返回JSON数组: [{"agentId":"xxx","task":"子任务描述"}]，只返回JSON，不要其他内容。`

  const text = await gatewayChat(p, leader.model || DEFAULT_MODEL, [{ role: 'user', content: prompt }], TIMEOUT_GATEWAY_SCAN)
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (jsonMatch) return JSON.parse(jsonMatch[0])
  return null
}

async function streamAgentReply(mw: BrowserWindow | null, gid: string, agent: any, msgs: any[], port: number): Promise<{ text: string; thinking: string; toolCalls: any[] }> {
  const apiBase = `http://127.0.0.1:${port}${API_PATH_CHAT}`
  const model = agent.model || DEFAULT_MODEL
  const body = JSON.stringify({ model, stream: true, messages: msgs })

  let full = '', thinking = ''
  const toolCalls: Array<{ id: string; name: string; status: string; args?: string; output?: string; error?: string }> = []
  const pendingTC: Record<number, { id: string; name: string; args: string }> = {}

  const resp = await fetch(apiBase, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(TIMEOUT_CHAT),
  })
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    throw new Error(`Gateway ${resp.status}: ${errText.slice(0, 300)}`)
  }
  if (!resp.body) throw new Error('Empty response body')

  const reader = resp.body.getReader()
  const dec = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()!
    for (const line of lines) {
      const t = line.trim()
      if (!t.startsWith('data: ')) continue
      const d = t.slice(6)
      if (d === '[DONE]') continue
      try {
        const obj = JSON.parse(d)
        const errObj = obj.error || obj.choices?.[0]?.error
        if (errObj) throw new Error(errObj.message || JSON.stringify(errObj))
        if (!obj.choices?.length) continue
        const delta = obj.choices[0].delta
        if (!delta) continue

        if (delta.content) {
          full += delta.content
          mw?.webContents.send('gc:stream:token', { groupId: gid, token: delta.content })
        }

        const th = delta.reasoning_content || delta.thinking
        if (th) {
          thinking += th
          mw?.webContents.send('gc:stream:thinking', { groupId: gid, text: th })
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0
            if (!pendingTC[idx]) pendingTC[idx] = { id: '', name: '', args: '' }
            if (tc.id) pendingTC[idx].id = tc.id
            if (tc.function?.name) {
              pendingTC[idx].name = tc.function.name
              toolCalls.push({ id: tc.id || `tc_${idx}`, name: tc.function.name, status: 'running' })
              mw?.webContents.send('gc:stream:tool', { groupId: gid, id: tc.id || `tc_${idx}`, name: tc.function.name, status: 'running' })
            }
            if (tc.function?.arguments) pendingTC[idx].args += tc.function.arguments
          }
        }

        if (delta.tool_event) {
          const te = delta.tool_event
          if (te.toolCallId) {
            const matched = toolCalls.find(tc => tc.id === te.toolCallId)
            if (matched) {
              matched.status = te.status === 'running' ? 'running' : te.status === 'error' ? 'error' : 'done'
              if (te.error) matched.error = te.error
              if (te.output) matched.output = typeof te.output === 'string' ? te.output : JSON.stringify(te.output)
            }
            mw?.webContents.send('gc:stream:tool', {
              groupId: gid, id: te.toolCallId,
              name: te.name || matched?.name || 'tool',
              status: te.status === 'running' ? 'running' : te.status === 'error' ? 'error' : 'done',
              output: typeof te.output === 'string' ? te.output.slice(0, 5000) : te.output ? JSON.stringify(te.output).slice(0, 5000) : undefined,
              error: te.error,
            })
          }
        }
      } catch (parseErr: any) {
        if (parseErr?.message?.includes('Gateway')) throw parseErr
      }
    }
  }

  return { text: full, thinking, toolCalls }
}

function selectParticipants(message: string, candidates: any[], max: number): any[] {
  if (candidates.length === 0) return []
  if (candidates.length <= max) return candidates

  // Score agents by relevance to the message
  const msgLower = message.toLowerCase()
  const scored = candidates.map(agent => {
    let score = 0
    const name = (agent.name || '').toLowerCase()
    const identity = (agent.identity || '').toLowerCase()
    const expertise = (agent.expertise || '').toLowerCase()
    const skills = (agent.skills || []).map((s: string) => s.toLowerCase())

    // Direct name mention
    if (msgLower.includes(name)) score += 10

    // Identity/expertise keyword match
    const keywords = [...identity.split(/\s+/), ...expertise.split(/\s+/), ...skills].filter(w => w.length > 1)
    for (const kw of keywords) {
      if (msgLower.includes(kw)) score += 2
    }

    // Role-based heuristics
    if (/代码|编程|开发|bug|函数|code|program/i.test(msgLower) && /开发|程序员|工程师|code/i.test(identity + expertise)) score += 3
    if (/分析|数据|统计|报告/i.test(msgLower) && /分析|数据|研究/i.test(identity + expertise)) score += 3
    if (/设计|界面|UI|UX/i.test(msgLower) && /设计|UI|UX/i.test(identity + expertise)) score += 3
    if (/翻译|英语|日语|translate/i.test(msgLower) && /翻译|语言/i.test(identity + expertise)) score += 3

    // Default baseline so all agents have a chance
    score += 1

    return { agent, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, max).map(s => s.agent)
}
