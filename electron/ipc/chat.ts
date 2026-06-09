import { ipcMain, BrowserWindow } from 'electron'
import { kvList, kvGet, kvUpsert, gcMsgList, gcMsgAdd, gcMsgBookmark, gcMsgPin, gcMsgBookmarked, gcMsgPinned, msgAdd } from '../storage/db'
import { loadConfig, getMainWindow } from './core'
import { logger } from './logger'
import { orchestrate } from './orchestrator'
import { executeTool } from './tool-executor'
import { searchDocuments } from './rag'
import { safeExec } from './cron-sandbox'

export function setupChatIPC() {
  // Group Chat
  ipcMain.handle('gc:groups', () => kvList('groups'))
  ipcMain.handle('gc:members', (_, gid) => {
    const group = kvGet('groups', gid); if (!group) return []
    const agents = kvList('agents')
    return (group.members || []).map((aid: string) => agents.find((a: any) => a.id === aid) || ({ agentId: aid, name: aid, icon: 'AI' } as any))
  })
  ipcMain.handle('gc:addMember', (_, gid, aid) => {
    const group = kvGet('groups', gid)
    if (group && !(group.members || []).includes(aid)) { group.members.push(aid); kvUpsert('groups', gid, group) }
  })
  ipcMain.handle('gc:save', (_, group) => { kvUpsert('groups', group.id, group) })
  ipcMain.handle('gc:messages', (_, gid) => gcMsgList(gid))
  ipcMain.handle('gc:sendMessage', async (_, gid, message) => {
    gcMsgAdd(gid, 'user', 'User', 'user', message)
    const group = kvGet('groups', gid)
    if (!group?.members?.length) return { ok: false, error: 'No members' }
    const providers = kvList('providers')
    const configuredProvIds = new Set(providers.filter((p: any) => p.apiKey).map((p: any) => p.id))
    const allAgents = kvList('agents')
    const groupAgents = group.members
      .map((aid: string) => allAgents.find((a: any) => a.id === aid))
      .filter((a: any) => {
        if (!a) return false
        const model = kvList('models').find((m: any) => m.id === a.model)
        return !model || configuredProvIds.has(model.provider) || a.model === 'openclaw'
      })
    if (groupAgents.length === 0) return { ok: false, error: 'No available agents' }
    // Round-robin: pick agent with fewest messages
    const gcHistory = gcMsgList(gid)
    const agentMsgCount: Record<string, number> = {}
    for (const a of groupAgents) agentMsgCount[a.id] = 0
    for (const m of gcHistory as any[]) { if (agentMsgCount[m.senderId] !== undefined) agentMsgCount[m.senderId]++ }
    const selectedAgent = groupAgents.reduce((min: any, a: any) =>
      (agentMsgCount[a.id] || 0) < (agentMsgCount[min.id] || 0) ? a : min
    )
    const recentHistory = gcHistory.slice(-10) as any[]
    const msgs = [{ role: 'system', content: (selectedAgent.systemPrompt || '') + '\n\nYou are in a group chat. Other members may reply after you.' }]
    for (const m of recentHistory) msgs.push({ role: (m as any).role === 'user' ? 'user' : 'assistant', content: (m as any).content })
    const config = loadConfig(); const port = config.gateway?.port || 18789
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedAgent.model || 'openclaw', stream: false, messages: msgs })
      })
      const data = await resp.json(); const reply = data.choices?.[0]?.message?.content || ''
      gcMsgAdd(gid, selectedAgent.id, selectedAgent.name, 'agent', reply)
      return { ok: true, reply, agentId: selectedAgent.id, agentName: selectedAgent.name }
    } catch (e) { return { ok: false, error: (e as Error).message } }
  })
  ipcMain.handle('gc:bookmark', (_, id) => { gcMsgBookmark(id, true) })
  ipcMain.handle('gc:unbookmark', (_, id) => { gcMsgBookmark(id, false) })
  ipcMain.handle('gc:bookmarks', (_, gid) => gcMsgBookmarked(gid))
  ipcMain.handle('gc:pin', (_, id) => { gcMsgPin(id, true) })
  ipcMain.handle('gc:pinned', (_, gid) => gcMsgPinned(gid))

  // Gateway
  ipcMain.handle('gateway:status', async () => {
    const config = loadConfig(); const port = config.gateway?.port || 18789
    try { await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) }); return { running: true, port } } catch { return { running: false, port } }
  })
  ipcMain.handle('gateway:start', () => {
    const { exec } = require('child_process'); const { existsSync } = require('fs'); const { join } = require('path')
    const candidates = [join(__dirname, '..', '..', 'bundled', 'openclaw', 'openclaw.mjs')]
    for (const oc of candidates) { if (existsSync(oc)) { try { exec(`node "${oc}" daemon start`, { windowsHide: true }); return { ok: true } } catch {} } }
    try { exec('openclaw daemon start', { windowsHide: true }); return { ok: true } } catch {}
    return { ok: false, error: 'OpenClaw not found' }
  })

  // ─── Chat Streaming with Orchestrator + Tool Call Loop ───
  let abortCtrl: AbortController | null = null

  ipcMain.handle('chat:send', async (_, { message, history, systemPrompt, model, convId }) => {
    const config = loadConfig()
    const port = config.gateway?.port || 18789
    const mw = getMainWindow()

    // Step 1: RAG knowledge base injection
    const ragResults = await searchDocuments(message, 3)
    if (ragResults.length > 0) {
      logger.info('Chat', `RAG: ${ragResults.length} relevant chunks found`)
    }

    // Step 2: Hermes orchestrator analyzes intent and builds request
    const { body, intent, agent, model: selectedModel } = await orchestrate({
      message, history, convId, modelId: model,
    })

    // Inject RAG context into messages
    if (ragResults.length > 0) {
      const ragContext = ragResults.map((r, i) => `[Ref${i + 1}] (${(r.score * 100).toFixed(0)}%)\n${r.text}`).join('\n\n---\n\n')
      const insertIdx = body.messages.findIndex((m: any) => m.role === 'system') + 1
      body.messages.splice(insertIdx, 0, { role: 'system', content: `[Knowledge Base]\n${ragContext}` })
    }

    if (convId) msgAdd(convId, 'user', message)

    abortCtrl = new AbortController()

    try {
      // Step 3: Tool call loop (max 5 rounds)
      let fullResponse = ''
      let rounds = 0
      const MAX_ROUNDS = 5

      while (rounds < MAX_ROUNDS) {
        rounds++
        logger.info('Chat', `Round ${rounds}`, { model: body.model, messages: body.messages.length, tools: body.tools?.length || 0 })

        // Call OpenClaw
        const resp = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: abortCtrl.signal,
        })

        if (!resp.ok) return { ok: false, error: await resp.text() }

        const reader = resp.body!.getReader()
        const dec = new TextDecoder()
        let buf = '', roundText = ''
        const toolCalls: any[] = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const lines = buf.split('\n'); buf = lines.pop()!
          for (const line of lines) {
            const t = line.trim()
            if (!t.startsWith('data: ')) continue
            const d = t.slice(6)
            if (d === '[DONE]') continue
            try {
              const obj = JSON.parse(d); const delta = obj.choices?.[0]?.delta
              if (!delta) continue
              if (delta.content) { roundText += delta.content; mw?.webContents.send('chat:token', delta.content) }
              const th = delta.reasoning_content || delta.thinking
              if (th) mw?.webContents.send('chat:thinking', th)
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  toolCalls.push(tc)
                  mw?.webContents.send('chat:toolCall', { id: tc.id, name: tc.function?.name, status: 'running' })
                }
              }
            } catch {}
          }
        }

        fullResponse += roundText

        // No tool calls = done
        if (toolCalls.length === 0) break

        // Step 4: Execute tool calls
        const toolResults: any[] = []
        for (const tc of toolCalls) {
          const funcName = tc.function?.name
          let funcArgs: any = {}
          try { funcArgs = JSON.parse(tc.function?.arguments || '{}') } catch {}

          logger.info('Chat', `Tool call: ${funcName}`, funcArgs)
          const result = await executeTool(funcName, funcArgs)

          mw?.webContents.send('chat:toolCall', {
            id: tc.id, name: funcName,
            status: result.success ? 'done' : 'error',
            output: result.output || result.error,
          })

          toolResults.push({
            tool_call_id: tc.id, role: 'tool',
            content: result.success ? (result.output || 'Success') : `Error: ${result.error}`,
          })
        }

        // Step 5: Inject tool results, continue next round
        body.messages.push({
          role: 'assistant', content: null,
          tool_calls: toolCalls.map(tc => ({
            id: tc.id, type: 'function',
            function: { name: tc.function?.name, arguments: tc.function?.arguments },
          })),
        })
        body.messages.push(...toolResults)
      }

      // Save assistant reply
      if (convId && fullResponse) msgAdd(convId, 'assistant', fullResponse)
      mw?.webContents.send('chat:done', fullResponse)

      logger.info('Chat', `Done`, {
        rounds, intent: intent.intent, agent: agent?.name,
        model: selectedModel, tokens: fullResponse.length,
      })

      return { ok: true, text: fullResponse }
    } catch (e: any) {
      logger.error('Chat', `Error: ${e.message}`)
      return { ok: false, error: e.message }
    }
  })
  ipcMain.handle('chat:cancel', () => { abortCtrl?.abort(); return true })

  // ─── RAG Document APIs ───
  ipcMain.handle('rag:import', async (_, filePath: string) => {
    const { importDocument } = require('./rag')
    return importDocument(filePath)
  })
  ipcMain.handle('rag:list', () => {
    const { listDocuments } = require('./rag')
    return listDocuments()
  })
  ipcMain.handle('rag:delete', (_, docId: string) => {
    const { deleteDocument } = require('./rag')
    deleteDocument(docId)
  })
  ipcMain.handle('rag:search', async (_, query: string, topK?: number) => {
    const { searchDocuments } = require('./rag')
    return searchDocuments(query, topK || 5)
  })

  // ─── Workflow APIs ───
  ipcMain.handle('wf:list', () => {
    const { listWorkflows } = require('./workflow')
    return listWorkflows()
  })
  ipcMain.handle('wf:save', (_, wf: any) => {
    const { saveWorkflow } = require('./workflow')
    saveWorkflow(wf)
  })
  ipcMain.handle('wf:delete', (_, id: string) => {
    const { deleteWorkflow } = require('./workflow')
    deleteWorkflow(id)
  })
  ipcMain.handle('wf:execute', async (_, wfId: string, input: string) => {
    const { executeWorkflow } = require('./workflow')
    return executeWorkflow(wfId, input)
  })
  ipcMain.handle('wf:presets', () => {
    const { getPresetWorkflows } = require('./workflow')
    return getPresetWorkflows()
  })

  // ─── Backup APIs ───
  ipcMain.handle('backup:create', () => {
    const { createBackup } = require('../storage/backup')
    return createBackup()
  })
  ipcMain.handle('backup:list', () => {
    const { listBackups } = require('../storage/backup')
    return listBackups()
  })
  ipcMain.handle('backup:restore', (_, path: string) => {
    const { restoreBackup } = require('../storage/backup')
    return restoreBackup(path)
  })

  // ─── Cron Execution History ───
  ipcMain.handle('cron:history', (_, jobId?: string) => {
    const { getExecutionHistory } = require('./cron-sandbox')
    return getExecutionHistory(jobId)
  })

  // ─── Prompt Templates ───
  ipcMain.handle('prompts:list', () => kvList('prompts'))
  ipcMain.handle('prompts:save', (_, p: any) => kvUpsert('prompts', p.id, p))
  ipcMain.handle('prompts:delete', (_, id: string) => {
    const { kvDelete } = require('../storage/db')
    kvDelete('prompts', id)
  })

  // ─── Logs ───
  ipcMain.handle('logs:list', () => {
    const { readdirSync, mkdirSync } = require('fs')
    const logDir = logger.getLogDir()
    mkdirSync(logDir, { recursive: true })
    return readdirSync(logDir).filter((f: string) => f.endsWith('.log')).sort().reverse()
  })
  ipcMain.handle('logs:read', (_, filename: string) => {
    const { existsSync, readFileSync } = require('fs')
    const path = require('path').join(logger.getLogDir(), filename)
    if (!existsSync(path)) return ''
    const content = readFileSync(path, 'utf8')
    const lines = content.split('\n')
    return lines.slice(-2000).join('\n')
  })
  ipcMain.handle('logs:dir', () => logger.getLogDir())

  // ─── Gateway Circuit Breaker Status ───
  ipcMain.handle('gateway:circuit', () => {
    const { getGatewayCircuitStatus } = require('./gateway-client')
    return getGatewayCircuitStatus()
  })

  // ─── Search Messages ───
  ipcMain.handle('search:messages', (_, query: string, limit?: number) => {
    const { searchMessages, kvGet } = require('../storage/db')
    if (!query.trim()) return []
    const results = searchMessages(query, limit || 50)
    return results.map((r: any) => {
      const conv = kvGet('conversations', r.convId)
      return { ...r, convTitle: conv?.title || 'New conversation' }
    })
  })

  // ─── Conversations Fork ───
  ipcMain.handle('conv:fork', (_, convId: string, messageIndex: number) => {
    const { randomUUID } = require('crypto')
    const { kvGet, kvUpsert, msgList, msgAdd } = require('../storage/db')
    const sourceConv = kvGet('conversations', convId)
    if (!sourceConv) return null
    const allMsgs = msgList(convId)
    const forkMsgs = allMsgs.slice(0, messageIndex + 1)
    const newId = randomUUID()
    const now = new Date().toISOString()
    kvUpsert('conversations', newId, {
      id: newId, title: (sourceConv.title || '') + ' (fork)',
      model: sourceConv.model, parentConvId: convId, forkPoint: messageIndex,
      createdAt: now, updatedAt: now,
    })
    for (const m of forkMsgs) {
      msgAdd(newId, (m as any).role, (m as any).content, (m as any).tokens)
    }
    return newId
  })
}
