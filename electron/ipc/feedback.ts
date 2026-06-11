import { kvUpsert, kvGet, kvList, memoryFtsUpsert } from '../storage/db'
import { smartSaveMemory } from './memory-manager'
import { logger } from './logger'

// B05: Behavior feedback learning — detect user corrections and save as memory
const CORRECTION_PATTERNS: Array<{ pattern: RegExp; memory: string }> = [
  { pattern: /太长|太啰嗦|简洁点|太详细|简短/, memory: '用户偏好简短回复，一句话即可' },
  { pattern: /别废话|不要解释|直接做|不要说步骤/, memory: '用户不喜欢步骤说明，直接执行' },
  { pattern: /你是不是想偷懒|全部都要|都要做|别偷懒/, memory: '用户要求完整执行，不能偷懒' },
  { pattern: /不对|错了|重来|重新|搞错了/, memory: '上次操作有误，需要重新检查' },
  { pattern: /^继续$|^接着$|^别停$/, memory: '用户希望连续执行不中断' },
  { pattern: /太慢了|快点|加速/, memory: '用户希望快速响应' },
  { pattern: /中文|说中文|用中文/, memory: '用户希望用中文回复' },
  { pattern: /换个方式|换个思路|重新想/, memory: '用户希望看到不同的解决方案' },
  { pattern: /不要用.*工具|别用.*命令/, memory: '用户不希望使用特定工具或命令' },
  { pattern: /解释一下|详细说|展开讲/, memory: '用户希望更详细的解释' },
]

// Emotional tone detection — returns detected emotion and suggested response adjustment
export type EmotionalTone = 'frustrated' | 'urgent' | 'satisfied' | 'confused' | 'neutral'

export function detectEmotionalTone(message: string): { tone: EmotionalTone; hint: string } {
  const lower = message.toLowerCase().trim()

  // Frustration signals
  if (/烦|操|靠|草|妈的|什么鬼|垃圾|废物|蠢|笨|傻|滚|去死|受不了|崩溃|无语|服了/.test(lower)) {
    return { tone: 'frustrated', hint: '用户情绪不佳，保持冷静、简洁、直接解决问题，不要解释原因，不要道歉过多' }
  }
  if (/怎么又|又出错|还是不行|还是错|还是没|搞什么|到底行不行/.test(lower)) {
    return { tone: 'frustrated', hint: '用户对反复失败感到沮丧，立即给出解决方案，不要重复之前失败的步骤' }
  }

  // Urgency signals
  if (/急|马上|立刻|尽快|赶紧|快|紧急|asap|urgent|immediately/.test(lower)) {
    return { tone: 'urgent', hint: '用户需要快速响应，跳过不必要的解释，直接给出结果或行动' }
  }
  if (/今天|明天|截止|deadline|来不及|赶/.test(lower)) {
    return { tone: 'urgent', hint: '用户有时间压力，优先执行，减少讨论' }
  }

  // Satisfaction signals
  if (/好|棒|赞|不错|厉害|牛|完美|太好了|感谢|谢谢|thank|great|perfect|awesome/.test(lower)) {
    return { tone: 'satisfied', hint: '用户对结果满意，可以适当保持当前的工作方式' }
  }

  // Confusion signals
  if (/什么意思|没看懂|不理解|不懂|啥意思|怎么看|怎么用|然后呢|然后怎么|为什么/.test(lower)) {
    return { tone: 'confused', hint: '用户可能没理解，用更简单的语言解释，给出具体例子' }
  }

  return { tone: 'neutral', hint: '' }
}

// Get the current emotional context for the system prompt
let currentEmotion: { tone: EmotionalTone; hint: string } = { tone: 'neutral', hint: '' }

export function setEmotionalContext(message: string): void {
  currentEmotion = detectEmotionalTone(message)
}

export function getEmotionalContext(): { tone: EmotionalTone; hint: string } {
  return currentEmotion
}

// Real-time behavior mode — adjusts response style immediately
export interface BehaviorMode {
  verbose: boolean      // false = concise, true = detailed
  explainSteps: boolean // false = just do it, true = explain
  speed: 'normal' | 'fast'  // fast = skip non-essential checks
  language: 'auto' | 'zh' | 'en'
  bannedTools: string[] // tools user explicitly said not to use
}

const defaultBehavior: BehaviorMode = {
  verbose: true,
  explainSteps: true,
  speed: 'normal',
  language: 'auto',
  bannedTools: [],
}

let currentBehavior: BehaviorMode = { ...defaultBehavior }

export function getBehaviorMode(): BehaviorMode {
  return { ...currentBehavior }
}

export function resetBehaviorMode(): void {
  currentBehavior = { ...defaultBehavior }
}

