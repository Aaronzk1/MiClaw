import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join, resolve, normalize } from 'path'
import { app } from 'electron'
import { kvList, kvUpsert, kvGet } from '../storage/db'
import { exec, ChildProcess } from 'child_process'
import { multiSearch, formatSearchResults, getStockQuote, formatStockQuote, getMarketIndices, getMarketOverview, formatMarketOverview, searchBaike, searchNews, getExchangeRate, crossReference, getWeather, formatWeather, getHotSearch, formatHotSearch, getDailyBriefing, getPoetry, formatPoetry, getHistoryToday, lookupIP, getJoke, getGovStats } from './data-providers'
import { taskDecompose, formatDecomposedTask, decisionAnalysis, formatDecision, matchWorkflowTemplate, listWorkflowTemplates, formatWorkflowTemplate, startProgress, updateStepStatus, getProgressReport, clearProgress, createProjectPlan, formatProjectPlan } from './workflow-skills'
import { isGitHubUrl, fetchWithMirror, readGitHubUrl, warmupMirrors } from './github-mirror'

// P3-3: Tool success rate tracking for self-optimization
const toolStats = new Map<string, { calls: number; successes: number; qualitySum: number; qualityCount: number; lastError: string; lastUsed: number; totalTime: number }>()

export function getToolStats(): Record<string, { calls: number; successes: number; successRate: number; avgQuality: number; lastError: string; avgTime: number }> {
  const stats: Record<string, any> = {}
  for (const [name, s] of toolStats) {
    stats[name] = {
      calls: s.calls, successes: s.successes,
      successRate: s.calls > 0 ? s.successes / s.calls : 0,
      avgQuality: s.qualityCount > 0 ? s.qualitySum / s.qualityCount : 5,
      lastError: s.lastError,
      avgTime: s.calls > 0 ? Math.round(s.totalTime / s.calls) : 0,
    }
  }
  return stats
}

export function getSlowTools(thresholdMs = 5000): string[] {
  const slow: string[] = []
  for (const [name, s] of toolStats) {
    if (s.calls >= 3 && s.totalTime / s.calls > thresholdMs) slow.push(name)
  }
  return slow
}

export function recordToolCall(name: string, success: boolean, error?: string, quality?: number, execTime?: number): void {
  const existing = toolStats.get(name) || { calls: 0, successes: 0, qualitySum: 0, qualityCount: 0, lastError: '', lastUsed: 0, totalTime: 0 }
  existing.calls++
  if (success) existing.successes++
  if (error) existing.lastError = error.slice(0, 200)
  if (quality !== undefined) { existing.qualitySum += quality; existing.qualityCount++ }
  if (execTime !== undefined) existing.totalTime += execTime
  existing.lastUsed = Date.now()
  toolStats.set(name, existing)
  // Auto-persist every 10 calls
  if (existing.calls % 10 === 0) persistToolStats()
}

// P3-4: Tool combination success tracking
const comboStats = new Map<string, { calls: number; successes: number }>()

export function recordToolCombination(tools: string[], success: boolean): void {
  const key = [...tools].sort().join('+')
  const existing = comboStats.get(key) || { calls: 0, successes: 0 }
  existing.calls++
  if (success) existing.successes++
  comboStats.set(key, existing)
}

export function getReliableCombinations(): string[] {
  const result: string[] = []
  for (const [combo, s] of comboStats) {
    if (s.calls >= 2 && s.successes / s.calls >= 0.8) {
      result.push(`${combo} (${Math.round(s.successes / s.calls * 100)}% success)`)
    }
  }
  return result
}

// Cross-session persistence
function persistToolStats(): void {
  try {
    const data: Record<string, any> = {}
    for (const [name, s] of toolStats) data[name] = s
    const combos: Record<string, any> = {}
    for (const [key, s] of comboStats) combos[key] = s
    kvUpsert('config', 'tool_stats', { stats: data, combos, savedAt: new Date().toISOString() })
  } catch {}
}

export function loadToolStats(): void {
  try {
    const saved = kvGet('config', 'tool_stats')
    if (saved?.stats) {
      for (const [name, s] of Object.entries(saved.stats as Record<string, any>)) {
        toolStats.set(name, {
          calls: s.calls || 0, successes: s.successes || 0,
          qualitySum: s.qualitySum || 0, qualityCount: s.qualityCount || 0,
          lastError: s.lastError || '', lastUsed: s.lastUsed || 0,
          totalTime: s.totalTime || 0,
        })
      }
    }
    if (saved?.combos) {
      for (const [key, s] of Object.entries(saved.combos as Record<string, any>)) {
        comboStats.set(key, { calls: (s as any).calls || 0, successes: (s as any).successes || 0 })
      }
    }
  } catch {}
}

// Self-learning: get tools with high success rate
export function getReliableTools(): string[] {
  const reliable: string[] = []
  for (const [name, s] of toolStats) {
    if (s.calls >= 3 && s.successes / s.calls >= 0.7) reliable.push(name)
  }
  return reliable
}

// Self-learning: get tools that consistently fail (unified threshold 0.5)
export function getUnreliableTools(): string[] {
  const unreliable: string[] = []
  for (const [name, s] of toolStats) {
    if (s.calls >= 3 && s.successes / s.calls < 0.5) unreliable.push(name)
  }
  return unreliable
}

// Error context for LLM prompt injection
export function getErrorContext(): string {
  const unreliable = getUnreliableTools()
  if (unreliable.length === 0) return ''
  const lines: string[] = ['[ERROR LEARNING - 避免使用以下失败工具]']
  for (const tool of unreliable) {
    const s = toolStats.get(tool)
    if (s) lines.push(`- ${tool}: ${s.calls}次调用, 成功率${Math.round(s.successes / s.calls * 100)}%, 最近错误: ${s.lastError?.slice(0, 60)}`)
  }
  return lines.join('\n')
}

