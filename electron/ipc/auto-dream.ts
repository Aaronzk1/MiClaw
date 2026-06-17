/**
 * Auto-Dream — background memory distillation
 *
 * Periodically reads conversation history, extracts persistent insights,
 * and saves them to ~/.openclaw/workspace/MEMORY.md (loaded by OpenClaw agent).
 */

import { kvGet, kvUpsert, msgList, kvList } from '../storage/db'
import { gatewayChat, scanGatewayPort } from '../main/gateway'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const DREAM_INTERVAL = 7 * 24 * 60 * 60 * 1000   // 7 days
const MAX_CONVS_TO_ANALYZE = 10
const MAX_MESSAGES_PER_CONV = 50
const MAX_MEMORY_LINES = 100

interface DreamState {
  lastDream: number
}

function getState(): DreamState {
  return kvGet('config', 'auto_dream') as DreamState || { lastDream: 0 }
}

function saveState(state: DreamState) {
  kvUpsert('config', 'auto_dream', state)
}

function getMemoryPath(): string {
  return join(homedir(), '.openclaw', 'workspace', 'MEMORY.md')
}

function readMemoryFile(): string {
  const p = getMemoryPath()
  if (!existsSync(p)) return '# MEMORY.md - Long-term Memory\n\n_Auto-extracted from conversations. The agent reads this every session._\n\n'
  return readFileSync(p, 'utf8')
}

function writeMemoryFile(content: string) {
  writeFileSync(getMemoryPath(), content, 'utf8')
}

/**
 * Dream: extract facts and patterns from recent conversations.
 * Writes to MEMORY.md so OpenClaw agent can read them.
 */
export async function runDream(): Promise<{ ok: boolean; saved: number; error?: string }> {
  const state = getState()
  const now = Date.now()

  if (now - state.lastDream < DREAM_INTERVAL) {
    return { ok: true, saved: 0 }
  }

  try {
    const port = await scanGatewayPort()
    const cfg = kvGet('config', 'main') || {}
    const model = cfg.ai?.model || 'openclaw'

    const convs = (kvList('conversations') as any[])
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, MAX_CONVS_TO_ANALYZE)

    if (convs.length === 0) {
      saveState({ ...state, lastDream: now })
      return { ok: true, saved: 0 }
    }

    const snippets: string[] = []
    for (const conv of convs) {
      const msgs = (msgList(conv.id) as any[]).slice(-MAX_MESSAGES_PER_CONV)
      if (msgs.length === 0) continue
      const snippet = msgs
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => `[${m.role}]: ${(m.content || '').slice(0, 300)}`)
        .join('\n')
      if (snippet.length > 50) snippets.push(`### ${conv.title || conv.id}\n${snippet}`)
    }

    if (snippets.length === 0) {
      saveState({ ...state, lastDream: now })
      return { ok: true, saved: 0 }
    }

    const prompt = `你是一个记忆提炼器。分析以下对话历史，提取值得长期记住的信息。

要求：
1. 提取用户偏好（语言风格、输出格式、工作习惯）
2. 提取重要事实（项目信息、技术栈、常用工具）
3. 提取模式（用户经常问什么类型的问题、常见工作流）
4. 不要提取临时信息（具体代码片段、一次性任务细节）
5. 每条记忆应该是一行，简洁可搜索

返回纯文本，每条记忆一行，以 "- " 开头。最多返回10条。不要返回JSON或其他格式。

对话历史:
${snippets.join('\n\n---\n\n').slice(0, 12000)}`

    const response = await gatewayChat(port, model, [{ role: 'user', content: prompt }], 60000)
    const lines = response.split('\n')
      .map(l => l.replace(/^[-*]\s*/, '').trim())
      .filter(l => l.length > 10 && l.length < 200)

    if (lines.length === 0) {
      saveState({ ...state, lastDream: now })
      return { ok: true, saved: 0 }
    }

    // Append to MEMORY.md
    const existing = readMemoryFile()
    const existingLines = existing.split('\n').filter(l => l.startsWith('- '))
    const newLines = lines.filter(l => !existingLines.some(el => el.includes(l.slice(0, 30))))

    if (newLines.length > 0) {
      const dateStr = new Date().toISOString().split('T')[0]
      const entry = `\n## Auto-extracted (${dateStr})\n${newLines.map(l => `- ${l}`).join('\n')}\n`
      let content = existing.trimEnd() + '\n' + entry

      // Trim if too long
      const allLines = content.split('\n')
      if (allLines.length > MAX_MEMORY_LINES * 3) {
        const header = allLines.slice(0, 5).join('\n')
        const recent = allLines.slice(-MAX_MEMORY_LINES * 2).join('\n')
        content = header + '\n\n_(earlier entries trimmed)_\n\n' + recent
      }

      writeMemoryFile(content)
      console.log(`[AutoDream] Added ${newLines.length} memories to MEMORY.md`)
    }

    saveState({ ...state, lastDream: now })
    return { ok: true, saved: newLines.length }
  } catch (e: any) {
    return { ok: false, saved: 0, error: e?.message }
  }
}

/**
 * Start auto-dream background scheduler.
 */
export function startAutoDream() {
  setTimeout(async () => {
    try {
      const result = await runDream()
      if (result.saved > 0) console.log('[AutoDream] Saved', result.saved, 'memories')
    } catch {}
  }, 30_000)

  setInterval(async () => {
    try { await runDream() } catch {}
  }, 60 * 60 * 1000)
}
