import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { ChatMessage, ActionItem, MeetingAttendee } from '@/lib/types'

const anthropic = new Anthropic()

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages, seriesId }: { messages: ChatMessage[]; seriesId: string } = await request.json()

  const [{ data: series }, { data: meetings }] = await Promise.all([
    supabase.from('meeting_series').select('*').eq('id', seriesId).single(),
    supabase.from('meetings').select('*').eq('series_id', seriesId).order('meeting_date', { ascending: false }),
  ])

  const meetingContext = (meetings ?? []).map((m: {
    title: string; meeting_date: string; meeting_time: string | null;
    attendees: MeetingAttendee[] | null; notes: string | null;
    summary: string | null; action_items: ActionItem[] | null;
  }) => {
    const openItems = (m.action_items ?? []).filter(a => !a.done)
    const doneItems = (m.action_items ?? []).filter(a => a.done)
    const lines = [
      `### ${m.title} — ${m.meeting_date}${m.meeting_time ? ` at ${m.meeting_time.slice(0, 5)}` : ''}`,
      m.attendees?.length ? `Attendees: ${m.attendees.map(a => `${a.name}${a.position ? ` (${a.position})` : ''}`).join(', ')}` : '',
      m.notes ? `Agenda/Notes: ${m.notes}` : '',
      m.summary ? `Summary: ${m.summary}` : '',
      openItems.length > 0 ? `Open action items: ${openItems.map(a => `${a.title}${a.owner ? ` (${a.owner})` : ''}`).join('; ')}` : '',
      doneItems.length > 0 ? `Completed items: ${doneItems.map(a => a.title).join('; ')}` : '',
    ].filter(Boolean).join('\n')
    return lines
  }).join('\n\n')

  const systemPrompt = `You are a meeting advisor helping Jon Harris, Controller at Goodwill of Central and Coastal Virginia, analyze and act on his recurring meeting series.

Series: ${series?.name ?? 'Unknown'}
Total meetings: ${(meetings ?? []).length}

${meetingContext || 'No meeting details available yet.'}

Help Jon identify patterns across meetings in this series, track progress on recurring action items, spot topics that keep resurfacing, summarize what's been decided or agreed, draft agendas for upcoming sessions, or provide any other insight about this series. Be specific — reference actual meetings, dates, and items from the context above.`

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
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
