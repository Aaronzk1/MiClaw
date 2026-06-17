import type { BrowserWindow } from 'electron'

export interface StreamContext {
  mainWindow: BrowserWindow | null
  apiBase: string
  apiKey: string
  modelName: string
  abortSignal: AbortSignal
  dispatcher: any
  generation: number
  chatGeneration: () => number
  config: any
  modelMaxTokens?: number
  modelContextWindow?: number
}

export async function streamChat(
  ctx: StreamContext,
  messages: any[],
  requestTools?: any[],
  opts?: { skipThinking?: boolean; temperature?: number }
): Promise<{ full: string; toolCalls: any[]; thinking: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }; model?: string }> {
  const cfg = ctx.config
  const body: any = { model: ctx.modelName, stream: true, messages }
  const baseTemp = opts?.temperature ?? cfg.ai?.temperature ?? 0.7
  body.temperature = Math.max(0, Math.min(2, baseTemp))
  const maxTokens = cfg.ai?.maxTokens || ctx.modelMaxTokens
  if (maxTokens) body.max_tokens = Math.max(1024, Math.min(131072, maxTokens))
  if (requestTools && requestTools.length > 0) body.tools = requestTools
  const headers: any = { 'Content-Type': 'application/json' }
  if (ctx.apiKey) headers['Authorization'] = `Bearer ${ctx.apiKey}`

  let resp: Response
  try {
    const isLocal = ctx.apiBase.includes('127.0.0.1') || ctx.apiBase.includes('localhost')
    const fetchOpts: any = {
      method: 'POST', headers, body: JSON.stringify(body),
      signal: ctx.abortSignal,
    }
    // Only use custom dispatcher for non-local endpoints (keep-alive for LLM APIs)
    if (!isLocal && ctx.dispatcher) fetchOpts.dispatcher = ctx.dispatcher
    resp = await fetch(ctx.apiBase, fetchOpts)
  } catch (e: any) {
    const msg = e?.message || String(e)
    if (msg.includes('abort') || msg.includes('signal')) throw new Error('请求已取消')
    if (msg.includes('ECONNREFUSED')) throw new Error(`无法连接到 ${ctx.apiBase} — 请检查服务是否运行`)
    if (msg.includes('fetch failed') || msg.includes('ENOTFOUND')) throw new Error(`网络错误: 无法访问 ${ctx.apiBase}`)
    throw new Error(`API请求失败: ${msg}`)
  }
  if (!resp.ok) {
    let errBody = ''
    try { errBody = await resp.text() } catch {}
    let detail = ''
    try { const j = JSON.parse(errBody); detail = j.error?.message || j.message || j.detail || errBody } catch { detail = errBody }
    const makeErr = (msg: string) => { const e = new Error(msg) as any; e.status = resp.status; return e }
    if (resp.status === 401) throw makeErr(`API认证失败(401) — 请检查 API Key 是否正确`)
    if (resp.status === 404) throw makeErr(`API端点不存在(404) — ${ctx.apiBase}，请检查模型名称: ${ctx.modelName}`)
    if (resp.status === 429) throw makeErr(`API限流(429) — 请求过于频繁，请稍后重试`)
    if (resp.status === 400) {
      console.error('[LLM] 400 error. Model:', ctx.modelName, 'API Base:', ctx.apiBase)
      console.error('[LLM] 400 Request body keys:', Object.keys(body), 'tools count:', body.tools?.length || 0, 'messages count:', body.messages?.length || 0)
      console.error('[LLM] 400 response:', errBody.slice(0, 500))
      throw makeErr(`API参数错误(400) — ${detail || '请求参数有误'}`)
    }
    throw makeErr(`API返回 ${resp.status}: ${detail || '未知错误'}`)
  }
  if (!resp.body) throw new Error('API返回空响应体')

  const reader = resp.body.getReader(); const dec = new TextDecoder()
  let buf = '', full = '', collectedThinking = ''
  let lastUsage: any = undefined, lastModel: string | undefined
  const pendingTC: Record<number, { id: string; name: string; args: string }> = {}
  const toolEvents: any[] = [] // Capture Gateway tool execution events
  const MAX_CONTENT = 100_000, MAX_THINKING = 50_000, MAX_TOOL_ARGS = 50_000

  // Heuristic: detect "one char per line" pattern from model tokenization
  // and strip spurious newlines during streaming
  let newlineCheckBuf = ''
  let charPerLineMode: boolean | null = null  // null = not determined yet

  let superseded = false
  let eventCount = 0
  let firstEventLogged = false
  while (true) {
    const { done, value } = await reader.read(); if (done) break
    buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop()!
    for (const line of lines) {
      const t = line.trim(); if (!t.startsWith('data: ')) continue; const d = t.slice(6)
      if (d === '[DONE]') continue
      try {
        const obj = JSON.parse(d)
        eventCount++
        if (!firstEventLogged) {
          firstEventLogged = true
          console.log('[LLM] First SSE event keys:', Object.keys(obj), 'choices:', obj.choices?.length, 'model:', obj.model)
          if (obj.choices?.[0]) console.log('[LLM] First choice keys:', Object.keys(obj.choices[0]), 'delta keys:', obj.choices[0].delta ? Object.keys(obj.choices[0].delta) : 'no delta')
        }
        if (obj.usage) lastUsage = obj.usage
        if (obj.model) lastModel = obj.model
        const errObj = obj.error || obj.choices?.[0]?.error || obj.choices?.[0]?.delta?.error
        if (errObj) {
          const errMsg = errObj.message || errObj.detail || JSON.stringify(errObj)
          throw new Error(errMsg)
        }
        if (!obj.choices || !Array.isArray(obj.choices) || obj.choices.length === 0) continue
        const delta = obj.choices?.[0]?.delta; if (!delta) continue
        if (ctx.generation !== ctx.chatGeneration()) { superseded = true; break }
        if (delta.content) {
          if (full.length < MAX_CONTENT) {
            let content = delta.content
            // Detect char-per-line pattern: after collecting ~30 chars, check if
            // most tokens are single chars followed by newline
            if (charPerLineMode === null) {
              newlineCheckBuf += content
              if (newlineCheckBuf.length >= 30) {
                const lines2 = newlineCheckBuf.split('\n').filter(l => l.length > 0)
                const singleCharLines = lines2.filter(l => l.length === 1).length
                charPerLineMode = lines2.length > 5 && singleCharLines / lines2.length > 0.7
                if (charPerLineMode) {
                  // Rebuild full without spurious newlines
                  full = full.replace(/\n(?=[^\n])/g, '')
                  content = content.replace(/\n(?=[^\n])/g, '')
                }
              }
            } else if (charPerLineMode) {
              content = content.replace(/\n(?=[^\n])/g, '')
            }
            full += content
            ctx.mainWindow?.webContents.send('chat:token', content)
          }
        }
        const th = delta.reasoning_content || delta.thinking
        if (th) {
          if (collectedThinking.length < MAX_THINKING) collectedThinking += th
          if (!opts?.skipThinking) ctx.mainWindow?.webContents.send('chat:thinking', th)
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0
            if (!pendingTC[idx]) {
              pendingTC[idx] = { id: '', name: '', args: '' }
            }
            if (tc.id) pendingTC[idx].id = tc.id
            if (tc.function?.name && !pendingTC[idx].name) {
              pendingTC[idx].name = tc.function.name
              // Notify frontend: model is calling a tool
              ctx.mainWindow?.webContents.send('chat:tool-status', {
                id: pendingTC[idx].id || `pending_${idx}`,
                name: tc.function.name,
                status: 'running',
              })
            }
            if (tc.function?.arguments && pendingTC[idx].args.length < MAX_TOOL_ARGS) pendingTC[idx].args += tc.function.arguments
          }
        }
        // Forward tool execution events from Gateway to frontend
        if (delta.tool_event) {
          const te = delta.tool_event
          toolEvents.push({ id: te.toolCallId, name: te.name, status: te.status, args: te.args, output: te.output, error: te.error })
          ctx.mainWindow?.webContents.send('chat:tool-status', {
            id: te.toolCallId,
            name: te.name,
            status: te.status,
            args: te.args ? JSON.stringify(te.args) : undefined,
            output: typeof te.output === 'string' ? te.output.slice(0, 5000) : te.output ? JSON.stringify(te.output).slice(0, 5000) : undefined,
            error: te.error,
          })
        }
      } catch (parseErr) {
        // Only log non-abort parse errors (abort errors are expected during cancel)
        if (!(parseErr as Error).message?.includes('abort')) {
          console.warn('[LLM] SSE parse error:', (parseErr as Error).message?.slice(0, 100))
        }
      }
      if (superseded) break
    }
    if (superseded) break
  }
  console.log('[LLM] Stream done. Events:', eventCount, 'Content:', full.length, 'Thinking:', collectedThinking.length, 'ToolCalls:', Object.keys(pendingTC).length, 'ToolEvents:', toolEvents.length)
  const toolCallList = Object.values(pendingTC)
    .filter(tc => tc.name)
    .map((tc, i) => {
      // Validate JSON arguments — malformed JSON would break downstream tool execution
      let validArgs = tc.args
      try { JSON.parse(validArgs) } catch {
        // Try to fix common LLM JSON errors: trailing commas, unquoted keys
        try {
          validArgs = validArgs
            .replace(/,\s*([\]}])/g, '$1')           // trailing commas
            .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":') // unquoted keys
          JSON.parse(validArgs) // verify fix worked
        } catch {
          console.warn('[LLM] Malformed tool_call args, using empty object:', tc.args.slice(0, 100))
          validArgs = '{}'
        }
      }
      return { id: tc.id || `call_${i}`, type: 'function', function: { name: tc.name, arguments: validArgs } }
    })
  // If no content and no tool calls, the provider returned an empty response
  if (!full && toolCallList.length === 0 && toolEvents.length === 0 && !superseded) {
    console.error('[LLM] Empty response. Events:', eventCount, 'Thinking:', collectedThinking.length, 'Model:', ctx.modelName, 'API:', ctx.apiBase)
    if (collectedThinking) {
      throw new Error(`模型仅返回思考内容，未生成实际回复 — 可能是 max_tokens 不足或模型配额问题`)
    }
    throw new Error(`模型返回空响应 — 请检查模型名称 "${ctx.modelName}" 是否正确，或该模型是否支持当前请求`)
  }
  // Use toolEvents (Gateway execution results) if no model-level tool_calls
  const finalToolCalls = toolCallList.length > 0 ? toolCallList : toolEvents.map((te, i) => ({
    id: te.id || `event_${i}`,
    name: te.name,
    status: te.error ? 'error' : 'done',
    args: te.args ? JSON.stringify(te.args) : undefined,
    output: typeof te.output === 'string' ? te.output : te.output ? JSON.stringify(te.output) : te.error || undefined,
  }))
  if (toolCallList.length > 0 || toolEvents.length > 0) console.log('[LLM] Tools:', toolCallList.length, 'calls,', toolEvents.length, 'events')
  return { full, toolCalls: finalToolCalls, thinking: collectedThinking, usage: lastUsage, model: lastModel }
}
