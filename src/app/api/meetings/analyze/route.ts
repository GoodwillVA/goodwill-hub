import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { fetchImageBlock, ImageBlock } from '@/lib/vision'

const anthropic = new Anthropic()

const SYSTEM_PROMPT = `You are a meeting analyst for Jon at Goodwill of Central and Coastal Virginia, a nonprofit workforce development organization.

Given a meeting transcript and context, return a JSON object with exactly these keys:

{
  "summary": "detailed structured plain-text summary using the section format described below",
  "action_items": [
    { "title": "specific task", "owner": "first name of person responsible or null", "due_date": "YYYY-MM-DD if mentioned otherwise null" }
  ]
}

Format the "summary" value as plain text with the following sections. Use exactly these all-caps headers. Only include a section if it has meaningful content.

OVERVIEW
2–3 sentences: what this meeting was about, who attended, and the primary outcome or purpose.

KEY DISCUSSION POINTS
• [Topic or issue]: Substantive summary of what was discussed — positions taken, context provided, analysis shared, concerns raised. Be specific enough that someone who wasn't in the room understands the substance.
• Continue for each significant topic.

DECISIONS MADE
• State each decision with enough context to understand it. "Decided to defer the external audit until Q3 due to staffing" not just "discussed audit".

OPEN QUESTIONS & UNRESOLVED ITEMS
• Questions raised but not answered, issues flagged for follow-up, topics tabled for a future meeting.

CONTEXT & BACKGROUND NOTED
• Important background, constraints, deadlines, or organizational context mentioned that informs future work or decisions.

Guidelines:
- Be specific and substantive throughout — this is a working record, not a vague recap
- Name people, amounts, dates, and systems when mentioned
- Action items: capture every commitment. "Jon to send revised budget to Sarah by June 1" not just "send budget"
- Omit sections that genuinely have no content rather than adding filler

Return ONLY valid JSON. No markdown code fences, no explanation outside the JSON.`

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { transcript, context, meetingId }: { transcript: string; context: string; meetingId?: string } = await request.json()

  if (!transcript?.trim()) {
    return Response.json({ error: 'No transcript provided' }, { status: 400 })
  }

  // Fetch any file attachments for this meeting to enrich context
  let attachmentContext = ''
  let imageBlocks: ImageBlock[] = []
  if (meetingId) {
    const { data: attachments } = await supabase
      .from('attachments')
      .select('file_name, extracted_text, mime_type, storage_path')
      .eq('entity_type', 'meeting')
      .eq('entity_id', meetingId)
    if (attachments && attachments.length > 0) {
      const parts = attachments
        .filter(a => a.extracted_text)
        .map(a => `--- Attached file: ${a.file_name} ---\n${a.extracted_text}`)
      if (parts.length > 0) {
        attachmentContext = `\n\nAttached reference documents:\n${parts.join('\n\n')}`
      }
      // Fetch images for vision
      const imgAtts = attachments.filter(a => a.mime_type.startsWith('image/') && !a.extracted_text)
      if (imgAtts.length > 0) {
        const signed = await Promise.all(
          imgAtts.map(a => supabase.storage.from('attachments').createSignedUrl(a.storage_path, 120))
        )
        const fetched = await Promise.all(
          signed.map((s: { data: { signedUrl: string } | null }, i: number) =>
            s.data?.signedUrl ? fetchImageBlock(s.data.signedUrl, imgAtts[i].mime_type) : null
          )
        )
        imageBlocks = fetched.filter((b): b is ImageBlock => b !== null)
      }
    }
  }

  const textContent = context
    ? `Meeting context:\n${context}${attachmentContext}\n\nTranscript:\n${transcript}`
    : `Transcript:\n${transcript}${attachmentContext}`

  // Build content array — add images alongside text so Claude can see them
  const userContent: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = [
    { type: 'text', text: textContent },
    ...imageBlocks,
  ]

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
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
