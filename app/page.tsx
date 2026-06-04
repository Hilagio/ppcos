'use client'

import { useState, useEffect, useRef } from 'react'

interface Client { name: string; customerId: number }
interface Skill { id: string; name: string; description: string; argumentHint: string }
interface OutputLine { type: 'text' | 'tool_use' | 'tool_result' | 'tool_error' | 'error' | 'done'; content: string }
interface ClientContext {
  businessName: string
  vertical: string
  primaryKpi: string
  targetCpa: string
  targetRoas: string
  budgetMonthly: string
  constraints: string
  notes: string
}

const EMPTY_CONTEXT: ClientContext = {
  businessName: '', vertical: '', primaryKpi: '', targetCpa: '',
  targetRoas: '', budgetMonthly: '', constraints: '', notes: ''
}

const displayName = (name: string) =>
  name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

function loadContext(clientName: string): ClientContext | null {
  try {
    const raw = localStorage.getItem(`ppcos_context_${clientName}`)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveContext(clientName: string, ctx: ClientContext) {
  localStorage.setItem(`ppcos_context_${clientName}`, JSON.stringify(ctx))
}

function hasContext(ctx: ClientContext | null) {
  return ctx && (ctx.businessName || ctx.vertical || ctx.primaryKpi)
}

export default function HomePage() {
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [skills, setSkills] = useState<Skill[]>([])
  const [loadingSkills, setLoadingSkills] = useState(false)
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [args, setArgs] = useState('')
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState<OutputLine[]>([])
  const [context, setContext] = useState<ClientContext | null>(null)
  const [showContextForm, setShowContextForm] = useState(false)
  const [contextDraft, setContextDraft] = useState<ClientContext>(EMPTY_CONTEXT)
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(setClients)
  }, [])

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [output])

  const selectClient = async (client: Client) => {
    setSelectedClient(client)
    setSelectedSkill(null)
    setOutput([])
    setArgs('')
    setSkills([])
    setShowContextForm(false)
    const ctx = loadContext(client.name)
    setContext(ctx)
    setContextDraft(ctx ?? EMPTY_CONTEXT)
    setLoadingSkills(true)
    const data = await fetch(`/api/clients/${client.name}/skills`).then(r => r.json())
    setSkills(data)
    setLoadingSkills(false)
    if (!hasContext(ctx)) setShowContextForm(true)
  }

  const saveAndClose = () => {
    if (!selectedClient) return
    saveContext(selectedClient.name, contextDraft)
    setContext(contextDraft)
    setShowContextForm(false)
  }

  const runSkill = async () => {
    if (!selectedSkill || !selectedClient || running) return
    setRunning(true)
    setOutput([])
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: selectedClient.name, skill: selectedSkill.id, args, context }),
      })
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try { handleEvent(JSON.parse(line.slice(6))) } catch {}
        }
      }
    } catch (err) {
      setOutput(prev => [...prev, { type: 'error', content: String(err) }])
    } finally {
      setRunning(false)
    }
  }

  const handleEvent = (event: Record<string, unknown>) => {
    if (event.type === 'text') {
      setOutput(prev => {
        const last = prev[prev.length - 1]
        if (last?.type === 'text') return [...prev.slice(0, -1), { type: 'text', content: last.content + (event.text as string) }]
        return [...prev, { type: 'text', content: event.text as string }]
      })
    } else if (event.type === 'tool_use') {
      setOutput(prev => [...prev, { type: 'tool_use', content: `[Tool: ${event.name}] ${JSON.stringify(event.input)}` }])
    } else if (event.type === 'tool_result') {
      setOutput(prev => [...prev, { type: 'tool_result', content: `[Result: ${event.name}] ${event.summary}` }])
    } else if (event.type === 'tool_error') {
      setOutput(prev => [...prev, { type: 'tool_error', content: `[Error: ${event.name}] ${event.error}` }])
    } else if (event.type === 'error') {
      setOutput(prev => [...prev, { type: 'error', content: event.error as string }])
    } else if (event.type === 'done') {
      setOutput(prev => [...prev, { type: 'done', content: '— done —' }])
    }
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.customerId.toString().includes(search)
  )

  const field = (label: string, key: keyof ClientContext, placeholder: string, hint?: string) => (
    <div className="form-field" key={key}>
      <label>{label}{hint && <span className="form-hint"> — {hint}</span>}</label>
      <input
        value={contextDraft[key]}
        onChange={e => setContextDraft(prev => ({ ...prev, [key]: e.target.value }))}
        placeholder={placeholder}
      />
    </div>
  )

  return (
    <>
      <header>
        <h1>PPCOS Dashboard</h1>
        {selectedClient && (
          <>
            <span>/ {displayName(selectedClient.name)}</span>
            <button className="ctx-btn" onClick={() => setShowContextForm(v => !v)}>
              {hasContext(context) ? '✓ Context' : '⚠ Setup context'}
            </button>
          </>
        )}
      </header>

      <div className="main-layout">
        <div className="client-sidebar">
          <input className="search-bar" placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)} />
          <div className="client-list">
            {filtered.map(client => (
              <div
                key={client.name}
                className={`client-item${selectedClient?.name === client.name ? ' active' : ''}`}
                onClick={() => selectClient(client)}
              >
                <div className="client-item-name">{displayName(client.name)}</div>
                <div className="client-item-id">{client.customerId}</div>
              </div>
            ))}
          </div>
        </div>

        {!selectedClient ? (
          <div className="empty-state">← Select a client to get started</div>
        ) : showContextForm ? (
          <div className="context-form">
            <div className="context-form-header">
              <h2>Client Context</h2>
              <p>This info is used by all skills to give relevant advice. You can update it anytime.</p>
            </div>
            {field('Business / Brand name', 'businessName', 'e.g. Azuramoda')}
            {field('Vertical', 'vertical', 'e.g. ecommerce, lead gen, local services')}
            {field('Primary KPI', 'primaryKpi', 'e.g. ROAS, CPA, leads', 'main goal')}
            {field('Target CPA', 'targetCpa', 'e.g. €25')}
            {field('Target ROAS', 'targetRoas', 'e.g. 4x or 400%')}
            {field('Monthly budget', 'budgetMonthly', 'e.g. €3.000/month')}
            {field('Constraints', 'constraints', 'e.g. no brand bidding, max CPC €2', 'things that cannot change')}
            {field('Notes', 'notes', 'Anything else Claude should know about this account')}
            <div className="form-actions">
              <button className="run-btn" onClick={saveAndClose}>Save & continue</button>
              {hasContext(context) && (
                <button className="cancel-btn" onClick={() => setShowContextForm(false)}>Cancel</button>
              )}
            </div>
          </div>
        ) : loadingSkills ? (
          <div className="empty-state">Loading skills...</div>
        ) : skills.length === 0 ? (
          <div className="empty-state">No skills found — Vercel may still be deploying</div>
        ) : (
          <div className="skills-layout">
            <div className="skill-list">
              {skills.map(skill => (
                <div
                  key={skill.id}
                  className={`skill-item${selectedSkill?.id === skill.id ? ' active' : ''}`}
                  onClick={() => { setSelectedSkill(skill); setArgs(''); setOutput([]) }}
                >
                  <h4>{skill.name}</h4>
                  <p>{skill.description}</p>
                </div>
              ))}
            </div>
            <div className="runner-panel">
              {!selectedSkill ? (
                <div className="output-area"><span className="empty">Select a skill to run</span></div>
              ) : (
                <>
                  <div className="runner-header">
                    <h3>{selectedSkill.name}</h3>
                    {selectedSkill.argumentHint && <span className="hint">{selectedSkill.argumentHint}</span>}
                  </div>
                  <div className="args-row">
                    <input
                      className="args-input"
                      placeholder={selectedSkill.argumentHint || 'Optional arguments...'}
                      value={args}
                      onChange={e => setArgs(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && runSkill()}
                    />
                    <button className="run-btn" onClick={runSkill} disabled={running}>
                      {running ? 'Running...' : 'Run'}
                    </button>
                  </div>
                  <div className="output-area" ref={outputRef}>
                    {output.length === 0 ? (
                      <span className="empty">Press Run to execute /{selectedSkill.id}{args ? ` ${args}` : ''}</span>
                    ) : output.map((line, i) => {
                      if (line.type === 'text') return <span key={i}>{line.content}</span>
                      if (line.type === 'tool_use') return <span key={i}><br /><span className="tool-badge">{line.content}</span><br /></span>
                      if (line.type === 'tool_result') return <span key={i}><span className="tool-result-badge">{line.content}</span><br /></span>
                      if (line.type === 'tool_error') return <span key={i}><span className="error-badge">{line.content}</span><br /></span>
                      if (line.type === 'error') return <span key={i}><span className="error-badge">Error: {line.content}</span><br /></span>
                      if (line.type === 'done') return <span key={i}><br /><span className="done-badge">{line.content}</span></span>
                      return null
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
