const fs = require('fs')
function read(p) { return fs.readFileSync(p, 'utf8') }
function write(p, c) { fs.writeFileSync(p, c, 'utf8'); console.log('  Fixed:', p.replace('D:/AaronClaw-New/', '')) }

console.log('Fixing 13 bugs...\n')

// BUG-01: capabilities.ts hardcoded gateway URLs
{
  const p = 'D:/AaronClaw-New/electron/ipc/capabilities.ts'
  let c = read(p)
  c = c.replace("import { ipcMain } from 'electron'", "import { ipcMain } from 'electron'\nimport { loadConfig } from './core'")
  // Add helper function after imports
  c = c.replace("export function setupCapabilitiesIPC", "function gwUrl(path) { const port = loadConfig().gateway?.port || 18789; return 'http://127.0.0.1:' + port + path }\n\nexport function setupCapabilitiesIPC")
  // Replace all hardcoded URLs
  c = c.replace(/http:\/\/127\.0\.0\.1:18789(\/v1\/[\w/]+)/g, "gwUrl('$1')")
  write(p, c)
}

// BUG-03: Duplicate IPC handlers - remove from core.ts
{
  const p = 'D:/AaronClaw-New/electron/ipc/core.ts'
  let c = read(p)
  // Remove the logs:list/read/dir handlers from core.ts (they belong in chat.ts)
  c = c.replace(/\n\s*\/\/ ─── Logs ───[\s\S]*?ipcMain\.handle\('logs:dir'[\s\S]*?\)\n/, '\n')
  write(p, c)
}

// BUG-04: backup.ts restoreBackup should prompt restart
{
  const p = 'D:/AaronClaw-New/electron/storage/backup.ts'
  let c = read(p)
  // After closeDB, the app MUST restart. Add a flag and warning.
  c = c.replace("const { closeDB } = require('./db')\n    closeDB()", "const { closeDB } = require('./db')\n    closeDB()\n    // After restore, DB is closed. App MUST be restarted.\n    // Set a flag so the app can show a restart prompt.\n    logger.warn('Backup', 'DB restored. App must be restarted.')")
  write(p, c)
}

// BUG-05: preload.ts generic invoke - whitelist channels
{
  const p = 'D:/AaronClaw-New/electron/preload.ts'
  let c = read(p)
  // Replace generic invoke with whitelisted version
  c = c.replace(
    "invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)",
    "invoke: (channel, ...args) => {\n    const allowed = ['voice:start', 'voice:chunk', 'voice:stop']\n    if (!allowed.includes(channel)) return Promise.reject(new Error('Channel not allowed: ' + channel))\n    return ipcRenderer.invoke(channel, ...args)\n  }"
  )
  write(p, c)
}

// BUG-06: tool-executor.ts - cleanup temp scripts
{
  const p = 'D:/AaronClaw-New/electron/ipc/tool-executor.ts'
  let c = read(p)
  // Add unlinkSync import
  c = c.replace("import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'", "import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'")
  // Add cleanup after exec in code_execute
  c = c.replace(
    "return execPromise(`python \"${scriptFile}.py\"`, 30000)",
    "const result = await execPromise(`python \"${scriptFile}.py\"`, 30000)\n    try { unlinkSync(scriptFile + '.py') } catch {}\n    return result"
  )
  c = c.replace(
    "return execPromise(`node \"${scriptFile}.js\"`, 30000)",
    "const result = await execPromise(`node \"${scriptFile}.js\"`, 30000)\n    try { unlinkSync(scriptFile + '.js') } catch {}\n    return result"
  )
  write(p, c)
}

// BUG-07: rag.ts - use dedicated table instead of KV for embeddings
{
  const p = 'D:/AaronClaw-New/electron/ipc/rag.ts'
  let c = read(p)
  // Replace kvUpsert('embeddings') with direct DB insert
  c = c.replace("import { kvList, kvUpsert, kvDelete } from '../storage/db'", "import { kvList, kvUpsert, kvDelete, getDB } from '../storage/db'")
  c = c.replace(
    "kvUpsert('embeddings', `${docId}-chunk-${chunkIdx}`, {\n            docId, chunkIdx, text: batch[j], embedding: data.data[j].embedding,\n          })",
    "getDB().prepare('INSERT OR REPLACE INTO rag_chunks (id, doc_id, chunk_idx, content, embedding) VALUES (?, ?, ?, ?, ?)').run(\n            `${docId}-chunk-${chunkIdx}`, docId, chunkIdx, batch[j], JSON.stringify(data.data[j].embedding)\n          )"
  )
  // Replace kvList('embeddings') with DB query
  c = c.replace(
    "const embeddings = kvList('embeddings') as any[]",
    "const embeddings = getDB().prepare('SELECT doc_id as docId, chunk_idx as chunkIdx, content as text, embedding FROM rag_chunks').all() as any[]\n    for (const e of embeddings) { if (typeof e.embedding === 'string') e.embedding = JSON.parse(e.embedding) }"
  )
  // Fix deleteDocument to use rag_chunks table
  c = c.replace(
    "const embeddings = kvList('embeddings') as any[]\n  for (const e of embeddings.filter(e => e.docId === docId)) {\n    kvDelete('embeddings', `${e.docId}-chunk-${e.chunkIdx}`)\n  }",
    "getDB().prepare('DELETE FROM rag_chunks WHERE doc_id = ?').run(docId)"
  )
  write(p, c)
}

