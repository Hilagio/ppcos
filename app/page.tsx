'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Client {
  name: string
  customerId: number
}

export default function HomePage() {
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const router = useRouter()

  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(setClients)
  }, [])

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.customerId.toString().includes(search)
  )

  const displayName = (name: string) =>
    name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <>
      <header>
        <h1>PPCOS Dashboard</h1>
        <span>Google Ads AI Workflows</span>
      </header>
      <div className="container">
        <input
          className="search-bar"
          placeholder="Search clients by name or customer ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <p className="count">{filtered.length} clients</p>
        <div className="client-grid">
          {filtered.map(client => (
            <div
              key={client.name}
              className="client-card"
              onClick={() => router.push(`/${client.name}`)}
            >
              <h3>{displayName(client.name)}</h3>
              <p>{client.customerId}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
