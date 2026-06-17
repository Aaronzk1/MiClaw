import { ipcMain } from 'electron'
import { getDB } from '../../storage/db'

export function registerTokenStatsIpc() {
  // Daily token usage split by role, last 30 days
  ipcMain.handle('tokenStats:daily', () => {
    try {
      return getDB().prepare(`
        SELECT date(timestamp) as date, role, SUM(tokens) as total
        FROM messages
        WHERE tokens > 0 AND timestamp > datetime('now', '-30 days')
        GROUP BY date(timestamp), role
        ORDER BY date
      `).all()
    } catch { return [] }
  })

  // Top 20 conversations by token usage
  ipcMain.handle('tokenStats:byConversation', () => {
    try {
      return getDB().prepare(`
        SELECT c.data as convData, SUM(m.tokens) as total, COUNT(m.id) as msgCount
        FROM messages m
        JOIN kv c ON c.ns = 'conversations' AND c.id = m.conv_id
        WHERE m.tokens > 0
        GROUP BY m.conv_id
        ORDER BY total DESC
        LIMIT 20
      `).all().map((r: any) => {
        let title = r.convData ? JSON.parse(r.convData).title : r.convData
        return { title: title || 'Untitled', total: r.total, msgCount: r.msgCount }
      })
    } catch { return [] }
  })

  // Summary statistics
  ipcMain.handle('tokenStats:summary', () => {
    try {
      const db = getDB()
      const totals = db.prepare(`
        SELECT COALESCE(SUM(tokens), 0) as totalTokens, COUNT(*) as totalMessages
        FROM messages WHERE tokens > 0
      `).get() as any
      const convCount = db.prepare(`
        SELECT COUNT(DISTINCT conv_id) as count FROM messages WHERE tokens > 0
      `).get() as any
      const avgTokens = totals.totalMessages > 0 ? Math.round(totals.totalTokens / totals.totalMessages) : 0

      // Last 7 days for burn rate
      const recent = db.prepare(`
        SELECT COALESCE(SUM(tokens), 0) as tokens
        FROM messages
        WHERE tokens > 0 AND timestamp > datetime('now', '-7 days')
      `).get() as any

      return {
        totalTokens: totals.totalTokens,
        totalMessages: totals.totalMessages,
        avgTokensPerMessage: avgTokens,
        totalConversations: convCount.count,
        tokensLast7Days: recent.tokens,
      }
    } catch {
      return { totalTokens: 0, totalMessages: 0, avgTokensPerMessage: 0, totalConversations: 0, tokensLast7Days: 0 }
    }
  })
}
