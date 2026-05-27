'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  TeamMember, TeamMemberLog, TeamMemberGoal, GoalStatus,
  AgendaItem, PendingAsk, ChatMessage, Meeting,
} from '@/lib/types'
import { toast } from 'sonner'
import {
  Users, Plus, X, ChevronDown, ChevronUp,
  Sparkles, Send, RotateCcw, Trash2,
  FileText, ClipboardList, Target, Megaphone, ArrowRight,
  CheckSquare, Square, CheckCircle2, Circle, CalendarDays, Paperclip,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import FileAttachments from '@/components/FileAttachments'

type MemberTab = 'notes' | 'log' | 'goals' | 'manage' | 'files' | 'ai'

type RichMember = TeamMember & {
  logs: TeamMemberLog[]
  goals: TeamMemberGoal[]
}

const GOAL_STATUSES: { value: GoalStatus; label: string; color: string }[] = [
  { value: 'not_started', label: 'Not Started', color: 'text-cream-200/50 bg-navy-600 border-navy-500' },
  { value: 'in_progress', label: 'In Progress', color: 'text-gold-400 bg-gold-500/15 border-gold-500/20' },
  { value: 'completed', label: 'Completed', color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/20' },
  { value: 'at_risk', label: 'At Risk', color: 'text-red-400 bg-red-500/15 border-red-500/20' },
]

const EMPTY_FORM = { name: '', title: '' }
const EMPTY_GOAL = { title: '', period: '', status: 'not_started' as GoalStatus }

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function formatLogDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function newId() {
  return Math.random().toString(36).slice(2, 10)
}

const MEETING_TYPE_LABELS: Record<string, string> = {
  'team': 'Team', '1-1': '1:1',
}

export default function AccountingTeamPage() {
  const supabase = createClient()
  const [members, setMembers] = useState<RichMember[]>([])
  const [teamMeetings, setTeamMeetings] = useState<Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'meeting_time' | 'type' | 'summary' | 'attendees'>[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [activeTabs, setActiveTabs] = useState<Record<string, MemberTab>>({})

  // Add / edit member modal
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Notes
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({})
  const [savingNotes, setSavingNotes] = useState<Set<string>>(new Set())

  // Log
  const [showAddLog, setShowAddLog] = useState<Record<string, boolean>>({})
  const [logDraft, setLogDraft] = useState<Record<string, { content: string; date: string }>>({})

  // Goals
  const [showAddGoal, setShowAddGoal] = useState<Record<string, boolean>>({})
  const [goalDraft, setGoalDraft] = useState<Record<string, typeof EMPTY_GOAL>>({})

  // Manage tab
  const [newAgendaText, setNewAgendaText] = useState<Record<string, string>>({})
  const [newAskText, setNewAskText] = useState<Record<string, string>>({})
  const [statusDraftEdit, setStatusDraftEdit] = useState<Record<string, string>>({})
  const [savingStatus, setSavingStatus] = useState<Set<string>>(new Set())

  // Member AI
  const [aiInputs, setAiInputs] = useState<Record<string, string>>({})
  const [streamingFor, setStreamingFor] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const chatContainerRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Team AI
  const [teamAiInput, setTeamAiInput] = useState('')
  const [teamAiThread, setTeamAiThread] = useState<ChatMessage[]>([])
  const [teamStreaming, setTeamStreaming] = useState(false)
  const [teamStreamingText, setTeamStreamingText] = useState('')
  const teamChatRef = useRef<HTMLDivElement | null>(null)

  // Announcements
  const [announcements, setAnnouncements] = useState('')
  const [savingAnnouncements, setSavingAnnouncements] = useState(false)

  useEffect(() => { load() }, [])

  // Auto-scroll member AI
  useEffect(() => {
    if (streamingFor && chatContainerRefs.current[streamingFor]) {
      chatContainerRefs.current[streamingFor]!.scrollTop = chatContainerRefs.current[streamingFor]!.scrollHeight
    }
  }, [streamingText, streamingFor])

  // Auto-scroll team AI
  useEffect(() => {
    if (teamChatRef.current) {
      teamChatRef.current.scrollTop = teamChatRef.current.scrollHeight
    }
  }, [teamStreamingText, teamAiThread])

  async function load() {
    setLoading(true)
    const [
      { data: membersData },
      { data: logsData },
      { data: goalsData },
      { data: settingsData },
      { data: meetingsData },
    ] = await Promise.all([
      supabase.from('team_members').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('team_member_logs').select('*').order('log_date', { ascending: false }),
      supabase.from('team_member_goals').select('*').order('sort_order', { ascending: true }),
      supabase.from('team_settings').select('*').eq('id', 1).single(),
      supabase.from('meetings')
        .select('id, title, meeting_date, meeting_time, type, summary, attendees')
        .in('type', ['team', '1-1'])
        .order('meeting_date', { ascending: false })
        .limit(20),
    ])
    const rich: RichMember[] = (membersData ?? []).map((m: TeamMember) => ({
      ...m,
      ai_thread: (m.ai_thread as ChatMessage[]) ?? [],
      agenda_items: (m.agenda_items as AgendaItem[]) ?? [],
      pending_asks: (m.pending_asks as PendingAsk[]) ?? [],
      logs: (logsData ?? []).filter((l: TeamMemberLog) => l.member_id === m.id),
      goals: (goalsData ?? []).filter((g: TeamMemberGoal) => g.member_id === m.id),
    }))
    setMembers(rich)
    setTeamMeetings(meetingsData ?? [])
    setAnnouncements(settingsData?.announcements ?? '')
    setTeamAiThread((settingsData?.ai_thread as ChatMessage[]) ?? [])
    setLoading(false)
  }

  // ── Members ────────────────────────────────────────────────────────────────

  async function saveMember() {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    const payload = { name: form.name.trim(), title: form.title.trim() || null }
    if (editing) {
      const { data, error } = await supabase.from('team_members').update(payload).eq('id', editing.id).select().single()
      if (error) { toast.error('Failed to save'); setSaving(false); return }
      setMembers(prev => prev.map(m => m.id === editing.id ? { ...m, ...data } : m))
      toast.success('Updated')
    } else {
      const { data, error } = await supabase
        .from('team_members')
        .insert({ ...payload, sort_order: members.length })
        .select().single()
      if (error) { toast.error('Failed to save'); setSaving(false); return }
      setMembers(prev => [...prev, { ...data, ai_thread: [], agenda_items: [], pending_asks: [], logs: [], goals: [] }])
      toast.success('Team member added')
    }
    setSaving(false)
    setShowModal(false)
  }

  async function deleteMember(id: string) {
    await supabase.from('team_members').delete().eq('id', id)
    setMembers(prev => prev.filter(m => m.id !== id))
    setExpanded(prev => { const s = new Set(prev); s.delete(id); return s })
    toast.success('Member removed')
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async function saveNotes(memberId: string) {
    const notes = notesDraft[memberId] ?? ''
    setSavingNotes(prev => new Set([...prev, memberId]))
    const { error } = await supabase.from('team_members').update({ notes }).eq('id', memberId)
    if (error) { toast.error('Failed to save notes') }
    else {
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, notes } : m))
      toast.success('Notes saved')
    }
    setSavingNotes(prev => { const s = new Set(prev); s.delete(memberId); return s })
  }

  // ── Log entries ────────────────────────────────────────────────────────────

  async function addLogEntry(memberId: string) {
    const draft = logDraft[memberId]
    if (!draft?.content?.trim()) return
    const { data, error } = await supabase
      .from('team_member_logs')
      .insert({ member_id: memberId, content: draft.content.trim(), log_date: draft.date || todayStr() })
      .select().single()
    if (error) { toast.error('Failed to add entry'); return }
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, logs: [data, ...m.logs] } : m))
    setLogDraft(prev => ({ ...prev, [memberId]: { content: '', date: '' } }))
    setShowAddLog(prev => ({ ...prev, [memberId]: false }))
  }

  async function deleteLogEntry(memberId: string, logId: string) {
    await supabase.from('team_member_logs').delete().eq('id', logId)
    setMembers(prev => prev.map(m => m.id === memberId
      ? { ...m, logs: m.logs.filter(l => l.id !== logId) }
      : m
    ))
  }

  // ── Goals ──────────────────────────────────────────────────────────────────

  async function addGoal(memberId: string) {
    const draft = goalDraft[memberId] ?? EMPTY_GOAL
    if (!draft.title.trim()) return
    const member = members.find(m => m.id === memberId)
    const { data, error } = await supabase
      .from('team_member_goals')
      .insert({ member_id: memberId, title: draft.title.trim(), period: draft.period.trim(), status: draft.status, sort_order: member?.goals.length ?? 0 })
      .select().single()
    if (error) { toast.error('Failed to add goal'); return }
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, goals: [...m.goals, data] } : m))
    setGoalDraft(prev => ({ ...prev, [memberId]: EMPTY_GOAL }))
    setShowAddGoal(prev => ({ ...prev, [memberId]: false }))
  }

  async function updateGoalStatus(memberId: string, goalId: string, status: GoalStatus) {
    await supabase.from('team_member_goals').update({ status }).eq('id', goalId)
    setMembers(prev => prev.map(m => m.id === memberId
      ? { ...m, goals: m.goals.map(g => g.id === goalId ? { ...g, status } : g) }
      : m
    ))
  }

  async function deleteGoal(memberId: string, goalId: string) {
    await supabase.from('team_member_goals').delete().eq('id', goalId)
    setMembers(prev => prev.map(m => m.id === memberId
      ? { ...m, goals: m.goals.filter(g => g.id !== goalId) }
      : m
    ))
  }

  // ── Manage: Agenda items ────────────────────────────────────────────────────

  async function addAgendaItem(memberId: string) {
    const text = (newAgendaText[memberId] ?? '').trim()
    if (!text) return
    const member = members.find(m => m.id === memberId)
    if (!member) return
    const newItem: AgendaItem = { id: newId(), title: text, done: false }
    const updated = [...member.agenda_items, newItem]
    await supabase.from('team_members').update({ agenda_items: updated }).eq('id', memberId)
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, agenda_items: updated } : m))
    setNewAgendaText(prev => ({ ...prev, [memberId]: '' }))
  }

  async function toggleAgendaItem(memberId: string, itemId: string) {
    const member = members.find(m => m.id === memberId)
    if (!member) return
    const updated = member.agenda_items.map(a => a.id === itemId ? { ...a, done: !a.done } : a)
    await supabase.from('team_members').update({ agenda_items: updated }).eq('id', memberId)
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, agenda_items: updated } : m))
  }

  async function deleteAgendaItem(memberId: string, itemId: string) {
    const member = members.find(m => m.id === memberId)
    if (!member) return
    const updated = member.agenda_items.filter(a => a.id !== itemId)
    await supabase.from('team_members').update({ agenda_items: updated }).eq('id', memberId)
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, agenda_items: updated } : m))
  }

  // ── Manage: Pending asks ────────────────────────────────────────────────────

  async function addPendingAsk(memberId: string) {
    const text = (newAskText[memberId] ?? '').trim()
    if (!text) return
    const member = members.find(m => m.id === memberId)
    if (!member) return
    const newItem: PendingAsk = { id: newId(), title: text, resolved: false }
    const updated = [...member.pending_asks, newItem]
    await supabase.from('team_members').update({ pending_asks: updated }).eq('id', memberId)
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, pending_asks: updated } : m))
    setNewAskText(prev => ({ ...prev, [memberId]: '' }))
  }

  async function togglePendingAsk(memberId: string, askId: string) {
    const member = members.find(m => m.id === memberId)
    if (!member) return
    const updated = member.pending_asks.map(a => a.id === askId ? { ...a, resolved: !a.resolved } : a)
    await supabase.from('team_members').update({ pending_asks: updated }).eq('id', memberId)
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, pending_asks: updated } : m))
  }

  async function deletePendingAsk(memberId: string, askId: string) {
    const member = members.find(m => m.id === memberId)
    if (!member) return
    const updated = member.pending_asks.filter(a => a.id !== askId)
    await supabase.from('team_members').update({ pending_asks: updated }).eq('id', memberId)
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, pending_asks: updated } : m))
  }

  // ── Manage: Status draft ────────────────────────────────────────────────────

  async function saveStatusDraft(memberId: string) {
    const status_draft = statusDraftEdit[memberId] ?? ''
    setSavingStatus(prev => new Set([...prev, memberId]))
    const { error } = await supabase.from('team_members').update({ status_draft }).eq('id', memberId)
    if (error) { toast.error('Failed to save') }
    else {
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, status_draft } : m))
      toast.success('Draft saved')
    }
    setSavingStatus(prev => { const s = new Set(prev); s.delete(memberId); return s })
  }

  // ── Member AI ──────────────────────────────────────────────────────────────

  async function sendAiMessage(memberId: string) {
    const input = (aiInputs[memberId] ?? '').trim()
    if (!input || streamingFor || teamStreaming) return
    const member = members.find(m => m.id === memberId)
    if (!member) return

    const userMsg: ChatMessage = { role: 'user', content: input }
    const updatedThread = [...member.ai_thread, userMsg]

    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, ai_thread: updatedThread } : m))
    setAiInputs(prev => ({ ...prev, [memberId]: '' }))
    setStreamingFor(memberId)
    setStreamingText('')

    await supabase.from('team_members').update({ ai_thread: updatedThread }).eq('id', memberId)

    try {
      const res = await fetch('/api/team/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedThread, memberId }),
      })
      if (!res.ok || !res.body) { toast.error('AI request failed'); setStreamingFor(null); return }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fullText += decoder.decode(value, { stream: true })
        setStreamingText(fullText)
      }

      const assistantMsg: ChatMessage = { role: 'assistant', content: fullText }
      const finalThread = [...updatedThread, assistantMsg]
      await supabase.from('team_members').update({ ai_thread: finalThread }).eq('id', memberId)
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, ai_thread: finalThread } : m))
    } catch { toast.error('AI request failed') }

    setStreamingFor(null)
    setStreamingText('')
  }

  async function clearMemberAiThread(memberId: string) {
    await supabase.from('team_members').update({ ai_thread: [] }).eq('id', memberId)
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, ai_thread: [] } : m))
  }

  // ── Team AI ────────────────────────────────────────────────────────────────

  async function sendTeamAiMessage() {
    const input = teamAiInput.trim()
    if (!input || teamStreaming || streamingFor) return

    const userMsg: ChatMessage = { role: 'user', content: input }
    const updatedThread = [...teamAiThread, userMsg]

    setTeamAiThread(updatedThread)
    setTeamAiInput('')
    setTeamStreaming(true)
    setTeamStreamingText('')

    await supabase.from('team_settings').update({ ai_thread: updatedThread }).eq('id', 1)

    try {
      const res = await fetch('/api/team/chat-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedThread }),
      })
      if (!res.ok || !res.body) { toast.error('AI request failed'); setTeamStreaming(false); return }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fullText += decoder.decode(value, { stream: true })
        setTeamStreamingText(fullText)
      }

      const assistantMsg: ChatMessage = { role: 'assistant', content: fullText }
      const finalThread = [...updatedThread, assistantMsg]
      await supabase.from('team_settings').update({ ai_thread: finalThread }).eq('id', 1)
      setTeamAiThread(finalThread)
    } catch { toast.error('AI request failed') }

    setTeamStreaming(false)
    setTeamStreamingText('')
  }

  async function clearTeamAiThread() {
    await supabase.from('team_settings').update({ ai_thread: [] }).eq('id', 1)
    setTeamAiThread([])
  }

  // ── Announcements ──────────────────────────────────────────────────────────

  async function saveAnnouncements() {
    setSavingAnnouncements(true)
    await supabase.from('team_settings').upsert({ id: 1, announcements, updated_at: new Date().toISOString() })
    setSavingAnnouncements(false)
    toast.success('Announcements saved')
  }

  // ── Expand / Tab ───────────────────────────────────────────────────────────

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s
    })
    if (!activeTabs[id]) setActiveTabs(prev => ({ ...prev, [id]: 'notes' }))
    const member = members.find(m => m.id === id)
    if (member) {
      if (notesDraft[id] === undefined) setNotesDraft(prev => ({ ...prev, [id]: member.notes ?? '' }))
      if (statusDraftEdit[id] === undefined) setStatusDraftEdit(prev => ({ ...prev, [id]: member.status_draft ?? '' }))
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-8 max-w-5xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-navy-700 rounded w-48" />
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-navy-800 rounded-xl" />)}
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 w-full max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-cream-100 flex items-center gap-2">
          <Users className="w-5 h-5 text-gold-500" /> Accounting Team
        </h1>
        <button
          onClick={() => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true) }}
          className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-400 text-navy-900 font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Member
        </button>
      </div>

      {/* Member cards */}
      <div className="space-y-4">
        {members.length === 0 && (
          <p className="text-cream-200/40 text-sm py-8 text-center">No team members yet. Add your first one above.</p>
        )}

        {members.map(member => {
          const isOpen = expanded.has(member.id)
          const activeTab = activeTabs[member.id] ?? 'notes'
          const isGenerating = streamingFor === member.id
          const currentNotesDraft = notesDraft[member.id] ?? member.notes ?? ''
          const notesChanged = currentNotesDraft !== (member.notes ?? '')
          const currentStatusDraft = statusDraftEdit[member.id] ?? member.status_draft ?? ''
          const statusChanged = currentStatusDraft !== (member.status_draft ?? '')
          const openAgenda = member.agenda_items.filter(a => !a.done).length
          const openAsks = member.pending_asks.filter(a => !a.resolved).length

          const tabs: Array<{ key: MemberTab; label: string; icon: typeof FileText; badge?: number }> = [
            { key: 'notes', label: 'Notes', icon: FileText },
            { key: 'log', label: 'Log', icon: ClipboardList, badge: member.logs.length || undefined },
            { key: 'goals', label: 'Goals', icon: Target, badge: member.goals.length || undefined },
            { key: 'manage', label: 'Manage', icon: CheckSquare, badge: (openAgenda + openAsks) || undefined },
            { key: 'files', label: 'Files', icon: Paperclip },
            { key: 'ai', label: 'AI', icon: Sparkles },
          ]

          return (
            <div key={member.id} className="bg-navy-800 border border-navy-600 rounded-xl overflow-hidden">
              {/* Header row */}
              <div className="p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gold-500/15 border border-gold-500/20 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-gold-400">{getInitials(member.name)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-cream-100">{member.name}</h3>
                  {member.title && <p className="text-xs text-cream-200/50 mt-0.5">{member.title}</p>}
                  {member.notes && !isOpen && (
                    <p className="text-xs text-cream-200/30 mt-0.5 truncate">{member.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {(openAgenda + openAsks) > 0 && !isOpen && (
                    <span className="text-xs text-gold-400/70 mr-1">
                      {openAgenda + openAsks} open
                    </span>
                  )}
                  <button
                    onClick={() => { setEditing(member); setForm({ name: member.name, title: member.title ?? '' }); setShowModal(true) }}
                    className="text-xs text-cream-200/40 hover:text-cream-100 px-2 py-1 rounded hover:bg-navy-700 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => toggleExpand(member.id)}
                    className="text-cream-200/40 hover:text-cream-100 p-1 rounded hover:bg-navy-700 transition-colors"
                  >
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Expanded panel */}
              {isOpen && (
                <div className="border-t border-navy-600">
                  {/* Tabs */}
                  <div className="flex border-b border-navy-600 overflow-x-auto">
                    {tabs.map(({ key, label, icon: Icon, badge }) => (
                      <button
                        key={key}
                        onClick={() => setActiveTabs(prev => ({ ...prev, [member.id]: key }))}
                        className={`px-5 py-2.5 text-sm font-medium flex items-center gap-1.5 shrink-0 transition-colors ${
                          activeTab === key
                            ? 'text-gold-400 border-b-2 border-gold-500 -mb-px'
                            : 'text-cream-200/50 hover:text-cream-100'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                        {badge !== undefined && (
                          <span className="text-[10px] bg-navy-600 text-cream-200/50 rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                            {badge}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* ── Notes ── */}
                  {activeTab === 'notes' && (
                    <div className="px-5 py-4">
                      <p className="text-xs font-medium text-cream-200/40 uppercase tracking-wider mb-3">
                        What {member.name.split(' ')[0]} is working on
                      </p>
                      <textarea
                        value={currentNotesDraft}
                        onChange={e => setNotesDraft(prev => ({ ...prev, [member.id]: e.target.value }))}
                        rows={5}
                        placeholder="Current projects, focus areas, priorities, development areas…"
                        className="w-full bg-navy-700 border border-navy-600 rounded-lg px-4 py-3 text-sm text-cream-100 placeholder-cream-200/25 focus:border-gold-500 focus:outline-none resize-none"
                      />
                      <div className="flex justify-end mt-3">
                        <button
                          onClick={() => saveNotes(member.id)}
                          disabled={!notesChanged || savingNotes.has(member.id)}
                          className="px-4 py-1.5 bg-gold-500 hover:bg-gold-400 text-navy-900 font-medium text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {savingNotes.has(member.id) ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Log ── */}
                  {activeTab === 'log' && (
                    <div className="px-5 py-4">
                      {showAddLog[member.id] ? (
                        <div className="bg-navy-700/50 rounded-lg p-4 space-y-3 mb-5 border border-navy-600">
                          <div className="flex items-center gap-3">
                            <label className="text-xs text-cream-200/50 shrink-0">Date</label>
                            <input
                              type="date"
                              value={logDraft[member.id]?.date ?? ''}
                              onChange={e => setLogDraft(prev => ({ ...prev, [member.id]: { ...prev[member.id] ?? { content: '', date: '' }, date: e.target.value } }))}
                              className="bg-navy-700 border border-navy-500 rounded px-2.5 py-1.5 text-sm text-cream-100 focus:outline-none focus:border-gold-500/50 [color-scheme:dark]"
                            />
                          </div>
                          <textarea
                            autoFocus rows={4}
                            placeholder="1:1 notes, feedback given, conversation highlights, observations…"
                            value={logDraft[member.id]?.content ?? ''}
                            onChange={e => setLogDraft(prev => ({ ...prev, [member.id]: { ...prev[member.id] ?? { content: '', date: '' }, content: e.target.value } }))}
                            className="w-full bg-navy-700 border border-navy-500 rounded-lg px-3 py-2.5 text-sm text-cream-100 placeholder-cream-200/25 focus:outline-none focus:border-gold-500/50 resize-none"
                          />
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setShowAddLog(prev => ({ ...prev, [member.id]: false }))} className="px-3 py-1.5 text-sm text-cream-200/50 hover:text-cream-100 transition-colors">Cancel</button>
                            <button
                              onClick={() => addLogEntry(member.id)}
                              disabled={!(logDraft[member.id]?.content?.trim())}
                              className="px-4 py-1.5 bg-gold-500 text-navy-900 rounded text-sm font-medium hover:bg-gold-400 disabled:opacity-40 transition-colors"
                            >Add Entry</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setShowAddLog(prev => ({ ...prev, [member.id]: true })); setLogDraft(prev => ({ ...prev, [member.id]: { content: '', date: todayStr() } })) }}
                          className="flex items-center gap-2 text-sm text-gold-400 hover:text-gold-300 font-medium mb-5 transition-colors"
                        >
                          <Plus className="w-4 h-4" /> Add Log Entry
                        </button>
                      )}
                      {member.logs.length === 0 ? (
                        <p className="text-cream-200/30 text-sm py-2">No log entries yet.</p>
                      ) : (
                        <ul className="space-y-3">
                          {member.logs.map(log => (
                            <li key={log.id} className="group p-4 bg-navy-700/50 rounded-lg border border-navy-600">
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <span className="text-xs font-semibold text-gold-400/70">{formatLogDate(log.log_date)}</span>
                                <button onClick={() => deleteLogEntry(member.id, log.id)} className="opacity-0 group-hover:opacity-100 text-cream-200/30 hover:text-red-400 transition-all shrink-0">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <p className="text-sm text-cream-200/80 leading-relaxed whitespace-pre-wrap">{log.content}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* ── Goals ── */}
                  {activeTab === 'goals' && (
                    <div className="px-5 py-4">
                      {member.goals.length > 0 && (
                        <ul className="space-y-2 mb-5">
                          {member.goals.map(goal => {
                            const statusInfo = GOAL_STATUSES.find(s => s.value === goal.status) ?? GOAL_STATUSES[0]
                            return (
                              <li key={goal.id} className="group flex items-start gap-3 p-4 bg-navy-700/50 rounded-lg border border-navy-600">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm text-cream-100 font-medium">{goal.title}</span>
                                    {goal.period && <span className="text-xs px-1.5 py-0.5 rounded bg-navy-600 text-cream-200/50 border border-navy-500">{goal.period}</span>}
                                  </div>
                                  {goal.notes && <p className="text-xs text-cream-200/40 mt-1">{goal.notes}</p>}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <select
                                    value={goal.status}
                                    onChange={e => updateGoalStatus(member.id, goal.id, e.target.value as GoalStatus)}
                                    className={`text-xs rounded-full px-2.5 py-1 border font-medium cursor-pointer focus:outline-none ${statusInfo.color}`}
                                  >
                                    {GOAL_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                  </select>
                                  <button onClick={() => deleteGoal(member.id, goal.id)} className="opacity-0 group-hover:opacity-100 text-cream-200/30 hover:text-red-400 transition-all">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                      {showAddGoal[member.id] ? (
                        <div className="bg-navy-700/50 rounded-lg p-4 space-y-3 border border-navy-600">
                          <input
                            autoFocus placeholder="Goal title"
                            value={goalDraft[member.id]?.title ?? ''}
                            onChange={e => setGoalDraft(prev => ({ ...prev, [member.id]: { ...prev[member.id] ?? EMPTY_GOAL, title: e.target.value } }))}
                            onKeyDown={e => e.key === 'Enter' && addGoal(member.id)}
                            className="w-full bg-navy-700 border border-navy-500 rounded-lg px-3 py-2.5 text-sm text-cream-100 placeholder-cream-200/25 focus:outline-none focus:border-gold-500/50"
                          />
                          <div className="flex gap-3 flex-wrap">
                            <input
                              placeholder="Period (e.g. Q1 FY26)"
                              value={goalDraft[member.id]?.period ?? ''}
                              onChange={e => setGoalDraft(prev => ({ ...prev, [member.id]: { ...prev[member.id] ?? EMPTY_GOAL, period: e.target.value } }))}
                              className="flex-1 bg-navy-700 border border-navy-500 rounded-lg px-3 py-2 text-sm text-cream-100 placeholder-cream-200/25 focus:outline-none focus:border-gold-500/50"
                            />
                            <select
                              value={goalDraft[member.id]?.status ?? 'not_started'}
                              onChange={e => setGoalDraft(prev => ({ ...prev, [member.id]: { ...prev[member.id] ?? EMPTY_GOAL, status: e.target.value as GoalStatus } }))}
                              className="bg-navy-700 border border-navy-500 rounded-lg px-3 py-2 text-sm text-cream-100 focus:outline-none"
                            >
                              {GOAL_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setShowAddGoal(prev => ({ ...prev, [member.id]: false }))} className="px-3 py-1.5 text-sm text-cream-200/50 hover:text-cream-100 transition-colors">Cancel</button>
                            <button onClick={() => addGoal(member.id)} disabled={!(goalDraft[member.id]?.title?.trim())} className="px-4 py-1.5 bg-gold-500 text-navy-900 rounded text-sm font-medium hover:bg-gold-400 disabled:opacity-40 transition-colors">Add Goal</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setShowAddGoal(prev => ({ ...prev, [member.id]: true }))} className="flex items-center gap-2 text-sm text-cream-200/35 hover:text-gold-400 transition-colors">
                          <Plus className="w-4 h-4" /> Add goal
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── Manage ── */}
                  {activeTab === 'manage' && (
                    <div className="px-5 py-4 space-y-6">

                      {/* Agenda / Bring up next */}
                      <div>
                        <p className="text-xs font-semibold text-cream-200/50 uppercase tracking-wider mb-3">Bring Up Next</p>
                        <ul className="space-y-1.5 mb-3">
                          {member.agenda_items.map(item => (
                            <li key={item.id} className="group flex items-center gap-2.5">
                              <button onClick={() => toggleAgendaItem(member.id, item.id)} className="shrink-0">
                                {item.done
                                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                  : <Circle className="w-4 h-4 text-cream-200/30 hover:text-cream-200/60" />}
                              </button>
                              <span className={`flex-1 text-sm ${item.done ? 'line-through text-cream-200/30' : 'text-cream-100'}`}>
                                {item.title}
                              </span>
                              <button onClick={() => deleteAgendaItem(member.id, item.id)} className="opacity-0 group-hover:opacity-100 text-cream-200/30 hover:text-red-400 transition-all shrink-0">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </li>
                          ))}
                          {member.agenda_items.length === 0 && (
                            <li className="text-sm text-cream-200/30 py-1">Nothing queued yet.</li>
                          )}
                        </ul>
                        <div className="flex gap-2">
                          <input
                            value={newAgendaText[member.id] ?? ''}
                            onChange={e => setNewAgendaText(prev => ({ ...prev, [member.id]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && addAgendaItem(member.id)}
                            placeholder="Add item to bring up…"
                            className="flex-1 bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/25 focus:border-gold-500 focus:outline-none"
                          />
                          <button onClick={() => addAgendaItem(member.id)} disabled={!(newAgendaText[member.id]?.trim())} className="text-sm bg-navy-600 hover:bg-navy-500 text-cream-100 rounded-lg px-3 py-2 transition-colors disabled:opacity-40">Add</button>
                        </div>
                      </div>

                      {/* Pending asks */}
                      <div>
                        <p className="text-xs font-semibold text-cream-200/50 uppercase tracking-wider mb-3">Key Asks Pending</p>
                        <ul className="space-y-1.5 mb-3">
                          {member.pending_asks.map(ask => (
                            <li key={ask.id} className="group flex items-center gap-2.5">
                              <button onClick={() => togglePendingAsk(member.id, ask.id)} className="shrink-0">
                                {ask.resolved
                                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                  : <Circle className="w-4 h-4 text-cream-200/30 hover:text-cream-200/60" />}
                              </button>
                              <span className={`flex-1 text-sm ${ask.resolved ? 'line-through text-cream-200/30' : 'text-cream-100'}`}>
                                {ask.title}
                              </span>
                              <button onClick={() => deletePendingAsk(member.id, ask.id)} className="opacity-0 group-hover:opacity-100 text-cream-200/30 hover:text-red-400 transition-all shrink-0">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </li>
                          ))}
                          {member.pending_asks.length === 0 && (
                            <li className="text-sm text-cream-200/30 py-1">No open asks.</li>
                          )}
                        </ul>
                        <div className="flex gap-2">
                          <input
                            value={newAskText[member.id] ?? ''}
                            onChange={e => setNewAskText(prev => ({ ...prev, [member.id]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && addPendingAsk(member.id)}
                            placeholder="Add ask or decision needed…"
                            className="flex-1 bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/25 focus:border-gold-500 focus:outline-none"
                          />
                          <button onClick={() => addPendingAsk(member.id)} disabled={!(newAskText[member.id]?.trim())} className="text-sm bg-navy-600 hover:bg-navy-500 text-cream-100 rounded-lg px-3 py-2 transition-colors disabled:opacity-40">Add</button>
                        </div>
                      </div>

                      {/* Status update draft */}
                      <div>
                        <p className="text-xs font-semibold text-cream-200/50 uppercase tracking-wider mb-3">Status Update Draft</p>
                        <textarea
                          value={currentStatusDraft}
                          onChange={e => setStatusDraftEdit(prev => ({ ...prev, [member.id]: e.target.value }))}
                          rows={4}
                          placeholder="Draft a status update, talking points, or message to send…"
                          className="w-full bg-navy-700 border border-navy-600 rounded-lg px-4 py-3 text-sm text-cream-100 placeholder-cream-200/25 focus:border-gold-500 focus:outline-none resize-none"
                        />
                        <div className="flex justify-end mt-3">
                          <button
                            onClick={() => saveStatusDraft(member.id)}
                            disabled={!statusChanged || savingStatus.has(member.id)}
                            className="px-4 py-1.5 bg-gold-500 hover:bg-gold-400 text-navy-900 font-medium text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {savingStatus.has(member.id) ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Files ── */}
                  {activeTab === 'files' && (
                    <div className="px-5 py-4">
                      <FileAttachments entityType="team_member" entityId={member.id} />
                    </div>
                  )}

                  {/* ── AI ── */}
                  {activeTab === 'ai' && (
                    <div className="flex flex-col" style={{ height: '540px' }}>
                      <div
                        ref={el => { chatContainerRefs.current[member.id] = el }}
                        className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
                      >
                        {member.ai_thread.length === 0 && !isGenerating ? (
                          <div className="flex flex-col items-center justify-center h-full text-center text-cream-200/30 py-8">
                            <Sparkles className="w-10 h-10 mb-4 text-gold-500/20" />
                            <p className="text-base font-medium text-cream-200/50">Team Member AI</p>
                            <p className="text-sm mt-1.5">Coaching, feedback drafts, 1:1 prep, performance conversations</p>
                          </div>
                        ) : (
                          <>
                            {member.ai_thread.map((msg, i) => (
                              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-gold-500/15 text-cream-100 border border-gold-500/20' : 'bg-navy-700 text-cream-200/90 border border-navy-600'}`}>
                                  {msg.content}
                                </div>
                              </div>
                            ))}
                            {isGenerating && streamingText && (
                              <div className="flex justify-start">
                                <div className="max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap bg-navy-700 text-cream-200/90 border border-navy-600">
                                  {streamingText}<span className="inline-block w-1.5 h-3.5 bg-gold-400 ml-0.5 animate-pulse rounded-sm" />
                                </div>
                              </div>
                            )}
                            {isGenerating && !streamingText && (
                              <div className="flex justify-start">
                                <div className="bg-navy-700 border border-navy-600 rounded-xl px-4 py-3 text-sm text-cream-200/40">Thinking…</div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <div className="px-5 pb-4 pt-3 border-t border-navy-600">
                        <div className="flex gap-2">
                          <input
                            value={aiInputs[member.id] ?? ''}
                            onChange={e => setAiInputs(prev => ({ ...prev, [member.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(member.id) } }}
                            placeholder={`Ask about ${member.name.split(' ')[0]}…`}
                            disabled={isGenerating || teamStreaming}
                            className="flex-1 bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-4 py-2.5 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none disabled:opacity-50"
                          />
                          <button
                            onClick={() => sendAiMessage(member.id)}
                            disabled={isGenerating || teamStreaming || !(aiInputs[member.id]?.trim())}
                            className="bg-gold-500 hover:bg-gold-400 text-navy-900 px-4 py-2.5 rounded-lg disabled:opacity-40 transition-colors"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                        {member.ai_thread.length > 0 && (
                          <button onClick={() => clearMemberAiThread(member.id)} className="flex items-center gap-1 text-xs text-cream-200/25 hover:text-cream-200/50 mt-2 transition-colors">
                            <RotateCcw className="w-3 h-3" /> Clear conversation
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Team section ── */}
      <div className="mt-10 space-y-4">
        <h2 className="text-xs font-semibold text-cream-200/40 uppercase tracking-wider">Team</h2>

        {/* Team AI */}
        <div className="bg-navy-800 border border-gold-500/20 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-navy-600 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-gold-400" />
            <h3 className="text-sm font-semibold text-cream-100">Team AI</h3>
            <span className="text-xs text-cream-200/35">Full-team context — workload, goals, patterns, priorities</span>
            {teamAiThread.length > 0 && (
              <button onClick={clearTeamAiThread} className="ml-auto flex items-center gap-1 text-xs text-cream-200/25 hover:text-cream-200/50 transition-colors">
                <RotateCcw className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
          <div className="flex flex-col" style={{ height: '480px' }}>
            <div ref={teamChatRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {teamAiThread.length === 0 && !teamStreaming ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-cream-200/30 py-8">
                  <Sparkles className="w-10 h-10 mb-4 text-gold-500/20" />
                  <p className="text-base font-medium text-cream-200/50">Team-wide AI Advisor</p>
                  <p className="text-sm mt-1.5">Ask about workload distribution, team patterns, priorities, or coaching strategies</p>
                </div>
              ) : (
                <>
                  {teamAiThread.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-gold-500/15 text-cream-100 border border-gold-500/20' : 'bg-navy-700 text-cream-200/90 border border-navy-600'}`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {teamStreaming && teamStreamingText && (
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap bg-navy-700 text-cream-200/90 border border-navy-600">
                        {teamStreamingText}<span className="inline-block w-1.5 h-3.5 bg-gold-400 ml-0.5 animate-pulse rounded-sm" />
                      </div>
                    </div>
                  )}
                  {teamStreaming && !teamStreamingText && (
                    <div className="flex justify-start">
                      <div className="bg-navy-700 border border-navy-600 rounded-xl px-4 py-3 text-sm text-cream-200/40">Thinking…</div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="px-5 pb-4 pt-3 border-t border-navy-600">
              <div className="flex gap-2">
                <input
                  value={teamAiInput}
                  onChange={e => setTeamAiInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTeamAiMessage() } }}
                  placeholder="Ask about the whole team…"
                  disabled={teamStreaming || !!streamingFor}
                  className="flex-1 bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-4 py-2.5 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none disabled:opacity-50"
                />
                <button
                  onClick={sendTeamAiMessage}
                  disabled={teamStreaming || !!streamingFor || !teamAiInput.trim()}
                  className="bg-gold-500 hover:bg-gold-400 text-navy-900 px-4 py-2.5 rounded-lg disabled:opacity-40 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Team files */}
        <div className="bg-navy-800 border border-navy-600 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Paperclip className="w-4 h-4 text-gold-400" />
            <h3 className="text-sm font-semibold text-cream-100">Team Reference Files</h3>
            <span className="text-xs text-cream-200/30">Shared context for team AI</span>
          </div>
          <FileAttachments entityType="team" entityId="accounting-team" />
        </div>

        {/* Team meetings */}
        <div className="bg-navy-800 border border-navy-600 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-gold-400" />
              <h3 className="text-sm font-semibold text-cream-100">Team & 1:1 Meetings</h3>
            </div>
            <a href="/meetings" className="flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300 transition-colors">
              All meetings <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
          {teamMeetings.length === 0 ? (
            <p className="text-sm text-cream-200/30">No Team or 1:1 meetings logged yet. Add them in the Meetings module using the Team or 1:1 type.</p>
          ) : (
            <ul className="space-y-2">
              {teamMeetings.slice(0, 8).map(m => (
                <li key={m.id} className="flex items-start gap-3 p-3 bg-navy-700/50 rounded-lg border border-navy-600">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-cream-100">{m.title}</span>
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        m.type === '1-1'
                          ? 'bg-purple-500/20 text-purple-300'
                          : 'bg-blue-500/20 text-blue-300'
                      }`}>
                        {MEETING_TYPE_LABELS[m.type] ?? m.type}
                      </span>
                    </div>
                    <p className="text-xs text-cream-200/40 mt-0.5">
                      {formatDate(m.meeting_date)}
                      {m.meeting_time ? ` · ${m.meeting_time.slice(0, 5)}` : ''}
                      {m.attendees?.length > 0 ? ` · ${m.attendees.map(a => a.name).join(', ')}` : ''}
                    </p>
                    {m.summary && <p className="text-xs text-cream-200/50 mt-1 line-clamp-2">{m.summary}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Announcements */}
        <div className="bg-navy-800 border border-navy-600 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Megaphone className="w-4 h-4 text-gold-400" />
            <h3 className="text-sm font-semibold text-cream-100">Team Announcements</h3>
            <span className="text-xs text-cream-200/30">Draft pad</span>
          </div>
          <textarea
            value={announcements}
            onChange={e => setAnnouncements(e.target.value)}
            rows={4}
            placeholder="Draft team announcements, reminders, policy updates, shout-outs…"
            className="w-full bg-navy-700 border border-navy-600 rounded-lg px-4 py-3 text-sm text-cream-100 placeholder-cream-200/25 focus:border-gold-500 focus:outline-none resize-none"
          />
          <div className="flex justify-end mt-3">
            <button
              onClick={saveAnnouncements}
              disabled={savingAnnouncements}
              className="px-4 py-1.5 bg-gold-500 hover:bg-gold-400 text-navy-900 font-medium text-sm rounded-lg disabled:opacity-50 transition-colors"
            >
              {savingAnnouncements ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit Member modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-navy-800 border border-navy-600 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-navy-600">
              <h2 className="font-bold text-cream-100">{editing ? 'Edit Member' : 'Add Team Member'}</h2>
              <button onClick={() => setShowModal(false)}><X className="w-4 h-4 text-cream-200/50" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Name *</label>
                <input
                  autoFocus value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && saveMember()}
                  placeholder="Full name"
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2.5 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Title</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && saveMember()}
                  placeholder="e.g. Staff Accountant"
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2.5 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              {editing && (
                <button onClick={() => { deleteMember(editing.id); setShowModal(false) }} className="text-xs text-red-400 hover:text-red-300 transition-colors mr-auto">
                  Remove
                </button>
              )}
              <button onClick={() => setShowModal(false)} className="flex-1 bg-navy-700 hover:bg-navy-600 text-cream-100 text-sm font-medium rounded-lg py-2.5 transition-colors">Cancel</button>
              <button onClick={saveMember} disabled={saving} className="flex-1 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-900 text-sm font-semibold rounded-lg py-2.5 transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