export function getBehaviorHint(): string {
  const hints: string[] = []
  if (!currentBehavior.verbose) hints.push('回复简洁，一句话说明结果')
  if (!currentBehavior.explainSteps) hints.push('不要解释步骤，直接执行')
  if (currentBehavior.speed === 'fast') hints.push('快速响应，跳过非必要检查')
  if (currentBehavior.language === 'zh') hints.push('必须用中文回复')
  if (currentBehavior.language === 'en') hints.push('Reply in English only')
  if (currentBehavior.bannedTools.length > 0) hints.push(`禁止使用: ${currentBehavior.bannedTools.join(', ')}`)
  return hints.length > 0 ? `[BehaviorMode] ${hints.join(' | ')}` : ''
}

/**
 * Unified response guidance — merges all behavioral signals into ONE coherent hint.
 * Priority: User explicit > Emotional tone > Proactive suggestions > Default
 * Prevents conflicts between systems.
 */
export function getUnifiedResponseGuidance(proactiveSuggestions: string[], taskProgressHint: string | null, experienceHint?: string | null): string {
  const lines: string[] = []

  // Priority 1: User explicit behavior (highest — never overridden)
  if (!currentBehavior.verbose) lines.push('回复简洁，一句话说明结果')
  if (!currentBehavior.explainSteps) lines.push('不要解释步骤，直接执行')
  if (currentBehavior.speed === 'fast') lines.push('快速响应')
  if (currentBehavior.language === 'zh') lines.push('用中文回复')
  if (currentBehavior.language === 'en') lines.push('Reply in English')
  if (currentBehavior.bannedTools.length > 0) lines.push(`禁用工具: ${currentBehavior.bannedTools.join(', ')}`)

  // Priority 2: Emotional tone (adapts style, doesn't override explicit)
  if (currentEmotion.tone !== 'neutral' && currentEmotion.hint) {
    // Only inject emotion hint if it doesn't conflict with behavior mode
    if (currentEmotion.tone === 'frustrated' && !currentBehavior.verbose) {
      // User frustrated + wants concise → just be direct, skip the empathy fluff
      lines.push('用户情绪不佳，直接解决问题')
    } else if (currentEmotion.tone === 'frustrated') {
      lines.push(currentEmotion.hint)
    } else if (currentEmotion.tone === 'urgent') {
      lines.push(currentEmotion.hint)
    }
    // satisfied/confused don't need special handling when behavior mode is set
  }

  // Priority 3: Task progress (logic — always useful, never conflicts)
  if (taskProgressHint) lines.push(taskProgressHint)

  // Priority 3.5: Experience reuse (past successful approaches)
  if (experienceHint) lines.push(experienceHint)

  // Priority 4: Proactive suggestions (lowest — suppress if user wants concise/fast)
  if (proactiveSuggestions.length > 0 && currentBehavior.verbose && currentBehavior.speed !== 'fast') {
    // Only show proactive suggestions if user hasn't asked for concise/fast mode
    lines.push(`建议: ${proactiveSuggestions[0]}`) // Max 1 suggestion to avoid noise
  }

  return lines.length > 0 ? lines.join('\n') : ''
}

// Experience reuse — look up similar past successful tasks from memory
export function getExperienceHint(message: string): string | null {
  try {
    const memories = kvList('memory')
    // Find task profiles that match the current request
    const taskProfiles = memories.filter((m: any) => m.category === 'task_profile' && m.content)
    if (taskProfiles.length === 0) return null

    const lower = message.toLowerCase()
    const keywords = lower.split(/\s+/).filter(w => w.length > 2)

    // Score task profiles by keyword overlap
    const scored = taskProfiles.map((tp: any) => {
      const content = (tp.content || '').toLowerCase()
      const matchCount = keywords.filter(k => content.includes(k)).length
      return { content: tp.content, score: matchCount }
    }).filter(s => s.score >= 2).sort((a, b) => b.score - a.score)

    if (scored.length > 0) {
      // Extract the approach from the best match
      const best = scored[0].content
      // Task profile format: "Task: "xxx" | Tools: xxx | Agent: xxx | Success"
      const toolsMatch = best.match(/Tools:\s*([^|]+)/)
      if (toolsMatch) {
        return `[Experience] 类似任务"${best.slice(0, 60)}"曾使用 ${toolsMatch[1].trim()} 成功完成，可参考此方法。`
      }
    }
  } catch {}
  return null
}

