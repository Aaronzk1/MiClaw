import { useState } from 'react'
import { WorkflowPanel, parseWorkflowFromOutput } from './WorkflowPanel'

interface ToolCallCardProps {
  name: string
  args?: string
  output?: string
  status: 'running' | 'done' | 'error'
  isStreaming?: boolean
}

const TOOL_LABELS: Record<string, string> = {
  ac_write_file: '写文件', write_file: '写文件',
  ac_read_file: '读文件', read_file: '读文件',
  ac_terminal: '终端', terminal: '终端',
  execute_command: '命令',
  code_execute: '执行代码',
  ac_web_search: '搜索', web_search: '搜索',
  ac_read_url: '读网页', read_url: '读网页',
  ac_baike: '百科',
  ac_news: '新闻',
  ac_weather: '天气',
  ac_hot_search: '热搜',
  ac_daily_briefing: '简报',
  ac_poetry: '诗词',
  ac_history_today: '历史今天',
  ac_forex: '汇率',
  ac_market_overview: '行情',
  ac_verify: '验证',
  ac_ip_lookup: 'IP查询',
  ac_joke: '笑话',
  ac_gov_stats: '统计',
  ac_browser: '浏览器',
  memory_save: '保存记忆', memory_search: '搜索记忆',
  list_directory: '列目录',
  translate: '翻译',
  skill_stock_quote: '行情', skill_stock_kline: 'K线',
  skill_stock_finance: '财务', skill_stock_screener: '选股',
  skill_data_profile: '数据探查', skill_sys_info: '系统信息',
  skill_text_stats: '文本统计', skill_code_review: '代码审查',
  skill_project_scan: '项目扫描', skill_csv_clean: 'CSV清洗',
  skill_md_format: 'MD格式化', skill_word_freq: '词频',
  skill_summarize: '摘要', skill_citation_extract: '引用提取',
  task_decompose: '任务分解', decision_analysis: '决策分析',
  workflow_template: '工作流', progress_track: '进度跟踪',
  project_plan: '项目规划',
  sessions_spawn: '创建子会话',
  sessions_yield: '等待子会话',
  github_mirror: 'GitHub镜像',
}

function extractCodeFromArgs(args: string, toolName: string): string {
  try {
    const obj = JSON.parse(args)
    if (toolName === 'code_execute') return obj.code || obj.input || obj.script || formatArgs(args)
    return obj.command || obj.cmd || obj.input || formatArgs(args)
  } catch {
    return args
  }
}

