'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Meeting, MeetingType, MeetingStatus, ActionItem, Project, MeetingAttendee, MeetingSeries, SavedAttendee } from '@/lib/types'
import { toast } from 'sonner'
import {
  Plus, X, CalendarDays, List, ChevronLeft, ChevronRight,
  Clock, FolderKanban, Upload, Sparkles, Copy,
  CheckCircle2, Circle, Trash2, Pencil, ArrowRight, UserPlus, Tag
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

const TYPES: { value: MeetingType; label: string; color: string }[] = [
  { value: 'client-call', label: 'Department Meeting', color: 'bg-blue-500/20 text-blue-300' },
  { value: 'discovery', label: 'Project Kickoff', color: 'bg-gold-500/20 text-gold-400' },
  { value: 'internal', label: 'Internal', color: 'bg-navy-600/80 text-cream-200/60' },
  { value: 'follow-up', label: 'Follow-up', color: 'bg-purple-500/20 text-purple-300' },
  { value: 'board', label: 'Board / Leadership', color: 'bg-emerald-500/20 text-emerald-300' },
  { value: 'training', label: 'Training', color: 'bg-orange-500/20 text-orange-300' },
  { value: 'external', label: 'External', color: 'bg-cyan-500/20 text-cyan-300' },
  { value: 'other', label: 'Other', color: 'bg-navy-600/60 text-cream-200/40' },
]

const ORGANIZATIONS = ['Goodwill Virginia', 'Board of Directors', 'External Auditors', 'Banking / Finance', 'Government / Regulatory', 'Vendor / Partner', 'Other']

const STATUSES: { value: MeetingStatus; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const EMPTY_FORM = {
  title: '', meeting_date: '', meeting_time: '', duration_minutes: '',
  type: 'internal' as MeetingType, project_id: '',
  notes: '', status: 'scheduled' as MeetingStatus,
  series_id: '',
}

export default function MeetingsPage() {
  const supabase = createClient()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [projects, setProjects] = useState<Pick<Project, 'id' | 'name'>[]>([])
  const [seriesList, setSeriesList] = useState<MeetingSeries[]>([])
  const [savedAttendees, setSavedAttendees] = useState<SavedAttendee[]>([])
  const [selected, setSelected] = useState<Meeting | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [calDate, setCalDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Meeting | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formAttendees, setFormAttendees] = useState<MeetingAttendee[]>([])
  const [attendeeInput, setAttendeeInput] = useState({ name: '', position: '', organization: 'Goodwill Virginia' })
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [newSeriesName, setNewSeriesName] = useState('')
  const [saving, setSaving] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [transcriptDraft, setTranscriptDraft] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [actionItems, setActionItems] = useState<ActionItem[]>([])
  const [pushingToProject, setPushingToProject] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [])
  useEffect(() => {
    setNotesDraft(selected?.notes ?? '')
    setTranscriptDraft(selected?.transcript ?? '')
    setActionItems(selected?.action_items ?? [])
  }, [selected?.id])

  async function load() {
    const [{ data: m }, { data: p }, { data: s }, { data: sa }] = await Promise.all([
      supabase.from('meetings').select('*, project:projects(id,name), series:meeting_series(id,name)').order('meeting_date', { ascending: false }),
      supabase.from('projects').select('id,name').order('name'),
      supabase.from('meeting_series').select('*').order('name'),
      supabase.from('saved_attendees').select('*').order('name'),
    ])
    setMeetings((m ?? []).map(mtg => ({ ...mtg, attendees: mtg.attendees ?? [], action_items: mtg.action_items ?? [] })))
    setProjects(p ?? [])
    setSeriesList(s ?? [])
    setSavedAttendees(sa ?? [])
  }

  function openAdd() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, meeting_date: new Date().toISOString().split('T')[0] })
    setFormAttendees([])
    setAttendeeInput({ name: '', position: '' })
    setNewSeriesName('')
    setShowModal(true)
  }

  function openEdit(m: Meeting) {
    setEditing(m)
    setForm({
      title: m.title, meeting_date: m.meeting_date, meeting_time: m.meeting_time ?? '',
      duration_minutes: m.duration_minutes != null ? String(m.duration_minutes) : '',
      type: m.type, project_id: m.project_id ?? '',
      notes: m.notes ?? '', status: m.status,
      series_id: m.series_id ?? '',
    })
    setFormAttendees(m.attendees ?? [])
    setAttendeeInput({ name: '', position: '' })
    setNewSeriesName('')
    setShowModal(true)
  }

  function addAttendee() {
    const name = attendeeInput.name.trim()
    if (!name) return
    if (formAttendees.some(a => a.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Attendee already added')
      return
    }
    setFormAttendees(prev => [...prev, {
      name,
      position: attendeeInput.position.trim() || null,
      organization: attendeeInput.organization.trim() || null,
    }])
    setAttendeeInput({ name: '', position: '', organization: 'Goodwill Virginia' })
    setShowSuggestions(false)
    nameInputRef.current?.focus()
  }

  function removeAttendee(name: string) {
    setFormAttendees(prev => prev.filter(a => a.name !== name))
  }

  function selectSuggestion(a: SavedAttendee) {
    setAttendeeInput({ name: a.name, position: a.position ?? '', organization: a.organization ?? 'Goodwill Virginia' })
    setShowSuggestions(false)
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  const attendeeSuggestions = attendeeInput.name.length >= 1
    ? savedAttendees.filter(a =>
        a.name.toLowerCase().includes(attendeeInput.name.toLowerCase()) &&
        !formAttendees.some(fa => fa.name.toLowerCase() === a.name.toLowerCase())
      ).slice(0, 5)
    : []

  async function saveMeeting() {
    if (!form.title.trim() || !form.meeting_date) { toast.error('Title and date are required'); return }
    setSaving(true)

    // Handle new series creation
    let seriesId: string | null = form.series_id || null
    if (form.series_id === '__new__' && newSeriesName.trim()) {
      const { data: ns, error: nsErr } = await supabase.from('meeting_series').insert({ name: newSeriesName.trim() }).select().single()
      if (nsErr) { toast.error('Failed to create series'); setSaving(false); return }
      seriesId = ns.id
      setSeriesList(prev => [...prev, ns])
    }

    // Save new attendees to saved_attendees table
    const existingNames = savedAttendees.map(a => a.name.toLowerCase())
    const newOnes = formAttendees.filter(a => !existingNames.includes(a.name.toLowerCase()))
    if (newOnes.length > 0) {
      const { data: saved } = await supabase.from('saved_attendees').insert(
        newOnes.map(a => ({ name: a.name, position: a.position, organization: a.organization }))
      ).select()
      if (saved) setSavedAttendees(prev => [...prev, ...saved])
    }

    const payload = {
      title: form.title.trim(),
      meeting_date: form.meeting_date,
      meeting_time: form.meeting_time || null,
      duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
      type: form.type,
      project_id: form.project_id || null,
      notes: form.notes || null,
      status: form.status,
      attendees: formAttendees,
      series_id: seriesId,
      contact_id: null,
    }

    if (editing) {
      const { data, error } = await supabase.from('meetings').update(payload).eq('id', editing.id)
        .select('*, project:projects(id,name), series:meeting_series(id,name)').single()
      if (error) { toast.error('Failed to save'); setSaving(false); return }
      const updated = { ...data, attendees: data.attendees ?? [], action_items: data.action_items ?? [] }
      setMeetings(prev => prev.map(m => m.id === editing.id ? updated : m))
      if (selected?.id === editing.id) setSelected(updated)
      toast.success('Meeting updated')
    } else {
      const { data, error } = await supabase.from('meetings').insert(payload)
        .select('*, project:projects(id,name), series:meeting_series(id,name)').single()
      if (error) { toast.error('Failed to save'); setSaving(false); return }
      setMeetings(prev => [{ ...data, attendees: data.attendees ?? [], action_items: [] }, ...prev])
      toast.success('Meeting added')
    }
    setSaving(false)
    setShowModal(false)
  }

  async function deleteMeeting(id: string) {
    await supabase.from('meetings').delete().eq('id', id)
    setMeetings(prev => prev.filter(m => m.id !== id))
    if (selected?.id === id) setSelected(null)
    toast.success('Meeting deleted')
  }

  async function saveNotes() {
    if (!selected) return
    const trimmed = notesDraft.trim() || null
    if (trimmed === selected.notes) return
    await supabase.from('meetings').update({ notes: trimmed }).eq('id', selected.id)
    const updated = { ...selected, notes: trimmed }
    setMeetings(prev => prev.map(m => m.id === selected.id ? updated : m))
    setSelected(updated)
  }

  async function saveTranscript() {
    if (!selected) return
    const trimmed = transcriptDraft.trim() || null
    if (trimmed === selected.transcript) return
    await supabase.from('meetings').update({ transcript: trimmed }).eq('id', selected.id)
    const updated = { ...selected, transcript: trimmed }
    setMeetings(prev => prev.map(m => m.id === selected.id ? updated : m))
    setSelected(updated)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.name.endsWith('.txt')) {
      const text = await file.text()
      setTranscriptDraft(text)
      toast.success('Transcript loaded')
    } else if (file.name.endsWith('.docx')) {
      try {
        const mammoth = (await import('mammoth')).default
        const arrayBuffer = await file.arrayBuffer()
        const result = await mammoth.extractRawText({ arrayBuffer })
        setTranscriptDraft(result.value)
        toast.success('Transcript loaded from DOCX')
      } catch {
        toast.error('Failed to read DOCX file')
      }
    } else {
      toast.error('Please upload a .txt or .docx file')
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function analyzeTranscript() {
    if (!selected || !transcriptDraft.trim()) { toast.error('Paste or upload a transcript first'); return }
    setAnalyzing(true)
    await supabase.from('meetings').update({ transcript: transcriptDraft.trim(), status: 'completed' }).eq('id', selected.id)

    const attendeeStr = selected.attendees?.length > 0
      ? `Attendees: ${selected.attendees.map(a => `${a.name}${a.position ? ` (${a.position})` : ''}`).join(', ')}`
      : ''

    const context = [
      selected.title,
      attendeeStr,
      selected.project ? `Project: ${(selected.project as { name: string }).name}` : '',
      selected.meeting_date ? `Date: ${formatDate(selected.meeting_date)}` : '',
    ].filter(Boolean).join('\n')

    try {
      const res = await fetch('/api/meetings/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcriptDraft.trim(), context }),
      })
      const data = await res.json()
      if (data.error) { toast.error('Analysis failed'); setAnalyzing(false); return }

      const items: ActionItem[] = (data.action_items ?? []).map((a: Omit<ActionItem, 'id' | 'done'>) => ({
        ...a, id: crypto.randomUUID(), done: false,
      }))

      await supabase.from('meetings').update({
        summary: data.summary ?? null,
        action_items: items,
        followup_email: data.followup_email ?? null,
        status: 'completed',
        transcript: transcriptDraft.trim(),
      }).eq('id', selected.id)

      const updated = { ...selected, summary: data.summary, action_items: items, followup_email: data.followup_email, status: 'completed' as MeetingStatus, transcript: transcriptDraft.trim() }
      setMeetings(prev => prev.map(m => m.id === selected.id ? updated : m))
      setSelected(updated)
      setActionItems(items)
      toast.success('Transcript analyzed')
    } catch {
      toast.error('Analysis request failed')
    }
    setAnalyzing(false)
  }

  async function toggleActionItem(item: ActionItem) {
    if (!selected) return
    const updated = actionItems.map(a => a.id === item.id ? { ...a, done: !a.done } : a)
    setActionItems(updated)
    await supabase.from('meetings').update({ action_items: updated }).eq('id', selected.id)
    setSelected(prev => prev ? { ...prev, action_items: updated } : prev)
  }

  async function pushTasksToProject() {
    if (!selected?.project_id || actionItems.length === 0) return
    setPushingToProject(true)
    const pending = actionItems.filter(a => !a.done)
    const tasks = pending.map(a => ({
      project_id: selected.project_id!,
      title: a.owner ? `${a.owner}: ${a.title}` : a.title,
      status: 'todo',
      due_date: a.due_date ?? null,
    }))
    const { error } = await supabase.from('tasks').insert(tasks)
    if (error) { toast.error('Failed to push tasks'); setPushingToProject(false); return }
    toast.success(`${tasks.length} task${tasks.length !== 1 ? 's' : ''} added to project`, {
      action: { label: 'View Projects', onClick: () => { window.location.href = '/projects' } },
    })
    setPushingToProject(false)
  }

  // Calendar helpers
  const calYear = calDate.getFullYear()
  const calMonth = calDate.getMonth()
  const firstDay = new Date(calYear, calMonth, 1).getDay()
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const today = new Date()

  const meetingsByDay = meetings.reduce((acc, m) => {
    const d = new Date(m.meeting_date + 'T00:00:00')
    if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
      const day = d.getDate()
      acc[day] = (acc[day] ?? 0) + 1
    }
    return acc
  }, {} as Record<number, number>)

  const calendarCells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (calendarCells.length % 7 !== 0) calendarCells.push(null)

  const filteredMeetings = selectedDay && viewMode === 'calendar'
    ? meetings.filter(m => {
        const d = new Date(m.meeting_date + 'T00:00:00')
        return d.getFullYear() === calYear && d.getMonth() === calMonth && d.getDate() === selectedDay
      })
    : meetings

  const typeObj = (t: MeetingType) => TYPES.find(x => x.value === t)!

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-72 shrink-0 border-r border-navy-600 flex flex-col h-full">
        <div className="p-4 border-b border-navy-600">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-bold text-cream-100 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-gold-500" /> Meetings
            </h1>
            <button onClick={openAdd} className="flex items-center gap-1 text-xs bg-gold-500 hover:bg-gold-400 text-navy-900 font-semibold px-2.5 py-1.5 rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-navy-600">
            <button onClick={() => setViewMode('list')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-navy-600 text-cream-100' : 'text-cream-200/50 hover:text-cream-100'}`}>
              <List className="w-3.5 h-3.5" /> List
            </button>
            <button onClick={() => setViewMode('calendar')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors ${viewMode === 'calendar' ? 'bg-navy-600 text-cream-100' : 'text-cream-200/50 hover:text-cream-100'}`}>
              <CalendarDays className="w-3.5 h-3.5" /> Calendar
            </button>
          </div>
        </div>

        {viewMode === 'calendar' && (
          <div className="p-3 border-b border-navy-600">
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setCalDate(new Date(calYear, calMonth - 1, 1))} className="text-cream-200/40 hover:text-cream-100 p-1 rounded transition-colors"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-xs font-semibold text-cream-100">{MONTHS[calMonth]} {calYear}</span>
              <button onClick={() => setCalDate(new Date(calYear, calMonth + 1, 1))} className="text-cream-200/40 hover:text-cream-100 p-1 rounded transition-colors"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-7 mb-1">
              {DAYS.map(d => <div key={d} className="text-[9px] font-medium text-cream-200/30 text-center py-0.5">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5">
              {calendarCells.map((day, i) => {
                if (!day) return <div key={i} />
                const isToday = today.getDate() === day && today.getMonth() === calMonth && today.getFullYear() === calYear
                const isSelected = selectedDay === day
                const hasMeetings = !!meetingsByDay[day]
                return (
                  <button key={i} onClick={() => setSelectedDay(isSelected ? null : day)}
                    className={`relative flex flex-col items-center justify-center h-7 rounded text-xs font-medium transition-colors ${isSelected ? 'bg-gold-500 text-navy-900' : isToday ? 'bg-navy-600 text-cream-100' : 'text-cream-200/60 hover:bg-navy-700 hover:text-cream-100'}`}
                  >
                    {day}
                    {hasMeetings && !isSelected && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-gold-500" />}
                    {hasMeetings && isSelected && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-navy-900" />}
                  </button>
                )
              })}
            </div>
            {selectedDay && <button onClick={() => setSelectedDay(null)} className="mt-2 text-[10px] text-cream-200/40 hover:text-cream-200/70 transition-colors">Clear filter ×</button>}
          </div>
        )}

        <ul className="flex-1 overflow-y-auto divide-y divide-navy-600">
          {filteredMeetings.length === 0 && <li className="p-4 text-sm text-cream-200/40">No meetings{selectedDay ? ' on this day' : ''}.</li>}
          {filteredMeetings.map(m => (
            <li key={m.id} onClick={() => setSelected(m)}
              className={`p-3 cursor-pointer hover:bg-navy-700 transition-colors ${selected?.id === m.id ? 'bg-navy-700 border-l-2 border-gold-500' : ''}`}
            >
              <div className="flex items-start justify-between gap-1">
                <p className="text-sm text-cream-100 font-medium leading-snug line-clamp-2 flex-1">{m.title}</p>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${typeObj(m.type).color}`}>{typeObj(m.type).label}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[10px] text-cream-200/40">
                <span>{formatDate(m.meeting_date)}</span>
                {m.meeting_time && <span>{m.meeting_time.slice(0, 5)}</span>}
                {m.series && <span className="flex items-center gap-0.5"><Tag className="w-2.5 h-2.5" />{(m.series as MeetingSeries).name}</span>}
                {m.summary && <span className="ml-auto">✓ AI</span>}
              </div>
              {m.attendees?.length > 0 && (
                <p className="text-[10px] text-cream-200/30 mt-0.5 truncate">
                  {m.attendees.map(a => a.name).join(', ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Right panel */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <div className="p-5 border-b border-navy-600 sticky top-0 bg-navy-900 z-10">
            <div className="flex items-start justify-between gap-4 mb-2">
              <h2 className="text-lg font-bold text-cream-100 leading-snug">{selected.title}</h2>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(selected)} className="text-cream-200/40 hover:text-cream-100 p-1.5 rounded hover:bg-navy-700 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => deleteMeeting(selected.id)} className="text-cream-200/40 hover:text-red-400 p-1.5 rounded hover:bg-navy-700 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-cream-200/50">
              <span className={`font-medium px-2 py-0.5 rounded ${typeObj(selected.type).color}`}>{typeObj(selected.type).label}</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(selected.meeting_date)}{selected.meeting_time ? ` · ${selected.meeting_time.slice(0, 5)}` : ''}{selected.duration_minutes ? ` · ${selected.duration_minutes}min` : ''}</span>
              {selected.project && <span className="flex items-center gap-1"><FolderKanban className="w-3 h-3" />{(selected.project as { name: string }).name}</span>}
              {selected.series && <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{(selected.series as MeetingSeries).name}</span>}
            </div>
            {selected.attendees?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selected.attendees.map(a => (
                  <span key={a.name} className="text-[10px] bg-navy-700 border border-navy-600 text-cream-200/70 rounded-full px-2.5 py-1">
                    {a.name}{a.position ? ` · ${a.position}` : ''}{a.organization && a.organization !== 'Goodwill Virginia' ? ` · ${a.organization}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="p-5 space-y-6">
            <section>
              <label className="block text-[10px] font-semibold text-cream-200/40 uppercase tracking-wider mb-2">Pre-meeting Notes / Agenda</label>
              <textarea value={notesDraft} onChange={e => setNotesDraft(e.target.value)} onBlur={saveNotes}
                placeholder="Agenda, talking points, questions to ask… (saves automatically)"
                rows={3}
                className="w-full bg-navy-700 border border-navy-600 rounded-xl text-sm text-cream-100 px-4 py-2.5 placeholder-cream-200/25 focus:border-gold-500 focus:outline-none resize-none transition-colors"
              />
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] font-semibold text-cream-200/40 uppercase tracking-wider">Transcript</label>
                <div className="flex items-center gap-2">
                  <input ref={fileInputRef} type="file" accept=".txt,.docx" onChange={handleFileUpload} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 text-[10px] bg-navy-700 hover:bg-navy-600 border border-navy-600 text-cream-200/60 hover:text-cream-100 px-2 py-1 rounded-lg transition-colors">
                    <Upload className="w-3 h-3" /> Upload .txt / .docx
                  </button>
                </div>
              </div>
              <textarea value={transcriptDraft} onChange={e => setTranscriptDraft(e.target.value)} onBlur={saveTranscript}
                placeholder="Paste your meeting transcript here, or upload a file above…"
                rows={6}
                className="w-full bg-navy-700 border border-navy-600 rounded-xl text-sm text-cream-100 px-4 py-2.5 placeholder-cream-200/25 focus:border-gold-500 focus:outline-none resize-y transition-colors font-mono text-xs leading-relaxed"
              />
              {transcriptDraft.trim() && (
                <button onClick={analyzeTranscript} disabled={analyzing}
                  className="mt-3 w-full flex items-center justify-center gap-2 bg-gold-500 hover:bg-gold-400 disabled:opacity-60 text-navy-900 font-semibold text-sm py-2.5 rounded-xl transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  {analyzing ? 'Analyzing transcript…' : 'Analyze Transcript'}
                </button>
              )}
            </section>

            {selected.summary && (
              <section>
                <p className="text-[10px] font-semibold text-cream-200/40 uppercase tracking-wider mb-2">AI Summary</p>
                <div className="bg-navy-700 border border-navy-600 rounded-xl p-4 text-sm text-cream-100 leading-relaxed">{selected.summary}</div>
              </section>
            )}

            {actionItems.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold text-cream-200/40 uppercase tracking-wider">Action Items</p>
                  {selected.project_id && (
                    <button onClick={pushTasksToProject} disabled={pushingToProject || actionItems.every(a => a.done)}
                      className="flex items-center gap-1 text-[10px] bg-navy-700 hover:bg-navy-600 border border-navy-600 text-cream-200/60 hover:text-cream-100 disabled:opacity-40 px-2 py-1 rounded-lg transition-colors"
                    >
                      <ArrowRight className="w-3 h-3" /> Push to Project
                    </button>
                  )}
                </div>
                <ul className="space-y-2">
                  {actionItems.map(item => (
                    <li key={item.id} className="flex items-start gap-3 p-3 bg-navy-700 rounded-xl border border-navy-600">
                      <button onClick={() => toggleActionItem(item)} className="mt-0.5 shrink-0">
                        {item.done ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Circle className="w-4 h-4 text-cream-200/30 hover:text-cream-200/60" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${item.done ? 'line-through text-cream-200/30' : 'text-cream-100'}`}>{item.title}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          {item.owner && <span className="text-[10px] text-cream-200/40">{item.owner}</span>}
                          {item.due_date && <span className="text-[10px] text-gold-400/70">{formatDate(item.due_date)}</span>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {selected.followup_email && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold text-cream-200/40 uppercase tracking-wider">Follow-up Email Draft</p>
                  <button onClick={() => { navigator.clipboard.writeText(selected.followup_email ?? ''); toast.success('Copied to clipboard') }}
                    className="flex items-center gap-1 text-[10px] bg-navy-700 hover:bg-navy-600 border border-navy-600 text-cream-200/60 hover:text-cream-100 px-2 py-1 rounded-lg transition-colors"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-sm text-cream-100 bg-navy-700 border border-navy-600 rounded-xl p-4 leading-relaxed">{selected.followup_email}</pre>
              </section>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-cream-200/30">
          <div className="text-center">
            <CalendarDays className="w-10 h-10 mx-auto mb-3 text-gold-500/20" />
            <p className="text-sm">Select a meeting or add a new one</p>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-navy-800 border border-navy-600 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-navy-600">
              <h2 className="font-bold text-cream-100">{editing ? 'Edit Meeting' : 'Add Meeting'}</h2>
              <button onClick={() => setShowModal(false)}><X className="w-4 h-4 text-cream-200/50" /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. May Close Review with CFO"
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none" />
              </div>

              {/* Date / Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Date *</label>
                  <input type="date" value={form.meeting_date} onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))}
                    className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Time</label>
                  <input type="time" value={form.meeting_time} onChange={e => setForm(f => ({ ...f, meeting_time: e.target.value }))}
                    className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2" />
                </div>
              </div>

              {/* Type / Duration */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as MeetingType }))}
                    className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2">
                    {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Duration (min)</label>
                  <input type="number" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} placeholder="60"
                    className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/30" />
                </div>
              </div>

              {/* Project / Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Project</label>
                  <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                    className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2">
                    <option value="">— None —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as MeetingStatus }))}
                    className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2">
                    {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Series */}
              <div>
                <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Meeting Series</label>
                <select value={form.series_id} onChange={e => { setForm(f => ({ ...f, series_id: e.target.value })); setNewSeriesName('') }}
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2">
                  <option value="">— None —</option>
                  {seriesList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <option value="__new__">+ Create new series…</option>
                </select>
                {form.series_id === '__new__' && (
                  <input
                    value={newSeriesName}
                    onChange={e => setNewSeriesName(e.target.value)}
                    placeholder="Series name (e.g. Monthly CFO Results Review)"
                    className="w-full mt-2 bg-navy-700 border border-gold-500/40 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none"
                  />
                )}
              </div>

              {/* Attendees */}
              <div>
                <label className="block text-xs font-medium text-cream-200/60 mb-1.5 flex items-center gap-1">
                  <UserPlus className="w-3 h-3" /> Attendees
                </label>
                <div className="space-y-2 mb-2">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        ref={nameInputRef}
                        value={attendeeInput.name}
                        onChange={e => { setAttendeeInput(p => ({ ...p, name: e.target.value })); setShowSuggestions(true) }}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAttendee())}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                        placeholder="Name"
                        className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none"
                      />
                      {showSuggestions && attendeeSuggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-navy-700 border border-navy-500 rounded-lg overflow-hidden z-20 shadow-xl">
                          {attendeeSuggestions.map(a => (
                            <button key={a.id} onMouseDown={() => selectSuggestion(a)}
                              className="w-full text-left px-3 py-2 text-sm text-cream-100 hover:bg-navy-600 transition-colors"
                            >
                              <span className="font-medium">{a.name}</span>
                              <span className="text-[10px] text-cream-200/40 ml-2">
                                {[a.position, a.organization].filter(Boolean).join(' · ')}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input
                      value={attendeeInput.position}
                      onChange={e => setAttendeeInput(p => ({ ...p, position: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAttendee())}
                      placeholder="Title / Role"
                      className="flex-1 bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={attendeeInput.organization}
                      onChange={e => setAttendeeInput(p => ({ ...p, organization: e.target.value }))}
                      className="flex-1 bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 focus:border-gold-500 focus:outline-none"
                    >
                      {ORGANIZATIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <button onClick={addAttendee} className="bg-navy-600 hover:bg-navy-500 text-cream-100 px-4 py-2 rounded-lg text-xs font-medium transition-colors shrink-0">
                      Add
                    </button>
                  </div>
                </div>
                {formAttendees.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {formAttendees.map(a => (
                      <span key={a.name} className="flex items-center gap-1.5 text-xs bg-navy-700 border border-navy-600 text-cream-200/80 rounded-full pl-3 pr-2 py-1">
                        <span>
                          {a.name}
                          {a.position && <span className="text-cream-200/50"> · {a.position}</span>}
                          {a.organization && <span className="text-cream-200/40"> · {a.organization}</span>}
                        </span>
                        <button onClick={() => removeAttendee(a.name)} className="text-cream-200/40 hover:text-red-400 transition-colors ml-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 p-6 pt-0">
              {editing && <button onClick={() => { deleteMeeting(editing.id); setShowModal(false) }} className="text-xs text-red-400 hover:text-red-300 transition-colors mr-auto">Delete</button>}
              <button onClick={() => setShowModal(false)} className="flex-1 bg-navy-700 hover:bg-navy-600 text-cream-100 text-sm font-medium rounded-lg py-2.5 transition-colors">Cancel</button>
              <button onClick={saveMeeting} disabled={saving} className="flex-1 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-900 text-sm font-semibold rounded-lg py-2.5 transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