export function learnFromFeedback(message: string): void {
  const lower = message.toLowerCase()

  // Update behavior mode in real-time
  if (/太长|太啰嗦|简洁点|太详细|简短/.test(lower)) {
    currentBehavior.verbose = false
  }
  if (/详细|展开|具体|详细说/.test(lower)) {
    currentBehavior.verbose = true
  }
  if (/别废话|不要解释|直接做|不要说步骤/.test(lower)) {
    currentBehavior.explainSteps = false
  }
  if (/解释一下|详细说|展开讲/.test(lower)) {
    currentBehavior.explainSteps = true
  }
  if (/太慢了|快点|加速/.test(lower)) {
    currentBehavior.speed = 'fast'
  }
  if (/中文|说中文|用中文/.test(lower)) {
    currentBehavior.language = 'zh'
  }
  if (/english|speak english|in english/.test(lower)) {
    currentBehavior.language = 'en'
  }
  // Banned tools detection
  const bannedMatch = lower.match(/不要用(\w+)|别用(\w+)/)
  if (bannedMatch) {
    const tool = bannedMatch[1] || bannedMatch[2]
    if (tool && !currentBehavior.bannedTools.includes(tool)) {
      currentBehavior.bannedTools.push(tool)
    }
  }

  for (const { pattern, memory } of CORRECTION_PATTERNS) {
    if (pattern.test(message)) {
      const id = 'mem-feedback-' + Date.now()
      if (smartSaveMemory(id, memory, 'user_pref', 0.9)) {
        logger.info('B05', `Learned: ${memory}`)
      }
      break
    }
  }

  // P2-2: User profile enrichment — detect technical level and domain interests

  // Detect technical vocabulary level
  const techTerms = ['api', 'sdk', '框架', '数据库', 'docker', 'kubernetes', '微服务', '架构', '算法', '并发', '异步', '回调', 'promise', 'async', 'await', 'typescript', 'webpack', 'vite', 'redis', 'mysql', 'nginx', 'linux', 'git']
  const techCount = techTerms.filter(t => lower.includes(t)).length
  if (techCount >= 3) {
    const id = 'mem-profile-tech-' + Date.now()
    smartSaveMemory(id, '用户技术水平较高，熟悉多种技术栈，可以用专业术语沟通', 'user_profile', 0.5)
  }

  // Detect domain interests
  const domainMap: Record<string, string[]> = {
    '金融': ['股票', '基金', '理财', '投资', '行情', 'K线', '涨跌', '大盘'],
    '开发': ['代码', '编程', '开发', '调试', 'bug', '部署', '测试'],
    '数据': ['数据', '分析', '统计', '可视化', '图表', '模型'],
    '内容': ['文章', '文案', '写作', '内容', '创作', '脚本'],
    '运维': ['服务器', '运维', '部署', '监控', '日志', '性能'],
  }
  for (const [domain, keywords] of Object.entries(domainMap)) {
    const matchCount = keywords.filter(k => lower.includes(k)).length
    if (matchCount >= 2) {
      const id = 'mem-profile-domain-' + Date.now()
      smartSaveMemory(id, `用户关注${domain}领域`, 'user_profile', 0.4)
      break
    }
  }

  // P3-1: Knowledge graph — extract entities from conversation
  extractEntities(message)
}

// P3-1: Entity extraction for knowledge graph
function extractEntities(message: string): void {
  // Extract project names (patterns like "XXX项目", "Project XXX", or paths like D:\XXX)
  const projectMatches = message.match(/[\w\\\/]+(?:项目|project|工程|repo)/gi) || []
  const pathMatch = message.match(/[A-Z]:\\[\w\\\/]+/g) || []
  const projects = [...new Set([...projectMatches, ...pathMatch])].slice(0, 3)

  // Extract technology names
  const techKeywords = ['React', 'Vue', 'Angular', 'Node.js', 'Python', 'Java', 'Go', 'Rust', 'TypeScript', 'Docker', 'Kubernetes', 'Redis', 'MySQL', 'PostgreSQL', 'MongoDB', 'Electron', 'Qt', 'C++', 'C#', 'Swift', 'Kotlin', 'Flutter', 'Next.js', 'Nuxt', 'Vite', 'Webpack', 'Tailwind', 'Prisma', 'Supabase', 'Firebase']
  const techs = techKeywords.filter(t => message.toLowerCase().includes(t.toLowerCase())).slice(0, 5)

  // Save entities to memory (smartSaveMemory handles deduplication)
  for (const project of projects) {
    const id = 'entity-proj-' + Date.now() + Math.random().toString(36).slice(2, 6)
    smartSaveMemory(id, `项目: ${project}`, 'entity', 0.6)
  }

  for (const tech of techs) {
    const id = 'entity-tech-' + Date.now() + Math.random().toString(36).slice(2, 6)
    smartSaveMemory(id, `技术栈: ${tech}`, 'entity', 0.5)
  }

  // Knowledge graph: create relationships when project + tech co-occur
  if (projects.length > 0 && techs.length > 0) {
    for (const project of projects.slice(0, 2)) {
      for (const tech of techs.slice(0, 3)) {
        const relContent = `关系: ${project} 使用 ${tech}`
        const id = 'rel-' + Date.now() + Math.random().toString(36).slice(2, 6)
        smartSaveMemory(id, relContent, 'entity', 0.55)
      }
    }
  }

  // Extract and save user action patterns for cross-conversation learning
  const actionPatterns = [
    { pattern: /(?:帮我|请|能不能).{0,10}(?:写|创建|生成|实现)/, action: '创建内容' },
    { pattern: /(?:帮我|请|能不能).{0,10}(?:查|搜索|查找|看看)/, action: '信息查询' },
    { pattern: /(?:帮我|请|能不能).{0,10}(?:分析|评估|对比|研究)/, action: '分析评估' },
    { pattern: /(?:帮我|请|能不能).{0,10}(?:修|修复|解决|处理)/, action: '问题修复' },
    { pattern: /(?:帮我|请|能不能).{0,10}(?:优化|改进|提升|重构)/, action: '优化改进' },
  ]
  for (const { pattern, action } of actionPatterns) {
    if (pattern.test(message)) {
      const id = 'action-' + Date.now() + Math.random().toString(36).slice(2, 6)
      smartSaveMemory(id, `用户常用操作: ${action}`, 'user_profile', 0.4)
      break
    }
  }
}