// Get average quality score for a tool (0-10 scale)
export function getToolQuality(name: string): number {
  const s = toolStats.get(name)
  if (!s || s.qualityCount === 0) return 5 // neutral default
  return s.qualitySum / s.qualityCount
}

// Compute quality score for a tool result (0-10)
export function computeResultQuality(toolName: string, result: string): number {
  let quality = 5
  if (!result || result.length === 0) return 0

  // Error JSON = low quality
  if (result.startsWith('{') && /"error"\s*:/i.test(result)) return 1

  // Timeout = low quality
  if (result.includes('[ERROR]') && result.toLowerCase().includes('timed out')) return 1

  // Search/news results with current year = higher quality
  const currentYear = new Date().getFullYear().toString()
  if ((toolName.includes('search') || toolName.includes('news')) && result.includes(currentYear)) quality += 2

  // Very short results for tools that should return more = lower quality
  if (result.length < 20 && !['joke', 'poetry'].includes(toolName)) quality -= 2

  // Compressed/truncated = slightly lower
  if (result.includes('[... compressed')) quality -= 1

  return Math.max(0, Math.min(10, quality))
}

// TTL cache for tool results (avoids re-reading same file / re-searching same query)
const toolCache = new Map<string, { result: string; expires: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function cacheGet(key: string): string | null {
  const entry = toolCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expires) { toolCache.delete(key); return null }
  return entry.result
}

function cacheSet(key: string, result: string): void {
  // Cap cache size at 100 entries
  if (toolCache.size > 100) {
    const oldest = toolCache.keys().next().value
    if (oldest) toolCache.delete(oldest)
  }
  toolCache.set(key, { result, expires: Date.now() + CACHE_TTL })
}

const runningProcesses = new Set<ChildProcess>()

export function killAllProcesses() {
  for (const proc of runningProcesses) {
    try { proc.kill('SIGTERM') } catch {}
  }
  runningProcesses.clear()
}

function asyncExec(command: string, opts: { timeout?: number; windowsHide?: boolean; encoding?: string } = {}): Promise<string> {
  const timeout = opts.timeout || 30000
  const startTime = Date.now()
  return new Promise((resolve) => {
    let resolved = false
    const safeResolve = (val: string) => { if (!resolved) { resolved = true; resolve(val) } }
    const proc = exec(command, { timeout, windowsHide: opts.windowsHide !== false, encoding: (opts.encoding || 'utf8') as any, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      runningProcesses.delete(proc)
      const elapsed = Date.now() - startTime
      if (err) {
        const isTimeout = (err as any).killed || elapsed >= timeout - 100
        if (isTimeout) {
          const existing = toolStats.get('__timeout__') || { calls: 0, successes: 0, qualitySum: 0, qualityCount: 0, lastError: '', lastUsed: 0, totalTime: 0 }
          existing.calls++
          existing.lastError = `Timeout after ${elapsed}ms: ${command.slice(0, 100)}`
          existing.lastUsed = Date.now()
          toolStats.set('__timeout__', existing)
        }
        safeResolve(stdout?.toString()?.slice(0, 10000) || stderr?.toString()?.slice(0, 10000) || (isTimeout ? `[ERROR] Command timed out after ${Math.round(elapsed / 1000)}s` : err.message))
      } else {
        safeResolve((stdout || '').toString().slice(0, 10000))
      }
    })
    runningProcesses.add(proc)
    // Safety: force-kill after 2x timeout if callback never fires
    const forceKillTimer = setTimeout(() => {
      if (!resolved) {
        try { proc.kill('SIGKILL') } catch {}
        runningProcesses.delete(proc)
        safeResolve(`[ERROR] Command force-killed after ${Math.round(timeout * 2 / 1000)}s`)
      }
    }, timeout * 2)
    // Clear timer when process completes normally
    proc.on('close', () => { clearTimeout(forceKillTimer) })
  })
}

