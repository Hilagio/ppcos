#!/usr/bin/env node
// Generates lib/data/ from clients/ at build time so Vercel can serve it

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'lib', 'data')

mkdirSync(join(OUT, 'skills'), { recursive: true })

const config = JSON.parse(readFileSync(join(ROOT, 'main-config.json'), 'utf8'))

// Write clients list
writeFileSync(join(OUT, 'clients.json'), JSON.stringify(config.clients))

let total = 0

for (const client of config.clients) {
  const skillsDir = join(ROOT, 'clients', client.name, '.claude', 'skills')
  if (!existsSync(skillsDir)) { writeFileSync(join(OUT, 'skills', `${client.name}.json`), '[]'); continue }

  const skills = []

  for (const skillId of readdirSync(skillsDir)) {
    const skillMdPath = join(skillsDir, skillId, 'SKILL.md')
    if (!existsSync(skillMdPath)) continue

    const raw = readFileSync(skillMdPath, 'utf8')
    const fm = parseFrontmatter(raw)

    let content = raw
    const refDir = join(skillsDir, skillId, 'reference')
    if (existsSync(refDir)) {
      content += '\n\n## Reference Files\n'
  for (const ref of readdirSync(refDir).filter(f => !f.startsWith('.'))) {
        const refPath = join(refDir, ref)
        if (!existsSync(refPath) || readdirSync(refDir).includes(ref + '/')) continue
        try {
          content += `\n### ${ref}\n\`\`\`\n${readFileSync(refPath, 'utf8')}\n\`\`\`\n`
        } catch {}
      }
    }

    // Include CLAUDE.md context inline with each skill
    const claudeMd = existsSync(join(ROOT, 'clients', client.name, 'CLAUDE.md'))
      ? readFileSync(join(ROOT, 'clients', client.name, 'CLAUDE.md'), 'utf8')
      : ''

    const optionsPath = join(skillsDir, skillId, 'argument-options.json')
    const argumentOptions = existsSync(optionsPath)
      ? JSON.parse(readFileSync(optionsPath, 'utf8'))
      : []

    skills.push({
      id: skillId,
      name: fm.name || skillId,
      description: fm.description || '',
      argumentHint: fm['argument-hint'] || '',
      argumentOptions,
      content,
      claudeMd,
    })
    total++
  }

  skills.sort((a, b) => a.name.localeCompare(b.name))
  writeFileSync(join(OUT, 'skills', `${client.name}.json`), JSON.stringify(skills))
}

console.log(`Generated data for ${config.clients.length} clients, ${total} skills total`)

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const result = {}
  const lines = match[1].split('\n')
  let currentKey = null
  let blockLines = []
  let blockType = null // '>' folded, '|' literal

  const flushBlock = () => {
    if (!currentKey) return
    if (blockType) {
      const joined = blockLines.map(l => l.trim()).join(blockType === '>' ? ' ' : '\n').trim()
      result[currentKey] = joined
    }
    blockLines = []
    blockType = null
  }

  for (const line of lines) {
    if (blockType && (line.startsWith(' ') || line.startsWith('\t'))) {
      blockLines.push(line)
      continue
    }
    flushBlock()
    const i = line.indexOf(':')
    if (i === -1) continue
    const key = line.slice(0, i).trim()
    const val = line.slice(i + 1).trim()
    if (val === '>' || val === '|') {
      currentKey = key
      blockType = val
    } else {
      currentKey = key
      result[key] = val
    }
  }
  flushBlock()
  return result
}