function formatArgs(args: string): string {
  try {
    const obj = JSON.parse(args)
    return JSON.stringify(obj, null, 2)
  } catch {
    return args
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + '...'
}

function getArgPreview(args: string | undefined, name: string): string {
  if (!args || args.length < 3) return ''
  try {
    const obj = JSON.parse(args)
    // Pick the most meaningful string field
    const keys = ['query', 'content', 'message', 'command', 'input', 'text', 'path', 'url', 'prompt', 'title', 'question']
    for (const k of keys) {
      if (typeof obj[k] === 'string' && obj[k].length > 0) {
        const v = obj[k].replace(/\n/g, ' ').trim()
        return v.length > 40 ? v.slice(0, 40) + '...' : v
      }
    }
    // Fallback: first string value
    for (const v of Object.values(obj)) {
      if (typeof v === 'string' && v.length > 0) {
        const s = v.replace(/\n/g, ' ').trim()
        return s.length > 40 ? s.slice(0, 40) + '...' : s
      }
    }
  } catch {}
  return ''
}

function isCodeTool(name: string): boolean {
  return /^(terminal|execute_command|code_execute|ac_terminal)$/.test(name)
}

function isDiffOutput(s: string): boolean {
  const lines = s.split('\n')
  let diffLines = 0
  for (const l of lines) {
    if (l.startsWith('+') || l.startsWith('-') || l.startsWith('@@')) diffLines++
  }
  return diffLines >= 3
}

function DiffBlock({ text }: { text: string }) {
  return (
    <pre className="tool-detail-code tool-diff">
      {text.split('\n').map((line, i) => {
        let cls = ''
        if (line.startsWith('@@')) cls = 'diff-hunk'
        else if (line.startsWith('+++') || line.startsWith('---')) cls = 'diff-meta'
        else if (line.startsWith('+')) cls = 'diff-add'
        else if (line.startsWith('-')) cls = 'diff-del'
        return <span key={i} className={cls || undefined}>{line}{'\n'}</span>
      })}
    </pre>
  )
}

export function ToolCallCard({ name, args, output, status }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [hasExpanded, setHasExpanded] = useState(false)
  const safeName = name || 'unknown'
  const label = TOOL_LABELS[safeName] || safeName.replace(/^(ac_|skill_)/, '')
  const hasDetails = (args && args.length > 2 && args !== '{}') || (output && output.length > 0)
  const argPreview = status === 'running' ? getArgPreview(args, safeName) : ''
  const outputIsDiff = output ? isDiffOutput(output) : false
  const isCode = isCodeTool(safeName)
  const workflowData = output ? parseWorkflowFromOutput(output) : null

  const toggleExpand = () => {
    if (!hasDetails) return
    const next = !expanded
    setExpanded(next)
    if (next) setHasExpanded(true)
  }

  return (
    <span className="tool-card-wrap" style={{ display: 'inline-block' }}>
      <span
        className={`tool-chip ${status}`}
        onClick={toggleExpand}
        style={{ cursor: hasDetails ? 'pointer' : 'default' }}
      >
        {status === 'running' && <span className="tool-chip-shimmer" />}
        {status === 'running' && <span className="tool-chip-spinner"></span>}
        {status === 'done' && <span className="tool-chip-dot done"></span>}
        {status === 'error' && <span className="tool-chip-dot error"></span>}
        <span className="tool-chip-label">{label}</span>
        {argPreview && <span className="tool-chip-arg">: {argPreview}</span>}
        {hasDetails && <span className="tool-chip-expand">{expanded ? '▲' : '▼'}</span>}
      </span>
      <div className={`tool-detail-panel${expanded ? ' expanded' : ''}`}>
        {hasExpanded && (
          <>
            {isCode ? (
              <>
                {args && args.length > 2 && args !== '{}' && (
                  <div className="tool-detail-section">
                    <div className="tool-detail-label">{safeName === 'code_execute' ? '代码' : '命令'}</div>
                    <pre className="tool-detail-code tool-code-exec">{extractCodeFromArgs(args, safeName)}</pre>
                  </div>
                )}
                {output && output.length > 0 && (
                  <div className="tool-detail-section">
                    <div className="tool-detail-label">输出</div>
                    <pre className={`tool-detail-code ${status === 'error' ? 'error' : ''}`}>{truncate(output, 3000)}</pre>
                  </div>
                )}
              </>
            ) : (
              <>
                {args && args.length > 2 && args !== '{}' && (
                  <div className="tool-detail-section">
                    <div className="tool-detail-label">参数</div>
                    <pre className="tool-detail-code">{formatArgs(args)}</pre>
                  </div>
                )}
                {output && output.length > 0 && (
                  <div className="tool-detail-section">
                    <div className="tool-detail-label">{status === 'error' ? '错误' : '输出'}</div>
                    {outputIsDiff
                      ? <DiffBlock text={truncate(output, 3000)} />
                      : <pre className={`tool-detail-code ${status === 'error' ? 'error' : ''}`}>{truncate(output, 3000)}</pre>
                    }
                  </div>
                )}
              </>
            )}
            {!output && status === 'done' && (
              <div className="tool-detail-section">
                <div className="tool-detail-label">输出</div>
                <pre className="tool-detail-code" style={{ color: 'var(--text4)', fontStyle: 'italic' }}>无输出</pre>
              </div>
            )}
            {workflowData && (
              <div className="tool-detail-section">
                <WorkflowPanel type={workflowData.type} data={workflowData.data} />
              </div>
            )}
          </>
        )}
      </div>
    </span>
  )
}
