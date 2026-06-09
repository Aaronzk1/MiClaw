import { exec } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { logger } from './logger'
import { kvList, kvUpsert } from '../storage/db'
import { gatewayRequest } from './gateway-client'

const SANDBOX_DIR = join(app.getPath('userData'), 'sandbox')
mkdirSync(SANDBOX_DIR, { recursive: true })

export interface ToolResult {
  success: boolean
  output?: string
  error?: string
  duration: number
}

export async function executeTool(name: string, args: any): Promise<ToolResult> {
  const start = Date.now()
  logger.info('ToolExecutor', `Execute: ${name}`, args)

  try {
    let result: ToolResult
    switch (name) {
      case 'code_execute': result = await toolCodeExecute(args); break
      case 'web_search': result = await toolWebSearch(args); break
      case 'file_read': result = await toolFileRead(args); break
      case 'file_write': result = await toolFileWrite(args); break
      case 'memory_save': result = await toolMemorySave(args); break
      case 'image_understand': result = await toolImageUnderstand(args); break
      default: result = await toolMcpForward(name, args); break
    }
    result.duration = Date.now() - start
    logger.info('ToolExecutor', `Done: ${name} (${result.duration}ms)`, { success: result.success })
    return result
  } catch (e: any) {
    logger.error('ToolExecutor', `Error: ${name}`, e.message)
    return { success: false, error: e.message, duration: Date.now() - start }
  }
}

async function toolCodeExecute(args: { language: string; code: string }): Promise<ToolResult> {
  const { language, code } = args
  if (!code || code.length > 50000) return { success: false, error: 'Code too long or empty', duration: 0 }

  const blocked = [/rm\s+-rf/, /format/, /del\s+\/[sfq]/, /shutdown/, /mkfs/, /dd\s+if=/]
  if (blocked.some(p => p.test(code))) return { success: false, error: 'Dangerous operation blocked', duration: 0 }

  const scriptFile = join(SANDBOX_DIR, `script-${Date.now()}`)

  if (language === 'python') {
    writeFileSync(scriptFile + '.py', code, 'utf8')
    const result = await execPromise(`python "${scriptFile}.py"`, 30000)
    try { unlinkSync(scriptFile + '.py') } catch {}
    return result
  }
  if (language === 'javascript') {
    writeFileSync(scriptFile + '.js', code, 'utf8')
    const result = await execPromise(`node "${scriptFile}.js"`, 30000)
    try { unlinkSync(scriptFile + '.js') } catch {}
    return result
  }
  if (language === 'shell') {
    return execPromise(code, 30000)
  }
  return { success: false, error: `Unsupported language: ${language}`, duration: 0 }
}

async function toolFileRead(args: { path: string }): Promise<ToolResult> {
  const filePath = args.path
  if (!existsSync(filePath)) return { success: false, error: 'File not found', duration: 0 }
  const content = readFileSync(filePath, 'utf8').slice(0, 100000)
  const truncated = content.length >= 100000 ? '\n... [truncated >100KB]' : ''
  return { success: true, output: content + truncated, duration: 0 }
}

async function toolFileWrite(args: { path: string; content: string }): Promise<ToolResult> {
  const allowedDirs = [SANDBOX_DIR, app.getPath('desktop')]
  if (!allowedDirs.some(d => args.path.startsWith(d))) {
    return { success: false, error: 'Only sandbox/desktop directory allowed', duration: 0 }
  }
  if (args.content.length > 1024 * 1024) return { success: false, error: 'Content exceeds 1MB limit', duration: 0 }
  writeFileSync(args.path, args.content, 'utf8')
  return { success: true, output: `Written: ${args.path}`, duration: 0 }
}

async function toolMemorySave(args: { content: string; category?: string }): Promise<ToolResult> {
  const id = 'mem-' + Date.now()
  kvUpsert('memory', id, {
    id, content: args.content,
    category: args.category || 'general',
    importance: 0.7, source: 'agent',
    createdAt: new Date().toISOString(),
  })
  return { success: true, output: `Memory saved: ${args.content.slice(0, 50)}`, duration: 0 }
}

async function toolImageUnderstand(args: { path: string; question?: string }): Promise<ToolResult> {
  try {
    const { loadConfig } = require('./core')
    const config = loadConfig()
    const port = config.gateway?.port || 18789
    const imageBuffer = readFileSync(args.path)
    const base64 = imageBuffer.toString('base64')
    const ext = args.path.split('.').pop()?.toLowerCase() || 'png'
    const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
    const mimeType = mimeMap[ext] || 'image/png'

    const resp = await gatewayRequest('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ai?.model || 'openclaw',
        stream: false,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: args.question || 'Describe this image' },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        }],
      }),
    })
    const data = await resp.json()
    return { success: true, output: data.choices?.[0]?.message?.content || 'Cannot recognize', duration: 0 }
  } catch (e: any) {
    return { success: false, error: e.message, duration: 0 }
  }
}

async function toolWebSearch(args: { query: string }): Promise<ToolResult> {
  try {
    const resp = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(args.query)}&format=json&no_html=1`,
      { signal: AbortSignal.timeout(10000) },
    )
    const data = await resp.json()
    const results = [
      ...(data.AbstractText ? [{ title: data.Heading, snippet: data.AbstractText }] : []),
      ...(data.RelatedTopics || []).slice(0, 5).map((t: any) => ({ title: '', snippet: t.Text })),
    ]
    const output = results.map((r: any, i: number) => `${i + 1}. ${r.title ? r.title + ': ' : ''}${r.snippet}`).join('\n')
    return { success: true, output: output || 'No results found', duration: 0 }
  } catch (e: any) {
    return { success: false, error: e.message, duration: 0 }
  }
}

async function toolMcpForward(name: string, args: any): Promise<ToolResult> {
  logger.warn('ToolExecutor', `MCP tool not connected: ${name}`)
  return { success: false, error: `MCP tool ${name} not connected`, duration: 0 }
}

function execPromise(cmd: string, timeout: number): Promise<ToolResult> {
  return new Promise(resolve => {
    exec(cmd, { timeout, windowsHide: true, cwd: SANDBOX_DIR, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) resolve({ success: false, error: stderr || error.message, duration: 0 })
        else resolve({ success: true, output: stdout, duration: 0 })
      }
    )
  })
}