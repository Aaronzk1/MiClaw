import { ipcMain } from 'electron'
import { createEvent, listEvents, getUpcoming, getToday, updateEvent, deleteEvent, getDueReminders } from '../../ipc/calendar'

export function registerFeaturesIpc() {
  ipcMain.handle('calendar:create', (_, event: any) => { try { return createEvent(event) } catch { return null } })
  ipcMain.handle('calendar:list', (_, startDate?: string, endDate?: string) => { try { return listEvents(startDate, endDate) } catch { return [] } })
  ipcMain.handle('calendar:upcoming', () => { try { return getUpcoming() } catch { return [] } })
  ipcMain.handle('calendar:today', () => { try { return getToday() } catch { return [] } })
  ipcMain.handle('calendar:update', (_, id: string, updates: any) => { try { updateEvent(id, updates); return { ok: true } } catch { return { ok: false } } })
  ipcMain.handle('calendar:delete', (_, id: string) => { try { deleteEvent(id); return { ok: true } } catch { return { ok: false } } })
  ipcMain.handle('calendar:reminders', (_, minutes?: number) => { try { return getDueReminders(minutes) } catch { return [] } })
}
