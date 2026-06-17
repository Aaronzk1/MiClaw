import { ipcMain } from 'electron'
import { getDB } from '../../storage/db'

export function registerAnalyticsIpc() {
  ipcMain.handle('analytics:heatmap', () => {
    const rows = getDB().prepare(`
      SELECT date(timestamp) as date, COUNT(*) as count
      FROM messages
      WHERE role = 'user'
      GROUP BY date(timestamp)
      ORDER BY date DESC
      LIMIT 365
    `).all() as Array<{ date: string; count: number }>
    return rows
  })

  ipcMain.handle('analytics:summary', () => {
    const db = getDB()
    const totalMessages = (db.prepare("SELECT COUNT(*) as c FROM messages WHERE role = 'user'").get() as any).c
    const totalConversations = (db.prepare('SELECT COUNT(DISTINCT conv_id) as c FROM messages').get() as any).c
    const activeDays = (db.prepare("SELECT COUNT(DISTINCT date(timestamp)) as c FROM messages WHERE role = 'user'").get() as any).c
    const rows = db.prepare(`
      SELECT date(timestamp) as date
      FROM messages WHERE role = 'user'
      GROUP BY date(timestamp)
      ORDER BY date ASC
    `).all() as Array<{ date: string }>
    let longestStreak = 0
    let currentStreak = 0
    let prevDate: string | null = null
    for (const r of rows) {
      if (prevDate) {
        const prev = new Date(prevDate)
        const curr = new Date(r.date)
        const diff = (curr.getTime() - prev.getTime()) / 86400000
        if (diff === 1) currentStreak++
        else currentStreak = 1
      } else {
        currentStreak = 1
      }
      if (currentStreak > longestStreak) longestStreak = currentStreak
      prevDate = r.date
    }
    return { totalMessages, totalConversations, activeDays, longestStreak }
  })
}
