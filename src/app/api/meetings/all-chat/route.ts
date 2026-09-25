import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { ChatMessage, ActionItem, MeetingAttendee } from '@/lib/types'

const anthropic = new Anthropic()

type MeetingRow = {
  id: string; title: string; meeting_date: string; meeting_time: string | null; status: string;
  attendees: MeetingAttendee[] | null; notes: string | null;
  summary: string | null; action_items: ActionItem[] | null;
  series: { name: string } | null; project: { name: string } | null;
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages }: { messages: ChatMessage[] } = await request.json()

  const [{ data: meetings }, { data: atts }] = await Promise.all([
    supabase
      .from('meetings')
      .select('id, title, meeting_date, meeting_time, status, attendees, notes, summary, action_items, series:meeting_series(name), project:projects(name)')
      .order('meeting_date', { ascending: false }),
    supabase.from('attachments').select('entity_id, file_name').eq('entity_type', 'meeting'),
  ])

  // Attachment contents are left out to keep per-question cost bounded across every meeting
  const meetingContext = ((meetings ?? []) as unknown as MeetingRow[]).map(m => {
    const openItems = (m.action_items ?? []).filter(a => !a.done)
    const doneItems = (m.action_items ?? []).filter(a => a.done)
    const files = (atts ?? []).filter(a => a.entity_id === m.id).map(a => a.file_name)
    return [
      `### ${m.title} — ${m.meeting_date}${m.meeting_time ? ` at ${m.meeting_time.slice(0, 5)}` : ''} (${m.status})`,
      m.series?.name ? `Series: ${m.series.name}` : '',
      m.project?.name ? `Project: ${m.project.name}` : '',
      m.attendees?.length ? `Attendees: ${m.attendees.map(a => `${a.name}${a.position ? ` (${a.position})` : ''}`).join(', ')}` : '',
      m.notes ? `Agenda/Notes: ${m.notes}` : '',
      m.summary ? `Summary: ${m.summary}` : '',
      openItems.length > 0 ? `Open action items: ${openItems.map(a => `${a.title}${a.owner ? ` (${a.owner})` : ''}${a.due_date ? ` due ${a.due_date}` : ''}`).join('; ')}` : '',
      doneItems.length > 0 ? `Completed items: ${doneItems.map(a => a.title).join('; ')}` : '',
      files.length > 0 ? `Attached files: ${files.join(', ')}` : '',
    ].filter(Boolean).join('\n')
  }).join('\n\n')

  const today = new Date().toISOString().split('T')[0]

  const systemPrompt = `You are a meeting advisor helping Jon Harris, Controller at Goodwill of Central and Coastal Virginia, analyze and act on everything across all of his meetings.

Today's date: ${today}
Total meetings: ${(meetings ?? []).length}

${meetingContext || 'No meeting details available yet.'}

Help Jon find information across meetings, identify themes and patterns, track open action items by person or topic, spot issues that keep resurfacing across different groups, summarize what was decided over a time period, or prepare for upcoming meetings. Be specific — reference actual meetings, dates, and items from the context above. If the answer isn't in the meeting records, say so rather than guessing.`

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-5',
    max_tokens: 8192,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
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
