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
}

// B02: Self-correction hint for tool errors
export function wrapToolResult(result: string, toolName: string): string {
  if (/\[ERROR\]|Error:|ENOENT|EACCES|not found|permission denied|Command failed|Traceback|TypeError:|SyntaxError:|ReferenceError:/i.test(result)) {
    return result + '\n[SYSTEM: Tool execution failed. Analyze the error, adjust your approach, and retry. Do not repeat the same operation. If unsure, ask the user.]'
  }
  return result
}

export async function streamChat(
  ctx: StreamContext,
  messages: any[],
  requestTools?: any[],
  opts?: { skipThinking?: boolean; temperature?: number }
): Promise<{ full: string; toolCalls: any[]; thinking: string }> {
  const cfg = ctx.config
  const body: any = { model: ctx.modelName, stream: true, messages }
  const baseTemp = opts?.temperature ?? cfg.ai?.temperature ?? 0.7
  body.temperature = Math.max(0, Math.min(2, baseTemp))
  body.max_tokens = Math.max(1024, Math.min(131072, cfg.ai?.maxTokens || 16384))
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
    if (resp.status === 401) throw new Error(`API认证失败(401) — 请检查 API Key 是否正确`)
    if (resp.status === 404) throw new Error(`API端点不存在(404) — ${ctx.apiBase}，请检查模型名称: ${ctx.modelName}`)
    if (resp.status === 429) throw new Error(`API限流(429) — 请求过于频繁，请稍后重试`)
    if (resp.status === 400) {
      console.error('[LLM] 400 error. Request body:', JSON.stringify({ model: body.model, messages: body.messages?.length, tools: body.tools?.length, temperature: body.temperature, max_tokens: body.max_tokens }))
      console.error('[LLM] 400 response:', errBody.slice(0, 500))
      throw new Error(`API参数错误(400) — ${detail || '请求参数有误'}`)
    }
    throw new Error(`API返回 ${resp.status}: ${detail || '未知错误'}`)
  }
  if (!resp.body) throw new Error('API返回空响应体')

  const reader = resp.body.getReader(); const dec = new TextDecoder()
  let buf = '', full = '', collectedThinking = ''
  const pendingTC: Record<number, { id: string; name: string; args: string }> = {}
  const MAX_CONTENT = 100_000, MAX_THINKING = 50_000, MAX_TOOL_ARGS = 50_000

  while (true) {
    const { done, value } = await reader.read(); if (done) break
    buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop()!
    for (const line of lines) {
      const t = line.trim(); if (!t.startsWith('data: ')) continue; const d = t.slice(6)
      if (d === '[DONE]') continue
      try {
        const obj = JSON.parse(d); const delta = obj.choices?.[0]?.delta; if (!delta) continue
        if (delta.content && ctx.generation === ctx.chatGeneration()) {
          if (full.length < MAX_CONTENT) {
            full += delta.content
            ctx.mainWindow?.webContents.send('chat:token', delta.content)
          }
        }
        const th = delta.reasoning_content || delta.thinking
        if (th && ctx.generation === ctx.chatGeneration()) {
          if (collectedThinking.length < MAX_THINKING) collectedThinking += th
          if (!opts?.skipThinking) ctx.mainWindow?.webContents.send('chat:thinking', th)
        }
        if (delta.tool_calls && ctx.generation === ctx.chatGeneration()) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0
            if (!pendingTC[idx]) pendingTC[idx] = { id: '', name: '', args: '' }
            if (tc.id) pendingTC[idx].id = tc.id
            if (tc.function?.name) pendingTC[idx].name = tc.function.name
            if (tc.function?.arguments && pendingTC[idx].args.length < MAX_TOOL_ARGS) pendingTC[idx].args += tc.function.arguments
          }
        }
      } catch {}
    }
  }
  const toolCallList = Object.values(pendingTC)
    .filter(tc => tc.name)
    .map((tc, i) => ({
      id: tc.id || `call_${i}`, type: 'function', function: { name: tc.name, arguments: tc.args }
    }))
  return { full, toolCalls: toolCallList, thinking: collectedThinking }
}
