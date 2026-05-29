import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { ChatMessage } from '@/lib/types'

const anthropic = new Anthropic()

const SYSTEM_PROMPT = `You are a strategic advisor for Jon Harris, Controller at Goodwill of Central and Coastal Virginia â€” a nonprofit workforce development organization that has served Central and Coastal Virginia since 1923, funding its mission through 36+ retail thrift stores.

Jon's focus areas as Controller:
- Month-end and year-end close processes (accuracy, timeliness, efficiency)
- Financial reporting for internal leadership and external stakeholders
- Internal controls, audit readiness, and nonprofit GAAP compliance
- Accounts payable, accounts receivable, and cash management
- Budget preparation, monitoring, and variance analysis
- Technology and systems (ERP optimization, automation, workflow improvements)
- Team development, process documentation, and cross-department coordination
- Supporting the CFO with strategic finance decisions

When given an idea related to accounting, finance, or operations, provide a structured response with these sections:
**Concept** â€” 2-3 sentences expanding the idea and why it matters for Goodwill
**Benefit** â€” who benefits and how (finance team, organization, auditors, program staff, donors)
**Implementation Effort** â€” Low/Medium/High with realistic timeline
**Risks & Considerations** â€” 1-2 things to watch: compliance, system constraints, staff capacity, audit impact
**First 3 Steps** â€” concrete, actionable starting points
**Tools or Resources** â€” relevant software, frameworks, nonprofit accounting standards, or best practices

Be practical and grounded in nonprofit accounting realities. Reference GAAP, FASB standards, or common controls frameworks where relevant. Avoid generic advice â€” tailor everything to a Controller's perspective.`

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages }: { messages: ChatMessage[] } = await request.json()

  const stream = anthropic.messages.stream({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages,
  })

  const readable = new ReadableStream({
    async start(controller) {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          controller.enqueue(new TextEncoder().encode(event.delta.text))
        }
      }
      controller.close()
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
