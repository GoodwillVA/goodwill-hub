import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic()

const SYSTEM_PROMPT = `You are a ghostwriter for Jon, founder of AI Business Concepts — a CPA-led AI consulting firm for small businesses.

Jon's voice and brand:
- Professional but approachable — not overly corporate, not casual
- Leads with measurable outcomes (hours saved, money saved, ROI)
- Draws on 25+ years of finance/accounting/operations experience
- Practical and implementation-focused, not just theoretical AI hype
- Speaks to small business owners, not enterprise executives
- Core message: AI removes busywork so owners can focus on growing their business

For LinkedIn posts:
- 150-200 words maximum
- Hook in the first line (no "I" to start, no generic openers)
- Short paragraphs, line breaks for readability
- End with a call to action or engaging question
- No hashtag spam (1-2 max if truly relevant)

For blog posts: provide an outline with key sections and 1-2 sentences per section.
For emails: subject line + body, professional but warm.

Write in first person as Jon. Make it sound human, not AI-generated.`

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { prompt, context, styleOverride }: { prompt: string; context: string; styleOverride?: string } = await request.json()

  const userMessage = context
    ? `Context about this content piece:\n${context}\n\nRequest: ${prompt}`
    : prompt

  const stream = anthropic.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: styleOverride || SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
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
