import { createClient } from '@/lib/supabase/server'

const GRANOLA_BASE = 'https://public-api.granola.ai/v1'

async function granolaFetch(path: string) {
  const apiKey = process.env.GRANOLA_API_KEY
  if (!apiKey) throw new Error('GRANOLA_API_KEY not set in environment variables')
  const res = await fetch(`${GRANOLA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Granola API ${res.status}: ${body}`)
  }
  return res.json()
}

function parseDateTime(note: Record<string, unknown>): { date: string; time: string | null } {
  const raw = (note.start_time ?? note.created_at ?? note.meeting_start ?? '') as string
  if (!raw) return { date: new Date().toISOString().split('T')[0], time: null }
  const d = new Date(raw)
  if (isNaN(d.getTime())) return { date: new Date().toISOString().split('T')[0], time: null }
  return {
    date: d.toISOString().split('T')[0],
    time: d.toTimeString().slice(0, 5),
  }
}

function formatTranscript(segments: unknown[]): string {
  if (!Array.isArray(segments)) return ''
  return segments
    .map(s => {
      if (typeof s !== 'object' || s === null) return null
      const seg = s as Record<string, unknown>
      if (!seg.text) return null
      const speaker = seg.speaker as Record<string, unknown> | undefined
      const source = speaker?.source as string | undefined
      const label = speaker?.diarization_label as string | undefined
      const name = source === 'microphone' ? 'Jon' : (label ?? 'Speaker')
      return `${name}: ${String(seg.text).trim()}`
    })
    .filter(Boolean)
    .join('\n')
}

// GET /api/meetings/granola          — list recent Granola meetings
// GET /api/meetings/granola?id=xxx   — fetch a meeting with full transcript
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  try {
    if (id) {
      const note = await granolaFetch(`/notes/${id}?include=transcript`) as Record<string, unknown>

      const { date, time } = parseDateTime(note)

      const rawTranscript = note.transcript as unknown[] | undefined
      const transcript = Array.isArray(rawTranscript) && rawTranscript.length > 0
        ? formatTranscript(rawTranscript)
        : null

      // Duration: Granola may return seconds or minutes — values > 600 are treated as seconds
      const rawDuration = note.duration as number | undefined
      const duration_minutes = rawDuration
        ? (rawDuration > 600 ? Math.round(rawDuration / 60) : rawDuration)
        : null

      const granolaSum = (note.summary_markdown ?? note.summary_text ?? note.summary) as string | undefined
      const notes = granolaSum?.trim()
        ? `--- Granola Summary ---\n${granolaSum.trim()}`
        : null

      return Response.json({
        title: String(note.title ?? 'Meeting'),
        meeting_date: date,
        meeting_time: time,
        duration_minutes,
        transcript,
        notes,
      })
    } else {
      const data = await granolaFetch('/notes') as Record<string, unknown>
      const list = ((data.notes ?? []) as Record<string, unknown>[]).map(n => {
        const { date, time } = parseDateTime(n)
        return {
          id: String(n.id),
          title: String(n.title ?? 'Untitled'),
          date,
          time,
          participantCount: Array.isArray(n.participants) ? (n.participants as unknown[]).length : null,
        }
      })
      return Response.json({ meetings: list })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
