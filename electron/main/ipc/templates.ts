import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { kvList, kvUpsert, kvDelete } from '../../storage/db'

function extractVars(content: string): string[] {
  const matches = content.match(/\{\{(\w+)\}\}/g)
  if (!matches) return []
  return [...new Set(matches.map(m => m.slice(2, -2)))]
}

export function registerTemplatesIpc() {
  ipcMain.handle('templates:list', () => kvList('templates'))

  ipcMain.handle('templates:save', (_, template) => {
    if (!template?.id) template = { ...template, id: 'tpl_' + randomUUID() }
    template.vars = extractVars(template.content || '')
    kvUpsert('templates', template.id, template)
    return template
  })

  ipcMain.handle('templates:delete', (_, id) => {
    kvDelete('templates', id)
  })

  ipcMain.handle('templates:forAgent', (_, agentId) => {
    const all = kvList('templates') as any[]
    return all.filter(t => !t.agentId || t.agentId === agentId)
  })
}
