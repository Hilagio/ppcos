'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Client { name: string; customerId: number }

interface Campaign {
  name: string; type: string; status: string; biddingStrategy: string
  cost30d: number; conversions30d: number; cpa30d: number | null; roas30d: number | null; label: string
}

interface ConversionAction {
  name: string; category: string; defaultValue: number; countingType: string
  isPrimary: boolean; include: boolean; customValue: string
}

interface ClientContext {
  businessName: string; vertical: string; mode: string; phase: string
  primaryKpi: string; targetCpa: string; targetRoas: string; targetConversions: string
  maxCpa: string; minRoas: string; budgetMonthly: string; currency: string
  campaigns: Campaign[]; conversionActions: ConversionAction[]
  valuePerLead: string; leadToCloseRate: string; avgDealValue: string; conversionLagDays: string
  competitiveApproach: string; competitorDomains: string; locationCode: string; winThemes: string
  negativeMatchType: string; primaryNegativeList: string
  constraints: string; seasonalityNotes: string; notes: string
}

interface PlanGoals {
  websiteUrl: string
  growthTarget: string
  focusAreas: string[]
  timeline: string
  clientNotes: string
}

const FOCUS_OPTIONS = [
  { value: 'bidding', label: 'Bidding strategy' },
  { value: 'budget', label: 'Budget allocation' },
  { value: 'search-terms', label: 'Search term hygiene' },
  { value: 'structure', label: 'Account structure' },
  { value: 'creatives', label: 'Ad creatives & RSAs' },
  { value: 'landing-pages', label: 'Landing pages' },
  { value: 'competitors', label: 'Competitor strategy' },
  { value: 'scaling', label: 'Scaling & growth' },
]

const AUDIT_PHASES = ['strategy-specialist', 'bidding-auditor', 'budget-auditor', 'synthesis']
const PHASE_LABELS: Record<string, string> = {
  'strategy-specialist': 'Strategy & unit economics audit',
  'bidding-auditor': 'Bidding strategy audit',
  'budget-auditor': 'Budget allocation audit',
  'synthesis': 'Generating 90-day plan',
}

type PhaseStatus = 'waiting' | 'running' | 'done' | 'error' | 'skipped'

const displayName = (name: string) =>
  name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

