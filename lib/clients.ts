import { readFileSync } from 'fs'
import { join } from 'path'

export interface ClientConfig {
  name: string
  enabled: boolean
  customerId: number
  loginCustomerId: number
}

const REPO_ROOT = process.cwd()

export function getClients(): ClientConfig[] {
  const path = join(REPO_ROOT, 'lib', 'data', 'clients.json')
  return JSON.parse(readFileSync(path, 'utf8')).filter((c: ClientConfig) => c.enabled)
}

export function getClient(name: string): ClientConfig | undefined {
  return getClients().find(c => c.name === name)
}
