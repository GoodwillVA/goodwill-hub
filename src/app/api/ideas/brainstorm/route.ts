import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { ChatMessage } from '@/lib/types'

const anthropic = new Anthropic()

const SYSTEM_PROMPT = `You are a strategic business advisor for AI Business Concepts, a CPA-led AI consulting firm that helps small businesses automate operations through AI.

About the business:
- Services: Operations & Workflow Automation, Finance & Accounting AI, AI Strategy & Roadmapping
- Target market: Small businesses with administrative burden and operational inefficiency
- Differentiator: CPA/finance background (25+ years) — practical, not pure tech
- Tagline: "Less busywork. More business"
- Revenue models exploring: productized consulting packages, digital products/templates, retainer support

When given a business idea, provide a structured response with these sections:
**Concept** — 2-3 sentences expanding the idea
**Target Buyer** — who specifically would pay for this
**Revenue Potential** — Low/Medium/High with rough estimate
**Effort to Launch** — Low/Medium/High with rough timeline
**First 3 Steps** — concrete actions to test or launch
**Watch Out For** — 1-2 key risks or considerations

Be practical, direct, and revenue-focused. Use dollar figures and timeframes wherever you can.`

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages }: { messages: ChatMessage[] } = await request.json()

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
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
