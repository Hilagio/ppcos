import Anthropic from '@anthropic-ai/sdk'
import { getClient } from '@/lib/clients'
import { getSkill } from '@/lib/skills'
import { runGaqlQuery } from '@/lib/google-ads'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'run_gaql_query',
    description: 'Execute a GAQL (Google Ads Query Language) query against the client Google Ads account to fetch live data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The GAQL query to execute' },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_context_file',
    description: 'Read a file from the client workspace (e.g. context/business.md, context/account-changelog.md).',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Relative path within the client directory' },
      },
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

function buildContextSection(ctx: ClientContext, customerId: string, loginCustomerId: string): string {
  const brandedCampaigns = ctx.campaigns.filter(c => c.label === 'brand').map(c => c.name)
  const includedConversions = ctx.conversionActions.filter(c => c.include).map(c => c.name)
  const competitorDomains = ctx.competitorDomains
    ? ctx.competitorDomains.split(',').map(d => d.trim()).filter(Boolean)
    : []

  const campaignLines = ctx.campaigns.length > 0
    ? ctx.campaigns.map(c => {
        const cpa = c.cpa30d != null ? `${ctx.currency} ${c.cpa30d} CPA` : 'no conversions'
        return `- **${c.name}** [${c.label || 'unlabeled'}] — ${c.type}, ${c.biddingStrategy}, ${c.status}, 30d spend: ${ctx.currency} ${c.cost30d}, ${cpa}`
      }).join('\n')
    : '— not available'

  const conversionLines = ctx.conversionActions.length > 0
    ? ctx.conversionActions.map(c => {
        const val = c.customValue || (c.defaultValue ? String(c.defaultValue) : '—')
        return `- ${c.name} [${c.category}] — value: ${val} — ${c.include ? 'included' : 'EXCLUDED'}`
      }).join('\n')
    : '— not available'

  const businessMd = `## Business Context (business.md)

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

### Branded campaigns (for search term exclusion)
${brandedCampaigns.length > 0 ? brandedCampaigns.map(n => `- ${n}`).join('\n') : '— none identified'}

### Conversion Actions
${conversionLines}
- Value per lead: ${ctx.valuePerLead || '—'}
- Lead-to-close rate: ${ctx.leadToCloseRate || '—'}
- Average deal value: ${ctx.avgDealValue || '—'}
- Conversion lag: ${ctx.conversionLagDays || '14'} days

### Competitive Strategy
- Approach: ${ctx.competitiveApproach || '—'}
- Competitors: ${competitorDomains.join(', ') || '—'}
- Win themes: ${ctx.winThemes || '—'}

### Constraints
${ctx.constraints || '— not set'}

### Seasonality
${ctx.seasonalityNotes || '— not set'}

### Notes
${ctx.notes || '— not set'}`

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
      minSpendToFlag: 5,
      conversionLagDays: parseInt(ctx.conversionLagDays) || 14,
      negativeMatchType: ctx.negativeMatchType || 'Broad',
      biddingStrategy: ctx.primaryKpi?.toLowerCase() === 'roas' ? 'roas' : 'cpa',
      inefficientCPAMultiplier: 1.5,
      inefficientROASMultiplier: 0.7,
      minSpendForInefficient: 50,
      minClicksForInefficient: 3,
      protectedTerms: { alwaysInclude: [], neverExclude: [] },
      sharedNegativeLists: {
        primary: ctx.primaryNegativeList || 'Search Term Exclusions',
        ngramNonConverting: 'Non-Converting N-grams',
        ngramInefficient: 'Inefficient N-grams',
      },
    },
    ngramAnalysis: {
      minImpressions: 50,
      minClicks: 5,
      minDistinctTerms: 2,
      biddingStrategy: ctx.primaryKpi?.toLowerCase() === 'roas' ? 'roas' : 'cpa',
      defaultAOV: parseInt((ctx.avgDealValue || '').replace(/[^0-9]/g, '')) || 200,
      nonConvertingSpendMultiplier: 2.0,
      inefficientCPAMultiplier: 1.75,
      inefficientROASMultiplier: 0.7,
      stopwords: [],
    },
  }

  return `${businessMd}

---

## ads-context.config.json

\`\`\`json
${JSON.stringify(adsConfig, null, 2)}
\`\`\``
}

export async function POST(request: Request) {
  const { client: clientName, skill: skillId, args, context } = await request.json()

  const clientConfig = getClient(clientName)
  if (!clientConfig) return new Response('Client not found', { status: 404 })

  const skill = getSkill(clientName, skillId)
  if (!skill) return new Response('Skill not found', { status: 404 })

  const contextSection = context
    ? buildContextSection(context as ClientContext, clientConfig.customerId.toString(), clientConfig.loginCustomerId.toString())
    : '## Business Context\nNot set — use available data to infer where possible.'

  const systemPrompt = `${skill.claudeMd}

---

## Dashboard Environment

Context files are NOT available as files. Do NOT attempt to read them.
Use the \`run_gaql_query\` tool to fetch all live data from the Google Ads API.

Google Ads config:
- Customer ID: ${clientConfig.customerId}
- Login Customer ID: ${clientConfig.loginCustomerId}

${contextSection}

---

${skill.content}`

  const userMessage = args ? `/${skillId} ${args}` : `/${skillId}`

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const messages: Anthropic.MessageParam[] = [
          { role: 'user', content: userMessage },
        ]

        let continueLoop = true
        while (continueLoop) {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 8096,
            system: systemPrompt,
            tools: TOOLS,
            messages,
          })

          const toolResults: Anthropic.ToolResultBlockParam[] = []

          for (const block of response.content) {
            if (block.type === 'text') {
              send({ type: 'text', text: block.text })
            } else if (block.type === 'tool_use') {
              send({ type: 'tool_use', name: block.name, input: block.input })

              let result: string
              try {
                if (block.name === 'run_gaql_query') {
                  const rows = await runGaqlQuery(
                    clientConfig.customerId.toString(),
                    clientConfig.loginCustomerId.toString(),
                    (block.input as { query: string }).query
                  )
                  result = JSON.stringify(rows, null, 2)
                  send({ type: 'tool_result', name: block.name, summary: `${rows.length} rows returned` })
                } else if (block.name === 'read_context_file') {
                  result = 'Context files not available in this environment — all context is injected in the system prompt.'
                  send({ type: 'tool_result', name: block.name, summary: 'Not available' })
                } else {
                  result = 'Unknown tool'
                }
              } catch (err: unknown) {
                result = `Error: ${err instanceof Error ? err.message : String(err)}`
                send({ type: 'tool_error', name: block.name, error: result })
              }

              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: result,
              })
            }
          }

          if (response.stop_reason === 'tool_use') {
            messages.push({ role: 'assistant', content: response.content })
            messages.push({ role: 'user', content: toolResults })
          } else {
            continueLoop = false
          }
        }
      } catch (err: unknown) {
        send({ type: 'error', error: err instanceof Error ? err.message : String(err) })
      } finally {
        send({ type: 'done' })
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
