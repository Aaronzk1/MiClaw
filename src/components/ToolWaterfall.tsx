import { useState, useMemo } from 'react'

// Reuse same label map as ToolCallCard
const TOOL_LABELS: Record<string, string> = {
  ac_write_file: '写文件', write_file: '写文件',
  ac_read_file: '读文件', read_file: '读文件',
  ac_terminal: '终端', terminal: '终端',
  execute_command: '命令',
  code_execute: '执行代码',
  ac_web_search: '搜索', web_search: '搜索',
  ac_read_url: '读网页', read_url: '读网页',
  ac_baike: '百科', ac_news: '新闻', ac_weather: '天气',
  ac_hot_search: '热搜', ac_daily_briefing: '简报',
  ac_poetry: '诗词', ac_history_today: '历史今天',
  ac_forex: '汇率', ac_market_overview: '行情',
  ac_verify: '验证', ac_ip_lookup: 'IP查询',
  ac_joke: '笑话', ac_gov_stats: '统计', ac_browser: '浏览器',
  memory_save: '保存记忆', memory_search: '搜索记忆',
  list_directory: '列目录', translate: '翻译',
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
  sessions_spawn: '创建子会话', sessions_yield: '等待子会话',
  github_mirror: 'GitHub镜像',
}

interface ToolCall {
  id: string
  name: string
  args?: string
  output?: string
  status: 'running' | 'done' | 'error'
}

interface WaterfallItem extends ToolCall {
  label: string
  startMs: number
  durationMs: number
}

function estimateDuration(output?: string): number {
  if (!output) return 800
  const len = output.length
  if (len < 50) return 600
  if (len < 200) return 1200
  if (len < 1000) return 2000
  return Math.min(5000, 1500 + Math.sqrt(len) * 40)
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function truncate(s: string, max: number): string {
  if (!s || s.length <= max) return s || ''
  return s.slice(0, max) + '...'
}

function getArgPreview(args?: string): string {
  if (!args || args.length < 3) return ''
  try {
    const obj = JSON.parse(args)
    const keys = ['query', 'content', 'message', 'command', 'input', 'text', 'path', 'url', 'prompt']
    for (const k of keys) {
      if (typeof obj[k] === 'string' && obj[k].length > 0) {
        return obj[k].replace(/\n/g, ' ').trim().slice(0, 60)
      }
    }
  } catch {}
  return ''
}

export function ToolWaterfall({ toolCalls }: { toolCalls: ToolCall[] }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const items = useMemo<WaterfallItem[]>(() => {
    let cursor = 0
    return toolCalls.map((tc) => {
      const dur = estimateDuration(tc.output)
      const start = cursor
      // Stagger: running tools overlap slightly, done/error are sequential
      cursor += tc.status === 'running' ? dur * 0.3 : dur * 0.6
      return {
        ...tc,
        label: TOOL_LABELS[tc.name] || tc.name.replace(/^(ac_|skill_)/, ''),
        startMs: start,
        durationMs: dur,
      }
    })
  }, [toolCalls])

  const totalMs = useMemo(() => {
    if (items.length === 0) return 0
    const last = items[items.length - 1]
    return last.startMs + last.durationMs
  }, [items])

  const doneCount = toolCalls.filter(t => t.status === 'done').length
  const errorCount = toolCalls.filter(t => t.status === 'error').length
  const runningCount = toolCalls.filter(t => t.status === 'running').length

  return (
    <div className="wf-container">
      {/* Header */}
      <div className="wf-header">
        <span className="wf-header-label">
          {runningCount > 0
            ? `${runningCount} 个工具执行中`
            : `${doneCount + errorCount} 个工具${errorCount > 0 ? ` (${errorCount} 失败)` : ''}`}
        </span>
        <span className="wf-header-time">总耗时 ~{formatDuration(totalMs)}</span>
      </div>

      {/* Timeline axis */}
      <div className="wf-timeline">
        <div className="wf-axis">
          <span className="wf-axis-label">0ms</span>
          <span className="wf-axis-label">{formatDuration(totalMs / 2)}</span>
          <span className="wf-axis-label">{formatDuration(totalMs)}</span>
        </div>
        <div className="wf-gridlines">
          <div className="wf-gridline" style={{ left: '25%' }} />
          <div className="wf-gridline" style={{ left: '50%' }} />
          <div className="wf-gridline" style={{ left: '75%' }} />
        </div>
      </div>

      {/* Bars */}
      <div className="wf-rows">
        {items.map((item) => {
          const leftPct = totalMs > 0 ? (item.startMs / totalMs) * 100 : 0
          const widthPct = totalMs > 0 ? Math.max(2, (item.durationMs / totalMs) * 100) : 100
          const isHovered = hoveredId === item.id

          return (
            <div
              key={item.id}
              className="wf-row"
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div className="wf-row-label" title={item.name}>{item.label}</div>
              <div className="wf-row-track">
                <div className="wf-gridlines">
                  <div className="wf-gridline" style={{ left: '25%' }} />
                  <div className="wf-gridline" style={{ left: '50%' }} />
                  <div className="wf-gridline" style={{ left: '75%' }} />
                </div>
                <div
                  className={`wf-bar ${item.status}`}
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                >
                  <span className="wf-bar-duration">{formatDuration(item.durationMs)}</span>
                </div>
              </div>

              {/* Hover tooltip */}
              {isHovered && (
                <div className="wf-tooltip">
                  <div className="wf-tooltip-name">{item.label} <span className="wf-tooltip-tool">({item.name})</span></div>
                  {item.args && item.args !== '{}' && (
                    <div className="wf-tooltip-section">
                      <span className="wf-tooltip-key">参数:</span> {getArgPreview(item.args) || truncate(item.args, 80)}
                    </div>
                  )}
                  {item.output && (
                    <div className="wf-tooltip-section">
                      <span className="wf-tooltip-key">输出:</span> {truncate(item.output, 120)}
                    </div>
                  )}
                  <div className="wf-tooltip-status">
                    状态: {item.status === 'done' ? '完成' : item.status === 'error' ? '失败' : '执行中'}
                    {' · '}{formatDuration(item.durationMs)}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
