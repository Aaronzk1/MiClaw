import { kvGet } from '../storage/db'

// Capability metadata: what each tool can and cannot do
const TOOL_CAPABILITIES: Record<string, { can: string[]; cannot: string[] }> = {
  ac_web_search: { can: ['搜索互联网获取实时信息', '查找新闻、文档、教程'], cannot: ['访问需要登录的网站', '获取付费内容'] },
  ac_read_file: { can: ['读取本地文件内容', '支持文本/代码/配置文件'], cannot: ['读取二进制文件(图片/视频)', '访问系统保护目录'] },
  ac_write_file: { can: ['创建或修改本地文件', '写入文本/代码/配置'], cannot: ['写入系统目录', '修改正在运行的程序文件'] },
  ac_terminal: { can: ['执行 Shell/PowerShell 命令', '运行脚本、查看系统状态'], cannot: ['执行破坏性命令(rm -rf, format)', '修改系统注册表'] },
  code_execute: { can: ['运行 Python/JavaScript 代码', '数据分析、计算、图表生成'], cannot: ['访问网络(受限)', '安装系统级包'] },
  ac_read_url: { can: ['抓取网页内容', '读取在线文档和API', '访问GitHub(自动镜像回退，国内可用)'], cannot: ['访问需要认证的页面', '执行JavaScript渲染的SPA'] },
  ac_browser: { can: ['在系统浏览器中打开URL'], cannot: ['返回页面内容(只是打开)', '自动化操作浏览器'] },
  translate: { can: ['多语言翻译'], cannot: ['翻译超长文档(>2000字)'] },
  memory_save: { can: ['保存长期记忆'], cannot: ['删除或修改已有记忆'] },
  memory_search: { can: ['搜索已保存的记忆'], cannot: ['搜索互联网'] },
  list_directory: { can: ['列出目录下文件和文件夹'], cannot: ['读取文件内容'] },
  skill_stock_quote: { can: ['获取A股实时行情'], cannot: ['获取港股/美股行情'] },
  skill_stock_kline: { can: ['获取日K线数据和均线'], cannot: ['分钟级K线'] },
  skill_stock_finance: { can: ['获取PE/PB/ROE等财务指标'], cannot: ['获取详细财报'] },
  skill_data_profile: { can: ['探查CSV数据集结构和统计'], cannot: ['处理超大数据集(>100MB)'] },
  skill_sys_info: { can: ['查看CPU/内存/磁盘使用'], cannot: ['修改系统设置'] },
  skill_text_stats: { can: ['统计字数/词数/段落数'], cannot: ['分析文本情感'] },
  skill_code_review: { can: ['审查Python代码质量、复杂度、命名规范'], cannot: ['审查非Python代码', '自动修复代码'] },
  skill_project_scan: { can: ['扫描项目目录结构、文件类型、代码行数'], cannot: ['分析代码逻辑', '检测安全漏洞'] },
  skill_csv_clean: { can: ['CSV去重、缺失值统计、类型推断'], cannot: ['处理超大文件(>100MB)', '自动修复数据'] },
  skill_stock_screener: { can: ['按PE/PB/涨跌幅/市值条件筛选A股'], cannot: ['筛选港股/美股', '实时盯盘'] },
  skill_md_format: { can: ['格式化Markdown文档结构'], cannot: ['转换为PDF/HTML', '检查语法错误'] },
  skill_word_freq: { can: ['统计中英文词频、提取关键词'], cannot: ['情感分析', '主题建模'] },
  skill_summarize: { can: ['提取长文本关键句子作为摘要'], cannot: ['生成原创摘要', '翻译摘要'] },
  skill_citation_extract: { can: ['提取文档中的URL和参考文献'], cannot: ['验证引用有效性', '自动补全引用'] },
  ac_market_overview: { can: ['获取A股大盘实时行情（上证/深证/沪深300/创业板）', '涨跌家数统计'], cannot: ['获取个股数据', '预测走势'] },
  ac_news: { can: ['搜索中文新闻（百度新闻源）', '获取最新资讯和行业动态'], cannot: ['获取付费新闻', '实时推送'] },
  ac_baike: { can: ['查询百度百科知识', '验证事实、查询定义和人物'], cannot: ['获取实时数据', '编辑百科'] },
  ac_forex: { can: ['查询实时汇率（美元/人民币等）'], cannot: ['历史汇率查询', '汇率预测'] },
  ac_verify: { can: ['多源交叉验证事实可信度', '对比搜索结果和百科信息'], cannot: ['100%确认真伪', '验证主观观点'] },
  ac_weather: { can: ['查询城市天气预报', '获取当前温度、湿度、风力和多日预报'], cannot: ['查询历史天气', '分钟级降水预报'] },
  ac_hot_search: { can: ['获取各平台热搜/趋势话题(微博/知乎/抖音/百度/B站/头条)'], cannot: ['获取已下架的热搜', '操控热搜排名'] },
  ac_daily_briefing: { can: ['获取60秒每日新闻简报'], cannot: ['深度报道', '付费新闻'] },
  ac_poetry: { can: ['随机获取古诗词/名言'], cannot: ['按主题检索诗词', '生成原创诗词'] },
  ac_history_today: { can: ['查询历史上的今天发生的事件'], cannot: ['查询任意日期的历史事件'] },
  ac_ip_lookup: { can: ['查询IP地址地理位置(国家/城市/ISP)'], cannot: ['查询内网IP', '精确到街道'] },
  ac_github_mirror: { can: ['诊断GitHub连通性', '测试直连和镜像可用性', '自动配置git镜像'], cannot: ['修复网络问题', '绕过认证限制'] },
  ac_joke: { can: ['获取随机笑话'], cannot: ['按主题筛选笑话'] },
  ac_gov_stats: { can: ['查询国家统计局宏观数据(GDP/CPI/PPI/人口等)'], cannot: ['获取实时数据', '查询省级以下数据'] },
  task_decompose: { can: ['将复杂任务分解为结构化步骤', '估算时间、识别依赖和风险'], cannot: ['自动执行分解后的步骤'] },
  decision_analysis: { can: ['多维度评估决策选项(收益/成本/风险)', '生成推荐排名'], cannot: ['预测未来结果', '替代人类判断'] },
  workflow_template: { can: ['匹配预设工作流模板(调研/代码审查/股票分析等)', '列出所有可用模板'], cannot: ['自定义模板步骤', '执行工作流'] },
  progress_track: { can: ['启动/更新/查看任务进度', '识别阻塞步骤'], cannot: ['自动解决阻塞', '预测完成时间'] },
  project_plan: { can: ['生成项目计划(里程碑/任务/风险)'], cannot: ['自动执行计划', '集成外部项目管理工具'] },
}

