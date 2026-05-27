'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Meeting, MeetingType, MeetingStatus, ActionItem, Project, MeetingAttendee, MeetingSeries, SavedAttendee, ChatMessage } from '@/lib/types'
import { toast } from 'sonner'
import {
  Plus, X, CalendarDays, List, ChevronLeft, ChevronRight,
  Clock, FolderKanban, Upload, Sparkles, Copy,
  CheckCircle2, Circle, Trash2, Pencil, ArrowRight, UserPlus, Tag,
  Send, RotateCcw, Layers, Search
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import FileAttachments from '@/components/FileAttachments'

const TYPES: { value: MeetingType; label: string; color: string }[] = [
  { value: 'client-call', label: 'Department Meeting', color: 'bg-blue-500/20 text-blue-300' },
  { value: 'discovery', label: 'Project', color: 'bg-gold-500/20 text-gold-400' },
  { value: 'internal', label: 'Internal', color: 'bg-navy-600/80 text-cream-200/60' },
  { value: 'follow-up', label: 'Follow-up', color: 'bg-purple-500/20 text-purple-300' },
  { value: 'board', label: 'Leadership', color: 'bg-emerald-500/20 text-emerald-300' },
  { value: 'training', label: 'Training', color: 'bg-orange-500/20 text-orange-300' },
  { value: 'external', label: 'External', color: 'bg-cyan-500/20 text-cyan-300' },
  { value: 'team', label: 'Team Meeting', color: 'bg-blue-500/20 text-blue-300' },
  { value: '1-1', label: '1:1', color: 'bg-purple-500/20 text-purple-300' },
  { value: 'other', label: 'Other', color: 'bg-navy-600/60 text-cream-200/40' },
]

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
  next_meeting_date: '',
  next_meeting_time: '',
}

