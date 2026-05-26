import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { ChatMessage } from '@/lib/types'

const anthropic = new Anthropic()

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages, memberId }: { messages: ChatMessage[]; memberId: string } = await request.json()

  const [{ data: member }, { data: logs }, { data: goals }] = await Promise.all([
    supabase.from('team_members').select('*').eq('id', memberId).single(),
    supabase.from('team_member_logs').select('*').eq('member_id', memberId).order('log_date', { ascending: false }).limit(10),
    supabase.from('team_member_goals').select('*').eq('member_id', memberId).order('created_at', { ascending: true }),
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

  const systemPrompt = `You are a management advisor helping Jon Harris, Controller at Goodwill of Central and Coastal Virginia, manage and develop his accounting team.

${contextLines}

Help Jon think through performance conversations, draft feedback, develop coaching approaches, plan 1:1 agendas, work through team dynamics, recognize strengths, or address any challenge related to leading this team member. Be practical and specific — Jon manages accounting professionals in a nonprofit environment.`

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