const BLOCKED_COMMANDS = [
  // File deletion (flexible whitespace)
  /\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*r[a-zA-Z]*f/i,
  /\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*f[a-zA-Z]*r/i,
  /\brmdir\s+\/s/i,
  /\bdel\s+\/[sfq]/i,
  /\bformat\s+[a-z]:/i,
  // System destructive
  /\bregedit\b/i,
  /\bnet\s+user\b/i,
  /\bshutdown\b/i,
  /\btaskkill\b/i,
  /\breg\s+(add|delete)\b/i,
  /\battrib\b/i,
  /\bcacls\b/i, /\bicacls\b/i,
  // PowerShell dangerous
  /\bpowershell\s+-[eE][cC]\b/i,
  /\bpowershell\s+-[eE]ncoded[cC]ommand\b/i,
  /\bRemove-Item\s+-Recurse/i,
  /\bInvoke-Expression\b/i,
  /\bIEX\s*\(/i,
  // cmd /c dangerous commands
  /\bcmd\s+\/c\s+(del|rmdir|format|reg|net)\b/i,
]

const BLOCKED_PATHS = [
  /[/\\]Windows[/\\]System32/i,
  /[/\\]Windows[/\\]SysWOW64/i,
  /[/\\]\$Recycle\.Bin/i,
  /[/\\]System Volume Information/i,
  /[/\\]pagefile\.sys/i,
  /[/\\]hiberfil\.sys/i,
  /[/\\]swapfile\.sys/i,
]

export function isPathAllowed(filePath: string): boolean {
  const normalized = normalize(resolve(filePath))
  // Block system-critical paths
  if (BLOCKED_PATHS.some(re => re.test(normalized))) return false
  // Block hidden system directories at drive root
  const rootMatch = normalized.match(/^([a-zA-Z]:)[/\\]?$/)
  if (rootMatch) return false // Block direct drive root access
  return true
}

function sanitizeCommand(cmd: string): string | null {
  if (BLOCKED_COMMANDS.some(re => re.test(cmd))) return null
  return cmd
}

// User-friendly error translation — converts technical errors to readable Chinese
const ERROR_TRANSLATIONS: Array<{ pattern: RegExp; msg: string }> = [
  { pattern: /No path provided/i, msg: '未提供文件路径' },
  { pattern: /No command provided/i, msg: '未提供命令' },
  { pattern: /No query provided/i, msg: '未提供搜索内容' },
  { pattern: /No URL provided/i, msg: '未提供网址' },
  { pattern: /No keyword provided/i, msg: '未提供关键词' },
  { pattern: /No stock code provided/i, msg: '未提供股票代码' },
  { pattern: /No city provided/i, msg: '未提供城市名' },
  { pattern: /No claim to verify/i, msg: '未提供要验证的内容' },
  { pattern: /No indicator provided/i, msg: '未提供指标名称' },
  { pattern: /No task description/i, msg: '未提供任务描述' },
  { pattern: /No decision question/i, msg: '未提供决策问题' },
  { pattern: /No content provided/i, msg: '未提供内容' },
  { pattern: /No text provided/i, msg: '未提供文本' },
  { pattern: /No project objective/i, msg: '未提供项目目标' },
  { pattern: /Access denied/i, msg: '访问被拒绝：路径不在允许范围内' },
  { pattern: /File not found/i, msg: '文件不存在' },
  { pattern: /Command blocked by security/i, msg: '命令被安全策略阻止' },
  { pattern: /Stock not found/i, msg: '未找到该股票' },
  { pattern: /Exchange rate not found/i, msg: '未找到汇率数据' },
  { pattern: /Weather data not found/i, msg: '未找到天气数据' },
  { pattern: /IP lookup failed/i, msg: 'IP查询失败' },
  { pattern: /Only http\/https URLs allowed/i, msg: '仅支持http/https网址' },
  { pattern: /Invalid URL/i, msg: '无效的网址' },
  { pattern: /Unknown tool/i, msg: '未知工具' },
  { pattern: /ENOENT|no such file/i, msg: '文件或目录不存在' },
  { pattern: /EACCES|permission denied/i, msg: '没有访问权限' },
  { pattern: /ECONNREFUSED/i, msg: '连接被拒绝，服务可能未运行' },
  { pattern: /ETIMEDOUT|timed out/i, msg: '操作超时' },
  { pattern: /ENOTFOUND/i, msg: '无法解析域名' },
]

export function translateError(result: string): string {
  if (!result.startsWith('{') || !result.includes('"error"')) return result
  try {
    const parsed = JSON.parse(result)
    if (!parsed.error) return result
    const errStr = String(parsed.error)
    for (const t of ERROR_TRANSLATIONS) {
      if (t.pattern.test(errStr)) {
        parsed.error = t.msg
        return JSON.stringify(parsed)
      }
    }
  } catch {}
  return result
}

export async function executeTool(name: string, args: any): Promise<string> {
  console.log('[Tool] Executing:', name, 'args:', JSON.stringify(args).slice(0, 200))
  try {
    switch (name) {
      case 'read_file':
      case 'ac_read_file':
      case 'read': {
        const filePath = args.path || args.file_path || args.filePath || ''
        if (!filePath) return JSON.stringify({ error: 'No path provided' })
        if (!isPathAllowed(filePath)) return JSON.stringify({ error: 'Access denied: path outside allowed directories' })
        if (!existsSync(filePath)) return JSON.stringify({ error: 'File not found' })
        const cacheKey = `read:${filePath}`
        const cached = cacheGet(cacheKey)
        if (cached) return cached
        const content = readFileSync(filePath, 'utf8').slice(0, 50000)
        cacheSet(cacheKey, content)
        return content
      }
      case 'write_file':
      case 'ac_write_file':
      case 'write': {
        const filePath = args.path || args.file_path || args.filePath || ''
        const content = args.content || ''
        if (!filePath) return JSON.stringify({ error: 'No path provided' })
        if (!isPathAllowed(filePath)) return JSON.stringify({ error: 'Access denied: path outside allowed directories' })
        console.log('[Tool] Writing file:', JSON.stringify(filePath), 'content length:', content.length)
        try {
          writeFileSync(filePath, content)
          cacheSet(`read:${filePath}`, content)
          const created = existsSync(filePath)
          console.log('[Tool] File exists after write:', created)
          return JSON.stringify({ ok: created, path: filePath, bytes: content.length })
        } catch (e) {
          console.log('[Tool] Write error:', (e as Error).message)
          return JSON.stringify({ error: (e as Error).message, path: filePath })
        }
      }
      case 'list_directory': {
        const dir = args.path || args.directory || app.getPath('home')
        if (!isPathAllowed(dir)) return JSON.stringify({ error: 'Access denied: path outside allowed directories' })
        const recursive = args.recursive === true || args.recursive === 'true'
        if (recursive) {
          const maxDepth = Math.min(args.depth || 3, 5)
          const scanDir = (d: string, depth: number): any[] => {
            if (depth > maxDepth) return []
            try {
              return readdirSync(d, { withFileTypes: true })
                .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '__pycache__')
                .slice(0, 30)
                .map(e => {
                  const fullPath = join(d, e.name)
                  const item: any = { name: e.name, type: e.isDirectory() ? 'dir' : 'file' }
                  if (e.isDirectory() && depth < maxDepth) {
                    item.children = scanDir(fullPath, depth + 1)
                  }
                  return item
                })
            } catch { return [] }
          }
          return JSON.stringify({ path: dir, tree: scanDir(dir, 0) })
        }
        return JSON.stringify(readdirSync(dir, { withFileTypes: true }).filter(e => !e.name.startsWith('.')).map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })).slice(0, 50))
      }
      // Incremental file modification (patch)
      case 'ac_patch_file':
      case 'patch_file': {
        const filePath = args.path || args.file_path || ''
        const oldText = args.old_text || args.old || ''
        const newText = args.new_text || args.new || ''
        if (!filePath) return JSON.stringify({ error: 'No path provided' })
        if (!oldText) return JSON.stringify({ error: 'No old_text provided' })
        if (!isPathAllowed(filePath)) return JSON.stringify({ error: 'Access denied' })
        if (!existsSync(filePath)) return JSON.stringify({ error: 'File not found' })
        try {
          const content = readFileSync(filePath, 'utf8')
          if (!content.includes(oldText)) return JSON.stringify({ error: 'old_text not found in file' })
          const patched = content.split(oldText).join(newText)
          writeFileSync(filePath, patched)
          return JSON.stringify({ ok: true, path: filePath, bytes: patched.length })
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }
      // Git operations
      case 'ac_git':
      case 'git': {
        const subcommand = args.command || args.subcommand || 'status'
        const dir = args.path || args.cwd || process.cwd()
        if (!isPathAllowed(dir)) return JSON.stringify({ error: 'Access denied' })
        const safeCommands = ['status', 'diff', 'log', 'branch', 'add', 'commit', 'push', 'pull', 'stash', 'remote']
        const parts = subcommand.split(/\s+/)
        const cmd = parts[0]
        if (!safeCommands.includes(cmd)) return JSON.stringify({ error: `Command '${cmd}' not allowed` })
        try {
          const fullCmd = `git ${subcommand}`
          const result = require('child_process').execSync(fullCmd, { cwd: dir, encoding: 'utf8', timeout: 30000, windowsHide: true })
          return JSON.stringify({ ok: true, output: result.slice(0, 5000) })
        } catch (e: any) { return JSON.stringify({ error: e.stderr || e.message }) }
      }
      case 'execute_command':
      case 'terminal':
      case 'ac_terminal': {
        const cmd = args.command || args.cmd || ''
        if (!cmd) return JSON.stringify({ error: 'No command provided' })
        const safe = sanitizeCommand(cmd)
        if (!safe) return JSON.stringify({ error: 'Command blocked by security policy' })
        const isWin = process.platform === 'win32'
        if (isWin) {
          // Use base64-encoded command to avoid all quoting/escaping issues
          const fullCmd = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${safe}`
          const encoded = Buffer.from(fullCmd, 'utf16le').toString('base64')
          return asyncExec(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 120000, windowsHide: true })
        }
        return asyncExec(safe, { timeout: 30000 })
      }
      case 'read_url':
      case 'ac_read_url':
      case 'read_website': {
        const url = args.url || ''
        if (!url) return JSON.stringify({ error: 'No URL provided' })
        try {
          // GitHub URL 自动镜像回退
          if (isGitHubUrl(url)) {
            return await readGitHubUrl(url)
          }
          const resp = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
            signal: AbortSignal.timeout(15000)
          })
          const html = await resp.text()
          const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&[a-z]+;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 8000)
          if (!text) return '页面内容为空或无法解析'
          // Extract dates from page content to detect stale info
          const currentYr = new Date().getFullYear()
          const pageDates = text.match(/20\d{2}[-年\/]\d{1,2}[-月\/]?\d{0,2}/g) || []
          let dateWarning = ''
          if (pageDates.length > 0) {
            const years = pageDates.map(d => parseInt(d.match(/(20\d{2})/)?.[1] || '0')).filter(y => y > 0)
            const maxYear = Math.max(...years)
            if (maxYear < currentYr) {
              dateWarning = `\n\n[⚠ 注意: 此页面最新日期为${maxYear}年，可能包含过时信息。当前年份${currentYr}年。]`
            }
          }
          return text + dateWarning
        } catch (e: any) {
          return JSON.stringify({ error: `读取页面失败: ${e?.message || e}` })
        }
      }
      case 'web_search':
      case 'ac_web_search':
      case 'search': {
        const query = args.query || args.q || ''
        if (!query) return JSON.stringify({ error: 'No query provided' })
        const searchCacheKey = `search:${query}`
        const searchCached = cacheGet(searchCacheKey)
        if (searchCached) return searchCached
        try {
          const results = await multiSearch(query, 5)
          if (results.length > 0) {
            const formatted = formatSearchResults(results)
            cacheSet(searchCacheKey, formatted)
            return formatted
          }
        } catch (e) { console.warn('[Search] Multi-search failed:', (e as Error).message) }
        // Fallback: LLM
        try {
          const providers = kvList('providers').filter((p: any) => p.apiKey && p.enabled !== false)
          if (providers.length > 0) {
            const prov = providers[0]
            const modelEntry = kvList('models').find((m: any) => m.provider === prov.id && m.enabled !== false)
            const modelId = modelEntry?.apiId || modelEntry?.id || prov.models?.[0]?.id || 'gpt-4o-mini'
            const apiBase = (prov.baseUrl || '').replace(/\/+$/, '') + '/chat/completions'
            const resp = await fetch(apiBase, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${prov.apiKey}` },
              body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: query }], max_tokens: 2048 }),
              signal: AbortSignal.timeout(60000)
            })
            if (resp.ok) {
              const data = await resp.json()
              const content = data.choices?.[0]?.message?.content
              if (content && content.length > 5) { cacheSet(searchCacheKey, content); return content }
            }
          }
        } catch (e) { console.warn('[Search] LLM fallback failed:', (e as Error).message) }
        return '暂时无法获取信息，请稍后重试。'
      }
      // Sina Finance: real-time stock quotes
      case 'stock_quote':
      case 'ac_stock_quote': {
        const code = args.code || args.symbol || args.stock || ''
        if (!code) return JSON.stringify({ error: 'No stock code provided' })
        try {
          const quote = await getStockQuote(code)
          if (quote) return formatStockQuote(quote)
          return JSON.stringify({ error: `Stock not found: ${code}` })
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }
      // Market overview: indices + breadth
      case 'market_overview':
      case 'ac_market_overview': {
        try {
          const [indices, overview] = await Promise.all([getMarketIndices(), getMarketOverview()])
          return formatMarketOverview(indices, overview)
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }
      // Baidu Baike: knowledge lookup
      case 'baike_lookup':
      case 'ac_baike': {
        const keyword = args.keyword || args.query || args.q || ''
        if (!keyword) return JSON.stringify({ error: 'No keyword provided' })
        try {
          const result = await searchBaike(keyword)
          if (result) return `${result.title}\n${result.summary}\n来源: ${result.url}`
          return `百度百科未找到"${keyword}"的相关词条`
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }
      // News search
      case 'news_search':
      case 'ac_news': {
        const query = args.query || args.q || ''
        if (!query) return JSON.stringify({ error: 'No query provided' })
        try {
          const news = await searchNews(query, args.max || 5)
          if (news.length === 0) return '未找到相关新闻'
          const today = new Date().toISOString().slice(0, 10)
          const lines = news.map((n, i) => `${i + 1}. ${n.title}${n.time ? ' [' + n.time + ']' : ''}\n   来源: ${n.source}\n   ${n.url}`)
          return `[新闻搜索 | ${today}]\n${lines.join('\n\n')}`
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }
      // Exchange rates
      case 'exchange_rate':
      case 'ac_forex': {
        const from = (args.from || args.from_currency || 'USD').toUpperCase()
        const to = (args.to || args.to_currency || 'CNY').toUpperCase()
        try {
          const rate = await getExchangeRate(from, to)
          if (rate) return `${from}/${to} 汇率: ${rate.rate.toFixed(4)}\n日期: ${rate.date}`
          return JSON.stringify({ error: `Exchange rate not found: ${from}/${to}` })
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }
      // Cross-reference verification
      case 'verify_fact':
      case 'ac_verify': {
        const claim = args.claim || args.statement || args.query || ''
        if (!claim) return JSON.stringify({ error: 'No claim to verify' })
        try {
          const result = await crossReference(claim)
          const lines = [`可信度: ${result.confidence === 'high' ? '高' : result.confidence === 'medium' ? '中' : '低'}`]
          for (const s of result.sources) {
            lines.push(`- ${s.source}: ${s.supports ? '支持' : '未确认'} | ${s.detail}`)
          }
          return lines.join('\n')
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }
      // Weather forecast
      case 'weather':
      case 'ac_weather': {
        const city = args.city || args.location || args.q || ''
        if (!city) return JSON.stringify({ error: 'No city provided' })
        try {
          const w = await getWeather(city)
          if (w) return formatWeather(w)
          return JSON.stringify({ error: `Weather data not found for: ${city}` })
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }
      // Hot search / trending topics
      case 'hot_search':
      case 'ac_hot_search': {
        const platform = args.platform || 'weibo'
        const max = args.max || 10
        try {
          const items = await getHotSearch(platform, max)
          if (items.length > 0) return formatHotSearch(items, platform)
          return `未找到${platform}热搜数据`
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }
      // Daily news briefing
      case 'daily_briefing':
      case 'ac_daily_briefing': {
        try {
          const briefing = await getDailyBriefing()
          return briefing || '暂时无法获取每日简报'
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }
      // Poetry / famous quotes
      case 'poetry':
      case 'ac_poetry': {
        try {
          const p = await getPoetry()
          if (p) return formatPoetry(p)
          return '暂时无法获取诗词'
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }
      // History today
      case 'history_today':
      case 'ac_history_today': {
        try {
          const events = await getHistoryToday()
          if (events.length === 0) return '未找到今天的历史事件'
          const today = new Date()
          const dateStr = `${today.getMonth() + 1}月${today.getDate()}日`
          const lines = events.map((e, i) => `${i + 1}. [${e.year}] ${e.title}`)
          return `[历史上的今天 | ${dateStr}]\n${lines.join('\n')}`
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }
      // IP geolocation
      case 'ip_lookup':
      case 'ac_ip_lookup': {
        try {
          const loc = await lookupIP(args.ip)
          if (loc) return `IP: ${loc.ip}\n位置: ${loc.country} ${loc.region} ${loc.city}\nISP: ${loc.isp}`
          return JSON.stringify({ error: 'IP lookup failed' })
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }
      // GitHub mirror diagnostics
      case 'ac_github_mirror': {
        try {
          await warmupMirrors()
          const testUrl = 'https://github.com/XiaomiMiMo/MiMo-Code'
          const result = await fetchWithMirror(testUrl, { timeout: 8000 })
          return [
            'GitHub 镜像状态:',
            `  直连: ${result.source === 'direct' ? '✓ 可用' : '✗ 不可用'}`,
            `  最终来源: ${result.source}`,
            `  测试URL: ${testUrl}`,
            result.ok ? '  结果: ✓ 可正常访问 GitHub' : `  结果: ✗ ${result.error}`,
          ].join('\n')
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }
      // Random joke
      case 'joke':
      case 'ac_joke': {
        try {
          const joke = await getJoke()
          return joke || '暂时无法获取笑话'
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }
      // Government macro stats
      case 'gov_stats':
      case 'ac_gov_stats': {
        const indicator = args.indicator || args.metric || args.q || ''
        if (!indicator) return JSON.stringify({ error: 'No indicator provided. Try: GDP, CPI, PPI, 人口, 失业率, 社零, 工业增加值' })
        try {
          const result = await getGovStats(indicator)
          return result || `未找到"${indicator}"的统计数据`
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }

      // ══════════ Workflow Skills ══════════

      // Task decomposition
      case 'task_decompose': {
        const desc = args.description || args.task || args.query || ''
        if (!desc) return JSON.stringify({ error: 'No task description provided' })
        try {
          const result = taskDecompose(desc)
          return formatDecomposedTask(result)
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }
      // Decision analysis
      case 'decision_analysis': {
        const question = args.question || args.query || ''
        const options = args.options || []
        if (!question) return JSON.stringify({ error: 'No decision question provided' })
        if (!Array.isArray(options) || options.length < 2) return JSON.stringify({ error: 'Need at least 2 options to compare' })
        try {
          const result = decisionAnalysis(question, options)
          return formatDecision(result)
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }
      // Workflow template matching
      case 'workflow_template': {
        const taskDesc = args.description || args.task || args.query || ''
        const action = args.action || 'match'
        try {
          if (action === 'list') {
            const templates = listWorkflowTemplates()
            return templates.map(t => `${t.id}: ${t.name} — ${t.description}`).join('\n')
          }
          if (taskDesc) {
            const matched = matchWorkflowTemplate(taskDesc)
            if (matched) return formatWorkflowTemplate(matched)
            return '未匹配到合适的工作流模板，可尝试: list 查看所有模板'
          }
          return JSON.stringify({ error: 'Provide a task description or action=list' })
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }
      // Progress tracking
      case 'progress_track': {
        const action = args.action || 'report'
        try {
          if (action === 'start') {
            const title = args.title || args.task || 'Task'
            const steps = args.steps || []
            if (!Array.isArray(steps) || steps.length === 0) return JSON.stringify({ error: 'Provide steps array' })
            const progress = startProgress(title, steps)
            return `进度跟踪已启动: ${progress.taskTitle}\n共 ${progress.entries.length} 个步骤`
          }
          if (action === 'update') {
            const stepIndex = args.step ?? args.stepIndex
            const status = args.status || 'completed'
            if (stepIndex === undefined) return JSON.stringify({ error: 'Provide step index' })
            const updated = updateStepStatus(stepIndex, status, args.note)
            if (!updated) return JSON.stringify({ error: 'No active progress tracking' })
            return getProgressReport() || 'No progress'
          }
          if (action === 'clear') {
            clearProgress()
            return '进度跟踪已清除'
          }
          // Default: report
          return getProgressReport() || '当前没有进行中的任务跟踪'
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }
      // Project planning
      case 'project_plan': {
        const name = args.name || args.project || args.query || 'Project'
        const objective = args.objective || args.goal || args.description || ''
        const constraints = args.constraints || []
        if (!objective) return JSON.stringify({ error: 'Provide project objective' })
        try {
          const plan = createProjectPlan(name, objective, constraints)
          return formatProjectPlan(plan)
        } catch (e) { return JSON.stringify({ error: (e as Error).message }) }
      }

      case 'memory_search': {
        const query = args.query || args.q || ''
        return JSON.stringify(kvList('memory').filter((m: any) => m.content.toLowerCase().includes(query.toLowerCase())).slice(0, 10))
      }
      case 'memory_add':
      case 'memory_save': {
        const content = args.content || ''
        if (!content) return JSON.stringify({ error: 'No content provided' })
        const id = 'mem-' + Date.now()
        const category = args.category || 'general'
        kvUpsert('memory', id, { id, content, category, importance: 0.5, createdAt: new Date().toISOString() })
        try { require('../storage/db').memoryFtsUpsert(id, content, category) } catch {}
        return JSON.stringify({ ok: true, id, content: content.slice(0, 100) })
      }
      case 'ac_data_analyze':
      case 'ac_chart_generate':
      case 'code_execute': {
        const code = args.code || args.script || ''
        const lang = args.language || args.lang || 'javascript'
        if (lang === 'python' || lang === 'py') {
          const tmpFile = join(app.getPath('userData'), 'data', '_exec_' + Date.now() + '.py')
          const safeCode = `
import sys, builtins
_trusted = {'pandas', 'numpy', 'akshare', 'requests', 'matplotlib', 'scipy', 'sklearn'}
_direct_allowed = {'json', 'datetime', 'collections', 'math', 're', 'csv', 'io', 'urllib', 'http', 'html', 'copy', 'functools', 'itertools', 'operator', 'string', 'textwrap', 'unicodedata', 'time', 'random', 'statistics', 'decimal', 'fractions', 'hashlib', 'hmac', 'base64', 'binascii', 'struct', 'array', 'queue', 'heapq', 'bisect', 'types', 'enum', 'dataclasses', 'typing', 'pathlib', 'tempfile', 'glob', 'fnmatch', 'shutil', 'warnings', 'contextlib', 'abc', 'numbers'}
_nesting = [0]
_real_import = builtins.__import__
def _safe_import(name, *args, **kwargs):
    top = name.split('.')[0]
    if _nesting[0] > 0:
        _nesting[0] += 1
        try:
            return _real_import(name, *args, **kwargs)
        finally:
            _nesting[0] -= 1
    if top in _trusted:
        _nesting[0] = 1
        try:
            return _real_import(name, *args, **kwargs)
        finally:
            _nesting[0] = 0
    if top in _direct_allowed:
        return _real_import(name, *args, **kwargs)
    raise ImportError(f"Import of '{name}' is blocked for security")
builtins.__import__ = _safe_import
del sys, builtins
${code}
`
          writeFileSync(tmpFile, safeCode)
          try { return await asyncExec(`python "${tmpFile}"`, { timeout: 30000, windowsHide: true }) } finally { try { require('fs').unlinkSync(tmpFile) } catch {} }
        } else {
          // JavaScript: run in sandboxed vm with no access to process/require
          const vm = require('vm')
          let output = ''
          const sandbox: any = {
            console: { log: (...a: any[]) => { output += a.join(' ') + '\n' }, error: (...a: any[]) => { output += '[error] ' + a.join(' ') + '\n' }, warn: (...a: any[]) => { output += '[warn] ' + a.join(' ') + '\n' } },
            result: null,
            Math, Date, JSON, parseInt, parseFloat, isNaN, isFinite,
            Array, Object, String, Number, Boolean, RegExp, Map, Set,
            Promise, Error, TypeError, RangeError, SyntaxError,
            setTimeout: undefined, setInterval: undefined, clearTimeout: undefined, clearInterval: undefined,
            fetch: undefined, XMLHttpRequest: undefined,
          }
          try {
            vm.runInNewContext(code, sandbox, { timeout: 5000, displayErrors: false })
            return output || String(sandbox.result || 'undefined')
          } catch (e) { return 'Error: ' + (e as Error).message }
        }
      }
      case 'translate': {
        const text = args.text || ''
        const target = args.target || args.to || 'en'
        if (!text) return JSON.stringify({ error: 'No text provided' })
        try {
          const providers = kvList('providers').filter((p: any) => p.apiKey && p.enabled !== false)
          if (providers.length > 0) {
            const prov = providers[0]
            const modelId = prov.models?.[0]?.id || 'gpt-4o-mini'
            const apiBase = (prov.baseUrl || '').replace(/\/+$/, '') + '/chat/completions'
            const resp = await fetch(apiBase, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${prov.apiKey}` },
              body: JSON.stringify({
                model: modelId, stream: false, max_tokens: 2000,
                messages: [{ role: 'user', content: `Translate the following text to ${target}. Return ONLY the translation, no explanations.\n\n${text}` }]
              }),
              signal: AbortSignal.timeout(15000)
            })
            const data = await resp.json()
            const content = data.choices?.[0]?.message?.content
            if (content) return content
          }
        } catch (e) { console.warn('[Translate] LLM failed:', (e as Error).message) }
        return `[Translation unavailable - no provider configured] ${text}`
      }
      case 'browser':
      case 'ac_browser': {
        const url = args.url || ''
        if (!url) return JSON.stringify({ error: 'No URL provided' })
        try {
          const parsed = new URL(url)
          if (!['http:', 'https:'].includes(parsed.protocol)) return JSON.stringify({ error: 'Only http/https URLs allowed' })
        } catch { return JSON.stringify({ error: 'Invalid URL' }) }
        const { shell } = require('electron')
        shell.openExternal(url)
        return JSON.stringify({ ok: true, url })
      }
      default: {
        // Check custom skills (skill_xxx)
        if (name.startsWith('skill_')) {
          const toolSuffix = name.slice(6) // part after 'skill_'
          const skills = kvList('skills')
          // Match by same transform used during injection: id.replace(/[^a-zA-Z0-9_]/g, '_')
          const skill = skills.find((s: any) => s.id.replace(/[^a-zA-Z0-9_]/g, '_') === toolSuffix)
          if (skill?.execute) {
            let script = skill.execute
            // Substitute {param} placeholders with args
            const input = args.input || args.query || args.text || JSON.stringify(args)
            // Sanitize: escape shell metacharacters in user input
            const esc = (s: string) => s.replace(/(["$`\\!|;&<>(){}[\]*?~])/g, '\\$1')
            const safeInput = esc(input)
            script = script.replace(/\{input\}/g, safeInput).replace(/\{query\}/g, esc(args.query || input)).replace(/\{text\}/g, esc(args.text || input))
            for (const [k, v] of Object.entries(args)) {
              script = script.replace(new RegExp(`\\{${k}\\}`, 'g'), esc(String(v)))
            }
            return asyncExec(script, { timeout: 30000, windowsHide: true })
          }
        }
        return JSON.stringify({ error: `Unknown tool: ${name}` })
      }
    }
  } catch (e) { return translateError(JSON.stringify({ error: (e as Error).message })) }
}

// ══════════ Parameter Pre-Validation ══════════

interface ParamRule {
  required?: string[]       // required param names
  defaults?: Record<string, any>  // default values for missing optional params
  fix?: (args: Record<string, any>) => Record<string, any>  // custom fixer
}

const TOOL_PARAM_RULES: Record<string, ParamRule> = {
  read_file: { required: ['path'], fix: a => ({ ...a, path: a.path || a.file_path || a.filePath || '' }) },
  ac_read_file: { required: ['path'], fix: a => ({ ...a, path: a.path || a.file_path || a.filePath || '' }) },
  read: { required: ['path'], fix: a => ({ ...a, path: a.path || a.file_path || a.filePath || '' }) },
  write_file: { required: ['path', 'content'], fix: a => ({ ...a, path: a.path || a.file_path || a.filePath || '', content: a.content || '' }) },
  ac_write_file: { required: ['path', 'content'], fix: a => ({ ...a, path: a.path || a.file_path || a.filePath || '', content: a.content || '' }) },
  write: { required: ['path', 'content'], fix: a => ({ ...a, path: a.path || a.file_path || a.filePath || '', content: a.content || '' }) },
  execute_command: { required: ['command'], fix: a => ({ ...a, command: a.command || a.cmd || '' }) },
  terminal: { required: ['command'], fix: a => ({ ...a, command: a.command || a.cmd || '' }) },
  ac_terminal: { required: ['command'], fix: a => ({ ...a, command: a.command || a.cmd || '' }) },
  web_search: { required: ['query'], fix: a => ({ ...a, query: a.query || a.q || '' }) },
  ac_web_search: { required: ['query'], fix: a => ({ ...a, query: a.query || a.q || '' }) },
  search: { required: ['query'], fix: a => ({ ...a, query: a.query || a.q || '' }) },
  read_url: { required: ['url'], fix: a => ({ ...a, url: a.url || '' }) },
  ac_read_url: { required: ['url'], fix: a => ({ ...a, url: a.url || '' }) },
  read_website: { required: ['url'], fix: a => ({ ...a, url: a.url || '' }) },
  code_execute: { required: ['code'], fix: a => ({ ...a, code: a.code || a.script || '', language: a.language || a.lang || 'javascript' }) },
  memory_search: { required: ['query'], fix: a => ({ ...a, query: a.query || a.q || '' }) },
  memory_add: { required: ['content'], fix: a => ({ ...a, content: a.content || '' }) },
  translate: { required: ['text'], fix: a => ({ ...a, text: a.text || '', target: a.target || a.to || 'en' }) },
  // New data providers
  weather: { required: ['city'], fix: a => ({ ...a, city: a.city || a.location || a.q || '' }) },
  ac_weather: { required: ['city'], fix: a => ({ ...a, city: a.city || a.location || a.q || '' }) },
  hot_search: { defaults: { platform: 'weibo' }, fix: a => ({ ...a, platform: a.platform || 'weibo' }) },
  ac_hot_search: { defaults: { platform: 'weibo' }, fix: a => ({ ...a, platform: a.platform || 'weibo' }) },
  gov_stats: { required: ['indicator'], fix: a => ({ ...a, indicator: a.indicator || a.metric || a.q || '' }) },
  ac_gov_stats: { required: ['indicator'], fix: a => ({ ...a, indicator: a.indicator || a.metric || a.q || '' }) },
  // Workflow skills
  task_decompose: { required: ['description'], fix: a => ({ ...a, description: a.description || a.task || a.query || '' }) },
  decision_analysis: { required: ['question', 'options'], fix: a => ({ ...a, question: a.question || a.query || '', options: a.options || [] }) },
  project_plan: { required: ['objective'], fix: a => ({ ...a, name: a.name || a.project || 'Project', objective: a.objective || a.goal || a.description || '' }) },
  progress_track: { defaults: { action: 'report' }, fix: a => ({ ...a, action: a.action || 'report' }) },
}

export function validateToolParams(name: string, args: Record<string, any>): { ok: boolean; args: Record<string, any>; error?: string } {
  const rule = TOOL_PARAM_RULES[name]
  if (!rule) return { ok: true, args } // no rules = pass through

  // Apply fixer (normalizes aliases)
  const fixed = rule.fix ? rule.fix(args) : args

  // Check required params
  if (rule.required) {
    for (const param of rule.required) {
      const val = fixed[param]
      if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
        return { ok: false, args: fixed, error: `Missing required parameter: ${param}` }
      }
    }
  }

  return { ok: true, args: fixed }
}

// ══════════ Output Quality Detection ══════════

export interface OutputQuality {
  ok: boolean
  issue?: string
  severity?: 'warn' | 'error'
}

export function checkOutputQuality(toolName: string, result: string): OutputQuality {
  if (!result || result.length === 0) {
    return { ok: false, issue: `Tool "${toolName}" returned empty result`, severity: 'error' }
  }

  // Detect JSON error responses
  if (result.startsWith('{') && /"error"\s*:/i.test(result)) {
    return { ok: false, issue: `Tool "${toolName}" returned error: ${result.slice(0, 200)}`, severity: 'error' }
  }

  // Detect timeout
  if (result.includes('[ERROR]') && result.toLowerCase().includes('timed out')) {
    return { ok: false, issue: `Tool "${toolName}" timed out`, severity: 'error' }
  }

  // Detect truncated JSON (tool output that looks like cut-off JSON)
  if (result.startsWith('{') || result.startsWith('[')) {
    const openBraces = (result.match(/{/g) || []).length - (result.match(/}/g) || []).length
    const openBrackets = (result.match(/\[/g) || []).length - (result.match(/]/g) || []).length
    if (openBraces > 0 || openBrackets > 0) {
      return { ok: false, issue: `Tool "${toolName}" output appears truncated (unmatched brackets)`, severity: 'warn' }
    }
  }

  // Detect suspiciously short results for tools that should return more
  const EXPECTED_MIN_LENGTH: Record<string, number> = {
    read_file: 10, ac_read_file: 10, read: 10,
    web_search: 20, ac_web_search: 20, search: 20,
    read_url: 30, ac_read_url: 30, read_website: 30,
    code_execute: 5,
  }
  const minLen = EXPECTED_MIN_LENGTH[toolName]
  if (minLen && result.length < minLen && !result.includes('error')) {
    return { ok: false, issue: `Tool "${toolName}" returned suspiciously short result (${result.length} chars)`, severity: 'warn' }
  }

  return { ok: true }
}

// ══════════ Tool Result Compression ══════════

/**
 * Compress tool results before adding to conversation context.
 * Saves tokens by removing redundancy while preserving key information.
 */
export function compressToolResult(toolName: string, result: string, maxLen = 8000): string {
  if (result.length <= maxLen) return result

  let compressed = result

  // Strip HTML artifacts if present
  if (compressed.includes('<') && compressed.includes('>')) {
    compressed = compressed
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/g, ' ')
  }

  // Collapse multiple blank lines
  compressed = compressed.replace(/\n{3,}/g, '\n\n')

  // Remove repetitive separators (---, ===, ***)
  compressed = compressed.replace(/([-*=])\1{5,}/g, '$1$1$1')

  // For code: remove consecutive blank lines and trailing whitespace
  if (/\.(js|ts|py|cpp|java|go|rs)$/i.test(toolName) || compressed.includes('function ') || compressed.includes('def ')) {
    compressed = compressed
      .replace(/[ \t]+$/gm, '') // trailing whitespace
      .replace(/\n{3,}/g, '\n\n') // collapse blank lines
  }

  // Truncate with smart boundary (prefer line break)
  if (compressed.length > maxLen) {
    const truncated = compressed.slice(0, maxLen)
    const lastNewline = truncated.lastIndexOf('\n')
    compressed = (lastNewline > maxLen * 0.8 ? truncated.slice(0, lastNewline) : truncated) + '\n[... compressed, original ' + result.length + ' chars]'
  }

  return compressed
}
