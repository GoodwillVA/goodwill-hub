'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CalMeeting {
  id: string
  title: string
  meeting_date: string
  meeting_time: string | null
}

interface CalProject {
  id: string
  name: string
  due_date: string
}

interface CalEvent {
  id: string
  title: string
  start_date: string
  end_date: string
  type: 'pto' | 'team_pto' | 'holiday' | 'note'
  team_member_id: string | null
  team_member: { id: string; name: string } | null
}

interface TeamMember {
  id: string
  name: string
}

type ItemType = 'meeting' | 'project' | 'pto' | 'team_pto' | 'holiday' | 'note'

interface CellItem {
  id: string
  title: string
  type: ItemType
  time?: string
  href?: string
  canDelete?: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ITEM_STYLES: Record<ItemType, string> = {
  meeting:  'bg-blue-500/20 text-blue-300',
  project:  'bg-gold-500/20 text-gold-400',
  pto:      'bg-emerald-500/20 text-emerald-300',
  team_pto: 'bg-purple-500/20 text-purple-300',
  holiday:  'bg-orange-500/20 text-orange-300',
  note:     'bg-navy-600/60 text-cream-200/50',
}

const LEGEND: [ItemType, string][] = [
  ['meeting',  'Meetings'],
  ['project',  'Due Dates'],
  ['pto',      'My PTO'],
  ['team_pto', 'Team PTO'],
  ['holiday',  'Holiday'],
  ['note',     'Note'],
]

const TYPE_LABELS: Record<string, string> = {
  note:     'Note',
  pto:      'My PTO',
  team_pto: 'Team PTO',
  holiday:  'Holiday',
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

const EMPTY_FORM = {
  title: '',
  type: 'note' as 'pto' | 'team_pto' | 'holiday' | 'note',
  start_date: '',
  end_date: '',
  team_member_id: '',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function getMondayOfWeek(d: Date): Date {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  const day = date.getDay()
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1))
  return date
}

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WeekCalendar() {
  const supabase = createClient()
  const router = useRouter()

  const [weekOffset, setWeekOffset] = useState(0)
  const [meetings, setMeetings] = useState<CalMeeting[]>([])
  const [projects, setProjects] = useState<CalProject[]>([])
  const [calEvents, setCalEvents] = useState<CalEvent[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const todayStr = useMemo(() => toDateStr(new Date()), [])

  const weeks = useMemo<Date[][]>(() => {
    const base = getMondayOfWeek(new Date())
    base.setDate(base.getDate() + weekOffset * 7)
    return Array.from({ length: 4 }, (_, wi) =>
      Array.from({ length: 5 }, (_, di) => {
        const d = new Date(base)
        d.setDate(d.getDate() + wi * 7 + di)
        return d
      })
    )
  }, [weekOffset])

  const [minDate, maxDate] = useMemo(() => [
    toDateStr(weeks[0][0]),
    toDateStr(weeks[3][4]),
  ], [weeks])

  useEffect(() => { loadData() }, [minDate, maxDate]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.from('team_members').select('id, name')
      .order('sort_order', { ascending: true })
      .then(({ data }) => setTeamMembers(data ?? []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    const [{ data: m }, { data: p }, { data: e }] = await Promise.all([
      supabase.from('meetings')
        .select('id, title, meeting_date, meeting_time')
        .gte('meeting_date', minDate)
        .lte('meeting_date', maxDate)
        .neq('status', 'cancelled')
        .order('meeting_time', { ascending: true, nullsFirst: false }),
      supabase.from('projects')
        .select('id, name, due_date')
        .gte('due_date', minDate)
        .lte('due_date', maxDate)
        .neq('status', 'delivered')
        .not('due_date', 'is', null),
      supabase.from('calendar_events')
        .select('*, team_member:team_members(id, name)')
        .lte('start_date', maxDate)
        .gte('end_date', minDate)
        .order('start_date', { ascending: true }),
    ])
    setMeetings((m ?? []) as CalMeeting[])
    setProjects((p ?? []) as CalProject[])
    setCalEvents((e ?? []) as CalEvent[])
  }

  function itemsForDate(dateStr: string): CellItem[] {
    const items: CellItem[] = []

    meetings
      .filter(m => m.meeting_date === dateStr)
      .forEach(m => items.push({
        id: m.id, title: m.title, type: 'meeting',
        time: m.meeting_time ? fmtTime(m.meeting_time) : undefined,
        href: '/meetings',
      }))

    projects
      .filter(p => p.due_date === dateStr)
      .forEach(p => items.push({
        id: p.id, title: p.name, type: 'project', href: '/projects',
      }))

    calEvents
      .filter(e => e.start_date <= dateStr && e.end_date >= dateStr)
      .forEach(e => items.push({
        id: e.id,
        title: e.type === 'team_pto' && e.team_member?.name
          ? `${e.team_member.name} — PTO`
          : e.title,
        type: e.type,
        canDelete: true,
      }))

    return items
  }

  function openAdd(day: Date) {
    const ds = toDateStr(day)
    setForm({ ...EMPTY_FORM, start_date: ds, end_date: ds })
    setShowModal(true)
  }

  async function saveEvent() {
    if (!form.title.trim()) { toast.error('Title is required'); return }
    if (form.type === 'team_pto' && !form.team_member_id) { toast.error('Select a team member'); return }
    setSaving(true)
    const end = form.end_date >= form.start_date ? form.end_date : form.start_date
    const { data, error } = await supabase.from('calendar_events')
      .insert({
        title: form.title.trim(),
        type: form.type,
        start_date: form.start_date,
        end_date: end,
        team_member_id: form.type === 'team_pto' ? form.team_member_id : null,
      })
      .select('*, team_member:team_members(id, name)')
      .single()
    if (error) { toast.error('Failed to save'); setSaving(false); return }
    setCalEvents(prev => [...prev, data as CalEvent])
    setShowModal(false)
    setSaving(false)
    toast.success('Added to calendar')
  }

  async function deleteEvent(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await supabase.from('calendar_events').delete().eq('id', id)
    setCalEvents(prev => prev.filter(ev => ev.id !== id))
    toast.success('Removed')
  }

  const periodLabel = useMemo(() => {
    const s = weeks[0][0]
    const e = weeks[3][4]
    const sf = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const ef = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return `${sf} – ${ef}`
  }, [weeks])

  return (
    <>
      <div className="bg-navy-800 border border-navy-600 rounded-xl overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 border-b border-navy-600 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-cream-200/70 uppercase tracking-wider">Calendar</h2>
            <span className="text-xs text-cream-200/40">{periodLabel}</span>
          </div>
          <div className="flex items-center gap-1">
            {weekOffset !== 0 && (
              <button onClick={() => setWeekOffset(0)}
                className="text-[11px] text-gold-400 hover:text-gold-300 px-2 py-1 rounded transition-colors mr-1">
                Today
              </button>
            )}
            <button onClick={() => setWeekOffset(w => w - 4)}
              className="p-1.5 text-cream-200/40 hover:text-cream-100 hover:bg-navy-700 rounded-lg transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setWeekOffset(w => w + 4)}
              className="p-1.5 text-cream-200/40 hover:text-cream-100 hover:bg-navy-700 rounded-lg transition-colors">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="px-4 py-2 border-b border-navy-600 flex items-center gap-4 flex-wrap">
          {LEGEND.map(([type, label]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${ITEM_STYLES[type].split(' ')[0]}`} />
              <span className="text-[10px] text-cream-200/40">{label}</span>
            </div>
          ))}
        </div>

        {/* Day column headers */}
        <div className="grid border-b border-navy-600" style={{ gridTemplateColumns: '3.5rem repeat(5, 1fr)' }}>
          <div />
          {DAYS.map(d => (
            <div key={d} className="text-center text-[10px] font-semibold text-cream-200/35 uppercase tracking-wider py-2 border-l border-navy-600/40">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => {
          const prevMon = wi > 0 ? weeks[wi - 1][0] : null
          const showMonth = wi === 0 || week[0].getMonth() !== prevMon!.getMonth()

          return (
            <div key={wi} className="grid border-b border-navy-600 last:border-b-0"
              style={{ gridTemplateColumns: '3.5rem repeat(5, 1fr)' }}>

              {/* Week label */}
              <div className="p-1.5 flex flex-col justify-start gap-0.5 border-r border-navy-600/40">
                {showMonth && (
                  <span className="text-[9px] font-bold text-cream-200/50 uppercase tracking-wide leading-none">
                    {week[0].toLocaleDateString('en-US', { month: 'short' })}
                  </span>
                )}
                <span className="text-[9px] text-cream-200/25 leading-none mt-0.5">
                  {week[0].getDate()}–{week[4].getDate()}
                </span>
              </div>

              {/* Day cells */}
              {week.map((day, di) => {
                const dateStr = toDateStr(day)
                const isToday = dateStr === todayStr
                const items = itemsForDate(dateStr)
                const visible = items.slice(0, 3)
                const overflow = items.length - 3

                return (
                  <div key={di}
                    className={`border-l border-navy-600/40 p-1.5 min-h-[90px] relative group ${isToday ? 'bg-gold-500/5' : ''}`}
                  >
                    {/* Date number */}
                    <div className="mb-1">
                      {isToday ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gold-500 text-navy-900 text-[9px] font-bold">
                          {day.getDate()}
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-cream-200/35">{day.getDate()}</span>
                      )}
                    </div>

                    {/* Items */}
                    <div className="space-y-0.5">
                      {visible.map(item => (
                        <div key={item.id}
                          title={item.title}
                          onClick={() => item.href && router.push(item.href)}
                          className={`group/item flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${ITEM_STYLES[item.type]} ${item.href || item.canDelete ? 'cursor-pointer' : ''}`}
                        >
                          <span className="truncate flex-1 min-w-0 leading-tight">
                            {item.time && <span className="opacity-60 mr-0.5">{item.time}</span>}
                            {item.title}
                          </span>
                          {item.canDelete && (
                            <button
                              onClick={e => deleteEvent(item.id, e)}
                              className="shrink-0 opacity-0 group-hover/item:opacity-100 hover:text-red-400 transition-all"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      {overflow > 0 && (
                        <div className="text-[9px] text-cream-200/25 pl-1.5">+{overflow} more</div>
                      )}
                    </div>

                    {/* Add button */}
                    <button
                      onClick={() => openAdd(day)}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-cream-200/25 hover:text-gold-400 rounded p-0.5 hover:bg-navy-700/60"
                    >
                      <Plus className="w-2.5 h-2.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Add Event Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-navy-800 border border-navy-600 rounded-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-navy-600">
              <h3 className="font-bold text-cream-100">Add to Calendar</h3>
              <button onClick={() => setShowModal(false)}>
                <X className="w-4 h-4 text-cream-200/50 hover:text-cream-100 transition-colors" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Title *</label>
                <input
                  autoFocus
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && saveEvent()}
                  placeholder="e.g. PTO, Holiday, Team offsite…"
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['note', 'pto', 'team_pto', 'holiday'] as const).map(t => (
                    <button key={t}
                      onClick={() => setForm(f => ({ ...f, type: t, team_member_id: '' }))}
                      className={`py-2 px-3 rounded-lg text-xs font-medium transition-colors border ${
                        form.type === t
                          ? 'bg-gold-500/20 text-gold-400 border-gold-500/40'
                          : 'bg-navy-700 text-cream-200/50 border-navy-600 hover:text-cream-100'
                      }`}
                    >
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Team member */}
              {form.type === 'team_pto' && (
                <div>
                  <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Team Member *</label>
                  <select value={form.team_member_id}
                    onChange={e => setForm(f => ({ ...f, team_member_id: e.target.value }))}
                    className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 focus:border-gold-500 focus:outline-none">
                    <option value="">Select a team member…</option>
                    {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              )}

              {/* Date range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Start *</label>
                  <input type="date" value={form.start_date}
                    onChange={e => setForm(f => ({
                      ...f,
                      start_date: e.target.value,
                      end_date: f.end_date < e.target.value ? e.target.value : f.end_date,
                    }))}
                    className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 focus:border-gold-500 focus:outline-none [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-cream-200/60 mb-1.5">End</label>
                  <input type="date" value={form.end_date} min={form.start_date}
                    onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 focus:border-gold-500 focus:outline-none [color-scheme:dark]"
                  />
                </div>
              </div>
              {form.start_date && form.end_date && form.end_date > form.start_date && (
                <p className="text-[10px] text-cream-200/35">
                  Spans {form.start_date} – {form.end_date}. Appears on each weekday in the range.
                </p>
              )}
            </div>

            <div className="flex gap-3 p-5 pt-0">
              <button onClick={() => setShowModal(false)}
                className="flex-1 bg-navy-700 hover:bg-navy-600 text-cream-100 text-sm font-medium rounded-lg py-2.5 transition-colors">
                Cancel
              </button>
              <button onClick={saveEvent} disabled={saving}
                className="flex-1 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-900 text-sm font-semibold rounded-lg py-2.5 transition-colors">
                {saving ? 'Saving…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
