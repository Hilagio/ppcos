import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface ClientConfig {
  name: string
  enabled: boolean
  customerId: number
  loginCustomerId: number
}

// In dev cwd = dashboard/, in Vercel cwd = repo root
const REPO_ROOT = existsSync(join(process.cwd(), 'main-config.json'))
  ? process.cwd()
  : join(process.cwd(), '..')

export function getClients(): ClientConfig[] {
  const path = join(REPO_ROOT, 'main-config.json')
  const config = JSON.parse(readFileSync(path, 'utf8'))
  return config.clients.filter((c: ClientConfig) => c.enabled)
}

export function getClient(name: string): ClientConfig | undefined {
  return getClients().find(c => c.name === name)
}

export { REPO_ROOT }
