// ═══════════════════════════════════════════════════════════
// AaronClaw Backend Test Suite
// Run: node _test_backend.js
// ═══════════════════════════════════════════════════════════

let passed = 0, failed = 0, total = 0

function assert(condition, name) {
  total++
  if (condition) { passed++; console.log(`  [PASS] ${name}`) }
  else { failed++; console.error(`  [FAIL] ${name}`) }
}

function suite(name) { console.log(`\n[Suite] ${name}`) }

// ═══════════════════════════════════════════════════════════
// Test 1: Intent Classification
// ═══════════════════════════════════════════════════════════
suite('Intent Classification')

// Inline the classifyIntent logic for testing
function classifyIntent(msg) {
  const lower = msg.toLowerCase()
  const intentRules = [
    { kw: ['write code','implement','create a','\u5199\u4ee3\u7801','\u5b9e\u73b0','\u7f16\u5199','\u5f00\u53d1','debug','\u8c03\u8bd5','refactor','\u91cd\u6784'], agent: 'coder', intent: 'code' },
    { kw: ['analyze','data','csv','excel','\u5206\u6790\u6570\u6360','\u7edf\u8ba1'], agent: 'analyst', intent: 'analyze' },
    { kw: ['research','\u8c03\u7814','\u8bba\u6587','report','\u7814\u7a76','study','paper'], agent: 'researcher', intent: 'research' },
    { kw: ['search','\u641c\u7d22','\u67e5\u627e','\u67e5\u4e00\u4e0b','find','look up'], agent: 'default', intent: 'search' },
    { kw: ['write article','\u5199\u6587\u7ae0','\u6587\u6848','\u5199\u4f5c','\u5c0f\u8bf4','blog','copywriting'], agent: 'writer', intent: 'write' },
  ]
  let best = { intent: 'chat', confidence: 0.2, agentId: 'default' }
  for (const rule of intentRules) {
    let score = 0
    for (const kw of rule.kw) { if (lower.includes(kw)) score += 0.4 }
    if (score > best.confidence) {
      best = { intent: rule.intent, confidence: Math.min(score, 1), agentId: rule.agent }
    }
  }
  return best
}

assert(classifyIntent('\u5199\u4ee3\u7801 python').intent === 'code', 'Chinese "write code" -> code')
assert(classifyIntent('\u5199\u4ee3\u7801 python').agentId === 'coder', 'Chinese "write code" -> coder agent')
assert(classifyIntent('analyze this CSV data').intent === 'analyze', 'English "analyze CSV" -> analyze')
assert(classifyIntent('\u641c\u7d22\u8bba\u6587').intent === 'research', 'Chinese "search paper" -> research (论文=keyword)')
assert(classifyIntent('\u5199\u6587\u7ae0').intent === 'write', 'Chinese "write article" -> write')
assert(classifyIntent('I want to research this topic').intent === 'research', 'English "research topic" -> research')
assert(classifyIntent('hello world').intent === 'chat', 'Greeting -> chat')
assert(classifyIntent('debug this code').agentId === 'coder', '"debug" -> coder')
assert(classifyIntent('refactor the function').agentId === 'coder', '"refactor" -> coder')
assert(classifyIntent('\u5206\u6790\u6570\u6360').agentId === 'analyst', 'Chinese "analyze data" -> analyst')

// ═══════════════════════════════════════════════════════════
// Test 2: Cron Expression Matching
// ═══════════════════════════════════════════════════════════
suite('Cron Expression Matching')

function matchesCron(schedule, now) {
  const parts = schedule.trim().split(/\s+/)
  if (parts.length < 2) return false
  const [min, hour, day, month, weekday] = parts
  const checks = [
    { val: now.getMinutes(), expr: min },
    { val: now.getHours(), expr: hour },
    { val: now.getDate(), expr: day || '*' },
    { val: now.getMonth() + 1, expr: month || '*' },
    { val: now.getDay(), expr: weekday || '*' },
  ]
  return checks.every(({ val, expr }) => {
    if (expr === '*') return true
    if (expr.startsWith('*/')) return val % parseInt(expr.slice(2)) === 0
    if (expr.includes(',')) return expr.split(',').map(Number).includes(val)
    return val === parseInt(expr)
  })
}

const testDate1 = new Date(2026, 0, 1, 12, 30, 0) // Jan 1 2026 12:30:00 Thu
assert(matchesCron('30 12 * * *', testDate1), 'Exact match: 30 12 * * * at 12:30')
assert(!matchesCron('31 12 * * *', testDate1), 'No match: 31 12 * * * at 12:30')
assert(matchesCron('* * * * *', testDate1), 'Always match: * * * * *')
assert(matchesCron('*/5 * * * *', testDate1), 'Every 5 min: */5 at minute 30')
assert(!matchesCron('*/7 * * * *', testDate1), 'Not every 7 min: */7 at minute 30')
assert(matchesCron('30 12 1 1 *', testDate1), 'Full match: 30 12 1 1 *')
assert(matchesCron('0,30 * * * *', testDate1), 'Comma match: 0,30 at minute 30')
assert(!matchesCron('0,15 * * * *', testDate1), 'Comma no match: 0,15 at minute 30')

