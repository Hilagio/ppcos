import { readFileSync } from 'fs'
import { join } from 'path'

export interface ClientConfig {
  name: string
  enabled: boolean
  customerId: number
  loginCustomerId: number
}

export function getClients(): ClientConfig[] {
  const path = join(process.cwd(), '..', 'main-config.json')
  const config = JSON.parse(readFileSync(path, 'utf8'))
  return config.clients.filter((c: ClientConfig) => c.enabled)
}

export function getClient(name: string): ClientConfig | undefined {
  return getClients().find(c => c.name === name)
}
