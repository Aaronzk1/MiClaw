import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { homedir } from 'os'

export interface SkillEntry {
  id: string
  label: string
  desc: string
  emoji?: string
  source: string
}

const HOME = homedir()

function getSkillDirs(): { dir: string; source: string }[] {
  const dirs: { dir: string; source: string }[] = []

  // Bundled skills from OpenClaw resources
  const resDir = app.isPackaged ? process.resourcesPath : join(__dirname, '..', 'resources')
  const bundledDir = join(resDir, 'openclaw', 'skills')
  if (existsSync(bundledDir)) dirs.push({ dir: bundledDir, source: 'bundled' })

  // Managed skills (user-installed via ClawHub)
  const managedDir = join(HOME, '.openclaw', 'skills')
  if (existsSync(managedDir)) dirs.push({ dir: managedDir, source: 'managed' })

  // Personal agent skills
  const personalDir = join(HOME, '.agents', 'skills')
  if (existsSync(personalDir)) dirs.push({ dir: personalDir, source: 'personal' })

  // Workspace skills
  const workspaceDir = join(HOME, '.openclaw', 'workspace', 'skills')
  if (existsSync(workspaceDir)) dirs.push({ dir: workspaceDir, source: 'workspace' })

  return dirs
}

function parseFrontmatter(content: string): { name?: string; description?: string; emoji?: string } | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match) return null

  const fm = match[1]
  const result: any = {}

  // Extract name
  const nameMatch = fm.match(/^name:\s*(?:"([^"]+)"|'([^']+)'|(\S+))/m)
  if (nameMatch) result.name = nameMatch[1] || nameMatch[2] || nameMatch[3]

  // Extract description
  const descMatch = fm.match(/^description:\s*(?:"([^"]+)"|'([^']+)'|(.+))/m)
  if (descMatch) result.description = descMatch[1] || descMatch[2] || descMatch[3]

  // Extract emoji from metadata.openclaw.emoji
  const emojiMatch = fm.match(/"emoji":\s*"([^"]+)"/)
  if (emojiMatch) result.emoji = emojiMatch[1]

  return result.name ? result : null
}

function scanSkillDir(dir: string, source: string): SkillEntry[] {
  const skills: SkillEntry[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillMd = join(dir, entry.name, 'SKILL.md')
      if (!existsSync(skillMd)) continue
      try {
        const content = readFileSync(skillMd, 'utf8')
        const meta = parseFrontmatter(content)
        if (meta?.name) {
          skills.push({
            id: meta.name,
            label: meta.name,
            desc: meta.description || '',
            emoji: meta.emoji,
            source,
          })
        }
      } catch { /* skip unreadable skill */ }
    }
  } catch { /* skip unreadable dir */ }
  return skills
}

function getAllSkills(): SkillEntry[] {
  const dirs = getSkillDirs()
  const byId = new Map<string, SkillEntry>()

  // Scan in order — later dirs override earlier (higher priority)
  for (const { dir, source } of dirs) {
    for (const skill of scanSkillDir(dir, source)) {
      byId.set(skill.id, skill)
    }
  }

  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label))
}

export function registerSkillsIpc() {
  ipcMain.handle('skills:list', () => getAllSkills())
}
