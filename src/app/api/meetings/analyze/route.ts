import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { fetchImageBlock, ImageBlock } from '@/lib/vision'

const anthropic = new Anthropic()

const SYSTEM_PROMPT = `You are a meeting analyst for Jon at Goodwill of Central and Coastal Virginia, a nonprofit workforce development organization serving Central and Coastal Virginia.

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
- Follow-up email: write as Jon from Goodwill of Central and Coastal Virginia. Reference specific points from the meeting. Professional but warm. Under 200 words. Include a subject line.

Return ONLY valid JSON. No markdown code fences, no explanation text outside the JSON.`

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
    max_tokens: 2048,
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
