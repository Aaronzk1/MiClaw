import { useState, useEffect } from 'react'
import { api } from '../lib/ipc'
import { ActivityHeatmap } from '../components/ActivityHeatmap'

interface Summary {
  totalMessages: number
  totalConversations: number
  activeDays: number
  longestStreak: number
}

export function AnalyticsPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.analyticsSummary().then(s => {
      setSummary(s)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const cards = summary ? [
    { label: '总消息数', value: summary.totalMessages, color: 'accent' },
    { label: '总对话数', value: summary.totalConversations, color: 'info' },
    { label: '活跃天数', value: summary.activeDays, color: 'success' },
    { label: '最长连续', value: summary.longestStreak + ' 天', color: 'warning' },
  ] : []

  return (
    <div className="dash-page">
      {/* Header */}
      <h2>活跃度分析</h2>
      <p className="dash-subtitle">查看您的对话活跃趋势</p>

      {/* Summary Cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>加载中...</div>
      ) : (
        <>
          <div className="dash-grid-4">
            {cards.map(card => (
              <div key={card.label} className="dash-stat" data-color={card.color}>
                <div className="stat-value">{card.value}</div>
                <div className="stat-label">{card.label}</div>
              </div>
            ))}
          </div>

          {/* Heatmap */}
          <div className="dash-section">
            <div className="dash-section-header">
              <span className="dash-section-title">消息活跃热力图</span>
            </div>
            <ActivityHeatmap />
          </div>
        </>
      )}
    </div>
  )
}
