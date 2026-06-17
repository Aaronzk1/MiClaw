/**
 * GitHub Mirror Fallback — 国内直连 GitHub 自动回退
 *
 * 解决问题: 国内访问 github.com / raw.githubusercontent.com 经常超时
 * 方案: 原始URL失败 → 自动尝试镜像源，用户无感
 *
 * 覆盖场景:
 *   - ac_read_url 抓取 GitHub 页面
 *   - git clone / npm install GitHub 包
 *   - MCP 服务器从 GitHub 安装
 */

import { logger } from './logger'

// ══════════ 镜像源配置 ══════════

interface MirrorSource {
  name: string
  // 将原始URL转换为镜像URL
  rewrite: (url: string) => string
  // 健康状态缓存
  healthy: boolean | null
  lastCheck: number
}

const HEALTH_CACHE_TTL = 10 * 60 * 1000 // 10分钟健康缓存
const FETCH_TIMEOUT = 12000 // 单次请求超时

const mirrors: MirrorSource[] = [
  {
    name: 'gh-proxy',
    rewrite: (url) => `https://gh-proxy.com/?url=${encodeURIComponent(url)}`,
    healthy: null,
    lastCheck: 0,
  },
  {
    name: 'ghfast',
    rewrite: (url) => url.replace(/^(https?:\/\/)/, '$1ghfast.top/'),
    healthy: null,
    lastCheck: 0,
  },
  {
    name: 'ghproxy',
    rewrite: (url) => url.replace(/^(https?:\/\/)/, '$1ghproxy.com/'),
    healthy: null,
    lastCheck: 0,
  },
]

// ══════════ URL 匹配 ══════════

const GITHUB_PATTERNS = [
  /^https?:\/\/github\.com\//i,
  /^https?:\/\/raw\.githubusercontent\.com\//i,
  /^https?:\/\/gist\.githubusercontent\.com\//i,
  /^https?:\/\/gist\.github\.com\//i,
  /^https?:\/\/api\.github\.com\//i,
]

// ══════════ 核心: 带镜像回退的 fetch ══════════

export interface FetchResult {
  ok: boolean
  status: number
  text: string
  source: 'direct' | string // 'direct' | 镜像名
  url: string // 实际请求的URL
  error?: string
}

/**
 * 带镜像回退的 fetch
 * 1. 先尝试直连
 * 2. 失败后按优先级尝试镜像
 * 3. 每个镜像有健康缓存，不健康的跳过
 */
export async function fetchWithMirror(
  url: string,
  options?: {
    timeout?: number
    headers?: Record<string, string>
    skipDirect?: boolean    // 跳过直连(已知不可达)
    mirrorOnly?: boolean    // 只用镜像
  }
): Promise<FetchResult> {
  const timeout = options?.timeout || FETCH_TIMEOUT
  const baseHeaders = options?.headers || {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  }

  // 1. 直连尝试
  if (!options?.skipDirect && !options?.mirrorOnly) {
    try {
      const resp = await fetch(url, {
        headers: baseHeaders,
        signal: AbortSignal.timeout(timeout),
      })
      if (resp.ok) {
        const text = await resp.text()
        if (text && text.length > 50) {
          return { ok: true, status: resp.status, text, source: 'direct', url }
        }
      }
      logger.info('GitHubMirror', `直连 ${url.slice(0, 80)} → HTTP ${resp.status}`)
    } catch (e: any) {
      logger.info('GitHubMirror', `直连失败 ${url.slice(0, 60)}: ${e?.message?.slice(0, 60)}`)
    }
  }

  // 2. 镜像回退
  const now = Date.now()
  for (const mirror of mirrors) {
    // 跳过已知不健康的镜像(缓存期内)
    if (mirror.healthy === false && now - mirror.lastCheck < HEALTH_CACHE_TTL) {
      continue
    }

    const mirrorUrl = mirror.rewrite(url)
    try {
      const resp = await fetch(mirrorUrl, {
        headers: baseHeaders,
        signal: AbortSignal.timeout(timeout + 5000), // 镜像多给5秒
      })
      if (resp.ok) {
        const text = await resp.text()
        if (text && text.length > 50) {
          mirror.healthy = true
          mirror.lastCheck = now
          logger.info('GitHubMirror', `✓ ${mirror.name} 成功 ${url.slice(0, 60)}`)
          return { ok: true, status: resp.status, text, source: mirror.name, url: mirrorUrl }
        }
      }
      // 响应不OK但没抛异常，标记不健康
      mirror.healthy = false
      mirror.lastCheck = now
      logger.info('GitHubMirror', `${mirror.name} HTTP ${resp.status}`)
    } catch (e: any) {
      mirror.healthy = false
      mirror.lastCheck = now
      logger.info('GitHubMirror', `${mirror.name} 失败: ${e?.message?.slice(0, 60)}`)
    }
  }

  return {
    ok: false,
    status: 0,
    text: '',
    source: 'direct',
    url,
    error: `直连和所有镜像均失败: ${url.slice(0, 80)}`,
  }
}

