import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface Skill {
  id: string
  name: string
  description: string
  argumentHint: string
  content: string
}

export function getSkills(clientName: string): Skill[] {
  const skillsDir = join(process.cwd(), '..', 'clients', clientName, '.claude', 'skills')
  if (!existsSync(skillsDir)) return []

  return readdirSync(skillsDir)
    .filter(dir => existsSync(join(skillsDir, dir, 'SKILL.md')))
    .map(dir => {
      const content = readFileSync(join(skillsDir, dir, 'SKILL.md'), 'utf8')
      const frontmatter = parseFrontmatter(content)
      return {
        id: dir,
        name: frontmatter.name || dir,
        description: frontmatter.description || '',
        argumentHint: frontmatter['argument-hint'] || '',
        content,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function getSkillContent(clientName: string, skillId: string): string | null {
  const skillDir = join(process.cwd(), '..', 'clients', clientName, '.claude', 'skills', skillId)
  const skillMdPath = join(skillDir, 'SKILL.md')
  if (!existsSync(skillMdPath)) return null

  let content = readFileSync(skillMdPath, 'utf8')

  // Append any reference files
  const refDir = join(skillDir, 'reference')
  if (existsSync(refDir)) {
    const refs = readdirSync(refDir)
    if (refs.length > 0) {
      content += '\n\n## Reference Files\n'
      for (const ref of refs) {
        content += `\n### ${ref}\n\`\`\`\n${readFileSync(join(refDir, ref), 'utf8')}\n\`\`\`\n`
      }
    }
  }

  return content
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const result: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()
    result[key] = value
  }
  return result
}

export function getContextFiles(clientName: string): Record<string, string> {
  const contextDir = join(process.cwd(), '..', 'clients', clientName, 'context')
  if (!existsSync(contextDir)) return {}

  const files: Record<string, string> = {}
  for (const file of readdirSync(contextDir)) {
    if (file.endsWith('.md') || file.endsWith('.csv') || file.endsWith('.txt')) {
      try {
        files[file] = readFileSync(join(contextDir, file), 'utf8')
      } catch {}
    }
  }
  return files
}

export function readClientFile(clientName: string, relativePath: string): string | null {
  const filePath = join(process.cwd(), '..', 'clients', clientName, relativePath)
  if (!existsSync(filePath)) return null
  try {
    return readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}