// ═══════════════════════════════════════════════════════════
// Test 3: DB Input Validation
// ═══════════════════════════════════════════════════════════
suite('DB Input Validation')

function validateId(id) {
  if (!id || typeof id !== 'string') throw new Error('Invalid id')
  if (id.length > 200) throw new Error('Id too long')
  return id
}

function validateNs(ns) {
  const allowed = ['agents', 'providers', 'models', 'skills', 'memory', 'cron', 'mcp',
    'groups', 'conversations', 'config', 'settings', 'drafts', 'prompts',
    'documents', 'embeddings', 'workflows']
  if (!allowed.includes(ns)) throw new Error(`Invalid namespace: ${ns}`)
  return ns
}

function validateData(data) {
  const json = JSON.stringify(data)
  if (json.length > 1024 * 1024) throw new Error('Data too large (>1MB)')
  return json
}

assert(validateId('test-123') === 'test-123', 'Valid id passes')
assert(validateNs('agents') === 'agents', 'Valid namespace passes')
assert(validateData({ name: 'test' }) === '{"name":"test"}', 'Valid data passes')

let threw = false
try { validateId('') } catch { threw = true }
assert(threw, 'Empty id throws')

threw = false
try { validateId('x'.repeat(201)) } catch { threw = true }
assert(threw, 'Too long id throws')

threw = false
try { validateNs('invalid') } catch { threw = true }
assert(threw, 'Invalid namespace throws')

threw = false
try { validateData('x'.repeat(1024 * 1024 + 1)) } catch { threw = true }
assert(threw, 'Too large data throws')

// ═══════════════════════════════════════════════════════════
// Test 4: Tool Security Checks
// ═══════════════════════════════════════════════════════════
suite('Tool Security Checks')

const BLOCKED_PATTERNS = [
  /\brm\s+-rf\b/i, /\bformat\b/i, /\bdel\s+\/[sfq]\b/i,
  /\bregedit\b/i, /\bnet\s+user\b/i, /\bshutdown\b/i,
  /\bpowershell\s+-[eE]c\b/i, /\bcmd\s+\/c\s+del\b/i,
]

function isBlockedCommand(cmd) {
  return BLOCKED_PATTERNS.some(p => p.test(cmd))
}

assert(isBlockedCommand('rm -rf /'), 'Block rm -rf /')
assert(isBlockedCommand('format C:'), 'Block format C:')
assert(isBlockedCommand('del /s /f /q C:\\'), 'Block del /s /f /q')
assert(isBlockedCommand('regedit'), 'Block regedit')
assert(isBlockedCommand('shutdown -s'), 'Block shutdown')
assert(!isBlockedCommand('python script.py'), 'Allow python')
assert(!isBlockedCommand('node index.js'), 'Allow node')
assert(!isBlockedCommand('git status'), 'Allow git')
assert(!isBlockedCommand('echo hello'), 'Allow echo')
assert(!isBlockedCommand('ls -la'), 'Allow ls')

// ═══════════════════════════════════════════════════════════
// Test 5: Markdown Sanitization
// ═══════════════════════════════════════════════════════════
suite('Markdown Sanitization')

function sanitizeBasic(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/javascript:/gi, '')
}

assert(!sanitizeBasic('<script>alert(1)</script>hello').includes('<script>'), 'Remove script tags')
assert(!sanitizeBasic('<img onerror="alert(1)">').includes('onerror='), 'Remove onerror handler')
assert(!sanitizeBasic('<a href="javascript:alert(1)">').includes('javascript:'), 'Remove javascript: href')
assert(sanitizeBasic('<p>hello</p>') === '<p>hello</p>', 'Keep safe HTML')

// ═══════════════════════════════════════════════════════════
// Test 6: Text Chunking (RAG)
// ═══════════════════════════════════════════════════════════
suite('Text Chunking (RAG)')

function chunkText(text, chunkSize, overlap) {
  const chunks = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end))
    start += chunkSize - overlap
  }
  return chunks
}

const text1 = 'A'.repeat(1000)
const chunks1 = chunkText(text1, 500, 50)
assert(chunks1.length === 3, `1000 chars / 500 chunk / 50 overlap = 3 chunks (got ${chunks1.length})`)
assert(chunks1[0].length === 500, 'First chunk is 500 chars')
assert(chunks1[1].length === 500, 'Second chunk is 500 chars')
assert(chunks1[2].length === 100, 'Last chunk is 100 chars')

