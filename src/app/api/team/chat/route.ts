import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { ChatMessage } from '@/lib/types'
import { fetchImageBlock, prependImageContext, ImageBlock } from '@/lib/vision'

const anthropic = new Anthropic()

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages, memberId }: { messages: ChatMessage[]; memberId: string } = await request.json()

  // Phase 1: get member record (name needed for meeting query)
  const { data: member } = await supabase.from('team_members').select('*').eq('id', memberId).single()

  // Phase 2: fetch everything else in parallel, including meetings this person attended
  const [{ data: logs }, { data: goals }, { data: atts }, { data: memberMeetings }] = await Promise.all([
    supabase.from('team_member_logs').select('*').eq('member_id', memberId).order('log_date', { ascending: false }).limit(10),
    supabase.from('team_member_goals').select('*').eq('member_id', memberId).order('created_at', { ascending: true }),
    supabase.from('attachments').select('file_name, mime_type, extracted_text, storage_path').eq('entity_type', 'team_member').eq('entity_id', memberId).order('created_at', { ascending: true }),
    member?.name
      ? supabase.from('meetings')
          .select('id, title, meeting_date, type, notes, summary, transcript')
          .contains('attendees', [{ name: member.name }])
          .in('type', ['team', '1-1'])
          .order('meeting_date', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as { id: string; title: string; meeting_date: string; type: string; notes: string | null; summary: string | null; transcript: string | null }[] }),
  ])

  const contextLines = [
    `Team member: ${member?.name}`,
    member?.title ? `Title: ${member.title}` : '',
    member?.notes ? `Current work:\n${member.notes}` : 'No current work notes on file.',
    logs && logs.length > 0
      ? `Recent log entries:\n${logs.map((l: { log_date: string; content: string }) => `- ${l.log_date}: ${l.content}`).join('\n')}`
      : 'No log entries yet.',
    goals && goals.length > 0
      ? `Goals:\n${goals.map((g: { title: string; period: string; status: string }) => `- ${g.title}${g.period ? ` (${g.period})` : ''} — ${g.status.replace(/_/g, ' ')}`).join('\n')}`
      : 'No goals recorded yet.',
  ].filter(Boolean).join('\n\n')

  // Build meeting history context
  const meetingContext = (memberMeetings ?? []).length > 0
    ? `\n\n## Meeting History\nRecent team and 1:1 meetings ${member?.name} attended:\n\n${(memberMeetings ?? []).map((m: {
        title: string; meeting_date: string; type: string; notes: string | null; summary: string | null; transcript: string | null
      }) => {
        const parts = [`### ${m.title} — ${m.meeting_date} (${m.type})`]
        if (m.summary) parts.push(`Summary: ${m.summary}`)
        if (m.notes) parts.push(`Notes: ${m.notes}`)
        // Include transcript only when there's no summary, capped at 2000 chars
        if (!m.summary && m.transcript) {
          const excerpt = m.transcript.length > 2000 ? m.transcript.slice(0, 2000) + '…' : m.transcript
          parts.push(`Transcript excerpt:\n${excerpt}`)
        }
        return parts.join('\n')
      }).join('\n\n')}`
    : ''

  const attachmentContext = (atts ?? []).filter((a: { extracted_text: string | null }) => a.extracted_text).length > 0
    ? `\n\n## Attached Reference Files\n${(atts ?? []).filter((a: { extracted_text: string | null }) => a.extracted_text).map((a: { file_name: string; extracted_text: string | null }) =>
        `### ${a.file_name}\n${a.extracted_text}`
      ).join('\n\n')}`
    : ''

  const imageAtts = (atts ?? []).filter((a: { mime_type: string; extracted_text: string | null }) =>
    a.mime_type.startsWith('image/') && !a.extracted_text
  )
  let imageBlocks: ImageBlock[] = []
  if (imageAtts.length > 0) {
    const signed = await Promise.all(
      imageAtts.map((a: { storage_path: string }) => supabase.storage.from('attachments').createSignedUrl(a.storage_path, 120))
    )
    const fetched = await Promise.all(
      signed.map((s: { data: { signedUrl: string } | null }, i: number) =>
        s.data?.signedUrl ? fetchImageBlock(s.data.signedUrl, imageAtts[i].mime_type) : null
      )
    )
    imageBlocks = fetched.filter((b): b is ImageBlock => b !== null)
  }

  const systemPrompt = `You are a management advisor helping Jon Harris, Controller at Goodwill of Central and Coastal Virginia, manage and develop his accounting team.

${contextLines}${meetingContext}

Help Jon think through performance conversations, draft feedback, develop coaching approaches, plan 1:1 agendas, work through team dynamics, recognize strengths, or address any challenge related to leading this team member. Be practical and specific — Jon manages accounting professionals in a nonprofit environment.${attachmentContext}`

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
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
