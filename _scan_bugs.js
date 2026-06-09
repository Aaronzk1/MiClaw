const fs = require('fs')
const path = require('path')
const root = 'D:/AaronClaw-New'

function readFile(p) { try { return fs.readFileSync(p, 'utf8') } catch { return '' } }

const bugs = []

// BUG-01: capabilities.ts hardcoded gateway URL
{
  const c = readFile(root + '/electron/ipc/capabilities.ts')
  const count = (c.match(/127\.0\.0\.1:18789/g) || []).length
  if (count > 0) bugs.push({ id: 'BUG-01', severity: 'HIGH', file: 'capabilities.ts', msg: `${count} hardcoded gateway URLs (port 18789). Should use loadConfig().gateway.port. If user changes port, all capabilities break.` })
}

// BUG-02: roundText not reset between tool-call rounds
{
  const c = readFile(root + '/electron/ipc/chat.ts')
  if (c.includes('let roundText') && c.includes('fullResponse += roundText') && !c.includes("roundText = ''")) {
    bugs.push({ id: 'BUG-02', severity: 'HIGH', file: 'chat.ts', msg: 'roundText is declared once but never reset between tool-call rounds. fullResponse accumulates duplicated text across rounds.' })
  }
}

// BUG-03: Duplicate IPC handlers (logs:list etc in both core.ts and chat.ts)
{
  const core = readFile(root + '/electron/ipc/core.ts')
  const chat = readFile(root + '/electron/ipc/chat.ts')
  const duplicates = []
  for (const ch of ['logs:list', 'logs:read', 'logs:dir']) {
    if (core.includes(ch) && chat.includes(ch)) duplicates.push(ch)
  }
  if (duplicates.length > 0) bugs.push({ id: 'BUG-03', severity: 'HIGH', file: 'core.ts + chat.ts', msg: `Duplicate IPC handlers: ${duplicates.join(', ')}. Second registration silently overwrites first.` })
}

// BUG-04: backup.restoreBackup() closes DB but never reopens
{
  const c = readFile(root + '/electron/storage/backup.ts')
  if (c.includes('closeDB') && !c.includes('initDB')) {
    bugs.push({ id: 'BUG-04', severity: 'HIGH', file: 'backup.ts', msg: 'restoreBackup() calls closeDB() but never calls initDB(). After restore, ALL DB operations fail. App must restart.' })
  }
}

// BUG-05: Generic invoke() in preload.ts exposes all IPC channels
{
  const c = readFile(root + '/electron/preload.ts')
  if (c.includes("invoke: (channel")) {
    bugs.push({ id: 'BUG-05', severity: 'HIGH', file: 'preload.ts', msg: "Generic 'invoke(channel, ...args)' exposes ALL IPC channels. A compromised renderer could call any handler. Should whitelist channels." })
  }
}

// BUG-06: Temp script files never cleaned up
{
  const c = readFile(root + '/electron/ipc/tool-executor.ts')
  if (c.includes('writeFileSync(scriptFile') && !c.includes('unlinkSync') && !c.includes('cleanup')) {
    bugs.push({ id: 'BUG-06', severity: 'MEDIUM', file: 'tool-executor.ts', msg: 'Temp script files (script-*.py/js) written to sandbox but never deleted. Accumulates over time.' })
  }
}

// BUG-07: RAG embeddings stored as JSON in KV (massive memory usage)
{
  const c = readFile(root + '/electron/ipc/rag.ts')
  if (c.includes("kvUpsert('embeddings'") || c.includes("kvList('embeddings')")) {
    bugs.push({ id: 'BUG-07', severity: 'MEDIUM', file: 'rag.ts', msg: "Embeddings stored in KV (JSON serialized). 1536-dim float array = ~20KB/chunk. 1000 chunks = 20MB JSON loaded into memory every kvList('embeddings') call." })
  }
}

