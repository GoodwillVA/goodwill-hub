import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { ChatMessage } from '@/lib/types'
import { fetchImageBlock, prependImageContext, ImageBlock } from '@/lib/vision'

const anthropic = new Anthropic()

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages, projectId }: { messages: ChatMessage[]; projectId: string } = await request.json()

  // Fetch project with tasks and recent meetings for context
  const [{ data: project }, { data: tasks }, { data: meetings }] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).single(),
    supabase.from('tasks').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    supabase.from('meetings').select('id, title, meeting_date, summary, action_items').eq('project_id', projectId).order('meeting_date', { ascending: false }).limit(5),
  ])

  const isGeneral = project?.is_general ?? false

  const { data: atts } = await supabase
    .from('attachments')
    .select('file_name, mime_type, extracted_text, storage_path')
    .eq('entity_type', 'project')
    .eq('entity_id', projectId)
    .order('created_at', { ascending: true })

  // Text attachments â†’ include in system prompt
  const attachmentContext = (atts ?? []).filter((a: { extracted_text: string | null }) => a.extracted_text).length > 0
    ? `\n\n## Attached Reference Files\n${(atts ?? []).filter((a: { extracted_text: string | null }) => a.extracted_text).map((a: { file_name: string; extracted_text: string | null }) =>
        `### ${a.file_name}\n${a.extracted_text}`
      ).join('\n\n')}`
    : ''

  // Image attachments â†’ fetch as base64 for vision
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

  let systemPrompt: string

  if (isGeneral) {
    systemPrompt = `You are a strategic advisor for Jon Harris, Controller at Goodwill of Central and Coastal Virginia â€” a nonprofit workforce development organization that has served Central and Coastal Virginia since 1923, funded through 36+ retail thrift stores.

Jon's focus areas:
- Month-end and year-end close processes
- Financial reporting for internal leadership and external stakeholders
- Internal controls, audit readiness, and nonprofit GAAP compliance
- Accounts payable, accounts receivable, and cash management
- Budget preparation, monitoring, and variance analysis
- Technology, systems, ERP optimization, and automation
- Team development and cross-department coordination
- Supporting the CFO with strategic finance decisions

You can help with anything: brainstorming ideas, drafting communications, analyzing problems, working through decisions, or general accounting and finance questions. Be practical, specific, and grounded in nonprofit accounting realities. Reference GAAP, FASB, or controls frameworks where relevant.${attachmentContext}`
  } else {
    const openTasks = (tasks ?? []).filter((t: { status: string }) => t.status === 'todo')
    const doneTasks = (tasks ?? []).filter((t: { status: string }) => t.status === 'done')
    const recentMeetings = (meetings ?? [])

    const contextLines = [
      `Project: ${project?.name}`,
      project?.area ? `Area: ${project.area}` : '',
      project?.description ? `Description: ${project.description}` : '',
      project?.due_date ? `Due date: ${project.due_date}` : '',
      openTasks.length > 0
        ? `Open tasks (${openTasks.length}): ${openTasks.map((t: { title: string }) => t.title).join(' Â· ')}`
        : 'No open tasks',
      doneTasks.length > 0
        ? `Completed tasks (${doneTasks.length}): ${doneTasks.map((t: { title: string }) => t.title).join(' Â· ')}`
        : '',
      recentMeetings.length > 0
        ? `Recent meetings:\n${recentMeetings.map((m: { title: string; meeting_date: string; summary: string | null; action_items: { title: string; done: boolean }[] | null }) => {
            const lines = [`- ${m.title} (${m.meeting_date})`]
            if (m.summary) lines.push(`  Summary: ${m.summary}`)
            const openItems = (m.action_items ?? []).filter(a => !a.done)
            if (openItems.length > 0) lines.push(`  Open action items: ${openItems.map(a => a.title).join(', ')}`)
            return lines.join('\n')
          }).join('\n')}`
        : '',
    ].filter(Boolean).join('\n')

    systemPrompt = `You are a project advisor helping Jon Harris, Controller at Goodwill of Central and Coastal Virginia, work through the following project:

${contextLines}

Help Jon brainstorm approaches, identify risks, draft communications, think through decisions, and move this project forward. Be specific and practical â€” Jon is a Controller at a nonprofit, so ground your advice in accounting, finance, and operations realities. Reference GAAP, FASB standards, or controls frameworks where relevant.${attachmentContext}`
  }

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
