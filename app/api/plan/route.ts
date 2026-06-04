import Anthropic from '@anthropic-ai/sdk'
import { getClient } from '@/lib/clients'
import { getSkill } from '@/lib/skills'
import { runGaqlQuery } from '@/lib/google-ads'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'run_gaql_query',
    description: 'Execute a GAQL (Google Ads Query Language) query against the client Google Ads account to fetch live data.',
    input_schema: {
      type: 'object' as const,
      properties: { query: { type: 'string', description: 'The GAQL query to execute' } },
      required: ['query'],
    },
  },
  {
    name: 'read_context_file',
    description: 'Read a file from the client workspace.',
    input_schema: {
      type: 'object' as const,
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
]

interface Campaign {
  name: string; type: string; status: string; biddingStrategy: string
  cost30d: number; conversions30d: number; cpa30d: number | null; roas30d: number | null; label: string
}

interface ConversionAction {
  name: string; category: string; defaultValue: number; include: boolean; customValue: string
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

function buildContextSection(ctx: ClientContext, customerId: string, loginCustomerId: string): string {
  const campaigns = ctx.campaigns ?? []
  const conversionActions = ctx.conversionActions ?? []
  const brandedCampaigns = campaigns.filter(c => c.label === 'brand').map(c => c.name)
  const includedConversions = conversionActions.filter(c => c.include).map(c => c.name)
  const competitorDomains = ctx.competitorDomains
    ? ctx.competitorDomains.split(',').map(d => d.trim()).filter(Boolean)
    : []

  const campaignLines = campaigns.length > 0
    ? campaigns.map(c => {
        const cpa = c.cpa30d != null ? `${ctx.currency} ${c.cpa30d} CPA` : 'no conversions'
        return `- **${c.name}** [${c.label || 'unlabeled'}] — ${c.type}, ${c.biddingStrategy}, ${c.status}, 30d spend: ${ctx.currency} ${c.cost30d}, ${cpa}`
      }).join('\n')
    : '— not available'

  const conversionLines = conversionActions.length > 0
    ? conversionActions.map(c => {
        const val = c.customValue || (c.defaultValue ? String(c.defaultValue) : '—')
        return `- ${c.name} [${c.category}] — value: ${val} — ${c.include ? 'included' : 'EXCLUDED'}`
      }).join('\n')
    : '— not available'

  const adsConfig = {
    googleAds: {
      customerId,
      loginCustomerId,
      dateRange: 30,
      clientName: ctx.businessName || '',
      conversionActions: includedConversions,
    },
    competitors: {
      domains: competitorDomains,
      location_code: parseInt(ctx.locationCode) || 2528,
    },
    searchTermAnalysis: {
      brandedCampaigns,
      excludeBrandedCampaigns: brandedCampaigns.length > 0,
      negativeMatchType: ctx.negativeMatchType || 'Broad',
      biddingStrategy: ctx.primaryKpi?.toLowerCase() === 'roas' ? 'roas' : 'cpa',
      sharedNegativeLists: {
        primary: ctx.primaryNegativeList || 'Search Term Exclusions',
        ngramNonConverting: 'Non-Converting N-grams',
        ngramInefficient: 'Inefficient N-grams',
      },
    },
    ngramAnalysis: {
      biddingStrategy: ctx.primaryKpi?.toLowerCase() === 'roas' ? 'roas' : 'cpa',
      defaultAOV: parseInt((ctx.avgDealValue || '').replace(/[^0-9]/g, '')) || 200,
    },
  }

  return `## Business Context

### Business
- Name: ${ctx.businessName || '—'}
- Vertical: ${ctx.vertical || '—'}
- Mode: ${ctx.mode || '—'}
- Phase: ${ctx.phase || '—'}

### Performance Targets
- Primary KPI: ${ctx.primaryKpi || '—'}
- Target CPA: ${ctx.targetCpa || '—'} | Max CPA: ${ctx.maxCpa || '—'}
- Target ROAS: ${ctx.targetRoas || '—'} | Min ROAS: ${ctx.minRoas || '—'}
- Target monthly conversions: ${ctx.targetConversions || '—'}
- Monthly budget: ${ctx.currency} ${ctx.budgetMonthly || '—'}

### Campaigns (last 30 days)
${campaignLines}

### Branded campaigns
${brandedCampaigns.length > 0 ? brandedCampaigns.map(n => `- ${n}`).join('\n') : '— none identified'}

### Conversion Actions
${conversionLines}
- Value per lead: ${ctx.valuePerLead || '—'}
- Lead-to-close rate: ${ctx.leadToCloseRate || '—'}
- Average deal value: ${ctx.avgDealValue || '—'}

### Competitive Strategy
- Approach: ${ctx.competitiveApproach || '—'}
- Competitors: ${competitorDomains.join(', ') || '—'}
- Win themes: ${ctx.winThemes || '—'}

### Constraints
${ctx.constraints || '— not set'}

### Seasonality
${ctx.seasonalityNotes || '— not set'}

### Notes
${ctx.notes || '— not set'}

---

## ads-context.config.json

\`\`\`json
${JSON.stringify(adsConfig, null, 2)}
\`\`\``
}

async function runAuditSkill(
  skillId: string,
  clientName: string,
  customerId: string,
  loginCustomerId: string,
  systemPrompt: string,
  send: (data: object) => void,
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `/${skillId} --diagnose` },
  ]

  let fullText = ''
  let continueLoop = true
  let round = 0
  const MAX_ROUNDS = 8

  while (continueLoop && round < MAX_ROUNDS) {
    round++
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    })

    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const block of response.content) {
      if (block.type === 'text') {
        fullText += block.text
      } else if (block.type === 'tool_use') {
        send({ type: 'skill_tool', skill: skillId, name: block.name })
        let result: string
        try {
          if (block.name === 'run_gaql_query') {
            const rows = await runGaqlQuery(
              customerId,
              loginCustomerId,
              (block.input as { query: string }).query
            )
            result = JSON.stringify(rows, null, 2)
          } else {
            result = 'Context files not available in this environment — context is injected in the system prompt.'
          }
        } catch (err: unknown) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`
        }
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      }
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content })
      messages.push({ role: 'user', content: toolResults })
    } else {
      continueLoop = false
    }
  }

  return fullText
}

const SYNTHESIS_PROMPT = `You are a senior Google Ads strategist creating a 90-day strategic plan for a client.

You will receive audit findings from multiple PPCOS diagnostic skills. Your job is to synthesize these into a structured, client-facing 90-day plan.

The plan must include:

1. **Executive Summary** — 3–5 sentences covering current state, key opportunity, and the plan's objective

2. **Current State Snapshot** — Key findings from the audits: what's working, what isn't, critical gaps

3. **90-Day Roadmap** — Structured by month:
   - Month 1 (Foundation): Quick wins, structural fixes, tracking improvements
   - Month 2 (Optimization): Bid strategy, search term hygiene, ad copy, landing pages
   - Month 3 (Scale): Budget reallocation, new opportunities, performance push

4. **KPI Projections** — Based on current data and planned changes:
   - Conservative scenario (minimal improvement)
   - Base scenario (expected with full execution)
   - Optimistic scenario (upside with market tailwinds)
   Include: projected spend, conversions, CPA/ROAS, revenue impact

5. **Priority Action List** — Top 10 actions ranked by impact/effort, with owner (team / client) and timing

6. **Risk Factors** — 3–5 risks that could affect the plan, with mitigations

Format in clean markdown. Use tables for projections and action list. Write as if presenting to a client — confident, specific, no jargon.`

export async function POST(request: Request) {
  const { client: clientName, context, planGoals } = await request.json() as {
    client: string
    context: ClientContext
    planGoals: PlanGoals
  }

  const clientConfig = getClient(clientName)
  if (!clientConfig) return new Response('Client not found', { status: 404 })

  const customerId = clientConfig.customerId.toString()
  const loginCustomerId = clientConfig.loginCustomerId.toString()

  const contextSection = context
    ? buildContextSection(context, customerId, loginCustomerId)
    : '## Business Context\nNot set.'

  const AUDIT_SKILLS = ['strategy-specialist', 'bidding-auditor', 'budget-auditor']

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const auditResults: Record<string, string> = {}

        for (const skillId of AUDIT_SKILLS) {
          const skill = getSkill(clientName, skillId)
          if (!skill) {
            send({ type: 'phase', phase: `Skipping ${skillId} (not found)` })
            continue
          }

          send({ type: 'phase', phase: skillId })

          const systemPrompt = `${skill.claudeMd}

---

## Dashboard Environment

Context files are NOT available as files. Use the \`run_gaql_query\` tool for live data.

Google Ads config:
- Customer ID: ${customerId}
- Login Customer ID: ${loginCustomerId}

${contextSection}

---

${skill.content}`

          try {
            const output = await runAuditSkill(
              skillId,
              clientName,
              customerId,
              loginCustomerId,
              systemPrompt,
              send,
            )
            auditResults[skillId] = output
            send({ type: 'phase_done', phase: skillId, chars: output.length })
          } catch (err: unknown) {
            send({ type: 'phase_error', phase: skillId, error: err instanceof Error ? err.message : String(err) })
            auditResults[skillId] = `[Error running ${skillId}: ${err instanceof Error ? err.message : String(err)}]`
          }
        }

        send({ type: 'phase', phase: 'synthesis' })

        const auditSummary = AUDIT_SKILLS
          .map(id => auditResults[id] ? `## ${id} Findings\n\n${auditResults[id]}` : `## ${id}\n\n[Not available]`)
          .join('\n\n---\n\n')

        const planGoalsSection = `## Plan Goals & Client Input

- Growth target: ${planGoals.growthTarget || '—'}
- Focus areas: ${planGoals.focusAreas?.join(', ') || '—'}
- Timeline notes: ${planGoals.timeline || '—'}
- Website URL: ${planGoals.websiteUrl || '—'}
- Additional client notes: ${planGoals.clientNotes || '—'}`

        const synthesisMessages: Anthropic.MessageParam[] = [
          {
            role: 'user',
            content: `Create a 90-day strategic Google Ads plan for ${context?.businessName || clientName}.

${planGoalsSection}

---

${contextSection}

---

## Audit Findings

${auditSummary}

---

Generate the complete 90-day strategic plan now.`,
          },
        ]

        const synthesisResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 16000,
          system: SYNTHESIS_PROMPT,
          messages: synthesisMessages,
        })

        for (const block of synthesisResponse.content) {
          if (block.type === 'text') {
            send({ type: 'plan', text: block.text })
          }
        }

        send({ type: 'done' })
      } catch (err: unknown) {
        send({ type: 'error', error: err instanceof Error ? err.message : String(err) })
        send({ type: 'done' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