export const BASE_PROMPT = `You are AaronClaw — a sharp, capable AI agent with a confident personality. You think before you act, explain your reasoning, and deliver results with clarity.

## Who you are
- You're not a chatbot. You're an operator — someone who gets things done.
- You have opinions. If a request is vague, you say what you'd recommend and why, then ask if the user wants to adjust.
- You think out loud. Before executing a complex task, briefly share your plan: "I'll do X, then Y, because Z." This helps the user catch mistakes early.
- You're honest about uncertainty. If you're not sure something will work, say so before trying — don't pretend confidence you don't have.

## How you think
- Break complex requests into steps. State the steps, then execute them one by one.
- When something fails, don't just retry — diagnose. "The command failed because X. I'll try Y instead."
- When results are ambiguous, interpret them. Don't just dump raw output — explain what it means.
- If the user's request has a simpler or better approach than what they asked, suggest it. "You asked for X, but Y might be faster because..."
- For decisions: analyze risks, benefits, costs, and alternatives. Show your reasoning chain.
- When you disagree with the user's approach, say so with clear reasons. Don't just execute blindly.
- For complex decisions, use this framework:
  **风险**: What could go wrong?
  **收益**: What's the upside?
  **成本**: Time, money, effort required?
  **替代方案**: What other options exist?
  **建议**: Your recommendation with reasoning.

## Date awareness
- The current date is injected in the environment info. ALWAYS check it.
- When searching or analyzing data, explicitly state the date of the information.
- If search results or web pages contain outdated dates (more than 6 months old), WARN the user: "注意：此信息来自[日期]，可能已过时。"
- For financial data, news, stock prices: always note the data date. Markets change daily.
- Never present old information as current. If you can't find recent data, say so.

## How you talk
- Concise but not robotic. Write like a smart colleague, not a manual.
- Use structure when it helps: numbered steps, short paragraphs, bold for key info.
- After completing a task, give a clear summary: what you did, what the result is, and anything the user should know.
- For multi-step tasks, recap the steps and outcomes.
- If something went wrong, explain what happened and what you tried — don't hide failures.
- When you switch into a specialized role (analyst, engineer, writer, etc.), adopt that mindset but keep your personality. You're still you — just wearing a different hat.

## Rules
- For apps: Start-Process with full exe path. Find paths with Get-ChildItem.
- If a tool fails: diagnose the error, explain it, adjust approach, retry. Never give up silently.
- CIRCUIT BREAKER: If the same tool fails 2 times in a row, STOP using it. Switch to a different tool or tell the user what you can't do and why. Never retry the same failing tool more than 2 times.
- Never just execute blindly. If the request is unclear, ask. If there's a better way, suggest it.
- Use the tools available to you. Don't tell the user you can't do something if you have a tool that can help.`

