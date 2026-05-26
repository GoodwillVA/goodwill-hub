'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DayFocusItem, Task, MonthlyTask, Meeting } from '@/lib/types'
import { Plus, X, GripVertical, Clock, Check, AlertCircle, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'

// ─── Business day helpers ────────────────────────────────────────────────────

function getTodayBase(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  // If weekend, snap to next Monday
  if (d.getDay() === 6) d.setDate(d.getDate() + 2)
  if (d.getDay() === 0) d.setDate(d.getDate() + 1)
  return d
}

function addBizDays(base: Date, n: number): Date {
  const d = new Date(base)
  if (n === 0) return d
  const dir = n > 0 ? 1 : -1
  let left = Math.abs(n)
  while (left > 0) {
    d.setDate(d.getDate() + dir)
    if (d.getDay() !== 0 && d.getDay() !== 6) left--
  }
  return d
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function todayStr(): string {
  return toDateStr(new Date())
}

function formatDay(dateStr: string): { weekday: string; date: string; isToday: boolean; isYesterday: boolean } {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'long' }),
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    isToday: toDateStr(d) === toDateStr(today),
    isYesterday: toDateStr(d) === toDateStr(yesterday),
  }
}

function formatTime(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

function formatMonthYear(monthYear: string): string {
  const [year, month] = monthYear.split('-').map(Number)
  return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProjectWithTasks {
  id: string
  name: string
  tasks: Task[]
}

interface MonthGroup {
  month_year: string
  tasks: MonthlyTask[]
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DayView() {
  const supabase = createClient()

  const [centerOffset, setCenterOffset] = useState(0)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [focusItems, setFocusItems] = useState<DayFocusItem[]>([])
  const [projects, setProjects] = useState<ProjectWithTasks[]>([])
  const [monthGroups, setMonthGroups] = useState<MonthGroup[]>([])
  const [loading, setLoading] = useState(true)

  // Add-item panel state
  const [addingToDate, setAddingToDate] = useState<string | null>(null)
  const [addType, setAddType] = useState<'freeform' | 'task' | 'monthly_task'>('freeform')
  const [addText, setAddText] = useState('')
  const [addProjectId, setAddProjectId] = useState('')
  const [addTaskId, setAddTaskId] = useState('')
  const [addMonthYear, setAddMonthYear] = useState('')
  const [addMonthlyTaskId, setAddMonthlyTaskId] = useState('')
  const [addSaving, setAddSaving] = useState(false)

  // Drag-drop state
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

  const base = useMemo(() => getTodayBase(), [])

  const visibleDates = useMemo(() => [
    toDateStr(addBizDays(base, centerOffset - 1)),
    toDateStr(addBizDays(base, centerOffset)),
    toDateStr(addBizDays(base, centerOffset + 1)),
  ], [base, centerOffset])

  useEffect(() => { loadData() }, [visibleDates])

  async function loadData() {
    setLoading(true)
    const [minDate, maxDate] = [visibleDates[0], visibleDates[2]].sort()

    const [{ data: mtgs }, { data: focus }, { data: projs }, { data: tasks }, { data: mTasks }] = await Promise.all([
      supabase.from('meetings')
        .select('id, title, meeting_date, meeting_time, type, status')
        .gte('meeting_date', minDate)
        .lte('meeting_date', maxDate)
        .neq('status', 'cancelled')
        .order('meeting_time', { ascending: true }),
      supabase.from('day_focus_items')
        .select('*')
        .gte('focus_date', minDate)
        .lte('focus_date', maxDate)
        .order('sort_order', { ascending: true }),
      supabase.from('projects').select('id, name').eq('is_general', false).order('name'),
      supabase.from('tasks').select('*').eq('status', 'todo').order('created_at'),
      supabase.from('monthly_tasks').select('*').eq('completed', false).order('month_year', { ascending: false }).order('sort_order'),
    ])

    setMeetings((mtgs ?? []) as Meeting[])
    setFocusItems(focus ?? [])

    // Group tasks by project
    const projMap: Record<string, ProjectWithTasks> = {}
    for (const p of (projs ?? [])) {
      projMap[p.id] = { id: p.id, name: p.name, tasks: [] }
    }
    for (const t of (tasks ?? [])) {
      if (projMap[t.project_id]) projMap[t.project_id].tasks.push(t as Task)
    }
    setProjects(Object.values(projMap).filter(p => p.tasks.length > 0))

    // Group monthly tasks by month
    const monthMap: Record<string, MonthGroup> = {}
    for (const t of (mTasks ?? [])) {
      if (!monthMap[t.month_year]) monthMap[t.month_year] = { month_year: t.month_year, tasks: [] }
      monthMap[t.month_year].tasks.push(t as MonthlyTask)
    }
    setMonthGroups(Object.values(monthMap))

    setLoading(false)
  }

  // ── Toggle ────────────────────────────────────────────────────────────────

  async function toggleFocusItem(item: DayFocusItem) {
    if (item.item_type === 'freeform') {
      const completed = !item.completed
      await supabase.from('day_focus_items').update({ completed }).eq('id', item.id)
      setFocusItems(prev => prev.map(i => i.id === item.id ? { ...i, completed } : i))
    } else if (item.item_type === 'task' && item.task_id) {
      const newStatus = 'done'
      await supabase.from('tasks').update({ status: newStatus }).eq('id', item.task_id)
      // Remove from focus list since it's now done
      await supabase.from('day_focus_items').delete().eq('id', item.id)
      setFocusItems(prev => prev.filter(i => i.id !== item.id))
    } else if (item.item_type === 'monthly_task' && item.monthly_task_id) {
      const completed_at = new Date().toISOString()
      await supabase.from('monthly_tasks').update({ completed: true, completed_at }).eq('id', item.monthly_task_id)
      await supabase.from('day_focus_items').delete().eq('id', item.id)
      setFocusItems(prev => prev.filter(i => i.id !== item.id))
    }
  }

  async function deleteFocusItem(id: string) {
    await supabase.from('day_focus_items').delete().eq('id', id)
    setFocusItems(prev => prev.filter(i => i.id !== id))
  }

  // ── Add item ─────────────────────────────────────────────────────────────

  function openAdd(date: string) {
    setAddingToDate(date)
    setAddType('freeform')
    setAddText('')
    setAddProjectId('')
    setAddTaskId('')
    setAddMonthYear('')
    setAddMonthlyTaskId('')
  }

  function closeAdd() {
    setAddingToDate(null)
  }

  async function addFocusItem() {
    if (!addingToDate || addSaving) return
    setAddSaving(true)

    const existingOnDate = focusItems.filter(i => i.focus_date === addingToDate)
    const sort_order = existingOnDate.length

    let payload: Partial<DayFocusItem> | null = null

    if (addType === 'freeform') {
      if (!addText.trim()) { setAddSaving(false); return }
      payload = { focus_date: addingToDate, item_type: 'freeform', title: addText.trim(), sort_order, completed: false }
    } else if (addType === 'task') {
      if (!addTaskId) { setAddSaving(false); return }
      const task = projects.flatMap(p => p.tasks).find(t => t.id === addTaskId)
      if (!task) { setAddSaving(false); return }
      const proj = projects.find(p => p.id === addProjectId)
      payload = {
        focus_date: addingToDate, item_type: 'task',
        title: `${proj?.name ? proj.name + ' › ' : ''}${task.title}`,
        task_id: addTaskId, sort_order, completed: false,
      }
    } else if (addType === 'monthly_task') {
      if (!addMonthlyTaskId) { setAddSaving(false); return }
      const mt = monthGroups.flatMap(g => g.tasks).find(t => t.id === addMonthlyTaskId)
      if (!mt) { setAddSaving(false); return }
      payload = {
        focus_date: addingToDate, item_type: 'monthly_task',
        title: `${formatMonthYear(mt.month_year)} › ${mt.title}`,
        monthly_task_id: addMonthlyTaskId, sort_order, completed: false,
      }
    }

    if (payload) {
      const { data, error } = await supabase.from('day_focus_items').insert(payload).select().single()
      if (!error && data) {
        setFocusItems(prev => [...prev, data as DayFocusItem])
        // Reset for next add
        setAddText('')
        setAddTaskId('')
        setAddMonthlyTaskId('')
      }
    }
    setAddSaving(false)
  }

  // ── Drag-drop ─────────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id)
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDragOverDate(null)
  }

  function handleDragOver(e: React.DragEvent, date: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverDate(date)
  }

  function handleDragLeave() {
    setDragOverDate(null)
  }

  async function handleDrop(e: React.DragEvent, targetDate: string) {
    e.preventDefault()
    setDragOverDate(null)
    const id = e.dataTransfer.getData('text/plain')
    if (!id) return
    const item = focusItems.find(i => i.id === id)
    if (!item || item.focus_date === targetDate) return

    await supabase.from('day_focus_items').update({ focus_date: targetDate }).eq('id', id)
    setFocusItems(prev => prev.map(i => i.id === id ? { ...i, focus_date: targetDate } : i))
    setDraggingId(null)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function itemsForDate(date: string) {
    return focusItems.filter(i => i.focus_date === date)
  }

  function meetingsForDate(date: string) {
    return meetings.filter(m => m.meeting_date === date).sort((a, b) => (a.meeting_time ?? '').localeCompare(b.meeting_time ?? ''))
  }

  const todayDateStr = todayStr()

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mb-8">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-cream-200/60 uppercase tracking-wider">Day View</h2>
        <div className="flex items-center gap-1">
          {centerOffset !== 0 && (
            <button
              onClick={() => setCenterOffset(0)}
              className="text-[11px] text-gold-400 hover:text-gold-300 px-2 py-1 rounded transition-colors mr-1"
            >
              Today
            </button>
          )}
          <button
            onClick={() => setCenterOffset(c => c - 1)}
            className="p-1.5 text-cream-200/40 hover:text-cream-100 hover:bg-navy-700 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCenterOffset(c => c + 1)}
            className="p-1.5 text-cream-200/40 hover:text-cream-100 hover:bg-navy-700 rounded-lg transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Day columns */}
      <div className="grid grid-cols-3 gap-4">
        {visibleDates.map(date => {
          const { weekday, date: dateLabel, isToday, isYesterday } = formatDay(date)
          const dayMeetings = meetingsForDate(date)
          const dayItems = itemsForDate(date)
          const incompleteItems = dayItems.filter(i => !i.completed)
          const isDragTarget = dragOverDate === date
          const isAddingHere = addingToDate === date

          return (
            <div
              key={date}
              onDragOver={e => handleDragOver(e, date)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, date)}
              className={`bg-navy-800 border rounded-xl flex flex-col transition-all min-h-[200px] ${
                isToday
                  ? 'border-gold-500/40 shadow-lg shadow-navy-900/40'
                  : isDragTarget
                  ? 'border-gold-500/60 bg-navy-700/80'
                  : 'border-navy-600'
              }`}
            >
              {/* Day header */}
              <div className={`px-4 pt-4 pb-3 border-b ${isToday ? 'border-gold-500/20' : 'border-navy-600'}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${isToday ? 'text-cream-100' : 'text-cream-200/70'}`}>
                    {weekday}
                  </span>
                  {isToday && (
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-gold-500/15 text-gold-400 border border-gold-500/25">
                      Today
                    </span>
                  )}
                  {isYesterday && incompleteItems.length > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                      <AlertCircle className="w-3 h-3" />
                      {incompleteItems.length} open
                    </span>
                  )}
                </div>
                <p className="text-xs text-cream-200/40 mt-0.5">{dateLabel}</p>
              </div>

              <div className="px-4 py-3 flex-1 flex flex-col gap-3">
                {/* Meetings */}
                {dayMeetings.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-cream-200/35 uppercase tracking-wider mb-1.5">Meetings</p>
                    <ul className="space-y-1">
                      {dayMeetings.map(m => (
                        <li key={m.id} className="flex items-center gap-2 text-xs text-cream-200/70">
                          <CalendarDays className="w-3 h-3 text-gold-500/60 shrink-0" />
                          <span className="truncate flex-1">{m.title}</span>
                          {m.meeting_time && (
                            <span className="text-[10px] text-cream-200/35 shrink-0">{formatTime(m.meeting_time)}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Focus items */}
                {dayItems.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-cream-200/35 uppercase tracking-wider mb-1.5">Focus</p>
                    <ul className="space-y-1">
                      {dayItems.map(item => {
                        const isDragging = draggingId === item.id
                        return (
                          <li
                            key={item.id}
                            draggable
                            onDragStart={e => handleDragStart(e, item.id)}
                            onDragEnd={handleDragEnd}
                            className={`group flex items-center gap-2 py-1 px-1.5 rounded-lg transition-all cursor-grab active:cursor-grabbing ${
                              isDragging ? 'opacity-40' : 'hover:bg-navy-700/60'
                            } ${isYesterday && !item.completed ? 'border border-amber-500/20 bg-amber-500/5' : ''}`}
                          >
                            {/* Drag handle */}
                            <GripVertical className="w-3 h-3 text-cream-200/20 shrink-0 group-hover:text-cream-200/40" />

                            {/* Checkbox */}
                            <button
                              onClick={() => toggleFocusItem(item)}
                              className={`w-3.5 h-3.5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                                item.completed
                                  ? 'bg-emerald-500 border-emerald-500'
                                  : 'border-cream-200/25 hover:border-gold-400'
                              }`}
                            >
                              {item.completed && <Check className="w-2 h-2 text-white" strokeWidth={3} />}
                            </button>

                            {/* Title */}
                            <span className={`flex-1 text-xs min-w-0 truncate ${
                              item.completed ? 'line-through text-cream-200/30' : isYesterday && !item.completed ? 'text-amber-200/80' : 'text-cream-100'
                            }`}>
                              {item.title}
                            </span>

                            {/* Badge for linked items */}
                            {item.item_type !== 'freeform' && (
                              <span className={`text-[9px] px-1 py-0.5 rounded shrink-0 ${
                                item.item_type === 'task'
                                  ? 'bg-blue-500/15 text-blue-300'
                                  : 'bg-purple-500/15 text-purple-300'
                              }`}>
                                {item.item_type === 'task' ? 'Task' : 'Close'}
                              </span>
                            )}

                            {/* Remove */}
                            <button
                              onClick={() => deleteFocusItem(item.id)}
                              className="text-cream-200/0 group-hover:text-cream-200/30 hover:!text-red-400 transition-colors shrink-0"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}

                {/* Add panel */}
                {isAddingHere ? (
                  <div className="bg-navy-700/60 rounded-lg p-3 border border-navy-500/60 mt-auto">
                    {/* Type tabs */}
                    <div className="flex gap-1 mb-3">
                      {(['freeform', 'task', 'monthly_task'] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => { setAddType(t); setAddTaskId(''); setAddMonthlyTaskId('') }}
                          className={`flex-1 text-[10px] font-medium py-1 rounded transition-colors ${
                            addType === t
                              ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                              : 'text-cream-200/40 hover:text-cream-100'
                          }`}
                        >
                          {t === 'freeform' ? 'Quick Note' : t === 'task' ? 'Project Task' : 'Close Task'}
                        </button>
                      ))}
                    </div>

                    {/* Freeform */}
                    {addType === 'freeform' && (
                      <input
                        autoFocus
                        value={addText}
                        onChange={e => setAddText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addFocusItem(); if (e.key === 'Escape') closeAdd() }}
                        placeholder="What do you want to focus on?"
                        className="w-full bg-navy-700 border border-navy-500 rounded px-2.5 py-1.5 text-xs text-cream-100 placeholder-cream-200/30 focus:outline-none focus:border-gold-500/50"
                      />
                    )}

                    {/* Project task */}
                    {addType === 'task' && (
                      <div className="space-y-2">
                        <select
                          value={addProjectId}
                          onChange={e => { setAddProjectId(e.target.value); setAddTaskId('') }}
                          className="w-full bg-navy-700 border border-navy-500 rounded px-2 py-1.5 text-xs text-cream-100 focus:outline-none focus:border-gold-500/50"
                        >
                          <option value="">Select project…</option>
                          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {addProjectId && (
                          <select
                            value={addTaskId}
                            onChange={e => setAddTaskId(e.target.value)}
                            className="w-full bg-navy-700 border border-navy-500 rounded px-2 py-1.5 text-xs text-cream-100 focus:outline-none focus:border-gold-500/50"
                          >
                            <option value="">Select task…</option>
                            {projects.find(p => p.id === addProjectId)?.tasks
                              .filter(t => !focusItems.some(fi => fi.task_id === t.id && fi.focus_date === date))
                              .map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                          </select>
                        )}
                      </div>
                    )}

                    {/* Monthly close task */}
                    {addType === 'monthly_task' && (
                      <div className="space-y-2">
                        <select
                          value={addMonthYear}
                          onChange={e => { setAddMonthYear(e.target.value); setAddMonthlyTaskId('') }}
                          className="w-full bg-navy-700 border border-navy-500 rounded px-2 py-1.5 text-xs text-cream-100 focus:outline-none focus:border-gold-500/50"
                        >
                          <option value="">Select month…</option>
                          {monthGroups.map(g => <option key={g.month_year} value={g.month_year}>{formatMonthYear(g.month_year)}</option>)}
                        </select>
                        {addMonthYear && (
                          <select
                            value={addMonthlyTaskId}
                            onChange={e => setAddMonthlyTaskId(e.target.value)}
                            className="w-full bg-navy-700 border border-navy-500 rounded px-2 py-1.5 text-xs text-cream-100 focus:outline-none focus:border-gold-500/50"
                          >
                            <option value="">Select task…</option>
                            {monthGroups.find(g => g.month_year === addMonthYear)?.tasks
                              .filter(t => !focusItems.some(fi => fi.monthly_task_id === t.id && fi.focus_date === date))
                              .map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                          </select>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 mt-2.5">
                      <button onClick={closeAdd} className="flex-1 text-[11px] text-cream-200/50 hover:text-cream-100 py-1 transition-colors">
                        Cancel
                      </button>
                      <button
                        onClick={addFocusItem}
                        disabled={addSaving || (addType === 'freeform' ? !addText.trim() : addType === 'task' ? !addTaskId : !addMonthlyTaskId)}
                        className="flex-1 bg-gold-500 text-navy-900 text-[11px] font-semibold py-1 rounded disabled:opacity-40 hover:bg-gold-400 transition-colors"
                      >
                        {addSaving ? '…' : 'Add'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => openAdd(date)}
                    className="flex items-center gap-1.5 text-xs text-cream-200/30 hover:text-gold-400 transition-colors mt-auto pt-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add focus item
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {loading && (
        <div className="absolute inset-0 bg-navy-900/40 rounded-xl flex items-center justify-center pointer-events-none">
          <span className="text-xs text-cream-200/40">Loading…</span>
        </div>
      )}
    </div>
  )
}
