import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { ChatMessage, ActionItem, MeetingAttendee } from '@/lib/types'
import { fetchImageBlock, prependImageContext, ImageBlock } from '@/lib/vision'
import { formatDate } from '@/lib/utils'

const anthropic = new Anthropic()

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages, meetingId }: { messages: ChatMessage[]; meetingId: string } = await request.json()

  const { data: meeting } = await supabase
    .from('meetings')
    .select('*, project:projects(id,name), series:meeting_series(id,name)')
    .eq('id', meetingId)
    .single()

  const { data: attachments } = await supabase
    .from('attachments')
    .select('file_name, mime_type, extracted_text, storage_path')
    .eq('entity_type', 'meeting')
    .eq('entity_id', meetingId)
    .order('created_at', { ascending: true })

  // Build text attachment context
  const attachmentContext = (attachments ?? [])
    .filter((a: { extracted_text: string | null }) => a.extracted_text)
    .map((a: { file_name: string; extracted_text: string | null }) => `### Attached file: ${a.file_name}\n${a.extracted_text}`)
    .join('\n\n')

  // Fetch image attachments for vision
  const imageAtts = (attachments ?? []).filter((a: { mime_type: string; extracted_text: string | null }) =>
    a.mime_type.startsWith('image/') && !a.extracted_text
  )
  let imageBlocks: ImageBlock[] = []
  if (imageAtts.length > 0) {
    const signed = await Promise.all(
      imageAtts.map((a: { storage_path: string }) =>
        supabase.storage.from('attachments').createSignedUrl(a.storage_path, 120)
      )
    )
    const fetched = await Promise.all(
      signed.map((s: { data: { signedUrl: string } | null }, i: number) =>
        s.data?.signedUrl ? fetchImageBlock(s.data.signedUrl, imageAtts[i].mime_type) : null
      )
    )
    imageBlocks = fetched.filter((b): b is ImageBlock => b !== null)
  }

  // Build system prompt from meeting context
  const attendeeStr = (meeting?.attendees ?? []).length > 0
    ? (meeting.attendees as MeetingAttendee[]).map((a: MeetingAttendee) =>
        `${a.name}${a.position ? ` (${a.position})` : ''}${a.organization ? ` â€” ${a.organization}` : ''}`
      ).join(', ')
    : 'Not recorded'

  const actionItemsStr = (meeting?.action_items ?? []).length > 0
    ? (meeting.action_items as ActionItem[]).map((a: ActionItem) =>
        `- [${a.done ? 'x' : ' '}] ${a.title}${a.owner ? ` â€” Owner: ${a.owner}` : ''}${a.due_date ? ` â€” Due: ${a.due_date}` : ''}`
      ).join('\n')
    : 'None'

  const sections: string[] = [
    `Meeting: ${meeting?.title ?? 'Unknown'}`,
    `Date: ${meeting?.meeting_date ? formatDate(meeting.meeting_date) : 'Unknown'}${meeting?.meeting_time ? ` at ${meeting.meeting_time.slice(0, 5)}` : ''}`,
    meeting?.duration_minutes ? `Duration: ${meeting.duration_minutes} minutes` : '',
    `Type: ${meeting?.type ?? 'Unknown'}`,
    meeting?.project ? `Project: ${(meeting.project as { name: string }).name}` : '',
    meeting?.series ? `Series: ${(meeting.series as { name: string }).name}` : '',
    `Attendees: ${attendeeStr}`,
    '',
    meeting?.notes ? `## Pre-meeting Notes / Agenda\n${meeting.notes}` : '',
    meeting?.transcript ? `## Transcript\n${meeting.transcript}` : '',
    meeting?.summary ? `## AI Summary\n${meeting.summary}` : '',
    `## Action Items\n${actionItemsStr}`,
    attachmentContext ? `## Attached Files\n${attachmentContext}` : '',
  ].filter(Boolean)

  const systemPrompt = `You are a meeting assistant for Jon Harris, Controller at Goodwill of Central and Coastal Virginia.

You have complete context for a specific meeting. Answer questions accurately and concisely, drawing only from what's in the meeting record. If something wasn't captured, say so.

${sections.join('\n')}`

  const stream = anthropic.messages.stream({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: systemPrompt,
    messages: prependImageContext(messages, imageBlocks),
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