export function buildSystemPrompt(agent: any, availableToolNames: string[], customBasePrompt?: string, knowledgeSkills?: string): string {
  // If agent has old-style systemPrompt, use it directly (backward compat)
  if (agent?.systemPrompt && !agent?.identity) {
    return agent.systemPrompt
  }

  // New style: base prompt + agent identity + tool awareness
  const parts: string[] = [customBasePrompt || BASE_PROMPT]

  if (agent?.identity) {
    let roleBlock = `\n## Your current role\nYou are currently acting as: ${agent.identity}.`
    if (agent.expertise) {
      roleBlock += `\nYour expertise: ${agent.expertise}`
    }
    parts.push(roleBlock)
  }

  if (availableToolNames.length > 0) {
    parts.push(`\n## Available tools\nYou have access to these tools: ${availableToolNames.join(', ')}. Use them when they can help accomplish the user's goal. Don't ask for permission to use tools — just use them.`)

    // Inject capability boundaries
    const caps: string[] = []
    for (const name of availableToolNames) {
      const cap = TOOL_CAPABILITIES[name]
      if (cap) {
        const canStr = cap.can.join('、')
        const cannotStr = cap.cannot.join('、')
        caps.push(`- ${name}: ${canStr} | 不能: ${cannotStr}`)
      } else if (name.startsWith('skill_')) {
        // Dynamic capability for custom skills
        caps.push(`- ${name}: 执行自定义脚本完成特定任务 | 不能: 超出脚本定义范围的操作、访问网络、修改系统`)
      } else if (!name.startsWith('ac_') && !name.startsWith('memory_') && !['code_execute', 'translate', 'list_directory'].includes(name)) {
        // Likely an MCP tool — generate generic capability
        caps.push(`- ${name}: 通过MCP服务器执行的外部工具 | 不能: 超出MCP服务器能力范围的操作`)
      }
    }
    if (caps.length > 0) {
      parts.push(`\n## Capability boundaries\n${caps.join('\n')}\n遇到超出能力范围的任务，明确告知用户并建议替代方案。不要尝试注定失败的操作。`)
    }

    // Smart tool recommendations based on available tools
    const recommendations = generateToolRecommendations(availableToolNames, (globalThis as any).__toolStats)
    if (recommendations) {
      parts.push(`\n## Recommended tool patterns\n${recommendations}`)
    }
  }

  // Inject knowledge skills (auto-matched by agent + user message)
  if (knowledgeSkills) {
    parts.push(knowledgeSkills)
  }

  return parts.join('\n')
}

// Generate tool recommendation hints based on available tool inventory + dynamic stats
function generateToolRecommendations(tools: string[], toolStats?: Record<string, { successRate: number; calls: number; avgQuality: number }>): string {
  const hints: string[] = []

  // Data analysis workflow
  if (tools.includes('code_execute') && tools.includes('skill_data_profile')) {
    hints.push('- 数据分析: 先用 skill_data_profile 探查结构 → code_execute 做计算/可视化')
  }

  // Stock analysis workflow
  const stockTools = tools.filter(t => t.startsWith('skill_stock'))
  if (stockTools.length >= 2) {
    hints.push('- 股票分析: ac_market_overview(大盘) → skill_stock_quote(个股) → skill_stock_kline(趋势) → skill_stock_finance(估值)')
  }

  // Research workflow
  if (tools.includes('ac_web_search') && tools.includes('ac_read_url')) {
    hints.push('- 调研: ac_web_search(找来源) → ac_read_url(读内容) → ac_baike(验证事实) → memory_save(存结论)')
  }

  // News monitoring workflow
  if (tools.includes('ac_news') && tools.includes('ac_web_search')) {
    hints.push('- 新闻追踪: ac_news(最新动态) → ac_web_search(深度搜索) → ac_verify(交叉验证)')
  }

  // Fact verification workflow
  if (tools.includes('ac_verify') && tools.includes('ac_baike')) {
    hints.push('- 事实验证: ac_verify(多源交叉) → ac_baike(百科确认)，重要结论必须验证')
  }

  // Code review workflow
  if (tools.includes('skill_code_review') && tools.includes('skill_project_scan')) {
    hints.push('- 代码审查: skill_project_scan(全局) → skill_code_review(逐文件) → ac_write_file(修复)')
  }

  // File operations with safety
  if (tools.includes('ac_read_file') && tools.includes('ac_write_file')) {
    hints.push('- 文件修改: 先 ac_read_file 读取确认 → 再 ac_write_file 写入，避免覆盖错误内容')
  }

  // Workflow planning
  if (tools.includes('task_decompose') && tools.includes('progress_track')) {
    hints.push('- 任务管理: task_decompose(分解) → progress_track(跟踪) → 每步完成后update')
  }

  // Decision making
  if (tools.includes('decision_analysis') && tools.includes('ac_web_search')) {
    hints.push('- 决策分析: ac_web_search(收集信息) → decision_analysis(评估选项) → 给出推荐')
  }

  // Project planning
  if (tools.includes('project_plan') && tools.includes('task_decompose')) {
    hints.push('- 项目规划: project_plan(整体计划) → task_decompose(分解里程碑) → progress_track(执行跟踪)')
  }

  // Life assistant patterns
  if (tools.includes('ac_weather') && tools.includes('ac_news')) {
    hints.push('- 生活助手: ac_weather(天气) + ac_hot_search(热搜) + ac_daily_briefing(简报)')
  }

  // Dynamic: tool reliability feedback from stats
  if (toolStats) {
    const reliable: string[] = []
    const unreliable: string[] = []
    for (const [name, s] of Object.entries(toolStats)) {
      if (s.calls >= 5 && s.successRate >= 0.8) reliable.push(`${name}(${Math.round(s.successRate * 100)}%)`)
      if (s.calls >= 3 && s.successRate < 0.3) unreliable.push(`${name}(${Math.round(s.successRate * 100)}%)`)
    }
    if (reliable.length > 0) hints.push(`- 历史可靠: ${reliable.join('、')} — 优先使用`)
    if (unreliable.length > 0) hints.push(`- 近期不佳: ${unreliable.join('、')} — 谨慎使用，准备替代方案`)
  }

  return hints.length > 0 ? hints.join('\n') : ''
}

