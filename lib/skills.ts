import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface Skill {
  id: string
  name: string
  description: string
  argumentHint: string
  content: string
  claudeMd: string
}

const REPO_ROOT = process.cwd()

function skillsPath(clientName: string) {
  return join(REPO_ROOT, 'lib', 'data', 'skills', `${clientName}.json`)
}

export function getSkills(clientName: string): Omit<Skill, 'content' | 'claudeMd'>[] {
  const path = skillsPath(clientName)
  if (!existsSync(path)) return []
  return (JSON.parse(readFileSync(path, 'utf8')) as Skill[]).map(({ id, name, description, argumentHint }) => ({
    id, name, description, argumentHint
  }))
}

export function getSkill(clientName: string, skillId: string): Skill | null {
  const path = skillsPath(clientName)
  if (!existsSync(path)) return null
  const skills: Skill[] = JSON.parse(readFileSync(path, 'utf8'))
  return skills.find(s => s.id === skillId) ?? null
}

export function readContextFile(clientName: string, relativePath: string): string | null {
  const filePath = join(REPO_ROOT, 'clients', clientName, relativePath)
  if (!existsSync(filePath)) return null
  try { return readFileSync(filePath, 'utf8') } catch { return null }
}
