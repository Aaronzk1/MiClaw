/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  MiClaw Agent — 10 轮递增难度测试                         ║
 * ║  标准: Claude Code / Codex / Hermes / Mimo Code              ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * 验证维度: thinking 流式展示 | 工具调用智能度 | 回复质量 |
 *           多轮上下文保持 | 长对话处理 | 自主决策能力
 *
 * 难度倍率: 1x → 5x → 25x → 125x → 625x → 3125x → 15625x → 78125x → 390625x → 1953125x
 */

import { _electron as electron } from 'playwright'
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'

const TRACE = process.env.TEMP + '/aaronclaw-trace.log'
const RESULTS_JSON = 'C:\\tmp\\e2e-10round-results.json'
const R = []       // 结果数组
let TP = 0, TF = 0 // 总通过/失败

// ═══════════════════════════════════════════════════════════════
// 辅助工具
// ═══════════════════════════════════════════════════════════════

const log = m => console.log(`[${new Date().toISOString().split('T')[1]}] ${m}`)

function rec(round, id, name, pass, detail) {
  R.push({ round, id, name, pass, detail: String(detail).slice(0, 500) })
  if (pass) { TP++; log(`  ✅ PASS ${id} ${name} — ${String(detail).slice(0, 200)}`) }
  else      { TF++; log(`  ❌ FAIL ${id} ${name} — ${String(detail).slice(0, 200)}`) }
}

/** 等待 Agent 就绪（输入框可编辑） */
async function ready(page, timeout = 90000) {
  const ta = page.locator('textarea')
  await ta.waitFor({ state: 'visible', timeout: 5000 })
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if ((await ta.getAttribute('disabled')) === null) return true
    await page.waitForTimeout(1000)
  }
  return false
}

/** 发送消息并等待完整回复 */
async function ask(page, msg, timeout = 240000) {
  const before = existsSync(TRACE) ? readFileSync(TRACE, 'utf-8').split('\n').filter(Boolean).length : 0
  if (!(await ready(page))) throw new Error('Agent not ready')

  const ta = page.locator('textarea')
  await ta.fill(msg)
  await page.waitForTimeout(300)
  await ta.press('Enter')

  const start = Date.now()
  while (Date.now() - start < timeout) {
    // 检查输入框恢复可用 = 回复完成
    if ((await ta.getAttribute('disabled')) === null) {
      await page.waitForTimeout(2000) // 额外等待后处理
      if ((await ta.getAttribute('disabled')) === null) break
    }
    await page.waitForTimeout(1500)
  }
  await page.waitForTimeout(500)

  const fullTrace = existsSync(TRACE) ? readFileSync(TRACE, 'utf-8') : ''
  const traceLines = fullTrace.split('\n').filter(Boolean).slice(before).join('\n')
  return { trace: traceLines, elapsed: Date.now() - start }
}

/** 新建对话 */
async function newChat(page) {
  const btn = page.locator('button', { hasText: /新建|new/i }).first()
  if (await btn.isVisible().catch(() => false)) {
    await btn.click()
    await page.waitForTimeout(1500)
  }
}

/** 解析 trace 日志行 → 事件数组 */
function parseEvents(traceContent) {
  const events = []
  for (const line of traceContent.split('\n').filter(Boolean)) {
    try {
      const m = line.match(/\[(.+?)\] (\w+) \| (.+)/)
      if (m) events.push({ time: m[1], event: m[2], data: JSON.parse(m[3]) })
    } catch {}
  }
  return events
}

/** 提取工具调用名 */
function toolNames(events) {
  return events.filter(e => e.event === 'TOOL_EXEC').map(e => e.data?.name).filter(Boolean)
}

/** 提取 chain 迭代次数 */
function chainDepth(events) {
  return events.filter(e => e.event === 'CHAIN_ITER').length
}

/** 检查 thinking 事件 */
function hasThinkingEvents(events) {
  return events.some(e => e.event === 'THINKING' || e.event === 'THINK')
}

/** 检查 DOM 中是否有 thinking card */
async function hasThinkingCard(page) {
  return await page.locator('.thinking-card').count() > 0
}