// ══════════ Task Step Tracking ══════════

interface TaskTracker {
  steps: string[]
  completed: number[]
  startedAt: number
}

let currentTask: TaskTracker | null = null

// Detect if user message contains a multi-step request
const STEP_PATTERNS = [
  /(?:第[一二三四五六七八九十\d]步|步骤\s*\d)/,
  /(?:首先|然后|接着|最后|其次).{2,20}(?:然后|接着|最后|其次)/,
  /(?:第一|第二|第三|第四|第五)/,
  /(?:1[\.\、]|\d[\.\、]).*(?:2[\.\、]|\d[\.\、])/,
  /(?:帮我).{0,5}(?:先|首先).{5,}(?:再|然后|接着)/,
]

export function detectMultiStepTask(message: string): boolean {
  return STEP_PATTERNS.some(p => p.test(message))
}

// Extract steps from a message (best-effort)
export function extractSteps(message: string): string[] {
  const steps: string[] = []

  // Numbered steps: "1. xxx 2. xxx"
  const numbered = message.match(/\d+[\.\、]\s*(.+?)(?=\d+[\.\、]|$)/g)
  if (numbered && numbered.length >= 2) {
    return numbered.map(s => s.replace(/^\d+[\.\、]\s*/, '').trim()).slice(0, 8)
  }

  // Chinese ordinals: "第一步 xxx 第二步 xxx"
  const ordinals = message.match(/第[一二三四五六七八九十]+步\s*(.+?)(?=第[一二三四五六七八九十]+步|$)/g)
  if (ordinals && ordinals.length >= 2) {
    return ordinals.map(s => s.replace(/^第[一二三四五六七八九十]+步\s*/, '').trim()).slice(0, 8)
  }

  // Sequential connectors: "先xxx，再xxx，然后xxx"
  const connectors = message.match(/(?:先|首先|然后|接着|再|最后|其次)\s*(.+?)(?=，|,|。|$)/g)
  if (connectors && connectors.length >= 2) {
    return connectors.map(s => s.replace(/^(?:先|首先|然后|接着|再|最后|其次)\s*/, '').trim()).slice(0, 8)
  }

  return steps
}

export function startTaskTracking(steps: string[]): void {
  currentTask = { steps, completed: [], startedAt: Date.now() }
}

export function markStepCompleted(stepIndex: number): void {
  if (currentTask && stepIndex >= 0 && stepIndex < currentTask.steps.length) {
    if (!currentTask.completed.includes(stepIndex)) {
      currentTask.completed.push(stepIndex)
    }
  }
}

export function getTaskProgress(): { remaining: string[]; done: string[]; total: number } | null {
  if (!currentTask) return null
  const done = currentTask.completed.map(i => currentTask!.steps[i])
  const remaining = currentTask.steps.filter((_, i) => !currentTask!.completed.includes(i))
  return { remaining, done, total: currentTask.steps.length }
}

export function clearTaskTracking(): void {
  currentTask = null
}

// Generate task progress injection for system prompt
export function getTaskProgressHint(): string | null {
  const progress = getTaskProgress()
  if (!progress || progress.remaining.length === 0) return null

  const doneStr = progress.done.length > 0 ? `已完成: ${progress.done.join('、')}` : ''
  const remainStr = `待完成: ${progress.remaining.join('、')}`
  return `[TaskProgress] ${doneStr}\n${remainStr}\n请按照步骤顺序继续执行。`
}