// Growth dimension: detect repeated task patterns and auto-generate skills
const taskPatternCounts = new Map<string, { count: number; lastSeen: number; examples: string[] }>()

// Persist pattern counts to DB
function persistPatterns(): void {
  try {
    const data: Record<string, any> = {}
    for (const [sig, d] of taskPatternCounts) data[sig] = d
    kvUpsert('config', 'pattern_counts', { patterns: data, savedAt: new Date().toISOString() })
  } catch {}
}

// Load pattern counts from DB on startup
export function loadPatternCounts(): void {
  try {
    const saved = kvGet('config', 'pattern_counts')
    if (saved?.patterns) {
      for (const [sig, d] of Object.entries(saved.patterns as Record<string, any>)) {
        taskPatternCounts.set(sig, { count: d.count || 0, lastSeen: d.lastSeen || 0, examples: d.examples || [] })
      }
    }
  } catch {}
}

// Auto-generate a skill definition from a detected pattern
export interface AutoSkillDef {
  id: string
  name: string
  description: string
  category: string
  source: string
  enabled: boolean
  autoGenerated: boolean
  pattern: string
  tools: string[]
  examples: string[]
  createdAt: string
}

export function autoGenerateSkill(signature: string, count: number, examples: string[]): AutoSkillDef | null {
  const tools = signature.split('→')
  if (tools.length < 2) return null

  // Generate a stable ID from the signature
  let hash = 0
  for (let i = 0; i < signature.length; i++) {
    hash = ((hash << 5) - hash) + signature.charCodeAt(i)
    hash |= 0
  }
  const id = 'auto_' + Math.abs(hash).toString(36)

  // Extract intent keywords from examples
  const keywords = new Map<string, number>()
  for (const ex of examples) {
    const words = ex.match(/[一-鿿]{2,}|[a-zA-Z]{3,}/g) || []
    for (const w of words) {
      const lower = w.toLowerCase()
      keywords.set(lower, (keywords.get(lower) || 0) + 1)
    }
  }
  // Top keywords for name/description
  const topKw = [...keywords.entries()]
    .filter(([w]) => !['帮我', '请', '一下', '这个', '那个', '可以', '能否', '怎么'].includes(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w)

  const intentSummary = topKw.length > 0 ? topKw.join('+') : tools.slice(0, 2).join('+')
  const toolNames = tools.map(t => t.replace(/^(ac_|skill_)/, '')).join('+')

  return {
    id,
    name: `自动: ${intentSummary}`,
    description: `基于您${count}次使用模式自动创建。工具链: ${toolNames}`,
    category: 'auto',
    source: 'auto',
    enabled: true,
    autoGenerated: true,
    pattern: signature,
    tools,
    examples,
    createdAt: new Date().toISOString(),
  }
}

// Get the full pattern data for a signature
export function getPatternData(signature: string): { count: number; examples: string[] } | null {
  return taskPatternCounts.get(signature) || null
}

// Get top N patterns by count
export function getTopPatterns(limit = 5): Array<{ signature: string; count: number; examples: string[] }> {
  return [...taskPatternCounts.entries()]
    .filter(([, d]) => d.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([sig, d]) => ({ signature: sig, count: d.count, examples: d.examples }))
}

export function detectRepeatedPattern(toolSequence: string[], userMessage: string): { message: string; autoSkill: AutoSkillDef | null } | null {
  if (toolSequence.length < 2) return null

  // Create a pattern signature from tool sequence
  const sig = toolSequence.sort().join('→')
  const existing = taskPatternCounts.get(sig) || { count: 0, lastSeen: 0, examples: [] }
  existing.count++
  existing.lastSeen = Date.now()
  if (existing.examples.length < 5) existing.examples.push(userMessage.slice(0, 80))
  taskPatternCounts.set(sig, existing)

  // Persist after every detection
  persistPatterns()

  // Auto-generate skill after 3 repetitions
  if (existing.count === 3) {
    const tools = toolSequence.join(', ')
    const autoSkill = autoGenerateSkill(sig, existing.count, existing.examples)
    return {
      message: `已自动创建技能「${autoSkill?.name || tools}」，下次遇到类似任务会自动匹配。`,
      autoSkill,
    }
  }

  // On subsequent repetitions, just note it
  if (existing.count > 3 && existing.count % 5 === 0) {
    return {
      message: `技能「自动: ${sig.split('→').slice(0, 2).join('+')}」已使用${existing.count}次，持续优化中。`,
      autoSkill: null,
    }
  }

  return null
}

// Get skill creation suggestion for the UI (wired up via IPC)
export function getSkillSuggestion(): { tools: string; count: number; examples: string[] } | null {
  let best: { sig: string; count: number; examples: string[] } | null = null
  for (const [sig, data] of taskPatternCounts) {
    if (data.count >= 3 && (!best || data.count > best.count)) {
      best = { sig, count: data.count, examples: data.examples }
    }
  }
  if (!best) return null
  return { tools: best.sig, count: best.count, examples: best.examples }
}

// P3-2: Pattern recognition — track behavior and generate proactive suggestions
const behaviorLog: Array<{ time: number; action: string; category: string }> = []
const MAX_LOG = 200

export function logBehavior(action: string, category: string): void {
  behaviorLog.push({ time: Date.now(), action, category })
  if (behaviorLog.length > MAX_LOG) behaviorLog.shift()
  // Persist to DB periodically (every 10 entries)
  if (behaviorLog.length % 10 === 0) persistBehaviorLog()
}

function persistBehaviorLog(): void {
  try {
    kvUpsert('config', 'behavior_log', { log: behaviorLog.slice(-MAX_LOG) })
  } catch {}
}

export function loadBehaviorLog(): void {
  try {
    const saved = kvGet('config', 'behavior_log')
    if (saved?.log && Array.isArray(saved.log)) {
      behaviorLog.length = 0
      behaviorLog.push(...saved.log.slice(-MAX_LOG))
    }
  } catch {}
}

export function getProactiveSuggestions(): string[] {
  const suggestions: string[] = []
  const now = new Date()
  const hour = now.getHours()
  const dayOfWeek = now.getDay() // 0=Sunday

  // Check for time-based patterns
  const recentActions = behaviorLog.filter(b => Date.now() - b.time < 7 * 24 * 60 * 60 * 1000) // Last 7 days
  const todayActions = behaviorLog.filter(b => {
    const d = new Date(b.time)
    return d.toDateString() === now.toDateString()
  })

  // Morning stock check pattern (8-10am)
  const morningStocks = recentActions.filter(b => {
    const h = new Date(b.time).getHours()
    return h >= 8 && h <= 10 && b.category === 'finance'
  })
  if (morningStocks.length >= 3 && hour >= 8 && hour <= 10) {
    suggestions.push('您通常在这个时间查看股票行情，需要我为您准备今日市场概览吗？')
  }

  // Frequent coding pattern
  const codingActions = recentActions.filter(b => b.category === 'coding')
  if (codingActions.length >= 5) {
    const lastProject = codingActions[codingActions.length - 1]?.action
    if (lastProject) suggestions.push(`您最近频繁进行编码工作，需要我帮您继续上次的项目吗？`)
  }

  // Weekly summary pattern (Monday morning)
  if (dayOfWeek === 1 && hour >= 9 && hour <= 11) {
    const lastWeekActions = behaviorLog.filter(b => Date.now() - b.time < 7 * 24 * 60 * 60 * 1000)
    if (lastWeekActions.length >= 10) {
      const topCategory = getTopCategory(lastWeekActions)
      suggestions.push(`新的一周开始了！上周您主要在${topCategory}方面，需要我帮您整理上周的工作总结吗？`)
    }
  }

  // Long idle pattern (no interaction for 2+ hours during work hours)
  if (hour >= 9 && hour <= 18 && behaviorLog.length > 0) {
    const lastAction = behaviorLog[behaviorLog.length - 1]
    const idleMinutes = (Date.now() - lastAction.time) / (1000 * 60)
    if (idleMinutes >= 120 && idleMinutes < 480) {
      suggestions.push('有一段时间没互动了，有什么需要我帮忙的吗？')
    }
  }

  // Data analysis pattern (multiple data-related actions)
  const dataActions = recentActions.filter(b => b.category === 'data')
  if (dataActions.length >= 3 && todayActions.filter(b => b.category === 'data').length > 0) {
    suggestions.push('您最近频繁进行数据分析，需要我帮您生成数据报告模板吗？')
  }

  // Evening research pattern
  const eveningResearch = recentActions.filter(b => {
    const h = new Date(b.time).getHours()
    return h >= 19 && h <= 22 && b.category === 'research'
  })
  if (eveningResearch.length >= 3 && hour >= 19 && hour <= 22) {
    suggestions.push('您通常在这个时间段进行调研，需要我帮您整理今天的调研笔记吗？')
  }

  return suggestions.slice(0, 2) // Max 2 suggestions
}

function getTopCategory(actions: Array<{ category: string }>): string {
  const counts = new Map<string, number>()
  for (const a of actions) counts.set(a.category, (counts.get(a.category) || 0) + 1)
  let top = 'general'
  let max = 0
  for (const [cat, count] of counts) {
    if (count > max) { top = cat; max = count }
  }
  const labels: Record<string, string> = { finance: '金融分析', coding: '编码开发', data: '数据分析', research: '调研学习', content: '内容创作', general: '通用任务' }
  return labels[top] || top
}

// Human-like: generate contextual greeting when starting a new conversation
export function getContextualGreeting(): string | null {
  const now = new Date()
  const hour = now.getHours()
  const recentActions = behaviorLog.filter(b => Date.now() - b.time < 24 * 60 * 60 * 1000)

  // Time-aware greeting
  let timeGreeting = ''
  if (hour >= 5 && hour < 9) timeGreeting = '早上好'
  else if (hour >= 9 && hour < 12) timeGreeting = '上午好'
  else if (hour >= 12 && hour < 14) timeGreeting = '中午好'
  else if (hour >= 14 && hour < 18) timeGreeting = '下午好'
  else if (hour >= 18 && hour < 22) timeGreeting = '晚上好'
  else timeGreeting = '夜深了'

  // Check for unfinished work patterns
  if (recentActions.length > 0) {
    const lastCategory = recentActions[recentActions.length - 1].category
    const labels: Record<string, string> = { finance: '金融分析', coding: '编码开发', data: '数据分析', research: '调研学习', content: '内容创作', general: '通用任务' }
    const categoryLabel = labels[lastCategory] || lastCategory
    const lastAction = recentActions[recentActions.length - 1]
    const timeDiff = Math.round((Date.now() - lastAction.time) / (1000 * 60))

    if (timeDiff < 30) {
      return `${timeGreeting}！刚才我们在做${categoryLabel}，要继续吗？`
    } else if (timeDiff < 120) {
      return `${timeGreeting}！之前在做${categoryLabel}，有什么新的需要？`
    }
  }

  // Check morning stock pattern
  if (hour >= 8 && hour <= 10) {
    const morningStocks = behaviorLog.filter(b => {
      const h = new Date(b.time).getHours()
      return h >= 8 && h <= 10 && b.category === 'finance'
    })
    if (morningStocks.length >= 2) {
      return `${timeGreeting}！需要我为您查看今日行情吗？`
    }
  }

  return `${timeGreeting}！有什么可以帮您的？`
}

// Conversation summarization — extract key topics and save for cross-conversation learning
export function summarizeConversation(messages: Array<{ role: string; content: string }>): void {
  if (messages.length < 3) return // Too short to summarize

  // Extract key topics from user messages
  const userMessages = messages.filter(m => m.role === 'user').map(m => m.content || '')
  const allText = userMessages.join(' ')

  // Extract topics (noun phrases, technical terms)
  const topics = new Set<string>()

  // Technical terms mentioned
  const techTerms = ['React', 'Vue', 'Angular', 'Node.js', 'Python', 'Java', 'Go', 'Rust', 'TypeScript', 'Docker', 'Kubernetes', 'Redis', 'MySQL', 'Electron', 'Qt', 'C++', 'C#']
  for (const term of techTerms) {
    if (allText.toLowerCase().includes(term.toLowerCase())) topics.add(term)
  }

  // Domain keywords
  const domainKeywords = ['股票', '行情', '代码', '开发', '分析', '数据', '写作', '翻译', '部署', '运维', '设计', '架构']
  for (const kw of domainKeywords) {
    if (allText.includes(kw)) topics.add(kw)
  }

  if (topics.size === 0) return

  // Save conversation summary as memory
  const topicList = [...topics].slice(0, 5).join('、')
  const summary = `对话主题: ${topicList} (${messages.length}条消息)`
  const id = 'conv-summary-' + Date.now()
  smartSaveMemory(id, summary, 'general', 0.35)
}

// B03: Multi-model routing — select model by task complexity
// Fast keywords in model IDs (flash, nano, mini, lite, instant)
const FAST_RE = /flash|nano|mini|lite|instant/i
// Strong keywords (pro, max, ultra, plus, opus, sonnet)
const STRONG_RE = /pro|max|ultra|plus|opus|sonnet/i

export function selectModel(message: string, agentModel: string, providers: any[]): string {
  if (agentModel && agentModel !== 'openclaw') return agentModel
  const lower = message.toLowerCase()
  const isSimple = message.length < 30 && !/[代码文件搜索分析写修创建调试]/.test(lower) && !/code|file|search|write|fix|debug/.test(lower)
  const isComplex = /分析|对比|评估|设计|架构|研究|复杂|analyze|compare|design|architect/.test(lower)

  // Collect all available models from enabled providers
  const available: Array<{ id: string; provider: string }> = []
  for (const p of providers) {
    if (!p.apiKey || p.enabled === false) continue
    for (const m of (p.models || [])) available.push({ id: m.id, provider: p.id })
  }
  if (available.length === 0) return agentModel || 'openclaw'

  const pick = (re: RegExp) => available.find(m => re.test(m.id))

  if (isSimple) {
    const fast = pick(FAST_RE)
    if (fast) { logger.info('B03', `Route: simple -> ${fast.id}`); return fast.id }
  }
  if (isComplex) {
    const strong = pick(STRONG_RE)
    if (strong) { logger.info('B03', `Route: complex -> ${strong.id}`); return strong.id }
  }
  return agentModel || 'openclaw'
}

// Intent router — weighted classification for agent selection
const intentRules: Array<{ kw: string[]; agent: string; weight: number }> = [
  // Finance — highest priority (very specific domain)
  { kw: ['股票', '行情', 'K线', 'k线', '涨幅', '跌幅', '大盘', '龙虎榜', '板块', 'stock', 'akshare', '市盈率', '市净率', '选股', '筛选', '涨停', '跌停', '换手率', '量比', '成交量', '主力', '北向资金', '融资融券'], agent: 'stock_analyst', weight: 3 },
  { kw: ['财务', 'ROE', 'PE', 'PB', '财报', '利润', '营收', '毛利率', '净利率', '资产负债率', '现金流', '分红', '股息'], agent: 'stock_analyst', weight: 2 },
  { kw: ['基金', 'ETF', '净值', '收益率', '定投', '基金经理', '持仓'], agent: 'stock_analyst', weight: 2 },
  // Engineering (coding + devops + data)
  { kw: ['写代码', '实现', '编写', '开发', '写个函数', '写个类', 'implement', 'code', 'function', 'class', 'bug', 'debug', '调试', '修复', '报错', '异常', '堆栈'], agent: 'engineer', weight: 2 },
  { kw: ['重构', 'review', '审查', '检查代码', '代码质量', '技术债', 'code smell'], agent: 'engineer', weight: 2 },
  { kw: ['服务器', '运维', 'docker', '部署', 'nginx', 'linux', '脚本自动化', 'ci/cd', 'devops', 'kubernetes', 'k8s', '容器', '微服务'], agent: 'engineer', weight: 2 },
  { kw: ['系统状态', 'cpu', '内存', '磁盘', '进程', '端口', '日志', '监控'], agent: 'engineer', weight: 1 },
  { kw: ['分析数据', '数据集', 'csv', 'excel', 'pandas', '统计', '可视化', '图表', 'data analysis', 'dataset', 'matplotlib', '数据清洗', '特征工程'], agent: 'engineer', weight: 2 },
  { kw: ['项目结构', '依赖', '代码行数', '扫描项目', '技术栈', '框架', 'npm', 'pip', '包管理'], agent: 'engineer', weight: 2 },
  { kw: ['数据库', 'SQL', '查询', '表结构', '索引', 'mysql', 'postgres', 'sqlite', 'redis', 'mongodb'], agent: 'engineer', weight: 2 },
  { kw: ['API', '接口', '请求', '响应', 'REST', 'GraphQL', 'webhook', '后端', '前端', '爬虫'], agent: 'engineer', weight: 2 },
  { kw: ['Git', '提交', '分支', '合并', '冲突', 'rebase', 'pull request', 'PR', 'merge'], agent: 'engineer', weight: 2 },
  { kw: ['测试', '单元测试', '集成测试', 'jest', 'pytest', '覆盖率', 'mock', 'assert'], agent: 'engineer', weight: 2 },
  // Design
  { kw: ['设计', 'UI', 'UX', '界面', '交互', '原型', 'Figma', 'Sketch', '配色', '布局', '组件库'], agent: 'creator', weight: 2 },
  // Content creation + translation
  { kw: ['写文章', '文案', '小红书', '抖音', '脚本', '直播', '种草', '爆款', '公众号', '自媒体', '推文'], agent: 'creator', weight: 2 },
  { kw: ['写作', '小说', '诗歌', '故事', '创作', '散文', '剧本', '歌词'], agent: 'creator', weight: 1 },
  { kw: ['翻译', 'translate', '英译中', '中译英', '日语', '韩语', '法语', '德语', '西班牙语', '多语言'], agent: 'creator', weight: 3 },
  { kw: ['PPT', '演示', '幻灯片', '汇报', '述职', '演讲稿'], agent: 'creator', weight: 2 },
  // Research
  { kw: ['调研', '论文', '研究', '报告', '分析报告', 'research', 'report', '摘要', '引用', '文献', '综述', '课题', '实验'], agent: 'researcher', weight: 2 },
  { kw: ['行业分析', '竞品', '市场', 'SWOT', '商业模式', '用户画像', '需求分析'], agent: 'researcher', weight: 2 },
  // General search (low priority — default handles it)
  { kw: ['搜索', '查找', '查一下', 'search', '查查', '帮我查', '帮我搜', '查查看'], agent: 'default', weight: 1 },
  // Health advisor
  { kw: ['健康', '饮食', '营养', '运动', '健身', '减肥', '养生', '睡眠', '感冒', '发烧', '头疼', '症状', '医院', '用药', '体检', '血压', '血糖', '中医', '食疗'], agent: 'health_advisor', weight: 2 },
  // Legal assistant
  { kw: ['法律', '合同', '劳动法', '维权', '起诉', '赔偿', '知识产权', '商标', '专利', '纠纷', '律师', '法规', '违法', '仲裁', '诉讼', '侵权', '合规'], agent: 'legal_assistant', weight: 2 },
  // Tutor
  { kw: ['学习', '教程', '知识点', '讲解', '课程', '考试', '作业', '练习', '入门', '怎么学', '学什么', '网课', '培训', '认证', '刷题'], agent: 'tutor', weight: 2 },
  // Life assistant
  { kw: ['天气', '今天天气', '明天天气', '下雨', '温度', '热搜', '新闻', '简报', '快递', '出行', '菜谱', '食谱', '旅游', '攻略', '机票', '酒店', '地铁', '公交'], agent: 'life_assistant', weight: 2 },
  { kw: ['诗词', '古诗', '名言', '历史上的今天', '笑话', '讲个笑话', '汇率', '多少钱', '翻译', '星座', '运势', '黄历'], agent: 'life_assistant', weight: 2 },
  { kw: ['做菜', '做饭', '烘焙', '食谱', '家常菜', '减脂餐', '早餐', '晚餐'], agent: 'life_assistant', weight: 2 },
  // Planner
  { kw: ['规划', '计划', '分解', '里程碑', '排期', '进度', '决策', '选择', '对比', '评估', '项目管理', '甘特图', 'OKR', 'KPI', '复盘', '总结'], agent: 'planner', weight: 2 },
]

// Conversation-level intent state — tracks previous intent for follow-up detection
let lastIntent: { agentId: string; intent: string; confidence: number } | null = null

// Follow-up patterns — messages that continue the previous intent
const FOLLOWUP_PATTERNS = /^(继续|接着|再来|再看看|也帮我|也查一下|另外|还有|还有呢|另一个|下一个|然后呢|然后|之后|后续|补充|追加)/i
const SHORT_FOLLOWUP = /^.{1,8}$/ // Very short messages are likely follow-ups

export function classifyIntent(msg: string): { intent: string; confidence: number; agentId: string } {
  const lower = msg.toLowerCase()
  const scores = new Map<string, { score: number; matchedKw: string[] }>()

  for (const r of intentRules) {
    const matched = r.kw.filter(k => lower.includes(k))
    if (matched.length > 0) {
      const existing = scores.get(r.agent) || { score: 0, matchedKw: [] }
      // Long keyword boost: 4+ chars get 1.5x, 6+ chars get 2x
      let kwScore = 0
      for (const kw of matched) {
        const lenBoost = kw.length >= 6 ? 2 : kw.length >= 4 ? 1.5 : 1
        kwScore += r.weight * lenBoost
      }
      existing.score += kwScore
      existing.matchedKw.push(...matched)
      scores.set(r.agent, existing)
    }
  }

  // Strong match found — update lastIntent and return
  if (scores.size > 0) {
    let bestAgent = 'default'
    let bestScore = 0
    let bestKw: string[] = []
    for (const [agent, { score, matchedKw }] of scores) {
      if (score > bestScore) { bestAgent = agent; bestScore = score; bestKw = matchedKw }
    }
    const confidence = Math.min(0.95, 0.5 + bestScore * 0.07)
    const result = { intent: bestKw[0], confidence, agentId: bestAgent }
    lastIntent = result
    return result
  }

  // No strong match — check if this is a follow-up to the previous intent
  if (lastIntent) {
    const isFollowup = FOLLOWUP_PATTERNS.test(msg.trim()) || (SHORT_FOLLOWUP.test(msg.trim()) && msg.trim().length > 0)
    if (isFollowup) {
      // Inherit previous intent with reduced confidence
      const result = { intent: lastIntent.intent, confidence: Math.max(0.3, lastIntent.confidence * 0.7), agentId: lastIntent.agentId }
      return result
    }
  }

  return { intent: 'chat', confidence: 0.3, agentId: 'default' }
}

// Reset intent state (e.g., on conversation switch)
export function resetIntentState(): void {
  lastIntent = null
}