function loadContext(clientName: string): ClientContext | null {
  try {
    const raw = localStorage.getItem(`ppcos_context_${clientName}`)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function mergeWithLiveData(
  stored: ClientContext | null,
  live: { campaigns: Campaign[]; conversionActions: ConversionAction[]; currency: string },
): ClientContext {
  const EMPTY: ClientContext = {
    businessName: '', vertical: '', mode: '', phase: '',
    primaryKpi: '', targetCpa: '', targetRoas: '', targetConversions: '', maxCpa: '', minRoas: '',
    budgetMonthly: '', currency: 'EUR', campaigns: [], conversionActions: [],
    valuePerLead: '', leadToCloseRate: '', avgDealValue: '', conversionLagDays: '14',
    competitiveApproach: '', competitorDomains: '', locationCode: '2528', winThemes: '',
    negativeMatchType: 'Broad', primaryNegativeList: 'Search Term Exclusions',
    constraints: '', seasonalityNotes: '', notes: '',
  }
  const base = stored ?? EMPTY
  const storedLabels = Object.fromEntries((stored?.campaigns ?? []).map(c => [c.name, c.label]))
  const campaigns = live.campaigns.map(c => ({ ...c, label: storedLabels[c.name] ?? '' }))
  const storedConv = Object.fromEntries((stored?.conversionActions ?? []).map(c => [c.name, c]))
  const conversionActions = live.conversionActions.map(c => ({
    ...c,
    include: storedConv[c.name] !== undefined ? storedConv[c.name].include : c.include,
    customValue: storedConv[c.name]?.customValue ?? '',
  }))
  return { ...base, campaigns, conversionActions, currency: live.currency || base.currency }
}

export default function PlanPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [context, setContext] = useState<ClientContext | null>(null)
  const [planGoals, setPlanGoals] = useState<PlanGoals>({
    websiteUrl: '',
    growthTarget: '',
    focusAreas: [],
    timeline: '',
    clientNotes: '',
  })
  const [running, setRunning] = useState(false)
  const [phases, setPhases] = useState<Record<string, PhaseStatus>>({})
  const [planText, setPlanText] = useState('')
  const [error, setError] = useState('')
  const planRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(setClients)
  }, [])

  useEffect(() => {
    if (planRef.current && planText) {
      planRef.current.scrollTop = planRef.current.scrollHeight
    }
  }, [planText])

  const selectClient = async (client: Client) => {
    setSelectedClient(client)
    setPlanText('')
    setPhases({})
    setError('')

    const stored = loadContext(client.name)
    try {
      const live = await fetch(`/api/clients/${client.name}/setup`).then(r => r.json())
      setContext(mergeWithLiveData(stored, live))
    } catch {
      setContext(stored)
    }
  }

  const toggleFocus = (value: string) => {
    setPlanGoals(prev => ({
      ...prev,
      focusAreas: prev.focusAreas.includes(value)
        ? prev.focusAreas.filter(f => f !== value)
        : [...prev.focusAreas, value],
    }))
  }

  const generatePlan = async () => {
    if (!selectedClient || running) return
    setRunning(true)
    setPlanText('')
    setError('')
    setPhases(Object.fromEntries(AUDIT_PHASES.map(p => [p, 'waiting'])))

    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: selectedClient.name, context, planGoals }),
      })

      if (!res.ok) {
        const text = await res.text()
        setError(`Server error ${res.status}: ${text}`)
        return
      }

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
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'phase') {
              setPhases(prev => ({ ...prev, [event.phase]: 'running' }))
            } else if (event.type === 'phase_done') {
              setPhases(prev => ({ ...prev, [event.phase]: 'done' }))
            } else if (event.type === 'phase_error') {
              setPhases(prev => ({ ...prev, [event.phase]: 'error' }))
            } else if (event.type === 'plan') {
              setPlanText(prev => prev + event.text)
              if (event.phase !== 'synthesis') {
                setPhases(prev => ({ ...prev, synthesis: 'running' }))
              }
            } else if (event.type === 'done') {
              setPhases(prev => {
                const next = { ...prev }
                for (const p of AUDIT_PHASES) {
                  if (next[p] === 'running') next[p] = 'done'
                }
                return next
              })
            } else if (event.type === 'error') {
              setError(event.error)
            }
          } catch {}
        }
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setRunning(false)
    }
  }

  const printPlan = () => window.print()

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.customerId.toString().includes(search)
  )

  const contextMissing = !context?.businessName && !context?.primaryKpi

  return (
    <>
      <header>
        <Link href="/" className="nav-link">← Dashboard</Link>
        <h1>90-Day Strategic Plan</h1>
        {selectedClient && <span>/ {displayName(selectedClient.name)}</span>}
        {planText && (
          <button className="ctx-btn print-btn" onClick={printPlan}>Print / PDF</button>
        )}
      </header>

      <div className="main-layout">
        <div className="client-sidebar">
          <input
            className="search-bar"
            placeholder="Search clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
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
          <div className="empty-state">← Select a client to generate a 90-day plan</div>
        ) : (
          <div className="plan-layout">
            <div className="plan-config">
              <div className="plan-config-inner">
                <h2>Plan Configuration</h2>

                {contextMissing && (
                  <div className="context-warning">
                    ⚠ No context set for {displayName(selectedClient.name)}.{' '}
                    <Link href="/">Set it up in the dashboard</Link> for a better plan.
                  </div>
                )}

                {context?.businessName && (
                  <div className="context-summary">
                    <strong>{context.businessName}</strong> — {context.vertical || 'vertical not set'} —{' '}
                    {context.primaryKpi || 'KPI not set'} — {context.currency} {context.budgetMonthly || '?'}/mo
                  </div>
                )}

                <div className="form-field" style={{ marginTop: 16 }}>
                  <label>Website URL <span className="form-hint"> — used to gather brand context</span></label>
                  <input
                    placeholder="https://example.com"
                    value={planGoals.websiteUrl}
                    onChange={e => setPlanGoals(prev => ({ ...prev, websiteUrl: e.target.value }))}
                  />
                </div>

                <div className="form-field">
                  <label>Growth target <span className="form-hint"> — what does success look like?</span></label>
                  <input
                    placeholder="e.g. +30% conversions at same CPA within 90 days"
                    value={planGoals.growthTarget}
                    onChange={e => setPlanGoals(prev => ({ ...prev, growthTarget: e.target.value }))}
                  />
                </div>

                <div className="form-field">
                  <label>Focus areas <span className="form-hint"> — select all relevant</span></label>
                  <div className="focus-grid">
                    {FOCUS_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        className={`focus-chip${planGoals.focusAreas.includes(opt.value) ? ' active' : ''}`}
                        onClick={() => toggleFocus(opt.value)}
                        type="button"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-field">
                  <label>Timeline notes <span className="form-hint"> — seasonality, campaigns, deadlines</span></label>
                  <input
                    placeholder="e.g. Black Friday in week 10, summer dip expected in month 2"
                    value={planGoals.timeline}
                    onChange={e => setPlanGoals(prev => ({ ...prev, timeline: e.target.value }))}
                  />
                </div>

                <div className="form-field">
                  <label>Client notes <span className="form-hint"> — anything extra for the plan</span></label>
                  <textarea
                    className="plan-textarea"
                    placeholder="e.g. Client is risk-averse, wants weekly check-ins, launching new product line in month 2"
                    value={planGoals.clientNotes}
                    onChange={e => setPlanGoals(prev => ({ ...prev, clientNotes: e.target.value }))}
                    rows={3}
                  />
                </div>

                <button
                  className="run-btn generate-btn"
                  onClick={generatePlan}
                  disabled={running}
                >
                  {running ? 'Generating...' : 'Generate 90-Day Plan'}
                </button>

                {(running || Object.keys(phases).length > 0) && (
                  <div className="phase-list">
                    {AUDIT_PHASES.map(phase => {
                      const status = phases[phase] ?? 'waiting'
                      return (
                        <div key={phase} className={`phase-item phase-${status}`}>
                          <span className="phase-icon">
                            {status === 'waiting' && '○'}
                            {status === 'running' && '⟳'}
                            {status === 'done' && '✓'}
                            {status === 'error' && '✗'}
                            {status === 'skipped' && '—'}
                          </span>
                          <span className="phase-label">{PHASE_LABELS[phase] || phase}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="plan-output" ref={planRef}>
              {error && (
                <div className="badge-row">
                  <span className="error-badge">Error: {error}</span>
                </div>
              )}
              {!planText && !running && !error && (
                <div className="empty-state" style={{ border: 'none', background: 'none' }}>
                  Configure the plan and click Generate
                </div>
              )}
              {planText && (
                <div className="plan-document">
                  <div className="plan-header-doc">
                    <div className="plan-title">90-Day Strategic Plan</div>
                    <div className="plan-subtitle">
                      {context?.businessName || displayName(selectedClient.name)} — Generated {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                  </div>
                  <div className="md-output plan-md">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{planText}</ReactMarkdown>
                  </div>
                  {running && <div className="plan-generating">Generating...</div>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
