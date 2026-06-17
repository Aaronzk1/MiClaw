import { ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, readdirSync, readFileSync, statSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { execSync } from 'child_process'

const CLAWHUB_API = 'https://clawhub.ai/api/v1'

function getOpenClawPluginsDir(): string {
  return join(homedir(), '.openclaw', 'plugins')
}

function getOpenClawSkillsDir(): string {
  return join(homedir(), '.openclaw', 'workspace', 'skills')
}

function scanInstalledPlugins(): any[] {
  const dir = getOpenClawPluginsDir()
  if (!existsSync(dir)) return []
  const plugins: any[] = []
  try {
    for (const name of readdirSync(dir)) {
      const pluginDir = join(dir, name)
      if (!statSync(pluginDir).isDirectory()) continue
      const pkgPath = join(pluginDir, 'package.json')
      const manifestPath = join(pluginDir, 'manifest.json')
      let meta: any = { id: name, name, installed: true }
      const metaPath = existsSync(pkgPath) ? pkgPath : existsSync(manifestPath) ? manifestPath : null
      if (metaPath) {
        try {
          const raw = JSON.parse(readFileSync(metaPath, 'utf8'))
          meta = { ...meta, name: raw.name || name, description: raw.description || '', version: raw.version || '', author: raw.author || '', installed: true, homepage: raw.homepage || '', repository: raw.repository || '' }
        } catch {}
      }
      plugins.push(meta)
    }
  } catch {}
  return plugins
}

function scanInstalledSkills(): string[] {
  const dir = getOpenClawSkillsDir()
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
  } catch { return [] }
}

async function searchClawHub(query: string, limit = 30): Promise<any[]> {
  try {
    const url = `${CLAWHUB_API}/search?q=${encodeURIComponent(query)}&limit=${limit}`
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!resp.ok) return []
    const data = await resp.json() as any
    return (data.results || []).map((r: any) => ({
      id: r.slug,
      slug: r.slug,
      name: r.displayName || r.slug,
      description: r.summary || '',
      version: r.version || '',
      author: r.owner?.displayName || r.ownerHandle || '',
      authorAvatar: r.owner?.image || '',
      installed: false,
      source: 'clawhub',
      updatedAt: r.updatedAt,
    }))
  } catch { return [] }
}

async function fetchClawHubDetail(slug: string): Promise<any | null> {
  try {
    const resp = await fetch(`${CLAWHUB_API}/skills/${encodeURIComponent(slug)}`, { signal: AbortSignal.timeout(8000) })
    if (!resp.ok) return null
    return await resp.json()
  } catch { return null }
}

// Search npm registry for openclaw plugins
async function getLatestVersion(packageName: string): Promise<string | null> {
  try {
    const resp = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, { signal: AbortSignal.timeout(5000) })
    if (!resp.ok) return null
    const data = await resp.json() as any
    return data.version || null
  } catch { return null }
}

