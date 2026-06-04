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

export async function POST(request: Request) {
  const { client: clientName, skill: skillId, args } = await request.json()

  const clientConfig = getClient(clientName)
  if (!clientConfig) return new Response('Client not found', { status: 404 })

  const skill = getSkill(clientName, skillId)
  if (!skill) return new Response('Skill not found', { status: 404 })

  const systemPrompt = `${skill.claudeMd}

---

## Dashboard Environment — Important

Context files (context/business.md, context/account-changelog.md, config/ads-context.config.json) are NOT available as files in this environment. Do NOT attempt to read them — skip straight to using the \`run_gaql_query\` tool to fetch all data you need live from the Google Ads API.

The client's Google Ads configuration is:
- Customer ID: ${clientConfig.customerId}
- Login Customer ID: ${clientConfig.loginCustomerId}

You have full access to the Google Ads API via \`run_gaql_query\`. Use it directly to fetch campaigns, ad groups, keywords, settings, change history, and any other data the skill requires. Do not wait for or request missing files.

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
                  result = 'Context files not available in this environment'
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
