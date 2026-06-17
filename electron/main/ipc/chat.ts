import { ipcMain, BrowserWindow } from 'electron'
import { Agent as UndiciAgent } from 'undici'
import { kvGet, msgAdd } from '../../storage/db'
import { cacheAgents, cacheProviders, cacheModels } from '../../ipc/chat-cache'
import { streamChat as llmStreamChat, type StreamContext } from '../../ipc/llm'
import { trace } from '../utils'
import { scanGatewayPort, loadConfig } from '../gateway'
import { DEFAULT_MODEL, DEFAULT_AGENT_ID, API_PATH_CHAT, OLLAMA_BASE_URL, API_PATH_OLLAMA_TAGS, TIMEOUT_HEALTH_CHECK } from '../../constants'

const keepAliveAgent = new UndiciAgent({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 600_000, connections: 6 })

export function registerChatIpc(getMainWindow: () => BrowserWindow | null) {
  let abortCtrl: AbortController | null = null
  let chatGeneration = 0

  ipcMain.handle('chat:send', async (_, { message, history, model, agentId, convId }) => {
    const perfStart = Date.now()
    trace('CHAT_START', { message: message.slice(0, 200), model, agentId, convId })
    abortCtrl?.abort()
    const myGen = ++chatGeneration

    const port = await scanGatewayPort()
    const mw = getMainWindow()
    abortCtrl = new AbortController()

    // Resolve model
    const config = kvGet('config', 'main') || {}
    const agents = cacheAgents()
    const agent = agents.find((a: any) => a.id === (agentId || DEFAULT_AGENT_ID)) || agents[0]
    const resolvedModel = model || agent?.model || config.ai?.model || DEFAULT_MODEL

    // Build minimal messages — OpenClaw handles everything else
    const msgs: any[] = []

    // Minimal system prompt — agent behavior is controlled by OpenClaw workspace files
    const sysParts: string[] = ['回复不要使用emoji表情符号，用纯文字表达']
    msgs.push({ role: 'system', content: sysParts.join('\n') })

    if (history && history.length > 0) msgs.push(...history)
    msgs.push({ role: 'user', content: message })
    if (convId) msgAdd(convId, 'user', message)

    // Route through Gateway
    const apiBase = `http://127.0.0.1:${port}${API_PATH_CHAT}`
    const apiKey = ''
    console.log('[Chat] Model:', resolvedModel)

    try {
      const streamCtx: StreamContext = {
        mainWindow: mw, apiBase, apiKey,
        modelName: resolvedModel, abortSignal: abortCtrl!.signal, dispatcher: keepAliveAgent,
        generation: myGen, chatGeneration: () => chatGeneration, config,
      }

      const result = await llmStreamChat(streamCtx, msgs)
      console.log(`[Chat] Response in ${Date.now() - perfStart}ms: content length=${result.full.length}`)
      trace('LLM_RESPONSE', { elapsed: Date.now() - perfStart, contentLen: result.full.length, hasThinking: !!result.thinking })

      if (myGen !== chatGeneration) { mw?.webContents.send('chat:done', '', '', []); return { ok: true, text: '' } }

      const finalText = result.full
      const allThinking = result.thinking || ''
      const allToolCalls = result.toolCalls || []
      console.log('[Chat] Tool calls collected:', allToolCalls.length, allToolCalls.map((tc: any) => tc.function?.name || tc.name).join(', '))

      if (convId && finalText) {
        const tokens = result.usage?.completion_tokens || Math.ceil(finalText.length / 4)
        msgAdd(convId, 'assistant', finalText, tokens, allToolCalls.length ? JSON.stringify(allToolCalls) : undefined, allThinking)
      }

      // Forward usage and model info to UI
      if (result.usage) mw?.webContents.send('chat:usage', result.usage)
      if (result.model) mw?.webContents.send('chat:model', result.model)

      mw?.webContents.send('chat:done', finalText, allThinking, allToolCalls)

      // Desktop notification
      try {
        const cfg = loadConfig()
        if (cfg.notifications?.desktop !== false && finalText) {
          const { Notification } = require('electron')
          if (Notification.isSupported()) {
            const preview = finalText.slice(0, 100).replace(/\n/g, ' ')
            new Notification({ title: 'MiClaw', body: preview + (finalText.length > 100 ? '...' : '') }).show()
          }
        }
      } catch {}

      const perfTotal = Date.now() - perfStart
      if (perfTotal > 10000) console.warn(`[Perf] Slow chat:send: ${perfTotal}ms for "${message.slice(0, 50)}..."`)

      return { ok: true, text: finalText }
    } catch (e) {
      if (myGen !== chatGeneration) { mw?.webContents.send('chat:done', '', '', []); return { ok: true, text: '' } }
      let errMsg = (e as Error).message || String(e) || '未知错误'
      const status = (e as any).status
      console.error('[Chat] Error:', errMsg, status ? `(HTTP ${status})` : '')
      if (errMsg.includes('ECONNREFUSED') || errMsg.includes('无法连接')) {
        errMsg = 'Gateway 未运行 — 请在侧边栏点击"网关"启动，或在设置中检查 Gateway 状态'
      } else if (status === 429 || errMsg.includes('429') || errMsg.includes('配额')) {
        errMsg = '模型配额已用完 — 请在设置中切换其他模型或供应商'
      }
      const isTransient = status === 429 || errMsg.includes('配额') || errMsg.includes('Gateway 未运行') || errMsg.includes('取消')
      if (convId && !isTransient) msgAdd(convId, 'assistant', `错误: ${errMsg}`)
      mw?.webContents.send('chat:error', errMsg)
      return { ok: false, error: errMsg }
    }
  })

  ipcMain.handle('chat:cancel', () => { abortCtrl?.abort(); return true })

  ipcMain.handle('ollama:status', async () => {
    try {
      const r = await fetch(`${OLLAMA_BASE_URL}${API_PATH_OLLAMA_TAGS}`, { signal: AbortSignal.timeout(TIMEOUT_HEALTH_CHECK) })
      const data = await r.json()
      return { running: true, models: (data.models || []).map((m: any) => m.name) }
    } catch { return { running: false, models: [] } }
  })

  ipcMain.handle('chat:compare', async (_, { message, modelIds }: { message: string; modelIds: string[] }) => {
    const mw = getMainWindow()
    const providers = cacheProviders()
    const models = cacheModels()
    const port = await scanGatewayPort()
    const config = kvGet('config', 'main') || {}

    const tasks = modelIds.map(async (modelId) => {
      const modelEntry = models.find((m: any) => m.id === modelId)
      const prov = modelEntry?.provider
        ? providers.find((p: any) => p.id === modelEntry.provider && p.apiKey && p.enabled !== false)
        : providers.find((p: any) => p.apiKey && p.enabled !== false)

      let apiBase = `http://127.0.0.1:${port}${API_PATH_CHAT}`
      let apiKey = ''
      if (prov?.apiKey) { apiBase = (prov.baseUrl || '').replace(/\/+$/, '') + '/chat/completions'; apiKey = prov.apiKey }

      const gen = Date.now()
      const proxyMw = mw ? {
        webContents: {
          send(channel: string, ...args: any[]) {
            if (channel === 'chat:token') mw.webContents.send('chat:compare:token', { modelId, token: args[0] })
            else if (channel === 'chat:thinking') mw.webContents.send('chat:compare:thinking', { modelId, token: args[0] })
            else if (channel === 'chat:tool-status') mw.webContents.send('chat:compare:tool-status', { modelId, ...args[0] })
          }
        }
      } as any : null

      const streamCtx: StreamContext = {
        mainWindow: proxyMw,
        apiBase, apiKey,
        modelName: modelId,
        abortSignal: new AbortController().signal,
        dispatcher: keepAliveAgent,
        generation: gen,
        chatGeneration: () => gen,
        config,
      }

      try {
        const result = await llmStreamChat(streamCtx, [{ role: 'user', content: message }])
        mw?.webContents.send('chat:compare:result', {
          modelId,
          text: result.full,
          thinking: result.thinking || '',
          toolCalls: result.toolCalls || [],
          ok: true,
        })
        return { model: modelId, text: result.full, ok: true }
      } catch (e: any) {
        const err = e?.message || '请求失败'
        mw?.webContents.send('chat:compare:result', { modelId, text: '', ok: false, error: err })
        return { model: modelId, text: '', ok: false, error: err }
      }
    })

    const results = await Promise.all(tasks)
    return { ok: true, results }
  })

  // ─── MaxMode: parallel proposals with different temperatures ───
  ipcMain.handle('chat:maxmode', async (_, { message, history, model, agentId, convId, proposalCount }: {
    message: string; history: any[]; model?: string; agentId?: string; convId?: string; proposalCount?: number
  }) => {
    const mw = getMainWindow()
    const port = await scanGatewayPort()
    const config = kvGet('config', 'main') || {}
    const agents = cacheAgents()
    const agent = agents.find((a: any) => a.id === (agentId || DEFAULT_AGENT_ID)) || agents[0]
    const resolvedModel = model || agent?.model || config.ai?.model || DEFAULT_MODEL

    const count = Math.min(Math.max(proposalCount || 3, 2), 5)
    const temperatures = [0.3, 0.7, 1.1, 0.5, 0.9].slice(0, count)

    // Build messages
    const msgs: any[] = []
    const sysParts: string[] = ['回复不要使用emoji表情符号，用纯文字表达']
    msgs.push({ role: 'system', content: sysParts.join('\n') })
    if (history && history.length > 0) msgs.push(...history)
    msgs.push({ role: 'user', content: message })

    const apiBase = `http://127.0.0.1:${port}${API_PATH_CHAT}`

    const tasks = temperatures.map(async (temp, idx) => {
      const gen = Date.now() + idx
      const proxyMw = mw ? {
        webContents: {
          send(channel: string, ...args: any[]) {
            if (channel === 'chat:token') mw.webContents.send('chat:maxmode:token', { proposalId: idx, token: args[0] })
            else if (channel === 'chat:thinking') mw.webContents.send('chat:maxmode:thinking', { proposalId: idx, token: args[0] })
          }
        }
      } as any : null

      const streamCtx: StreamContext = {
        mainWindow: proxyMw, apiBase, apiKey: '',
        modelName: resolvedModel,
        abortSignal: new AbortController().signal,
        dispatcher: keepAliveAgent,
        generation: gen, chatGeneration: () => gen, config,
      }

      try {
        const result = await llmStreamChat(streamCtx, msgs, undefined, { temperature: temp })
        mw?.webContents.send('chat:maxmode:done', { proposalId: idx, text: result.full, thinking: result.thinking || '', ok: true })
        return { id: idx, temperature: temp, text: result.full, thinking: result.thinking || '', ok: true }
      } catch (e: any) {
        const err = e?.message || '请求失败'
        mw?.webContents.send('chat:maxmode:done', { proposalId: idx, text: '', ok: false, error: err })
        return { id: idx, temperature: temp, text: '', ok: false, error: err }
      }
    })

    const proposals = await Promise.all(tasks)

    // Judge: ask the model to pick the best
    const validProposals = proposals.filter(p => p.ok && p.text)
    let judgePick = 0
    if (validProposals.length >= 2) {
      try {
        const judgePrompt = `你是质量评审员。以下是同一问题的 ${validProposals.length} 个不同回复方案，请选出最好的一个。

评判标准：
1. 准确性和完整性
2. 逻辑清晰度和结构
3. 表达简洁度

${validProposals.map((p, i) => `--- 方案 ${i + 1} (temperature=${p.temperature}) ---\n${p.text.slice(0, 2000)}`).join('\n\n')}

只回复方案编号（1-${validProposals.length}），不要其他内容。`

        const judgeResult = await llmStreamChat({
          mainWindow: null, apiBase, apiKey: '',
          modelName: resolvedModel,
          abortSignal: AbortSignal.timeout(30000),
          dispatcher: keepAliveAgent,
          generation: Date.now(), chatGeneration: () => Date.now(), config,
        }, [{ role: 'user', content: judgePrompt }], undefined, { temperature: 0 })

        const num = parseInt(judgeResult.full.match(/\d+/)?.[0] || '1')
        const judgeIdx = Math.max(1, Math.min(validProposals.length, num)) - 1
        judgePick = validProposals[judgeIdx].id
      } catch {
        judgePick = validProposals[0].id
      }
    } else if (validProposals.length === 1) {
      judgePick = validProposals[0].id
    }

    mw?.webContents.send('chat:maxmode:judge', { bestId: judgePick })

    // Save to conversation
    if (convId) {
      const best = proposals.find(p => p.id === judgePick)
      if (best?.ok && best.text) {
        msgAdd(convId, 'user', message)
        msgAdd(convId, 'assistant', best.text, Math.ceil(best.text.length / 4))
      }
    }

    return { ok: true, proposals, judgePick }
  })

  // ─── Goal Judge: verify task completion ───
  ipcMain.handle('chat:goalJudge', async (_, { question, response, model }: {
    question: string; response: string; model?: string
  }) => {
    const port = await scanGatewayPort()
    const config = kvGet('config', 'main') || {}
    const resolvedModel = model || config.ai?.model || DEFAULT_MODEL
    const apiBase = `http://127.0.0.1:${port}${API_PATH_CHAT}`

    const judgePrompt = `你是任务完成度评审员。判断AI的回答是否真正完成了用户的任务。

用户的问题:
${question.slice(0, 2000)}

AI的回答:
${response.slice(0, 3000)}

评判标准:
1. 是否完整回答了用户的所有问题
2. 是否遗漏了关键信息或步骤
3. 是否有明显的错误或不确定的推测
4. 代码是否完整可运行（如果涉及代码）

回复JSON格式: {"score": 1-10, "complete": true/false, "issues": ["问题1", "问题2"], "suggestion": "改进建议"}
- score >= 7 且无严重问题 → complete: true
- score < 7 或有严重遗漏 → complete: false
只回复JSON，不要其他内容。`

    try {
      const result = await llmStreamChat({
        mainWindow: null, apiBase, apiKey: '',
        modelName: resolvedModel,
        abortSignal: AbortSignal.timeout(30000),
        dispatcher: keepAliveAgent,
        generation: Date.now(), chatGeneration: () => Date.now(), config,
      }, [{ role: 'user', content: judgePrompt }], undefined, { temperature: 0 })

      const cleaned = result.full.replace(/```json?\s*/g, '').replace(/```/g, '').trim()
      try {
        const verdict = JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] || '{}')
        return {
          ok: true,
          score: Math.max(1, Math.min(10, verdict.score || 5)),
          complete: !!verdict.complete,
          issues: Array.isArray(verdict.issues) ? verdict.issues : [],
          suggestion: verdict.suggestion || '',
        }
      } catch {
        return { ok: true, score: 5, complete: true, issues: [], suggestion: '' }
      }
    } catch (e: any) {
      return { ok: false, score: 0, complete: true, issues: [], suggestion: e?.message || 'Judge 失败' }
    }
  })

}
