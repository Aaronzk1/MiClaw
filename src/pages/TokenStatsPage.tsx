import { useEffect, useState, useMemo } from 'react'
import { api } from '../lib/ipc'

interface DailyRow { date: string; role: string; total: number }
interface ConvRow { title: string; total: number; msgCount: number }
interface Summary {
  totalTokens: number; totalMessages: number; avgTokensPerMessage: number
  totalConversations: number; tokensLast7Days: number
}

const INPUT_PRICE = 3 / 1_000_000
const OUTPUT_PRICE = 15 / 1_000_000
const USD_TO_CNY = 7.2

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function fmtCost(usd: number): string {
  return '$' + usd.toFixed(2)
}

export function TokenStatsPage() {
  const [daily, setDaily] = useState<DailyRow[]>([])
  const [convs, setConvs] = useState<ConvRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [sortBy, setSortBy] = useState<'total' | 'msgCount' | 'avg'>('total')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.tokenStatsDaily(),
      api.tokenStatsByConversation(),
      api.tokenStatsSummary(),
    ]).then(([d, c, s]) => {
      setDaily(d as DailyRow[])
      setConvs(c as ConvRow[])
      setSummary(s as Summary)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Aggregate daily data by date
  const dailyByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of daily) map.set(r.date, (map.get(r.date) || 0) + r.total)
    const entries = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    return entries.slice(-30)
  }, [daily])

  // Daily input/output split
  const dailySplit = useMemo(() => {
    const map = new Map<string, { input: number; output: number }>()
    for (const r of daily) {
      const entry = map.get(r.date) || { input: 0, output: 0 }
      if (r.role === 'user' || r.role === 'system') entry.input += r.total
      else entry.output += r.total
      map.set(r.date, entry)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-30)
  }, [daily])

  // Cost estimation
  const costEstimate = useMemo(() => {
    let inputTokens = 0, outputTokens = 0
    for (const r of daily) {
      if (r.role === 'user' || r.role === 'system') inputTokens += r.total
      else outputTokens += r.total
    }
    const inputCost = inputTokens * INPUT_PRICE
    const outputCost = outputTokens * OUTPUT_PRICE
    return { inputTokens, outputTokens, totalUSD: inputCost + outputCost, totalCNY: (inputCost + outputCost) * USD_TO_CNY }
  }, [daily])

  // Burn rate: tokens/day over last 7 days
  const burnRate = useMemo(() => {
    if (!summary) return { perDay: 0, monthlyUSD: 0, monthlyCNY: 0 }
    const perDay = summary.tokensLast7Days / 7
    const dailyCost = perDay * (INPUT_PRICE + OUTPUT_PRICE) / 2
    return { perDay, monthlyUSD: dailyCost * 30, monthlyCNY: dailyCost * 30 * USD_TO_CNY }
  }, [summary])

  // Sorted conversations
  const sortedConvs = useMemo(() => {
    const arr = [...convs]
    if (sortBy === 'total') arr.sort((a, b) => b.total - a.total)
    else if (sortBy === 'msgCount') arr.sort((a, b) => b.msgCount - a.msgCount)
    else arr.sort((a, b) => (b.total / Math.max(b.msgCount, 1)) - (a.total / Math.max(a.msgCount, 1)))
    return arr
  }, [convs, sortBy])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)' }}>加载中...</div>

  const maxDaily = Math.max(...dailyByDate.map(([, v]) => v), 1)
  const maxSplit = Math.max(...dailySplit.map(([, v]) => v.input + v.output), 1)
  const chartH = 160

  return (
    <div className="dash-page">
      <h2>Token 经济分析</h2>

      {/* Summary Cards */}
      <div className="dash-grid-4">
        <div className="dash-stat" data-color="accent">
          <div className="stat-label">总 Tokens</div>
          <div className="stat-value">{fmtNum(summary?.totalTokens || 0)}</div>
          <div className="stat-sub">{summary?.totalConversations || 0} 个对话</div>
        </div>
        <div className="dash-stat" data-color="info">
          <div className="stat-label">总花费 (估)</div>
          <div className="stat-value">{fmtCost(costEstimate.totalUSD)}</div>
          <div className="stat-sub">≈ ¥{costEstimate.totalCNY.toFixed(2)}</div>
        </div>
        <div className="dash-stat" data-color="success">
          <div className="stat-label">日均消耗</div>
          <div className="stat-value">{fmtNum(Math.round(burnRate.perDay))}</div>
          <div className="stat-sub">{summary?.totalMessages || 0} 条消息</div>
        </div>
        <div className="dash-stat" data-color="warning">
          <div className="stat-label">月预估</div>
          <div className="stat-value">{fmtCost(burnRate.monthlyUSD)}</div>
          <div className="stat-sub">≈ ¥{burnRate.monthlyCNY.toFixed(2)}</div>
        </div>
      </div>

      {/* Daily Usage Bar Chart (split) */}
      <div className="dash-section">
        <div className="dash-section-header">
          <span className="dash-section-title">每日用量 (近30天)</span>
          <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent, #6366f1)' }} />输出
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--info, #3b82f6)' }} />输入
            </span>
          </div>
        </div>
        {dailySplit.length === 0 ? (
          <div style={{ height: chartH, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text4)', fontSize: 13 }}>暂无数据</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: chartH + 20, padding: '0 4px' }}>
            {dailySplit.map(([date, v], i) => {
              const total = v.input + v.output
              const pctInput = maxSplit > 0 ? (v.input / maxSplit) * 100 : 0
              const pctOutput = maxSplit > 0 ? (v.output / maxSplit) * 100 : 0
              const day = date.slice(5)
              return (
                <div key={date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
                  <div style={{ width: '100%', height: chartH, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 0 }}>
                    {pctOutput > 0 && <div style={{ width: '70%', maxWidth: 20, height: pctOutput + '%', background: 'var(--accent, #6366f1)', borderRadius: '2px 2px 0 0', opacity: 0.85, transition: 'height 0.3s' }} />}
                    {pctInput > 0 && <div style={{ width: '70%', maxWidth: 20, height: pctInput + '%', background: 'var(--info, #3b82f6)', borderRadius: pctOutput > 0 ? 0 : '2px 2px 0 0', opacity: 0.7, transition: 'height 0.3s' }} />}
                  </div>
                  {i % 5 === 0 && <span style={{ fontSize: 9, color: 'var(--text4)', whiteSpace: 'nowrap' }}>{day}</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Top Conversations Table */}
      <div className="dash-section">
        <div className="dash-section-header">
          <span className="dash-section-title">对话用量排行</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`dash-sort-btn${sortBy === 'total' ? ' active' : ''}`} onClick={() => setSortBy('total')}>总Token</button>
            <button className={`dash-sort-btn${sortBy === 'msgCount' ? ' active' : ''}`} onClick={() => setSortBy('msgCount')}>消息数</button>
            <button className={`dash-sort-btn${sortBy === 'avg' ? ' active' : ''}`} onClick={() => setSortBy('avg')}>均值</button>
          </div>
        </div>
        {sortedConvs.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text4)', fontSize: 13 }}>暂无数据</div>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                <th>#</th>
                <th style={{ textAlign: 'left' }}>对话</th>
                <th>总 Tokens</th>
                <th>消息数</th>
                <th>均值/条</th>
                <th>费用(估)</th>
              </tr>
            </thead>
            <tbody>
              {sortedConvs.map((c, i) => {
                const avg = c.msgCount > 0 ? Math.round(c.total / c.msgCount) : 0
                const cost = c.total * (INPUT_PRICE + OUTPUT_PRICE) / 2
                return (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td style={{ textAlign: 'left', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</td>
                    <td>{fmtNum(c.total)}</td>
                    <td>{c.msgCount}</td>
                    <td>{fmtNum(avg)}</td>
                    <td>{fmtCost(cost)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Cost Breakdown */}
      <div className="dash-section">
        <div className="dash-section-header">
          <span className="dash-section-title">费用明细</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text4)', marginBottom: 4 }}>输入 Tokens</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{fmtNum(costEstimate.inputTokens)}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>{fmtCost(costEstimate.inputTokens * INPUT_PRICE)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text4)', marginBottom: 4 }}>输出 Tokens</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{fmtNum(costEstimate.outputTokens)}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>{fmtCost(costEstimate.outputTokens * OUTPUT_PRICE)}</div>
          </div>
        </div>
        <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--accent-light, #f0f0ff)', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>定价参考</div>
          <div style={{ fontSize: 11, color: 'var(--text4)', lineHeight: 1.8 }}>
            输入: $3/1M tokens | 输出: $15/1M tokens | 汇率: 1 USD = 7.2 CNY
          </div>
        </div>
      </div>
    </div>
  )
}
