import { useState, useEffect, useMemo } from 'react'
import { api } from '../lib/ipc'

interface HeatmapDay {
  date: string
  count: number
}

export function ActivityHeatmap() {
  const [data, setData] = useState<HeatmapDay[]>([])
  const [hovered, setHovered] = useState<HeatmapDay | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.analyticsHeatmap().then(rows => {
      setData(rows)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Build a map of date -> count for quick lookup
  const countMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of data) map.set(d.date, d.count)
    return map
  }, [data])

  // Generate grid: 7 rows (Sun-Sat) x ~53 columns (weeks)
  const grid = useMemo(() => {
    const today = new Date()
    const cells: Array<{ date: string; count: number; col: number; row: number }> = []
    // Start from ~52 weeks ago, aligned to Sunday
    const start = new Date(today)
    start.setDate(start.getDate() - 364)
    // Align to the previous Sunday
    start.setDate(start.getDate() - start.getDay())

    const current = new Date(start)
    let col = 0
    while (current <= today) {
      const dayOfWeek = current.getDay()
      if (dayOfWeek === 0 && current > start) col++
      const dateStr = current.toISOString().slice(0, 10)
      cells.push({
        date: dateStr,
        count: countMap.get(dateStr) || 0,
        col,
        row: dayOfWeek,
      })
      current.setDate(current.getDate() + 1)
    }
    return cells
  }, [countMap])

  // Month labels
  const monthLabels = useMemo(() => {
    const labels: Array<{ label: string; col: number }> = []
    let lastMonth = -1
    for (const cell of grid) {
      const month = new Date(cell.date).getMonth()
      if (month !== lastMonth) {
        lastMonth = month
        const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
        labels.push({ label: monthNames[month], col: cell.col })
      }
    }
    return labels
  }, [grid])

  const maxCol = grid.length > 0 ? Math.max(...grid.map(c => c.col)) + 1 : 0

  const getColor = (count: number): string => {
    if (count === 0) return 'var(--bg3)'
    if (count <= 2) return '#9be9a8'
    if (count <= 5) return '#40c463'
    if (count <= 10) return '#30a14e'
    return '#216e39'
  }

  const cellSize = 12
  const gap = 2
  const leftPad = 32
  const topPad = 20

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  if (loading) {
    return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>加载中...</div>
  }

  return (
    <div style={{ position: 'relative' }} onMouseMove={handleMouseMove} onMouseLeave={() => setHovered(null)}>
      {/* Day labels */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 2 }}>
        <div style={{ width: leftPad }} />
        <svg width={maxCol * (cellSize + gap)} height={topPad}>
          {monthLabels.map((m, i) => (
            <text key={i} x={m.col * (cellSize + gap)} y={14} fontSize={10} fill="var(--text4)" fontFamily="var(--font)">
              {m.label}
            </text>
          ))}
        </svg>
      </div>

      {/* Grid */}
      <div style={{ display: 'flex', gap: 0 }}>
        {/* Day of week labels */}
        <div style={{ width: leftPad, display: 'flex', flexDirection: 'column', gap, paddingTop: 0, justifyContent: 'space-between', height: 7 * (cellSize + gap) - gap }}>
          {['', '一', '', '三', '', '五', ''].map((d, i) => (
            <div key={i} style={{ height: cellSize, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4, fontSize: 10, color: 'var(--text4)' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${maxCol}, ${cellSize}px)`, gridTemplateRows: `repeat(7, ${cellSize}px)`, gap }}>
          {grid.map((cell, i) => {
            const isToday = cell.date === new Date().toISOString().slice(0, 10)
            return (
              <div
                key={i}
                onMouseEnter={() => setHovered(cell)}
                style={{
                  width: cellSize,
                  height: cellSize,
                  borderRadius: 2,
                  background: getColor(cell.count),
                  gridColumn: cell.col + 1,
                  gridRow: cell.row + 1,
                  cursor: 'pointer',
                  outline: isToday ? '1px solid var(--accent)' : 'none',
                  outlineOffset: 1,
                  transition: 'transform 0.1s',
                  transform: hovered?.date === cell.date ? 'scale(1.3)' : 'scale(1)',
                }}
              />
            )
          })}
        </div>
      </div>

      {/* Tooltip */}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(mousePos.x + 8, 500),
            top: mousePos.y - 30,
            background: 'var(--text)',
            color: 'var(--bg)',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          {hovered.date}: {hovered.count} 条消息
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 10, color: 'var(--text4)', marginRight: 4 }}>少</span>
        {[0, 1, 3, 6, 11].map(v => (
          <div key={v} style={{ width: cellSize, height: cellSize, borderRadius: 2, background: getColor(v) }} />
        ))}
        <span style={{ fontSize: 10, color: 'var(--text4)', marginLeft: 4 }}>多</span>
      </div>
    </div>
  )
}
