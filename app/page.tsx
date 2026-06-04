'use client'

import { useState, useEffect, useRef } from 'react'

interface Client { name: string; customerId: number }
interface Skill { id: string; name: string; description: string; argumentHint: string }
interface OutputLine { type: 'text' | 'tool_use' | 'tool_result' | 'tool_error' | 'error' | 'done'; content: string }

interface Campaign {
  name: string
  type: string
  status: string
  biddingStrategy: string
  cost30d: number
  conversions30d: number
  cpa30d: number | null
  roas30d: number | null
  label: string
}

interface ConversionAction {
  name: string
  category: string
  defaultValue: number
  countingType: string
  isPrimary: boolean
  include: boolean
  customValue: string
}

interface ClientContext {
  businessName: string
  vertical: string
  mode: string
  phase: string
  primaryKpi: string
  targetCpa: string
  targetRoas: string
  targetConversions: string
  maxCpa: string
  minRoas: string
  budgetMonthly: string
  currency: string
  campaigns: Campaign[]
  conversionActions: ConversionAction[]
  valuePerLead: string
  leadToCloseRate: string
  avgDealValue: string
  conversionLagDays: string
  competitiveApproach: string
  competitorDomains: string
  locationCode: string
  winThemes: string
  negativeMatchType: string
  primaryNegativeList: string
  constraints: string
  seasonalityNotes: string
  notes: string
}

const EMPTY_CONTEXT: ClientContext = {
  businessName: '', vertical: '', mode: '', phase: '',
  primaryKpi: '', targetCpa: '', targetRoas: '', targetConversions: '', maxCpa: '', minRoas: '',
  budgetMonthly: '', currency: 'EUR',
  campaigns: [], conversionActions: [],
  valuePerLead: '', leadToCloseRate: '', avgDealValue: '', conversionLagDays: '14',
  competitiveApproach: '', competitorDomains: '', locationCode: '2528', winThemes: '',
  negativeMatchType: 'Broad', primaryNegativeList: 'Search Term Exclusions',
  constraints: '', seasonalityNotes: '', notes: '',
}

const LOCATION_CODES: Record<string, string> = {
  '2528': 'Netherlands', '2276': 'Germany', '2250': 'France', '2724': 'Spain',
  '2380': 'Italy', '2056': 'Belgium', '2840': 'United States', '2826': 'United Kingdom',
  '2124': 'Canada', '2036': 'Australia', '2554': 'New Zealand', '2756': 'Switzerland',
  '2040': 'Austria', '2752': 'Sweden', '2208': 'Denmark', '2246': 'Finland', '2578': 'Norway',
}

const displayName = (name: string) =>
  name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

const formatCampaignType = (t: string) =>
  ({ SEARCH: 'Search', SHOPPING: 'Shopping', PERFORMANCE_MAX: 'PMax', DISPLAY: 'Display', VIDEO: 'Video' }[t] ?? t)

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
  return ctx && (ctx.businessName || ctx.primaryKpi)
}