export default function MeetingsPage() {
  const supabase = createClient()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [projects, setProjects] = useState<Pick<Project, 'id' | 'name'>[]>([])
  const [seriesList, setSeriesList] = useState<MeetingSeries[]>([])
  const [savedAttendees, setSavedAttendees] = useState<SavedAttendee[]>([])
  const [selected, setSelected] = useState<Meeting | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'calendar' | 'series'>('list')
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
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSeries, setSelectedSeries] = useState<MeetingSeries | null>(null)
  const [seriesAiInputs, setSeriesAiInputs] = useState<Record<string, string>>({})
  const [seriesAiThreads, setSeriesAiThreads] = useState<Record<string, ChatMessage[]>>({})
  const [seriesStreamingFor, setSeriesStreamingFor] = useState<string | null>(null)
  const [seriesStreamingText, setSeriesStreamingText] = useState('')
  const seriesAiEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { load() }, [])
  useEffect(() => {
    setNotesDraft(selected?.notes ?? '')
    setTranscriptDraft(selected?.transcript ?? '')
    setActionItems(selected?.action_items ?? [])
  }, [selected?.id])
  useEffect(() => {
    seriesAiEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [seriesAiThreads, seriesStreamingText])

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
    setSeriesAiThreads(Object.fromEntries((s ?? []).map((ser: MeetingSeries) => [ser.id, ser.ai_thread ?? []])))
  }

  function openAdd() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, meeting_date: new Date().toISOString().split('T')[0] })
    setFormAttendees([])
    setAttendeeInput({ name: '', position: '', organization: 'Goodwill Virginia' })
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
      next_meeting_date: '',
      next_meeting_time: '',
    })
    setFormAttendees(m.attendees ?? [])
    setAttendeeInput({ name: '', position: '', organization: 'Goodwill Virginia' })
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

    // Create next meeting in series if a date was provided
    if (form.next_meeting_date && seriesId) {
      const nextPayload = {
        title: form.title.trim(),
        meeting_date: form.next_meeting_date,
        meeting_time: form.next_meeting_time || null,
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
        type: form.type,
        project_id: form.project_id || null,
        notes: null,
        status: 'scheduled' as MeetingStatus,
        attendees: formAttendees,
        series_id: seriesId,
        contact_id: null,
      }
      const { data: nextMtg, error: nextErr } = await supabase.from('meetings').insert(nextPayload)
        .select('*, project:projects(id,name), series:meeting_series(id,name)').single()
      if (!nextErr && nextMtg) {
        setMeetings(prev => [{ ...nextMtg, attendees: nextMtg.attendees ?? [], action_items: [] }, ...prev])
        toast.success('Next meeting scheduled')
      }
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
        body: JSON.stringify({ transcript: transcriptDraft.trim(), context, meetingId: selected.id }),
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

  async function sendSeriesAiMessage(seriesId: string) {
    const input = (seriesAiInputs[seriesId] ?? '').trim()
    if (!input || seriesStreamingFor) return
    const userMsg: ChatMessage = { role: 'user', content: input }
    const currentThread = seriesAiThreads[seriesId] ?? []
    const newThread = [...currentThread, userMsg]
    setSeriesAiThreads(prev => ({ ...prev, [seriesId]: newThread }))
    setSeriesAiInputs(prev => ({ ...prev, [seriesId]: '' }))
    setSeriesStreamingFor(seriesId)
    setSeriesStreamingText('')
    try {
      const res = await fetch('/api/meetings/series-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newThread, seriesId }),
      })
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        setSeriesStreamingText(full)
      }
      const assistantMsg: ChatMessage = { role: 'assistant', content: full }
      const finalThread = [...newThread, assistantMsg]
      setSeriesAiThreads(prev => ({ ...prev, [seriesId]: finalThread }))
      await supabase.from('meeting_series').update({ ai_thread: finalThread }).eq('id', seriesId)
      setSeriesList(prev => prev.map(s => s.id === seriesId ? { ...s, ai_thread: finalThread } : s))
    } catch {
      toast.error('AI request failed')
    }
    setSeriesStreamingFor(null)
    setSeriesStreamingText('')
  }

  async function clearSeriesAiThread(seriesId: string) {
    setSeriesAiThreads(prev => ({ ...prev, [seriesId]: [] }))
    await supabase.from('meeting_series').update({ ai_thread: [] }).eq('id', seriesId)
    setSeriesList(prev => prev.map(s => s.id === seriesId ? { ...s, ai_thread: [] } : s))
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

  const filteredMeetings = meetings.filter(m => {
    if (selectedDay && viewMode === 'calendar') {
      const d = new Date(m.meeting_date + 'T00:00:00')
      if (!(d.getFullYear() === calYear && d.getMonth() === calMonth && d.getDate() === selectedDay)) return false
    }
    if (searchQuery.trim()) {
      return m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.attendees?.some(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()))
    }
    return true
  })

  const todayDateStr = new Date().toISOString().split('T')[0]
  const upcomingMeetings = filteredMeetings
    .filter(m => m.meeting_date >= todayDateStr)
    .sort((a, b) => a.meeting_date.localeCompare(b.meeting_date))
  const pastMeetings = filteredMeetings
    .filter(m => m.meeting_date < todayDateStr)
    .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))

  const typeObj = (t: MeetingType) => TYPES.find(x => x.value === t)!

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className={`${viewMode === 'list' ? 'w-[58rem]' : 'w-[30rem]'} shrink-0 border-r border-navy-600 flex flex-col h-full`}>
        <div className="p-5 border-b border-navy-600">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-lg font-bold text-cream-100 flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-gold-500" /> Meetings
            </h1>
            <button onClick={openAdd} className="flex items-center gap-1.5 text-sm bg-gold-500 hover:bg-gold-400 text-navy-900 font-semibold px-4 py-2 rounded-lg transition-colors">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-navy-600">
            <button onClick={() => setViewMode('list')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-navy-600 text-cream-100' : 'text-cream-200/50 hover:text-cream-100'}`}>
              <List className="w-4 h-4" /> List
            </button>
            <button onClick={() => setViewMode('calendar')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${viewMode === 'calendar' ? 'bg-navy-600 text-cream-100' : 'text-cream-200/50 hover:text-cream-100'}`}>
              <CalendarDays className="w-4 h-4" /> Cal
            </button>
            <button onClick={() => { setViewMode('series'); setSelected(null) }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${viewMode === 'series' ? 'bg-navy-600 text-cream-100' : 'text-cream-200/50 hover:text-cream-100'}`}>
              <Layers className="w-4 h-4" /> Series
            </button>
          </div>
        </div>

        {viewMode !== 'series' && (
          <div className="px-5 py-3 border-b border-navy-600">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cream-200/30 pointer-events-none" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by title or attendee…"
                className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 pl-9 pr-9 py-2.5 placeholder-cream-200/25 focus:border-gold-500 focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-cream-200/30 hover:text-cream-200/70 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

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

        {viewMode === 'series' ? (
          <ul className="flex-1 overflow-y-auto divide-y divide-navy-600">
            {seriesList.length === 0 ? (
              <li className="p-4 text-sm text-cream-200/40">No series yet. Assign a meeting to a series to get started.</li>
            ) : seriesList.map(s => {
              const count = meetings.filter(m => m.series_id === s.id).length
              return (
                <li key={s.id} onClick={() => setSelectedSeries(s)}
                  className={`p-3 cursor-pointer hover:bg-navy-700 transition-colors ${selectedSeries?.id === s.id ? 'bg-navy-700 border-l-2 border-gold-500' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <Layers className="w-3 h-3 text-gold-500/60 shrink-0" />
                    <p className="text-sm text-cream-100 font-medium">{s.name}</p>
                  </div>
                  <p className="text-[10px] text-cream-200/40 mt-0.5 pl-5">{count} meeting{count !== 1 ? 's' : ''}{(seriesAiThreads[s.id] ?? []).length > 0 ? ' · AI active' : ''}</p>
                </li>
              )
            })}
          </ul>
        ) : viewMode === 'list' ? (
          <div className="flex-1 overflow-hidden flex min-h-0">
            {/* Upcoming column */}
            <div className="flex-1 flex flex-col border-r border-navy-600/50 min-w-0">
              <div className="px-4 py-2.5 border-b border-navy-600 shrink-0">
                <p className="text-xs font-semibold text-cream-200/40 uppercase tracking-wider flex items-center gap-1.5">
                  Upcoming <span className="font-normal normal-case tracking-normal text-cream-200/25">{upcomingMeetings.length}</span>
                </p>
              </div>
              <ul className="flex-1 overflow-y-auto divide-y divide-navy-600">
                {upcomingMeetings.length === 0 && (
                  <li className="px-4 py-8 text-sm text-cream-200/30 text-center">No upcoming meetings.</li>
                )}
                {upcomingMeetings.map(m => (
                  <li key={m.id} onClick={() => setSelected(m)}
                    className={`p-4 cursor-pointer hover:bg-navy-700 transition-colors ${selected?.id === m.id ? 'bg-navy-700 border-l-2 border-gold-500' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm text-cream-100 font-medium leading-snug line-clamp-2 flex-1">{m.title}</p>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ml-1 ${typeObj(m.type).color}`}>{typeObj(m.type).label}</span>
                    </div>
                    <p className="text-xs text-cream-200/40">
                      {formatDate(m.meeting_date)}{m.meeting_time ? ` · ${m.meeting_time.slice(0, 5)}` : ''}{m.summary ? ' · ✓' : ''}
                    </p>
                    {m.attendees?.length > 0 && (
                      <p className="text-xs text-cream-200/30 truncate mt-0.5">{m.attendees.map(a => a.name).join(', ')}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            {/* Past column */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="px-4 py-2.5 border-b border-navy-600 shrink-0">
                <p className="text-xs font-semibold text-cream-200/40 uppercase tracking-wider flex items-center gap-1.5">
                  Past <span className="font-normal normal-case tracking-normal text-cream-200/25">{pastMeetings.length}</span>
                </p>
              </div>
              <ul className="flex-1 overflow-y-auto divide-y divide-navy-600">
                {pastMeetings.length === 0 && (
                  <li className="px-4 py-8 text-sm text-cream-200/30 text-center">No past meetings.</li>
                )}
                {pastMeetings.map(m => (
                  <li key={m.id} onClick={() => setSelected(m)}
                    className={`p-4 cursor-pointer hover:bg-navy-700 transition-colors ${selected?.id === m.id ? 'bg-navy-700 border-l-2 border-gold-500' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm text-cream-100 font-medium leading-snug line-clamp-2 flex-1">{m.title}</p>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ml-1 ${typeObj(m.type).color}`}>{typeObj(m.type).label}</span>
                    </div>
                    <p className="text-xs text-cream-200/40">
                      {formatDate(m.meeting_date)}{m.meeting_time ? ` · ${m.meeting_time.slice(0, 5)}` : ''}{m.summary ? ' · ✓' : ''}
                    </p>
                    {m.attendees?.length > 0 && (
                      <p className="text-xs text-cream-200/30 truncate mt-0.5">{m.attendees.map(a => a.name).join(', ')}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          // Calendar view — single column
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
        )}
      </div>

      {/* Right panel */}
      {viewMode === 'series' && selectedSeries ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <div className="p-5 border-b border-navy-600 sticky top-0 bg-navy-900 z-10">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-4 h-4 text-gold-500" />
              <h2 className="text-lg font-bold text-cream-100">{selectedSeries.name}</h2>
            </div>
            <p className="text-xs text-cream-200/40">
              {meetings.filter(m => m.series_id === selectedSeries.id).length} meetings in this series
            </p>
          </div>
          <div className="p-5 space-y-6">
            {/* Series AI */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-semibold text-cream-200/40 uppercase tracking-wider">Series AI Advisor</p>
                {(seriesAiThreads[selectedSeries.id] ?? []).length > 0 && (
                  <button onClick={() => clearSeriesAiThread(selectedSeries.id)}
                    className="flex items-center gap-1 text-[10px] text-cream-200/30 hover:text-cream-200/60 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" /> Clear
                  </button>
                )}
              </div>
              <div className="bg-navy-800 border border-navy-600 rounded-xl overflow-hidden">
                <div className="h-80 overflow-y-auto p-4 space-y-3">
                  {(seriesAiThreads[selectedSeries.id] ?? []).length === 0 && seriesStreamingFor !== selectedSeries.id ? (
                    <p className="text-sm text-cream-200/30 text-center py-8">Ask about patterns across meetings, recurring topics, progress on action items, or get help drafting an agenda for the next session.</p>
                  ) : (
                    <>
                      {(seriesAiThreads[selectedSeries.id] ?? []).map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-gold-500/20 text-cream-100' : 'bg-navy-700 text-cream-100'}`}>
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        </div>
                      ))}
                      {seriesStreamingFor === selectedSeries.id && (
                        <div className="flex justify-start">
                          <div className="max-w-[85%] rounded-xl px-3 py-2 text-sm bg-navy-700 text-cream-100 leading-relaxed">
                            <p className="whitespace-pre-wrap">{seriesStreamingText || '…'}</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  <div ref={seriesAiEndRef} />
                </div>
                <div className="border-t border-navy-600 p-3 flex gap-2">
                  <input
                    value={seriesAiInputs[selectedSeries.id] ?? ''}
                    onChange={e => setSeriesAiInputs(prev => ({ ...prev, [selectedSeries!.id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendSeriesAiMessage(selectedSeries.id))}
                    placeholder="Ask about this meeting series…"
                    disabled={!!seriesStreamingFor}
                    className="flex-1 bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/25 focus:border-gold-500 focus:outline-none disabled:opacity-50"
                  />
                  <button
                    onClick={() => sendSeriesAiMessage(selectedSeries.id)}
                    disabled={!seriesAiInputs[selectedSeries.id]?.trim() || !!seriesStreamingFor}
                    className="bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-navy-900 p-2 rounded-lg transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </section>
            {/* Series-level file attachments */}
            <section>
              <FileAttachments entityType="series" entityId={selectedSeries.id} />
            </section>

            {/* Meetings in series */}
            <section>
              <p className="text-[10px] font-semibold text-cream-200/40 uppercase tracking-wider mb-3">Meetings in Series</p>
              {meetings.filter(m => m.series_id === selectedSeries.id).length === 0 ? (
                <p className="text-sm text-cream-200/30">No meetings in this series yet. When adding a meeting, select this series from the Meeting Series dropdown.</p>
              ) : (
                <ul className="space-y-2">
                  {meetings
                    .filter(m => m.series_id === selectedSeries.id)
                    .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))
                    .map(m => {
                      const openItems = m.action_items.filter(a => !a.done)
                      return (
                        <li key={m.id}
                          onClick={() => { setViewMode('list'); setSelected(m) }}
                          className="p-3 bg-navy-800 border border-navy-600 rounded-xl cursor-pointer hover:border-navy-500 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm text-cream-100 font-medium">{m.title}</p>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${typeObj(m.type).color}`}>{typeObj(m.type).label}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-cream-200/40">
                            <span>{formatDate(m.meeting_date)}</span>
                            {m.meeting_time && <span>{m.meeting_time.slice(0, 5)}</span>}
                            {m.summary && <span className="text-emerald-400/60">✓ Summary</span>}
                            {openItems.length > 0 && <span className="text-gold-400/60">{openItems.length} open action{openItems.length !== 1 ? 's' : ''}</span>}
                          </div>
                          {m.summary && <p className="text-[10px] text-cream-200/30 mt-1 line-clamp-2">{m.summary}</p>}
                          {m.attendees?.length > 0 && <p className="text-[10px] text-cream-200/25 mt-0.5 truncate">{m.attendees.map(a => a.name).join(', ')}</p>}
                        </li>
                      )
                    })
                  }
                </ul>
              )}
            </section>
          </div>
        </div>
      ) : selected ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <div className="p-6 border-b border-navy-600 sticky top-0 bg-navy-900 z-10">
            <div className="flex items-start justify-between gap-4 mb-3">
              <h2 className="text-2xl font-bold text-cream-100 leading-snug">{selected.title}</h2>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(selected)} className="text-cream-200/40 hover:text-cream-100 p-2 rounded hover:bg-navy-700 transition-colors"><Pencil className="w-5 h-5" /></button>
                <button onClick={() => deleteMeeting(selected.id)} className="text-cream-200/40 hover:text-red-400 p-2 rounded hover:bg-navy-700 transition-colors"><Trash2 className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-cream-200/50">
              <span className={`font-medium px-2.5 py-1 rounded ${typeObj(selected.type).color}`}>{typeObj(selected.type).label}</span>
              <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{formatDate(selected.meeting_date)}{selected.meeting_time ? ` · ${selected.meeting_time.slice(0, 5)}` : ''}{selected.duration_minutes ? ` · ${selected.duration_minutes}min` : ''}</span>
              {selected.project && <span className="flex items-center gap-1.5"><FolderKanban className="w-4 h-4" />{(selected.project as { name: string }).name}</span>}
              {selected.series && <span className="flex items-center gap-1.5"><Tag className="w-4 h-4" />{(selected.series as MeetingSeries).name}</span>}
            </div>
            {selected.attendees?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {selected.attendees.map(a => (
                  <span key={a.name} className="text-xs bg-navy-700 border border-navy-600 text-cream-200/70 rounded-full px-3 py-1.5">
                    {a.name}{a.position ? ` · ${a.position}` : ''}{a.organization && a.organization !== 'Goodwill Virginia' ? ` · ${a.organization}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="p-6 space-y-8">
            <section>
              <label className="block text-sm font-semibold text-cream-200/40 uppercase tracking-wider mb-3">Pre-meeting Notes / Agenda</label>
              <textarea value={notesDraft} onChange={e => setNotesDraft(e.target.value)} onBlur={saveNotes}
                placeholder="Agenda, talking points, questions to ask… (saves automatically)"
                rows={10}
                className="w-full bg-navy-700 border border-navy-600 rounded-xl text-base text-cream-100 px-4 py-3 placeholder-cream-200/25 focus:border-gold-500 focus:outline-none resize-y transition-colors"
              />
            </section>

            <section>
              <FileAttachments entityType="meeting" entityId={selected.id} />
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-semibold text-cream-200/40 uppercase tracking-wider">Transcript</label>
                <div className="flex items-center gap-2">
                  <input ref={fileInputRef} type="file" accept=".txt,.docx" onChange={handleFileUpload} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 text-xs bg-navy-700 hover:bg-navy-600 border border-navy-600 text-cream-200/60 hover:text-cream-100 px-3 py-1.5 rounded-lg transition-colors">
                    <Upload className="w-3.5 h-3.5" /> Upload .txt / .docx
                  </button>
                </div>
              </div>
              <textarea value={transcriptDraft} onChange={e => setTranscriptDraft(e.target.value)} onBlur={saveTranscript}
                placeholder="Paste your meeting transcript here, or upload a file above…"
                rows={6}
                className="w-full bg-navy-700 border border-navy-600 rounded-xl text-sm text-cream-100 px-4 py-3 placeholder-cream-200/25 focus:border-gold-500 focus:outline-none resize-y transition-colors font-mono leading-relaxed"
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
                <p className="text-sm font-semibold text-cream-200/40 uppercase tracking-wider mb-3">AI Summary</p>
                <div className="bg-navy-700 border border-navy-600 rounded-xl p-5 text-base text-cream-100 leading-relaxed whitespace-pre-wrap">{selected.summary}</div>
              </section>
            )}

            {actionItems.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-cream-200/40 uppercase tracking-wider">Action Items</p>
                  {selected.project_id && (
                    <button onClick={pushTasksToProject} disabled={pushingToProject || actionItems.every(a => a.done)}
                      className="flex items-center gap-1.5 text-xs bg-navy-700 hover:bg-navy-600 border border-navy-600 text-cream-200/60 hover:text-cream-100 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <ArrowRight className="w-3.5 h-3.5" /> Push to Project
                    </button>
                  )}
                </div>
                <ul className="space-y-2">
                  {actionItems.map(item => (
                    <li key={item.id} className="flex items-start gap-3 p-4 bg-navy-700 rounded-xl border border-navy-600">
                      <button onClick={() => toggleActionItem(item)} className="mt-0.5 shrink-0">
                        {item.done ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <Circle className="w-5 h-5 text-cream-200/30 hover:text-cream-200/60" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-base ${item.done ? 'line-through text-cream-200/30' : 'text-cream-100'}`}>{item.title}</p>
                        <div className="flex items-center gap-3 mt-1">
                          {item.owner && <span className="text-sm text-cream-200/40">{item.owner}</span>}
                          {item.due_date && <span className="text-sm text-gold-400/70">{formatDate(item.due_date)}</span>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-cream-200/30">
          <div className="text-center">
            <CalendarDays className="w-14 h-14 mx-auto mb-4 text-gold-500/20" />
            <p className="text-base">{viewMode === 'series' ? 'Select a series from the left panel' : 'Select a meeting or add a new one'}</p>
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

              {/* Next meeting in series */}
              {form.series_id && form.series_id !== '__new__' && (
                <div className="bg-navy-700/50 border border-navy-600 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-cream-200/70 flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5 text-gold-500/70" />
                      Schedule next occurrence
                    </label>
                    {form.next_meeting_date && (
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, next_meeting_date: '', next_meeting_time: '' }))}
                        className="text-[10px] text-cream-200/30 hover:text-cream-200/60 transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-cream-200/40 mb-1">Date</label>
                      <input
                        type="date"
                        value={form.next_meeting_date}
                        onChange={e => setForm(f => ({ ...f, next_meeting_date: e.target.value }))}
                        className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 focus:border-gold-500/60 focus:outline-none [color-scheme:dark]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-cream-200/40 mb-1">Time (optional)</label>
                      <input
                        type="time"
                        value={form.next_meeting_time}
                        onChange={e => setForm(f => ({ ...f, next_meeting_time: e.target.value }))}
                        className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 focus:border-gold-500/60 focus:outline-none [color-scheme:dark]"
                      />
                    </div>
                  </div>
                  {form.next_meeting_date ? (
                    <p className="text-[10px] text-gold-400/70">
                      A new <span className="font-medium">{form.title.trim() || 'matching'}</span> meeting will be created for this date with the same title, type, attendees, duration, and project.
                    </p>
                  ) : (
                    <p className="text-[10px] text-cream-200/30">Leave blank to skip — you can always add the next meeting later.</p>
                  )}
                </div>
              )}

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
                    <input
                      value={attendeeInput.organization}
                      onChange={e => setAttendeeInput(p => ({ ...p, organization: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAttendee())}
                      placeholder="Organization"
                      list="org-suggestions"
                      className="flex-1 bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none"
                    />
                    <datalist id="org-suggestions">
                      <option value="Goodwill Virginia" />
                      {[...new Set(savedAttendees.map(a => a.organization).filter(Boolean))].map(o => (
                        <option key={o} value={o!} />
                      ))}
                    </datalist>
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