// ══════════ URL 重写(给 git/npm 用) ══════════

/**
 * 获取可用的镜像URL(用于 git config insteadOf)
 * 返回第一个可用镜像的URL前缀
 */
export function getMirrorUrl(originalUrl: string): string | null {
  const now = Date.now()
  for (const mirror of mirrors) {
    if (mirror.healthy === false && now - mirror.lastCheck < HEALTH_CACHE_TTL) continue
    return mirror.rewrite(originalUrl)
  }
  return null
}

/**
 * 获取 git config --global url.insteadOf 命令
 * 让 git clone https://github.com/xxx 自动走镜像
 */
export function getGitMirrorConfig(): { original: string; mirror: string }[] {
  const configs: { original: string; mirror: string }[] = []
  const now = Date.now()

  // 只用第一个可用镜像
  for (const mirror of mirrors) {
    if (mirror.healthy === false && now - mirror.lastCheck < HEALTH_CACHE_TTL) continue
    const original = 'https://github.com/'
    const rewritten = mirror.rewrite(original)
    configs.push({ original, mirror: rewritten })

    // raw.githubusercontent.com 也要处理
    const rawOriginal = 'https://raw.githubusercontent.com/'
    const rawRewritten = mirror.rewrite(rawOriginal)
    configs.push({ original: rawOriginal, mirror: rawRewritten })

    break // 只用第一个
  }
  return configs
}

// ══════════ 健康检查(启动时预热) ══════════

/**
 * 预热镜像健康状态 + 自动配置 git 镜像
 * 在应用启动时调用，异步检测哪些镜像可用
 */
export async function warmupMirrors(): Promise<void> {
  const testUrl = 'https://api.github.com/zen'
  logger.info('GitHubMirror', '预热镜像健康检查...')

  await Promise.allSettled(
    mirrors.map(async (mirror) => {
      const start = Date.now()
      try {
        const resp = await fetch(mirror.rewrite(testUrl), {
          signal: AbortSignal.timeout(8000),
        })
        const ms = Date.now() - start
        mirror.healthy = resp.ok
        mirror.lastCheck = Date.now()
        logger.info('GitHubMirror', `${mirror.name}: ${resp.ok ? '✓' : '✗'} ${ms}ms`)
      } catch {
        mirror.healthy = false
        mirror.lastCheck = Date.now()
        logger.info('GitHubMirror', `${mirror.name}: ✗ 超时`)
      }
    })
  )

  const healthy = mirrors.filter(m => m.healthy).length
  logger.info('GitHubMirror', `预热完成: ${healthy}/${mirrors.length} 镜像可用`)

  // 智能 git 镜像: 先测直连，失败才配置镜像(不强制覆盖)
  try {
    const { execSync } = require('child_process')
    // 检查是否已有 insteadOf 配置
    let existingConfig = ''
    try {
      existingConfig = execSync('git config --global --get url.insteadOf', {
        timeout: 3000, windowsHide: true, stdio: 'pipe',
      }).toString().trim()
    } catch {}

    // 如果已经有配置，不覆盖
    if (existingConfig.includes('github.com')) {
      logger.info('GitHubMirror', 'git 镜像已存在，跳过配置')
    } else {
      // 测试直连 GitHub
      let directOk = false
      try {
        execSync('git ls-remote --heads https://github.com/XiaomiMiMo/MiMo-Code.git', {
          timeout: 10000, windowsHide: true, stdio: 'pipe',
        })
        directOk = true
        logger.info('GitHubMirror', 'git 直连 GitHub ✓，无需配置镜像')
      } catch {
        logger.info('GitHubMirror', 'git 直连 GitHub ✗，配置镜像...')
      }

      // 直连失败 + 有可用镜像 → 配置
      if (!directOk && healthy > 0) {
        const configs = getGitMirrorConfig()
        for (const cfg of configs) {
          try {
            execSync(`git config --global url."${cfg.mirror}".insteadOf "${cfg.original}"`, {
              timeout: 5000, windowsHide: true, stdio: 'pipe',
            })
            logger.info('GitHubMirror', `git 镜像已配置: ${cfg.original} → ${cfg.mirror}`)
          } catch {}
        }
      }
    }
  } catch {}
}

// ══════════ 便捷方法 ══════════

/**
 * Check if URL is a GitHub URL
 */
export function isGitHubUrl(url: string): boolean {
  return GITHUB_PATTERNS.some(p => p.test(url))
}

/**
 * Read GitHub URL with mirror fallback
 * Tries direct first, then mirrors
 */
export async function readGitHubUrl(url: string): Promise<string> {
  const result = await fetchWithMirror(url, { timeout: 15000 })
  if (result.ok) return result.text
  throw new Error(result.error || `Failed to fetch: ${url}`)
}

