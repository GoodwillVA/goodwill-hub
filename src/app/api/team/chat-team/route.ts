import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { ChatMessage, AgendaItem, PendingAsk } from '@/lib/types'

const anthropic = new Anthropic()

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages }: { messages: ChatMessage[] } = await request.json()

  const [{ data: members }, { data: logs }, { data: goals }, { data: meetings }] = await Promise.all([
    supabase.from('team_members').select('*').order('sort_order', { ascending: true }),
    supabase.from('team_member_logs').select('*').order('log_date', { ascending: false }),
    supabase.from('team_member_goals').select('*').order('created_at', { ascending: true }),
    supabase.from('meetings')
      .select('id, title, meeting_date, type, summary, attendees')
      .in('type', ['team', '1-1'])
      .order('meeting_date', { ascending: false })
      .limit(10),
  ])

  const memberContext = (members ?? []).map((m: {
    id: string; name: string; title: string | null; notes: string | null;
    agenda_items: AgendaItem[] | null; pending_asks: PendingAsk[] | null;
  }) => {
    const memberLogs = (logs ?? [])
      .filter((l: { member_id: string }) => l.member_id === m.id)
      .slice(0, 5)
    const memberGoals = (goals ?? []).filter((g: { member_id: string }) => g.member_id === m.id)
    const openAgenda = ((m.agenda_items ?? []) as AgendaItem[]).filter(a => !a.done)
    const openAsks = ((m.pending_asks ?? []) as PendingAsk[]).filter(a => !a.resolved)

    const lines = [
      `### ${m.name}${m.title ? ` — ${m.title}` : ''}`,
      m.notes ? `Current work: ${m.notes}` : '',
      memberGoals.length > 0
        ? `Goals: ${memberGoals.map((g: { title: string; period: string; status: string }) =>
            `${g.title}${g.period ? ` (${g.period})` : ''} [${g.status.replace(/_/g, ' ')}]`
          ).join('; ')}`
        : '',
      openAgenda.length > 0
        ? `Agenda items pending: ${openAgenda.map(a => a.title).join('; ')}`
        : '',
      openAsks.length > 0
        ? `Asks/decisions pending: ${openAsks.map(a => a.title).join('; ')}`
        : '',
      memberLogs.length > 0
        ? `Recent log:\n${memberLogs.map((l: { log_date: string; content: string }) => `- ${l.log_date}: ${l.content}`).join('\n')}`
        : '',
    ].filter(Boolean).join('\n')

    return lines
  }).join('\n\n')

  const meetingContext = (meetings ?? []).length > 0
    ? `\n\nRecent team meetings:\n${(meetings ?? []).map((m: {
        title: string; meeting_date: string; type: string; summary: string | null
      }) => `- ${m.title} (${m.meeting_date}, ${m.type})${m.summary ? `: ${m.summary}` : ''}`
      ).join('\n')}`
    : ''

  const systemPrompt = `You are a management advisor helping Jon Harris, Controller at Goodwill of Central and Coastal Virginia, think strategically about his accounting team as a whole.

## Team Overview

${memberContext}${meetingContext}

Help Jon with team-wide thinking: workload distribution, identifying patterns across the team, coaching strategies, team communication, prioritization, identifying who needs support, succession planning, or anything else related to leading his accounting team effectively. Be practical and grounded in nonprofit accounting operations.`

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