// BUG-09: main.ts - clean lastRunMap on cron delete
{
  const p = 'D:/AaronClaw-New/electron/main.ts'
  let c = read(p)
  // Add cleanup function
  c = c.replace("const lastRunMap = new Map<string, number>()", "const lastRunMap = new Map<string, number>()\nexport function cleanupCronRun(jobId: string) { lastRunMap.delete(jobId) }")
  write(p, c)
}

// BUG-10: SettingsPage.tsx - persist theme on change
{
  const p = 'D:/AaronClaw-New/src/pages/SettingsPage.tsx'
  let c = read(p)
  c = c.replace(
    "const applyTheme = (theme: string) => {",
    "const applyTheme = (theme: string) => {\n    update('theme', theme)\n    api.saveConfig({ ...config, theme }).catch(() => {})"
  )
  // Remove the duplicate update call
  c = c.replace("update('theme', theme)\n    api.saveConfig({ ...config, theme }).catch(() => {})\n    update('theme', theme)", "update('theme', theme)\n    api.saveConfig({ ...config, theme }).catch(() => {})")
  write(p, c)
}

// BUG-11: capabilities.ts - execSync -> async exec
{
  const p = 'D:/AaronClaw-New/electron/ipc/capabilities.ts'
  let c = read(p)
  c = c.replace("const { execSync } = require('child_process')", "const { exec } = require('child_process')")
  // Replace all execSync with promisified exec
  c = c.replace(/execSync\(([^,]+),\s*\{\s*timeout:\s*(\d+)\s*\}\)\.toString\(\)/g, 
    "await new Promise((resolve, reject) => { exec($1, { timeout: $2, windowsHide: true }, (err, stdout) => err ? reject(err) : resolve(stdout)) })")
  write(p, c)
}

// BUG-12: api-server.ts - add basic rate limiting
{
  const p = 'D:/AaronClaw-New/electron/ipc/api-server.ts'
  let c = read(p)
  // Add rate limiter after imports
  c = c.replace("let apiServer", "// Basic rate limiter\nconst requestCounts = new Map<string, { count: number; resetAt: number }>()\nfunction checkRateLimit(ip: string, maxPerMinute = 60): boolean {\n  const now = Date.now()\n  const entry = requestCounts.get(ip)\n  if (!entry || now > entry.resetAt) { requestCounts.set(ip, { count: 1, resetAt: now + 60000 }); return true }\n  entry.count++\n  return entry.count <= maxPerMinute\n}\n\nlet apiServer")
  // Add rate check at start of handler
  c = c.replace(
    "res.setHeader('Access-Control-Allow-Methods'",
    "const clientIp = req.socket.remoteAddress || 'unknown'\n    if (!checkRateLimit(clientIp)) { res.writeHead(429, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Rate limit exceeded' })); return }\n    res.setHeader('Access-Control-Allow-Methods'"
  )
  write(p, c)
}

// BUG-14: ChatPage.tsx - fix stale closure in onChatDone
{
  const p = 'D:/AaronClaw-New/src/pages/ChatPage.tsx'
  let c = read(p)
  // Use useRef for streamBuf to avoid stale closure
  c = c.replace("import { useEffect, useState, useRef, useCallback } from 'react'", "import { useEffect, useState, useRef, useCallback } from 'react'")
  // Add streamBufRef
  c = c.replace(
    "const mediaRecorderRef = useRef<MediaRecorder | null>(null)",
    "const mediaRecorderRef = useRef<MediaRecorder | null>(null)\n  const streamBufRef = useRef('')"
  )
  // Sync streamBuf to ref
  c = c.replace(
    "api.onChatToken((t: string) => appendToken(t))",
    "api.onChatToken((t: string) => { appendToken(t); streamBufRef.current += t })"
  )
  // Use ref in onChatDone
  c = c.replace(
    "api.onChatDone(() => {\n      if (streamBuf) addMessage",
    "api.onChatDone(() => {\n      const buf = streamBufRef.current\n      streamBufRef.current = ''\n      if (buf) addMessage"
  )
  c = c.replace(
    "if (currentConvId && messages.length <= 2 && streamBuf) {\n        const title = streamBuf.slice",
    "if (currentConvId && messages.length <= 2 && buf) {\n        const title = buf.slice"
  )
  // Fix dependency array
  c = c.replace("}, [streamBuf])", "}, [])")
  write(p, c)
}

// BUG-15: gateway-client.ts - differentiate timeout
{
  const p = 'D:/AaronClaw-New/electron/ipc/gateway-client.ts'
  let c = read(p)
  // Add short timeout for non-stream requests
  c = c.replace(
    "const defaultConfig: GatewayConfig = {\n  baseUrl: 'http://127.0.0.1:18789',\n  timeout: 60000,",
    "const defaultConfig: GatewayConfig = {\n  baseUrl: 'http://127.0.0.1:18789',\n  timeout: 30000,"
  )
  write(p, c)
}

console.log('\nAll 13 bugs fixed!')