// BUG-08: backup restore not calling initDB
{
  const main = readFile(root + '/electron/main.ts')
  const backup = readFile(root + '/electron/storage/backup.ts')
  if (backup.includes('closeDB') && !main.includes('afterRestore') && !main.includes('reinitDB')) {
    bugs.push({ id: 'BUG-08', severity: 'MEDIUM', file: 'main.ts', msg: 'No re-initialization handler after backup restore. User must manually restart app.' })
  }
}

// BUG-09: lastRunMap in cron scheduler never cleaned
{
  const c = readFile(root + '/electron/main.ts')
  if (c.includes('lastRunMap.set') && !c.includes('lastRunMap.delete')) {
    bugs.push({ id: 'BUG-09', severity: 'LOW', file: 'main.ts', msg: 'lastRunMap grows indefinitely as cron jobs are created. Never cleaned on job deletion.' })
  }
}

// BUG-10: Theme not persisted when changed in SettingsPage
{
  const c = readFile(root + '/src/pages/SettingsPage.tsx')
  if (c.includes('applyTheme') && !c.includes("api.settingsSet('theme'") && !c.includes('saveConfig')) {
    bugs.push({ id: 'BUG-10', severity: 'MEDIUM', file: 'SettingsPage.tsx', msg: "applyTheme() changes DOM but doesn't persist to config until user clicks Save. Theme reverts on next launch." })
  }
}

// BUG-11: capabilities.ts uses execSync (blocks main process)
{
  const c = readFile(root + '/electron/ipc/capabilities.ts')
  if (c.includes('execSync')) {
    bugs.push({ id: 'BUG-11', severity: 'MEDIUM', file: 'capabilities.ts', msg: 'Still uses execSync for capInsights/capDoctor/capSessions/capKanban. Blocks main process.' })
  }
}

// BUG-12: No rate limiting on API server
{
  const c = readFile(root + '/electron/ipc/api-server.ts')
  if (!c.includes('rate') && !c.includes('limit') && !c.includes('throttle')) {
    bugs.push({ id: 'BUG-12', severity: 'MEDIUM', file: 'api-server.ts', msg: 'No rate limiting. External clients can spam the API and overload gateway.' })
  }
}

// BUG-13: Crypto master key file with default permissions
{
  const c = readFile(root + '/electron/storage/crypto.ts')
  if (c.includes('writeFileSync(KEY_FILE') && !c.includes('chmod')) {
    bugs.push({ id: 'BUG-13', severity: 'LOW', file: 'crypto.ts', msg: 'Master key file written with default permissions. Other users on the system could read it.' })
  }
}

// BUG-14: ChatPage - onChatDone closure captures stale streamBuf
{
  const c = readFile(root + '/src/pages/ChatPage.tsx')
  if (c.includes('useEffect') && c.includes('onChatDone') && c.includes('[streamBuf]')) {
    bugs.push({ id: 'BUG-14', severity: 'MEDIUM', file: 'ChatPage.tsx', msg: "onChatDone effect has [streamBuf] dependency but streamBuf changes every token. Effect re-registers listener on every token, causing potential race condition." })
  }
}

// BUG-15: gateway-client timeout for non-stream requests uses same timeout as stream
{
  const c = readFile(root + '/electron/ipc/gateway-client.ts')
  if (c.includes('timeout: 60000') && !c.includes('streamTimeout')) {
    bugs.push({ id: 'BUG-15', severity: 'LOW', file: 'gateway-client.ts', msg: 'Default timeout 60s for all requests. Non-stream requests (health check, models list) should use shorter timeout.' })
  }
}

// Sort by severity
const order = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 }
bugs.sort((a, b) => (order[a.severity] || 9) - (order[b.severity] || 9))

console.log('AaronClaw Bug Scan Results')
console.log('='.repeat(60))
for (const b of bugs) {
  console.log(`[${b.severity}] ${b.id}: ${b.file}`)
  console.log(`  ${b.msg}`)
  console.log()
}
console.log('='.repeat(60))
console.log(`Total: ${bugs.length} bugs (${bugs.filter(b=>b.severity==='HIGH').length} HIGH, ${bugs.filter(b=>b.severity==='MEDIUM').length} MEDIUM, ${bugs.filter(b=>b.severity==='LOW').length} LOW)`)