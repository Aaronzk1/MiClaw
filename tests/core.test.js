/**
 * Core logic unit tests — no framework needed, just Node assert
 * Run: node tests/core.test.js
 */

const assert = require('assert')

let passed = 0, failed = 0

function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`  PASS  ${name}`)
  } catch (e) {
    failed++
    console.log(`  FAIL  ${name}: ${e.message}`)
  }
}

// ═══════════════════════════════════════
// isPathAllowed — path safety
// ═══════════════════════════════════════

const BLOCKED_PATHS = [
  /^c:\\windows\\system32/i,
  /^c:\\windows\\syswow64/i,
  /^c:\\program files/i,
  /^c:\\program files \(x86\)/i,
  /\\\.ssh\\/i,
  /\\\.aws\\/i,
  /\\\.azure\\/i,
  /\\\.gnupg\\/i,
  /[\\\/]\.env$/i,
  /[\\\/]\.env\.[a-z]/i,
  /\\credentials/i,
  /\\\.git\\/i,
  /node_modules\\/i,
]

function isPathAllowed(filePath) {
  if (!filePath) return false
  const normalized = filePath.replace(/\//g, '\\')
  return !BLOCKED_PATHS.some(re => re.test(normalized))
}

console.log('\n=== isPathAllowed ===')

test('allows normal user path', () => assert.strictEqual(isPathAllowed('C:\\Users\\test\\file.txt'), true))
test('blocks system32', () => assert.strictEqual(isPathAllowed('C:\\Windows\\System32\\cmd.exe'), false))
test('blocks .ssh', () => assert.strictEqual(isPathAllowed('C:\\Users\\test\\.ssh\\id_rsa'), false))
test('blocks .env file', () => assert.strictEqual(isPathAllowed('C:\\project\\.env'), false))
test('blocks .env.local', () => assert.strictEqual(isPathAllowed('C:\\project\\.env.local'), false))
test('blocks .env.production', () => assert.strictEqual(isPathAllowed('C:\\project\\.env.production'), false))
test('allows .environment', () => assert.strictEqual(isPathAllowed('C:\\project\\.environment'), true))
test('blocks credentials', () => assert.strictEqual(isPathAllowed('C:\\project\\credentials.json'), false))
test('blocks node_modules', () => assert.strictEqual(isPathAllowed('C:\\project\\node_modules\\pkg'), false))
test('blocks .git', () => assert.strictEqual(isPathAllowed('C:\\project\\.git\\config'), false))
test('allows normal project file', () => assert.strictEqual(isPathAllowed('D:\\MiClaw\\src\\main.ts'), true))
test('blocks empty path', () => assert.strictEqual(isPathAllowed(''), false))
test('blocks Program Files', () => assert.strictEqual(isPathAllowed('C:\\Program Files\\app.exe'), false))
test('normalizes forward slashes', () => assert.strictEqual(isPathAllowed('C:/Windows/System32/cmd.exe'), false))

// ═══════════════════════════════════════
// estimateTokens — token estimation
// ═══════════════════════════════════════

console.log('\n=== estimateTokens ===')

function estimateTokens(text) {
  const t = text || ''
  const cnRatio = (t.match(/[一-鿿]/g) || []).length / Math.max(1, t.length)
  const charsPerToken = cnRatio > 0.3 ? 1.8 : 3.5
  return Math.ceil(t.length / charsPerToken)
}

test('empty string', () => assert.strictEqual(estimateTokens(''), 0))
test('pure English ~3.5 char/token', () => {
  const t = estimateTokens('hello world test') // 16 chars
  assert.ok(t >= 4 && t <= 6, `expected ~5, got ${t}`)
})
test('pure Chinese ~1.8 char/token', () => {
  const t = estimateTokens('你好世界测试中文') // 7 chars
  assert.ok(t >= 3 && t <= 5, `expected ~4, got ${t}`)
})
test('mixed text', () => {
  const t = estimateTokens('Hello 你好 World 世界')
  assert.ok(t >= 4 && t <= 8, `expected ~6, got ${t}`)
})
test('null input', () => assert.strictEqual(estimateTokens(null), 0))
test('undefined input', () => assert.strictEqual(estimateTokens(undefined), 0))

// ═══════════════════════════════════════
// enrichMediaContent — media URL detection
// ═══════════════════════════════════════

console.log('\n=== enrichMediaContent ===')

function enrichMediaContent(text) {
  if (!text) return text
  const urlRe = /(?<!!\[)(?<!\()(https?:\/\/[^\s)\]]+?\.(?:png|jpg|jpeg|gif|webp|svg|mp3|mp4|wav|ogg|webm|flac))(?=[\s)\]]|$)/gi
  return text.replace(urlRe, (url) => {
    const lower = url.toLowerCase()
    if (/\.(png|jpg|jpeg|gif|webp|svg)$/.test(lower)) return `![image](${url})`
    if (/\.(mp3|wav|ogg|flac)$/.test(lower)) return `[audio](${url})`
    if (/\.(mp4|webm)$/.test(lower)) return `[video](${url})`
    return url
  })
}

