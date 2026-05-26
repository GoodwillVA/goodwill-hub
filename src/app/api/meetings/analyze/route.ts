import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic()

const SYSTEM_PROMPT = `You are a meeting analyst for Jon at AI Business Concepts, a CPA-led AI consulting firm for small businesses.

Given a meeting transcript and context, return a JSON object with exactly these keys:

{
  "summary": "3-5 sentence recap covering: what was discussed, key decisions made, and what happens next",
  "action_items": [
    { "title": "specific task", "owner": "first name of person responsible or null", "due_date": "YYYY-MM-DD if mentioned otherwise null" }
  ],
  "followup_email": "complete email text starting with 'Subject: ...\\n\\n' then the full email body"
}

Guidelines:
- Summary: be specific and outcome-focused. Name decisions, not just topics.
- Action items: capture every commitment, deliverable, or next step. "Jon to send proposal by June 1" not just "send proposal". Include every person's commitments.
- Follow-up email: write as Jon from AI Business Concepts. Reference specific points from the meeting. Professional but warm. Under 200 words. Include a subject line.

Return ONLY valid JSON. No markdown code fences, no explanation text outside the JSON.`

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { transcript, context }: { transcript: string; context: string } = await request.json()

  if (!transcript?.trim()) {
    return Response.json({ error: 'No transcript provided' }, { status: 400 })
  }

  const userMessage = context
    ? `Meeting context:\n${context}\n\nTranscript:\n${transcript}`
    : `Transcript:\n${transcript}`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    const parsed = JSON.parse(raw)
    return Response.json(parsed)
  } catch {
    // Try stripping markdown fences if Claude added them anyway
    const stripped = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
    try {
      return Response.json(JSON.parse(stripped))
    } catch {
      return Response.json({ error: 'Failed to parse AI response', raw }, { status: 500 })
    }
  }
}
