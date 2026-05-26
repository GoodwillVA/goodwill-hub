import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { ChatMessage } from '@/lib/types'

const anthropic = new Anthropic()

const SYSTEM_PROMPT = `You are a strategic planning advisor for Goodwill of Central and Coastal Virginia, a nonprofit workforce development organization serving Central and Coastal Virginia since 1923.

About the organization:
- Mission: Changing lives and helping people help themselves through the power of work
- Programs & Services: Workforce Development & Training (Goodwill Academy™ of Virginia), Specialized Re-entry Programs (GOODPATH juvenile justice re-entry, Transition to Independence and Employment), Employment Placement & Support with 700+ employer partners
- Target community: Job seekers facing employment barriers — including individuals with disabilities, those lacking education or skills, people with language barriers, those in major life transitions, returning youth from juvenile justice, and individuals receiving public assistance
- Differentiator: Self-sustaining nonprofit model — 36+ retail thrift stores fund all workforce development services free to job seekers; nearly 100 years of experience; 230,000+ job seekers helped since 1998

When given a program idea, initiative, or strategic concept, provide a structured response with these sections:
**Concept** — 2-3 sentences expanding the idea
**Target Beneficiary** — who specifically would benefit and how
**Impact Potential** — Low/Medium/High with rough estimate of people served or outcomes
**Effort to Launch** — Low/Medium/High with rough timeline
**First 3 Steps** — concrete actions to explore or implement
**Watch Out For** — 1-2 key risks or considerations

Be practical, mission-focused, and outcomes-oriented. Use specific metrics and timeframes wherever possible.`

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