function mergeWithLiveData(stored: ClientContext | null, live: { campaigns: Campaign[], conversionActions: ConversionAction[], currency: string }): ClientContext {
  const base = stored ?? EMPTY_CONTEXT
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
  const [setupLoading, setSetupLoading] = useState(false)
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
    setLoadingSkills(true)

    const stored = loadContext(client.name)
    setContext(stored)
    setSetupLoading(true)

    const [skillsData, setupData] = await Promise.all([
      fetch(`/api/clients/${client.name}/skills`).then(r => r.json()),
      fetch(`/api/clients/${client.name}/setup`).then(r => r.json()),
    ])

    setSkills(skillsData)
    setLoadingSkills(false)

    const merged = mergeWithLiveData(stored, setupData)
    setContextDraft(merged)
    setSetupLoading(false)

    if (!hasContext(stored)) setShowContextForm(true)
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

  const setDraft = (key: keyof ClientContext, value: unknown) =>
    setContextDraft(prev => ({ ...prev, [key]: value }))

  const setCampaignLabel = (idx: number, label: string) =>
    setContextDraft(prev => {
      const campaigns = [...prev.campaigns]
      campaigns[idx] = { ...campaigns[idx], label }
      return { ...prev, campaigns }
    })

  const setConversionInclude = (idx: number, include: boolean) =>
    setContextDraft(prev => {
      const conversionActions = [...prev.conversionActions]
      conversionActions[idx] = { ...conversionActions[idx], include }
      return { ...prev, conversionActions }
    })

  const setConversionValue = (idx: number, customValue: string) =>
    setContextDraft(prev => {
      const conversionActions = [...prev.conversionActions]
      conversionActions[idx] = { ...conversionActions[idx], customValue }
      return { ...prev, conversionActions }
    })

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.customerId.toString().includes(search)
  )

  const tf = (label: string, key: keyof ClientContext, placeholder: string, hint?: string) => (
    <div className="form-field" key={key}>
      <label>{label}{hint && <span className="form-hint"> — {hint}</span>}</label>
      <input
        value={contextDraft[key] as string}
        onChange={e => setDraft(key, e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )

  const sf = (label: string, key: keyof ClientContext, options: string[], hint?: string) => (
    <div className="form-field" key={key}>
      <label>{label}{hint && <span className="form-hint"> — {hint}</span>}</label>
      <select value={contextDraft[key] as string} onChange={e => setDraft(key, e.target.value)}>
        <option value="">— select —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
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
              <h2>Client Context — {displayName(selectedClient.name)}</h2>
              <p>Injected into every skill run. Fill in once; update when the account changes.</p>
              {setupLoading && <p className="setup-loading">Fetching live account data...</p>}
            </div>

            <div className="form-section">
              <h3>Business Identity</h3>
              {tf('Business / Brand name', 'businessName', 'e.g. Azuramoda')}
              {tf('Vertical', 'vertical', 'e.g. ecommerce, lead gen, local services, SaaS')}
              {sf('Mode', 'mode', ['Growth', 'Balanced', 'Cost Control'], 'overall strategy direction')}
              {sf('Phase', 'phase', ['Launch', 'Learning', 'Optimization', 'Scaling', 'Maintenance'], 'current account lifecycle stage')}
            </div>

            <div className="form-section">
              <h3>Performance Targets</h3>
              {sf('Primary KPI', 'primaryKpi', ['CPA', 'ROAS', 'Conversions', 'Revenue'])}
              <div className="form-row">
                {tf('Target CPA', 'targetCpa', 'e.g. €25')}
                {tf('Max CPA (hard limit)', 'maxCpa', 'e.g. €40')}
              </div>
              <div className="form-row">
                {tf('Target ROAS', 'targetRoas', 'e.g. 4x or 400%')}
                {tf('Min ROAS (hard limit)', 'minRoas', 'e.g. 2x')}
              </div>
              <div className="form-row">
                {tf('Target monthly conversions', 'targetConversions', 'e.g. 200')}
                {tf('Monthly budget', 'budgetMonthly', `e.g. 3000`)}
              </div>
            </div>

            <div className="form-section">
              <h3>Campaigns <span className="section-hint">auto-fetched — label each campaign</span></h3>
              {contextDraft.campaigns.length === 0 ? (
                <p className="section-empty">{setupLoading ? 'Loading...' : 'No campaigns found.'}</p>
              ) : (
                <div className="campaign-table">
                  <div className="campaign-header">
                    <span>Campaign</span>
                    <span>Type</span>
                    <span>30d Spend</span>
                    <span>30d CPA</span>
                    <span>Label</span>
                  </div>
                  {contextDraft.campaigns.map((c, i) => (
                    <div key={c.name} className={`campaign-row${c.status === 'PAUSED' ? ' paused' : ''}`}>
                      <span className="campaign-name" title={c.name}>{c.name}</span>
                      <span className="campaign-type">{formatCampaignType(c.type)}</span>
                      <span className="campaign-metric">{contextDraft.currency} {c.cost30d.toLocaleString()}</span>
                      <span className="campaign-metric">{c.cpa30d != null ? `${contextDraft.currency} ${c.cpa30d}` : '—'}</span>
                      <select
                        className="label-select"
                        value={c.label}
                        onChange={e => setCampaignLabel(i, e.target.value)}
                      >
                        <option value="">— unlabeled —</option>
                        <option value="brand">Brand</option>
                        <option value="non-brand">Non-Brand</option>
                        <option value="competitor">Competitor</option>
                        <option value="test">Test / Discovery</option>
                        <option value="display">Display / Awareness</option>
                        <option value="pmax">PMax</option>
                        <option value="shopping">Shopping</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-section">
              <h3>Conversion Tracking <span className="section-hint">auto-fetched — toggle and configure</span></h3>
              {contextDraft.conversionActions.length === 0 ? (
                <p className="section-empty">{setupLoading ? 'Loading...' : 'No conversion actions found.'}</p>
              ) : (
                <>
                  <div className="conv-action-list">
                    <div className="conv-action-header">
                      <span>Use</span>
                      <span>Action</span>
                      <span>Category</span>
                      <span>Value override</span>
                    </div>
                    {contextDraft.conversionActions.map((ca, i) => (
                      <div key={ca.name} className="conv-action-row">
                        <input
                          type="checkbox"
                          checked={ca.include}
                          onChange={e => setConversionInclude(i, e.target.checked)}
                        />
                        <span className={ca.include ? '' : 'conv-excluded'}>{ca.name}</span>
                        <span className="conv-category">{ca.category}</span>
                        <input
                          className="conv-value-input"
                          placeholder={ca.defaultValue ? `default: ${ca.defaultValue}` : 'e.g. 50'}
                          value={ca.customValue}
                          onChange={e => setConversionValue(i, e.target.value)}
                          disabled={!ca.include}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="form-row" style={{ marginTop: 12 }}>
                    {tf('Value per lead / conversion', 'valuePerLead', 'e.g. 150', 'revenue per acquisition')}
                    {tf('Lead-to-close rate', 'leadToCloseRate', 'e.g. 20%')}
                  </div>
                  <div className="form-row">
                    {tf('Average deal value', 'avgDealValue', 'e.g. 2500')}
                    {tf('Conversion lag (days)', 'conversionLagDays', '14', 'days before a conversion is counted as final')}
                  </div>
                </>
              )}
            </div>

            <div className="form-section">
              <h3>Competitive Strategy</h3>
              {sf('Competitive approach', 'competitiveApproach', ['Aggressive', 'Defensive', 'Balanced', 'Opportunistic'])}
              {tf('Competitor domains', 'competitorDomains', 'e.g. competitor1.com, competitor2.com', 'comma-separated, used by competitor-scraper')}
              {tf('Win themes', 'winThemes', 'e.g. Faster delivery, better pricing, local service')}
              <div className="form-field">
                <label>Country / location <span className="form-hint"> — used for competitor scraping</span></label>
                <select value={contextDraft.locationCode} onChange={e => setDraft('locationCode', e.target.value)}>
                  {Object.entries(LOCATION_CODES).map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-section">
              <h3>Search Term Analysis Config</h3>
              <div className="form-row">
                {sf('Negative match type', 'negativeMatchType', ['Broad', 'Phrase', 'Exact'], 'default match type for new negatives')}
                {tf('Primary negative list name', 'primaryNegativeList', 'Search Term Exclusions', 'exact name in Google Ads')}
              </div>
            </div>

            <div className="form-section">
              <h3>Constraints &amp; Notes</h3>
              {tf('Known constraints', 'constraints', 'e.g. no brand bidding, max CPC €2, no weekend changes', 'things that cannot change')}
              {tf('Seasonality', 'seasonalityNotes', 'e.g. Q4 peak Nov–Dec, summer dip in July')}
              {tf('Additional notes', 'notes', 'Anything else Claude should know about this account')}
            </div>

            <div className="form-actions">
              <button className="run-btn" onClick={saveAndClose}>Save &amp; continue</button>
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