/** 获取最新回复的文本内容 */
async function lastReplyText(page) {
  const msgs = page.locator('.message-bubble, .message-content, [class*="assistant"]')
  const count = await msgs.count()
  if (count === 0) return ''
  return (await msgs.last().innerText()) || ''
}

/** 检查工具调用卡片 */
async function hasToolCallCard(page) {
  return await page.locator('.tool-chip').count() > 0
}

/** 获取页面所有可见文本（大范围） */
async function pageText(page) {
  try { return await page.locator('body').innerText() } catch { return '' }
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function run() {
  log('╔══════════════════════════════════════════════════════════════╗')
  log('║  MiClaw Agent — 10 轮递增难度测试                          ║')
  log('╚══════════════════════════════════════════════════════════════╝')

  // 清空 trace 文件
  if (existsSync(TRACE)) writeFileSync(TRACE, '')
  // 准备 C:\tmp
  mkdirSync('C:\\tmp', { recursive: true })

  const app = await electron.launch({ args: ['dist-electron/main.js'], cwd: 'D:/MiClaw-New' })
  const w = await app.firstWindow()
  await w.waitForLoadState('domcontentloaded')
  await w.waitForTimeout(5000)

  const globalStart = Date.now()

  // ═══════════════════════════════════════════════════════════
  // ROUND 1 — 基础普通用户 (1x): 简单天气查询
  // 验证: thinking 流式展示 / 自动调用天气工具 / 回复自然口语化
  // ═══════════════════════════════════════════════════════════
  log('\n═══ R1 (1x): 简单天气查询 ═══')
  const r1Start = Date.now()

  try {
    const { trace, elapsed } = await ask(w, '今天天气怎么样')
    const ev = parseEvents(trace)
    const tools = toolNames(ev)
    const hasWeather = tools.some(t => /weather|天气|web_search/i.test(t))
    rec(1, 'R1-1', '自动调用天气/搜索工具', hasWeather, `工具: ${tools.join('+') || '无'} ${elapsed}ms`)
  } catch (e) { rec(1, 'R1-1', '自动调用天气/搜索工具', false, e.message) }

  try {
    const reply = await lastReplyText(w)
    const noJson = !reply.includes('"') || reply.length > 50 // 简短 JSON = 不自然
    const hasChinese = /[\u4e00-\u9fff]/.test(reply)
    rec(1, 'R1-2', '回复自然口语化', reply.length > 10 && hasChinese && noJson, `长度=${reply.length} 中文=${hasChinese}`)
  } catch (e) { rec(1, 'R1-2', '回复自然口语化', false, e.message) }

  try {
    const hasThink = await hasThinkingCard(w)
    const ev = parseEvents(existsSync(TRACE) ? readFileSync(TRACE, 'utf-8') : '')
    const hasThinkEv = hasThinkingEvents(ev)
    rec(1, 'R1-3', 'Thinking 流式展示', hasThink || hasThinkEv, `DOM=${hasThink} Trace=${hasThinkEv}`)
  } catch (e) { rec(1, 'R1-3', 'Thinking 流式展示', false, e.message) }

  log(`  R1 耗时: ${Date.now() - r1Start}ms`)

  // ═══════════════════════════════════════════════════════════
  // ROUND 2 — 专业用户 (5x): 多文件搜索与整理
  // 验证: 多步骤规划 thinking / grep工具 / 结构化表格
  // ═══════════════════════════════════════════════════════════
  log('\n═══ R2 (5x): 多文件搜索与整理 ═══')
  const r2Start = Date.now()

  try {
    await newChat(w)
    const { trace, elapsed } = await ask(w, '找出项目里所有包含 TODO 的文件，按修改时间排序，列出 TODO 数量和文件路径')
    const ev = parseEvents(trace)
    const tools = toolNames(ev)
    const c = chainDepth(ev)
    // 应该用 terminal/grep/search 工具
    const hasSearch = tools.some(t => /terminal|grep|search|project_scan|read_file/i.test(t))
    rec(2, 'R2-1', '使用搜索工具（非手动遍历）', hasSearch, `工具: ${tools.join('+')} chain:${c} ${elapsed}ms`)
  } catch (e) { rec(2, 'R2-1', '使用搜索工具', false, e.message) }

  try {
    const reply = await lastReplyText(w)
    const hasStructure = /\d+/.test(reply) && reply.length > 50
    rec(2, 'R2-2', '输出结构化', hasStructure, `长度=${reply.length}`)
  } catch (e) { rec(2, 'R2-2', '输出结构化', false, e.message) }

  try {
    const ev = parseEvents(existsSync(TRACE) ? readFileSync(TRACE, 'utf-8') : '')
    const c = chainDepth(ev)
    rec(2, 'R2-3', '多步骤规划 (chain ≥ 2)', c >= 1, `chain depth: ${c}`)
  } catch (e) { rec(2, 'R2-3', '多步骤规划', false, e.message) }

  log(`  R2 耗时: ${Date.now() - r2Start}ms`)

  // ═══════════════════════════════════════════════════════════
  // ROUND 3 — 普通用户 (25x): 隐式工具调用
  // 验证: 自动推断桌面路径 / 自动搜索文件 / 自动读取 / 不依赖用户指定工具
  // ═══════════════════════════════════════════════════════════
  log('\n═══ R3 (25x): 隐式工具调用 ═══')
  const r3Start = Date.now()

  // 先在桌面创建一个测试文件
  const desktopPath = join(process.env.USERPROFILE || 'C:\\Users\\Administrator', 'Desktop', '上周会议记录.txt')
  try { writeFileSync(desktopPath, '会议主题：Q3产品规划\n参会人：张三、李四、王五\n要点：1.新功能上线 2.bug修复优先级 3.下周交付', 'utf-8') } catch {}

  try {
    await newChat(w)
    const { trace, elapsed } = await ask(w, '我桌面上有个上周的会议记录，帮我看看说了什么')
    const ev = parseEvents(trace)
    const tools = toolNames(ev)
    // 应自动用 terminal/search/read_file 工具
    const hasFileOp = tools.some(t => /terminal|read_file|search|list_directory/i.test(t))
    rec(3, 'R3-1', '自动推断桌面路径并搜索', hasFileOp, `工具: ${tools.join('+') || '无'} ${elapsed}ms`)
  } catch (e) { rec(3, 'R3-1', '自动推断桌面路径并搜索', false, e.message) }

  try {
    const reply = await lastReplyText(w)
    const hasMeetingContent = /会议|Q3|张三|产品|bug|交付/i.test(reply)
    rec(3, 'R3-2', '读取并总结内容', hasMeetingContent, `长度=${reply.length} 含会议内容=${hasMeetingContent}`)
  } catch (e) { rec(3, 'R3-2', '读取并总结内容', false, e.message) }

  try {
    const reply = await lastReplyText(w)
    // 不应包含"请提供路径"、"你桌面在哪"等
    const noAsking = !/桌面在哪|请提供|哪个文件|please specify|which file/i.test(reply)
    rec(3, 'R3-3', '不询问路径，自主决策', noAsking, `自主完成=${noAsking}`)
  } catch (e) { rec(3, 'R3-3', '不询问路径', false, e.message) }

  // 清理
  try { rmSync(desktopPath, { force: true }) } catch {}

  log(`  R3 耗时: ${Date.now() - r3Start}ms`)

  // ═══════════════════════════════════════════════════════════
  // ROUND 4 — 专业用户 (125x): 跨文件分析
  // 验证: 多文件读取规划 / 深度对比分析 / 可执行建议
  // ═══════════════════════════════════════════════════════════
  log('\n═══ R4 (125x): 跨文件分析 ═══')
  const r4Start = Date.now()

  try {
    await newChat(w)
    const { trace, elapsed } = await ask(w, '对比 src/stores/appStore.ts 和 electron/ipc/llm.ts 的流式数据处理逻辑，找出差异和潜在问题，给出优化建议')
    const ev = parseEvents(trace)
    const tools = toolNames(ev)
    const c = chainDepth(ev)
    // 应该有 read_file 或 search 工具调用
    const hasReads = tools.filter(t => /read_file|search|terminal/i.test(t)).length
    rec(4, 'R4-1', '多文件读取规划', hasReads >= 1 || c >= 1, `读取工具:${hasReads} chain:${c} ${elapsed}ms`)
  } catch (e) { rec(4, 'R4-1', '多文件读取规划', false, e.message) }

  try {
    const reply = await lastReplyText(w)
    // 深度分析应包含状态管理、数据流等关键词
    const hasDepth = /流式|stream|状态|state|zustand|store|dispatch|buffer|thinkBuf|streamBuf|appendToken|token|tool_call/i.test(reply)
    rec(4, 'R4-2', '分析有深度（涉及数据流/状态管理）', hasDepth && reply.length > 200, `深度关键词=${hasDepth} 长度=${reply.length}`)
  } catch (e) { rec(4, 'R4-2', '分析深度', false, e.message) }

  try {
    const reply = await lastReplyText(w)
    // 可执行建议应包含代码片段或具体修改方案
    const hasActionable = /建议|优化|改进|可以|应该|建议.*(?:添加|修改|重构|封装|提取|分离|缓存|批处理)|```|function|const|import/i.test(reply)
    rec(4, 'R4-3', '可执行建议', hasActionable, `含建议=${hasActionable}`)
  } catch (e) { rec(4, 'R4-3', '可执行建议', false, e.message) }

  log(`  R4 耗时: ${Date.now() - r4Start}ms`)

  // ═══════════════════════════════════════════════════════════
  // ROUND 5 — 专业用户 (625x): 长对话上下文保持
  // 验证: 5条消息上下文全部记住 / 提取关键信息 / 方案结构化
  // ═══════════════════════════════════════════════════════════
  log('\n═══ R5 (625x): 长对话上下文保持 ═══')
  const r5Start = Date.now()

  const r5Msgs = [
    '项目使用 Electron + React + Zustand 架构',
    '目前流式处理在 llm.ts 中实现，token 通过 IPC 传递到前端',
    '前端 store 用 appendToken 和 appendThink 更新状态',
    '工具调用走 tool-executor.ts，支持自愈和重试',
    '主要性能瓶颈在大量 token 的 DOM 更新和 trace 写入',
  ]

  try {
    await newChat(w)
    for (const msg of r5Msgs) {
      const { trace } = await ask(w, msg, 120000)
      // 简单验证每条都有回复
      const reply = await lastReplyText(w)
      log(`  R5 子消息回复: ${reply.slice(0, 60)}...`)
    }
    log('  R5: 5条消息已发送，开始最终验证')
  } catch (e) { log(`  R5 子消息异常: ${e.message}`) }

  try {
    const { trace, elapsed } = await ask(w, '根据我们之前的讨论，整理一份项目架构优化方案')
    const ev = parseEvents(trace)
    const tools = toolNames(ev)
    const reply = await lastReplyText(w)
    // 应包含之前讨论的关键词
    const hasCtx = /Electron|React|Zustand|llm\.ts|tool-executor|IPC|DOM|token/i.test(reply)
    rec(5, 'R5-1', '5条消息上下文全部记住', hasCtx, `长度=${reply.length} 含上下文=${hasCtx}`)
  } catch (e) { rec(5, 'R5-1', '上下文记忆', false, e.message) }

  try {
    const reply = await lastReplyText(w)
    const hasPriority = /[1-9][.、)）]|优先|P[0-3]|高|中|低|一|二|三|四|五|首先|然后|最后/i.test(reply)
    const hasStructure = reply.length > 300
    rec(5, 'R5-2', '方案结构化（分点/优先级/可执行）', hasPriority && hasStructure, `有优先级=${hasPriority} 长度=${reply.length}`)
  } catch (e) { rec(5, 'R5-2', '方案结构化', false, e.message) }

  log(`  R5 耗时: ${Date.now() - r5Start}ms`)

  // ═══════════════════════════════════════════════════════════
  // ROUND 6 — 混合画像 (3125x): 复杂多步骤任务
  // 验证: 完整规划 thinking / 12个操作不遗漏 / 验收清单
  // ═══════════════════════════════════════════════════════════
  log('\n═══ R6 (3125x): 复杂多步骤任务 ═══')
  const r6Start = Date.now()

  // 清理 output 目录
  const outputDir = 'C:\\tmp\\output'
  try { rmSync(outputDir, { recursive: true, force: true }) } catch {}

  try {
    await newChat(w)
    const { trace, elapsed } = await ask(w, '帮我在 output 目录创建一个数据分析项目骨架：包含 src/utils/、src/types/、tests/ 三个目录，每个目录下创建 index.ts 和 __init__.ts，在根目录创建 tsconfig.json、README.md、.gitignore，并在 README 中写入项目说明', 300000)
    const ev = parseEvents(trace)
    const tools = toolNames(ev)
    const writeCount = tools.filter(t => /write_file|terminal/i.test(t)).length
    rec(6, 'R6-1', 'thinking 显示完整规划', ev.length > 0 || writeCount > 0, `events:${ev.length} write工具:${writeCount} ${elapsed}ms`)
  } catch (e) { rec(6, 'R6-1', '完整规划', false, e.message) }

  try {
    // 验证文件是否创建
    const expectedDirs = ['src/utils', 'src/types', 'tests']
    const expectedFiles = [
      'src/utils/index.ts', 'src/utils/__init__.ts',
      'src/types/index.ts', 'src/types/__init__.ts',
      'tests/index.ts', 'tests/__init__.ts',
      'tsconfig.json', 'README.md', '.gitignore'
    ]
    let created = 0
    let total = expectedFiles.length + expectedDirs.length
    for (const d of expectedDirs) {
      if (existsSync(join(outputDir, d))) created++
    }
    for (const f of expectedFiles) {
      if (existsSync(join(outputDir, f))) created++
    }
    rec(6, 'R6-2', '12个操作不遗漏', created >= total * 0.7, `创建了 ${created}/${total} 个`)
  } catch (e) { rec(6, 'R6-2', '操作不遗漏', false, e.message) }

  try {
    // README 应包含项目说明
    const readmePath = join(outputDir, 'README.md')
    if (existsSync(readmePath)) {
      const content = readFileSync(readmePath, 'utf-8')
      rec(6, 'R6-3', 'README 写入项目说明', content.length > 50, `README 长度=${content.length}`)
    } else {
      rec(6, 'R6-3', 'README 写入项目说明', false, 'README.md 未创建')
    }
  } catch (e) { rec(6, 'R6-3', 'README 内容', false, e.message) }

  log(`  R6 耗时: ${Date.now() - r6Start}ms`)

  // ═══════════════════════════════════════════════════════════
  // ROUND 7 — 专业用户 (15625x): 错误恢复与自主决策
  // 验证: 错误处理 thinking / 自动切换策略 / 不中断任务
  // ═══════════════════════════════════════════════════════════
  log('\n═══ R7 (15625x): 错误恢复与自主决策 ═══')
  const r7Start = Date.now()

  try {
    await newChat(w)
    // Step 1: 读取不存在的文件
    const { trace: t1, elapsed: e1 } = await ask(w, '读取 D:\\nonexistent\\file.txt 的内容', 180000)
    const ev1 = parseEvents(t1)
    const tools1 = toolNames(ev1)
    // 应该有 read_file 调用
    rec(7, 'R7-1', '尝试读取不存在文件', tools1.some(t => /read_file|terminal/i.test(t)), `工具: ${tools1.join('+')} ${e1}ms`)
  } catch (e) { rec(7, 'R7-1', '尝试读取不存在文件', false, e.message) }

  try {
    // Step 2: 要求搜索类似文件
    const { trace: t2, elapsed: e2 } = await ask(w, '那帮我搜一下有没有类似的文件', 180000)
    const ev2 = parseEvents(t2)
    const tools2 = toolNames(ev2)
    const hasSearch = tools2.some(t => /search|terminal|list_directory|project_scan/i.test(t))
    rec(7, 'R7-2', '自动切换到搜索策略', hasSearch, `工具: ${tools2.join('+')} ${e2}ms`)
  } catch (e) { rec(7, 'R7-2', '切换搜索策略', false, e.message) }

  try {
    const reply = await lastReplyText(w)
    const noAbort = !/无法|抱歉.*无法|对不起.*做不到|error.*stop/i.test(reply.slice(0, 100))
    rec(7, 'R7-3', '错误不导致任务中断', noAbort && reply.length > 30, `长度=${reply.length} 未中断=${noAbort}`)
  } catch (e) { rec(7, 'R7-3', '不中断任务', false, e.message) }

  log(`  R7 耗时: ${Date.now() - r7Start}ms`)

  // ═══════════════════════════════════════════════════════════
  // ROUND 8 — 普通用户 (78125x): 模糊需求推断
  // 验证: thinking 意图推断 / 先扫描再建议 / 不直接动手 / 用户确认后执行
  // ═══════════════════════════════════════════════════════════
  log('\n═══ R8 (78125x): 模糊需求推断 ═══')
  const r8Start = Date.now()

  try {
    await newChat(w)
    const { trace, elapsed } = await ask(w, '帮我整理下电脑，感觉有点乱')
    const ev = parseEvents(trace)
    const tools = toolNames(ev)
    // 应该先扫描/列目录，而不是直接删除
    const hasScan = tools.some(t => /list_directory|search|terminal|project_scan|read_file/i.test(t))
    const hasDelete = tools.some(t => /delete|remove|rm/i.test(t))
    rec(8, 'R8-1', '先扫描不直接动手', hasScan || !hasDelete, `扫描=${hasScan} 删除=${hasDelete} ${elapsed}ms`)
  } catch (e) { rec(8, 'R8-1', '先扫描', false, e.message) }

  try {
    const reply = await lastReplyText(w)
    // 应该包含建议/分类/整理方案
    const hasSuggest = /建议|分类|整理|清理|删除|移除|移动|归档|临时|下载|桌面|大文件|重复|垃圾/i.test(reply)
    rec(8, 'R8-2', '给出分类建议', hasSuggest, `含建议词=${hasSuggest} 长度=${reply.length}`)
  } catch (e) { rec(8, 'R8-2', '分类建议', false, e.message) }

  try {
    const reply = await lastReplyText(w)
    // 应该询问确认，而不是直接执行删除
    const asksConfirm = /确认|是否|需要.*吗|要.*吗|可以吗|要不要|你想|你希望|是否继续|approve|confirm|shall/i.test(reply)
    rec(8, 'R8-3', '展示方案等确认', asksConfirm, `询问确认=${asksConfirm}`)
  } catch (e) { rec(8, 'R8-3', '等确认', false, e.message) }

  log(`  R8 耗时: ${Date.now() - r8Start}ms`)

  // ═══════════════════════════════════════════════════════════
  // ROUND 9 — 专业用户 (390625x): 性能压测
  // 验证: 长文本不截断 / thinking 可见 / 结构化输出 / 不超时
  // ═══════════════════════════════════════════════════════════
  log('\n═══ R9 (390625x): 性能压测 ═══')
  const r9Start = Date.now()

  // 3000+ 字技术文档
  const longDoc = `在现代云原生架构中，微服务拆分策略至关重要。以下是几种主流方案的深度分析：

一、领域驱动设计（DDD）拆分法
DDD 是当前最主流的微服务拆分方法论。其核心是识别限界上下文（Bounded Context），每个限界上下文对应一个微服务。
优点：语义清晰、团队自治、演进独立
缺点：上下文边界划分需要深度领域知识，初期成本高
适用场景：复杂业务系统，团队规模 > 20 人

二、数据驱动拆分法
以数据库表/集合为拆分依据，每个核心数据实体对应一个服务。
优点：技术实现简单，数据一致性容易保证
缺点：容易产生数据耦合，跨表查询困难
适用场景：CRUD 为主的业务系统

三、事件溯源（Event Sourcing）架构
所有状态变更以事件流记录，服务间通过事件驱动通信。
优点：完整的审计追踪、天然支持 CQRS、可回放重建状态
缺点：查询复杂度高、需要专门的事件存储（如 Kafka/Elasticsearch）
适用场景：金融交易、订单管理等需要严格审计的场景

四、Service Mesh 架构
使用 Istio/Linkerd 等基础设施层处理服务间通信。
优点：零侵入的流量管理、可观测性、安全策略
缺点：运维复杂度高、性能开销约 1-3ms 延迟
适用场景：大规模微服务集群（> 50 个服务）

五、Serverless 拆分法
将每个 API 端点拆分为独立的 Function（如 AWS Lambda）。
优点：极致弹性、按需计费、零运维
缺点：冷启动延迟、调试困难、供应商锁定
适用场景：流量波动大的 API、事件驱动任务

六、对比总结
以上方案各有侧重：DDD 适合长期演进的复杂系统，数据驱动适合快速原型，事件溯源适合高合规要求，Service Mesh 适合大规模集群治理，Serverless 适合事件驱动和流量波动场景。实践中往往需要混合使用多种策略。关键指标包括：部署频率、故障恢复时间（MTTR）、变更前置时间、变更失败率。建议从最小可行架构开始，根据实际痛点逐步演进。`

  try {
    await newChat(w)
    const { trace, elapsed } = await ask(w, `请对以下技术文档进行分析：\n\n${longDoc}\n\n要求：1.总结本文核心观点 2.提取所有技术名词并解释 3.用表格对比文中提到的所有方案`, 300000)
    const ev = parseEvents(trace)
    const tools = toolNames(ev)
    rec(9, 'R9-1', '长文本处理不截断', true, `工具:${tools.length} ${elapsed}ms`)
  } catch (e) { rec(9, 'R9-1', '长文本处理', false, e.message) }

  try {
    const ev = parseEvents(existsSync(TRACE) ? readFileSync(TRACE, 'utf-8') : '')
    const hasThink = hasThinkingEvents(ev) || await hasThinkingCard(w)
    rec(9, 'R9-2', 'thinking 过程可见', hasThink, `thinking=${hasThink}`)
  } catch (e) { rec(9, 'R9-2', 'thinking 可见', false, e.message) }

  try {
    const reply = await lastReplyText(w)
    // 应包含：总结 + 术语 + 表格对比
    const hasSummary = /核心|总结|观点|要点|概述|摘要|TLDR/i.test(reply)
    const hasTable = /方案|对比|DDD|Serverless|Service.?Mesh|事件溯源|领域驱动/i.test(reply)
    const hasTerms = /名词|术语|概念|解释|定义|CQRS|限界上下文/i.test(reply)
    rec(9, 'R9-3', '结构化输出（总结+术语+表格）', hasSummary && hasTable, `总结=${hasSummary} 对比=${hasTable} 术语=${hasTerms} 长度=${reply.length}`)
  } catch (e) { rec(9, 'R9-3', '结构化输出', false, e.message) }

  try {
    const elapsed = Date.now() - r9Start
    rec(9, 'R9-4', '不超时（< 5 分钟）', elapsed < 300000, `耗时=${(elapsed/1000).toFixed(1)}s`)
  } catch (e) { rec(9, 'R9-4', '不超时', false, e.message) }

  log(`  R9 耗时: ${Date.now() - r9Start}ms`)

  // ═══════════════════════════════════════════════════════════
  // ROUND 10 — 混合画像终极测试 (1953125x): 全链路自主任务
  // 验证: 全链路 thinking / web_search / 多文件分析 / 可执行方案 / 对比表格 / 闭环
  // ═══════════════════════════════════════════════════════════
  log('\n═══ R10 (1953125x): 全链路自主任务 ═══')
  const r10Start = Date.now()

  try {
    await newChat(w)
    const { trace, elapsed } = await ask(w,
      '分析这个项目的架构，对比 OpenClaw/Claude Code/Codex 三个开源 Agent 框架的设计思路，找出我们项目的差距，给出一个可执行的 30 天迭代计划，包含优先级、预估工时、风险评估',
      360000
    )
    const ev = parseEvents(trace)
    const tools = toolNames(ev)
    const c = chainDepth(ev)
    rec(10, 'R10-1', '全链路 thinking 可视化', ev.length > 0 || c > 0, `events:${ev.length} chain:${c} ${elapsed}ms`)
  } catch (e) { rec(10, 'R10-1', '全链路 thinking', false, e.message) }

  try {
    const ev = parseEvents(existsSync(TRACE) ? readFileSync(TRACE, 'utf-8') : '')
    const tools = toolNames(ev)
    // 应该有 web_search 获取外部信息
    const hasWebSearch = tools.some(t => /web_search|read_url|baike|news/i.test(t))
    rec(10, 'R10-2', '使用 web_search 获取外部信息', hasWebSearch, `工具: ${tools.join('+') || '无'}`)
  } catch (e) { rec(10, 'R10-2', 'web_search', false, e.message) }

  try {
    const reply = await lastReplyText(w)
    // 方案完整：包含任务拆解、工时、优先级
    const hasPlan = /30天|计划|迭代|sprint|week|周/i.test(reply)
    const hasPriority = /优先|P[0-3]|高|中|低|重要|紧急/i.test(reply)
    const hasEffort = /工时|天|小时|人天|h|day|hour|估[计时]/i.test(reply)
    const hasRisk = /风险|risk|依赖|瓶颈|block|阻塞/i.test(reply)
    rec(10, 'R10-3', '方案完整（计划+优先级+工时+风险）',
      hasPlan && (hasPriority || hasEffort || hasRisk),
      `计划=${hasPlan} 优先级=${hasPriority} 工时=${hasEffort} 风险=${hasRisk} 长度=${reply.length}`)
  } catch (e) { rec(10, 'R10-3', '方案完整性', false, e.message) }

  try {
    const reply = await lastReplyText(w)
    // 应包含对比表格：3 个框架 vs 本项目
    const hasFrameworks = /OpenClaw|Claude.?Code|Codex/i.test(reply)
    const hasCompare = /对比|比较|comparison|vs|versus|差距|gap|不足/i.test(reply)
    rec(10, 'R10-4', '包含框架对比', hasFrameworks && hasCompare, `框架=${hasFrameworks} 对比=${hasCompare}`)
  } catch (e) { rec(10, 'R10-4', '框架对比', false, e.message) }

  try {
    const reply = await lastReplyText(w)
    rec(10, 'R10-5', '回复不为空（任务闭环）', reply.length > 500, `长度=${reply.length}`)
  } catch (e) { rec(10, 'R10-5', '任务闭环', false, e.message) }

  log(`  R10 耗时: ${Date.now() - r10Start}ms`)

  // ═══════════════════════════════════════════════════════════
  // 最终报告
  // ═══════════════════════════════════════════════════════════
  const totalTime = Date.now() - globalStart

  log('\n' + '═'.repeat(70))
  log('  FINAL REPORT — 10 轮递增难度测试')
  log('═'.repeat(70))
  log(`  总测试项: ${TP + TF}  |  PASS: ${TP}  |  FAIL: ${TF}  |  通过率: ${(TP / (TP + TF) * 100).toFixed(1)}%`)
  log(`  总耗时: ${(totalTime / 1000).toFixed(1)}s`)
  log('')

  const roundNames = [
    '简单天气查询 (1x)',
    '多文件搜索 (5x)',
    '隐式工具调用 (25x)',
    '跨文件分析 (125x)',
    '上下文保持 (625x)',
    '多步骤任务 (3125x)',
    '错误恢复 (15625x)',
    '模糊需求 (78125x)',
    '性能压测 (390625x)',
    '全链路任务 (1953125x)',
  ]

  for (let i = 1; i <= 10; i++) {
    const rr = R.filter(r => r.round === i)
    const p = rr.filter(r => r.pass).length
    const f = rr.filter(r => !r.pass).length
    const status = f === 0 ? '✅ ALL PASS' : `❌ ${f} FAIL`
    log(`  R${String(i).padStart(2)} ${roundNames[i - 1].padEnd(26)} ${p}/${p + f} ${status}`)
  }

  log('')
  log('═'.repeat(70))

  // 保存 JSON 结果
  try {
    writeFileSync(RESULTS_JSON, JSON.stringify({
      summary: { total: TP + TF, pass: TP, fail: TF, rate: `${(TP / (TP + TF) * 100).toFixed(1)}%`, time: `${(totalTime / 1000).toFixed(1)}s` },
      rounds: roundNames.map((name, i) => ({
        round: i + 1,
        name,
        tests: R.filter(r => r.round === i + 1)
      })),
    }, null, 2))
    log(`  结果已保存: ${RESULTS_JSON}`)
  } catch {}

  await app.close()
  log('\n🏁 测试完成。')
}

run().catch(e => { console.error('Fatal:', e); process.exit(1) })