test('image URL to markdown', () => {
  assert.ok(enrichMediaContent('see https://example.com/cat.png here').includes('![image]('))
})
test('already-markdown not double-wrapped', () => {
  const input = '![x](https://example.com/img.png)'
  assert.strictEqual(enrichMediaContent(input), input)
})
test('no media unchanged', () => {
  assert.strictEqual(enrichMediaContent('just text'), 'just text')
})
test('video URL', () => {
  assert.ok(enrichMediaContent('https://example.com/demo.mp4').includes('[video]('))
})
test('audio URL', () => {
  assert.ok(enrichMediaContent('https://example.com/song.mp3').includes('[audio]('))
})
test('null input', () => assert.strictEqual(enrichMediaContent(null), null))
test('multiple URLs', () => {
  const result = enrichMediaContent('img https://a.com/1.png and https://b.com/2.mp4')
  assert.ok(result.includes('![image]('))
  assert.ok(result.includes('[video]('))
})

// ═══════════════════════════════════════
// buildFtsQuery — FTS tokenization
// ═══════════════════════════════════════

console.log('\n=== buildFtsQuery ===')

function buildFtsQuery(text, maxWords = 8) {
  const words = text.toLowerCase().split(/[\s,.;!?。；！？、\n]+/).filter((w) => w.length > 1).slice(0, maxWords)
  if (words.length === 0) return null
  return words.map((t) => `"${t}"`).join(' OR ')
}

test('normal query', () => {
  const q = buildFtsQuery('搜索 今天的 天气')
  assert.ok(q.includes('"搜索"'))
  assert.ok(q.includes('"今天的"'))
  assert.ok(q.includes('"天气"'))
})
test('Chinese without spaces is one token', () => {
  const q = buildFtsQuery('今天天气怎么样')
  assert.ok(q.includes('"今天天气怎么样"'))
})
test('short words filtered', () => {
  const q = buildFtsQuery('a bb c dd')
  assert.ok(!q.includes('"a"'))
  assert.ok(q.includes('"bb"'))
})
test('empty result', () => assert.strictEqual(buildFtsQuery(''), null))
test('single-char only', () => assert.strictEqual(buildFtsQuery('的 了 是'), null))
test('maxWords limit', () => {
  const q = buildFtsQuery('one two three four five six seven eight nine ten')
  const count = (q.match(/"/g) || []).length / 2
  assert.ok(count <= 8, `expected <=8 words, got ${count}`)
})

// ═══════════════════════════════════════
// Personality block builder
// ═══════════════════════════════════════

console.log('\n=== buildPersonalityBlock ===')

const TONE_MAP = { '专业': '用词精准', '轻松': '语气亲切', '幽默': '善用比喻' }
const STYLE_MAP = { '简洁': '能一句话说清', '详细': '提供完整背景' }

function buildPersonalityBlock(agent) {
  const p = agent?.personality
  if (!p && !agent?.identity) return null
  const parts = ['## 性格特征']
  if (agent?.identity) parts.push('身份: ' + agent.identity)
  if (agent?.expertise) parts.push('专长: ' + agent.expertise)
  if (p?.tone && TONE_MAP[p.tone]) parts.push('语气: ' + TONE_MAP[p.tone])
  if (p?.style && STYLE_MAP[p.style]) parts.push('表达: ' + STYLE_MAP[p.style])
  if (p?.quirks?.length) parts.push('特征: ' + p.quirks.join('；'))
  if (p?.backstory) parts.push('背景: ' + p.backstory)
  if (p?.values?.length) parts.push('价值: ' + p.values.join('、'))
  return parts.join('\n')
}

test('agent with full personality', () => {
  const result = buildPersonalityBlock({
    identity: '金融分析师', expertise: 'A股',
    personality: { tone: '专业', style: '简洁', quirks: ['数据先行'], backstory: '10年经验', values: ['风控'] }
  })
  assert.ok(result.includes('金融分析师'))
  assert.ok(result.includes('用词精准'))
  assert.ok(result.includes('数据先行'))
  assert.ok(result.includes('10年经验'))
})
test('agent without personality', () => {
  const result = buildPersonalityBlock({ identity: '助手', expertise: '通用' })
  assert.ok(result.includes('助手'))
  assert.ok(!result.includes('语气'))
})
test('no agent returns null', () => assert.strictEqual(buildPersonalityBlock(null), null))
test('empty agent returns null', () => assert.strictEqual(buildPersonalityBlock({}), null))

// ═══════════════════════════════════════
// Summary
// ═══════════════════════════════════════

console.log(`\n${'='.repeat(40)}`)
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`)
if (failed > 0) process.exit(1)