async function searchNpmPlugins(query: string): Promise<any[]> {
  try {
    const resp = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query + ' openclaw')}&size=20`, { signal: AbortSignal.timeout(5000) })
    if (!resp.ok) return []
    const data = await resp.json() as any
    return (data.objects || []).map((o: any) => ({
      id: o.package.name,
      name: o.package.name,
      description: o.package.description || '',
      version: o.package.version || '',
      author: o.package.publisher?.username || o.package.author?.name || '',
      homepage: o.package.links?.homepage || '',
      installed: false,
      source: 'npm',
    }))
  } catch { return [] }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0, nb = pb[i] || 0
    if (na !== nb) return na - nb
  }
  return 0
}

async function installClawHubSkill(slug: string): Promise<{ ok: boolean; error?: string }> {
  const skillsDir = getOpenClawSkillsDir()
  if (!existsSync(skillsDir)) mkdirSync(skillsDir, { recursive: true })

  const targetDir = join(skillsDir, slug)
  if (existsSync(targetDir)) return { ok: true }

  try {
    // Download skill archive from ClawHub
    const resolveUrl = `${CLAWHUB_API}/skills/${encodeURIComponent(slug)}/install`
    const resp = await fetch(resolveUrl, { signal: AbortSignal.timeout(15000) })
    if (!resp.ok) return { ok: false, error: `ClawHub returned ${resp.status}` }

    const data = await resp.json() as any
    if (!data?.downloadUrl) return { ok: false, error: 'No download URL' }

    // Download the archive
    const archResp = await fetch(data.downloadUrl, { signal: AbortSignal.timeout(30000) })
    if (!archResp.ok) return { ok: false, error: 'Download failed' }

    const buffer = Buffer.from(await archResp.arrayBuffer())
    const tgzPath = join(skillsDir, `${slug}.tgz`)
    writeFileSync(tgzPath, buffer)

    // Extract
    mkdirSync(targetDir, { recursive: true })
    execSync(`tar -xzf "${tgzPath}" -C "${targetDir}" --strip-components=1`, { timeout: 15000, stdio: 'pipe' })

    // Cleanup
    try { rmSync(tgzPath, { force: true }) } catch {}
    return { ok: true }
  } catch (e: any) {
    // Cleanup on failure
    try { rmSync(targetDir, { recursive: true, force: true }) } catch {}
    return { ok: false, error: e.message }
  }
}

export function registerPluginsIpc() {
  ipcMain.handle('plugins:list', async () => {
    const installed = scanInstalledPlugins()
    const installedSkillSlugs = new Set(scanInstalledSkills())

    // ClawHub doesn't support wildcard search — use popular keywords
    const keywords = ['skill', 'tool', 'agent', 'web', 'code', 'data']
    const searches = await Promise.all(keywords.map(k => searchClawHub(k, 10)))
    const bySlug = new Map<string, any>()
    for (const results of searches) {
      for (const r of results) {
        if (!bySlug.has(r.slug)) bySlug.set(r.slug, r)
      }
    }
    const available = [...bySlug.values()]
      .filter((s: any) => !installedSkillSlugs.has(s.slug))
      .slice(0, 30)
      .map((s: any) => ({ ...s, installed: false }))

    return { installed, available }
  })

  ipcMain.handle('plugins:details', async (_, pluginId: string) => {
    // Try ClawHub first
    const clawhub = await fetchClawHubDetail(pluginId)
    if (clawhub) return { id: pluginId, readme: clawhub.readme || clawhub.summary || '', source: 'clawhub' }

    // Fallback to local
    const dir = join(getOpenClawPluginsDir(), pluginId)
    if (!existsSync(dir)) return null
    const readmePath = join(dir, 'README.md')
    let readme = ''
    if (existsSync(readmePath)) {
      try { readme = readFileSync(readmePath, 'utf8').slice(0, 5000) } catch {}
    }
    return { id: pluginId, readme }
  })

  ipcMain.handle('plugins:openDir', async () => {
    const dir = getOpenClawPluginsDir()
    const { shell } = require('electron')
    if (existsSync(dir)) shell.openPath(dir)
  })

  ipcMain.handle('plugins:install', async (_, pluginId: string, source?: string) => {
    if (source === 'clawhub') return installClawHubSkill(pluginId)

    // npm install fallback
    const dir = getOpenClawPluginsDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const targetDir = join(dir, pluginId.replace('/', '_').replace('@', ''))
    try {
      execSync(`npm pack ${pluginId} --pack-destination "${dir}"`, { timeout: 30000, stdio: 'pipe' })
      const tgz = readdirSync(dir).find(f => f.endsWith('.tgz'))
      if (tgz) {
        execSync(`tar -xzf "${join(dir, tgz)}" -C "${dir}"`, { timeout: 10000, stdio: 'pipe' })
        const extracted = join(dir, 'package')
        if (existsSync(extracted)) {
          const { renameSync } = require('fs')
          renameSync(extracted, targetDir)
        }
        const { unlinkSync } = require('fs')
        try { unlinkSync(join(dir, tgz)) } catch {}
      }
      return { ok: true }
    } catch (e: any) {
      try {
        mkdirSync(targetDir, { recursive: true })
        writeFileSync(join(targetDir, 'manifest.json'), JSON.stringify({ name: pluginId, version: '0.0.1', description: 'Installed plugin' }, null, 2))
        return { ok: true, fallback: true }
      } catch { return { ok: false, error: e.message } }
    }
  })

  ipcMain.handle('plugins:uninstall', async (_, pluginId: string) => {
    // Try skills dir first
    const skillDir = join(getOpenClawSkillsDir(), pluginId)
    if (existsSync(skillDir)) {
      try { rmSync(skillDir, { recursive: true, force: true }); return { ok: true } } catch (e: any) { return { ok: false, error: e.message } }
    }
    // Fallback to plugins dir
    const dir = join(getOpenClawPluginsDir(), pluginId)
    if (!existsSync(dir)) return { ok: false, error: 'Not found' }
    try { rmSync(dir, { recursive: true, force: true }); return { ok: true } } catch (e: any) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('plugins:search', async (_, query: string) => {
    if (!query || query.trim().length < 2) return []
    const [clawhub, npm] = await Promise.all([
      searchClawHub(query.trim(), 20),
      searchNpmPlugins(query.trim()),
    ])
    // ClawHub results first, then npm
    const seen = new Set(clawhub.map((s: any) => s.id))
    return [...clawhub, ...npm.filter((p: any) => !seen.has(p.id))]
  })

  ipcMain.handle('plugins:checkUpdates', async () => {
    const installed = scanInstalledPlugins()
    const updates: Array<{ id: string; current: string; latest: string }> = []
    for (const p of installed) {
      if (!p.version) continue
      const latest = await getLatestVersion(p.id)
      if (latest && compareVersions(latest, p.version) > 0) {
        updates.push({ id: p.id, current: p.version, latest })
      }
    }
    return updates
  })
}