const text2 = 'Hello World'
const chunks2 = chunkText(text2, 5, 1)
assert(chunks2.length === 3, `11 chars / 5 chunk / 1 overlap = 3 chunks (got ${chunks2.length})`)
assert(chunks2[0] === 'Hello', 'First chunk: Hello')
assert(chunks2[1] === 'o Wor', 'Second chunk: o Wor')
assert(chunks2[2] === 'rld', 'Third chunk: rld')

// ═══════════════════════════════════════════════════════════
// Test 7: Cosine Similarity
// ═══════════════════════════════════════════════════════════
suite('Cosine Similarity')

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1)
}

assert(Math.abs(cosineSimilarity([1, 0, 0], [1, 0, 0]) - 1.0) < 0.001, 'Identical vectors = 1.0')
assert(Math.abs(cosineSimilarity([1, 0, 0], [0, 1, 0]) - 0.0) < 0.001, 'Orthogonal vectors = 0.0')
assert(Math.abs(cosineSimilarity([1, 0], [0, 1]) - 0.0) < 0.001, 'Perpendicular 2D = 0.0')
assert(cosineSimilarity([1, 1], [1, 1]) > 0.99, 'Same direction ~1.0')
assert(cosineSimilarity([1, 0], [-1, 0]) < -0.99, 'Opposite direction ~-1.0')

// ═══════════════════════════════════════════════════════════
// Test 8: Circuit Breaker
// ═══════════════════════════════════════════════════════════
suite('Circuit Breaker')

class CircuitBreaker {
  constructor() { this.failures = 0; this.state = 'closed'; this.threshold = 5; this.recoveryTime = 100 }
  async execute(fn) {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.recoveryTime) this.state = 'half-open'
      else throw new Error('Circuit open')
    }
    try { const r = await fn(); this.onSuccess(); return r }
    catch (e) { this.onFailure(); throw e }
  }
  onSuccess() { this.failures = 0; this.state = 'closed' }
  onFailure() { this.failures++; this.lastFailure = Date.now(); if (this.failures >= this.threshold) this.state = 'open' }
}

async function testCircuitBreaker() {
  const cb = new CircuitBreaker()
  assert(cb.state === 'closed', 'Initial state: closed')

  // 4 failures should not trip
  for (let i = 0; i < 4; i++) {
    try { await cb.execute(() => Promise.reject(new Error('fail'))) } catch {}
  }
  assert(cb.state === 'closed', 'After 4 failures: still closed')
  assert(cb.failures === 4, 'Failures count: 4')

  // 5th failure trips the breaker
  try { await cb.execute(() => Promise.reject(new Error('fail'))) } catch {}
  assert(cb.state === 'open', 'After 5 failures: open')

  // Should reject immediately when open
  let openThrew = false
  try { await cb.execute(() => Promise.resolve('ok')) } catch { openThrew = true }
  assert(openThrew, 'Rejects when open')

  // After recovery time, should go half-open
  await new Promise(r => setTimeout(r, 150))
  const result = await cb.execute(() => Promise.resolve('recovered'))
  assert(result === 'recovered', 'Recovers after timeout')
  assert(cb.state === 'closed', 'State after recovery: closed')
}
testCircuitBreaker()

// ═══════════════════════════════════════════════════════════
// Test 9: Prompt Template Rendering
// ═══════════════════════════════════════════════════════════
suite('Prompt Template Rendering')

function renderTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || `{${key}}`)
}

assert(renderTemplate('Hello {name}!', { name: 'World' }) === 'Hello World!', 'Simple template')
assert(renderTemplate('{a} + {b}', { a: '1', b: '2' }) === '1 + 2', 'Multi-var template')
assert(renderTemplate('No vars', { a: '1' }) === 'No vars', 'No placeholders')
assert(renderTemplate('{missing}', {}) === '{missing}', 'Missing var keeps placeholder')

// ═══════════════════════════════════════════════════════════
// Test 10: Token Estimation
// ═══════════════════════════════════════════════════════════
suite('Token Estimation')

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4)
}

assert(estimateTokens('hello') === 2, '5 chars ~ 2 tokens')
assert(estimateTokens('') === 0, 'Empty = 0 tokens')
assert(estimateTokens('a'.repeat(100)) === 25, '100 chars = 25 tokens')
assert(estimateTokens(null) === 0, 'Null = 0 tokens')
assert(estimateTokens(undefined) === 0, 'Undefined = 0 tokens')

// ═══════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(50))
console.log(`Results: ${passed}/${total} passed, ${failed} failed`)
if (failed === 0) console.log('ALL TESTS PASSED')
else console.log('SOME TESTS FAILED')
console.log('═'.repeat(50))
process.exit(failed > 0 ? 1 : 0)