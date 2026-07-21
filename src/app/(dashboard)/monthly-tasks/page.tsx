'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MonthlyTask } from '@/lib/types'
import {
  Plus, Check, ChevronDown, ChevronRight,
  RefreshCw, Trash2, Calendar, X, Copy, FileText, Pencil,
} from 'lucide-react'

// ── Business-day helpers ──────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function observedHolidayDate(nominal: string): string {
  const d = new Date(nominal + 'T00:00:00')
  const dow = d.getDay()
  if (dow === 6) d.setDate(d.getDate() - 1) // Sat → Fri
  if (dow === 0) d.setDate(d.getDate() + 1) // Sun → Mon
  return toDateStr(d)
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): string {
  const d = new Date(year, month, 1)
  let count = 0
  while (d.getMonth() === month) {
    if (d.getDay() === weekday && ++count === n) return toDateStr(d)
    d.setDate(d.getDate() + 1)
  }
  return toDateStr(new Date(year, month, 1))
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): string {
  const d = new Date(year, month + 1, 0)
  while (d.getDay() !== weekday) d.setDate(d.getDate() - 1)
  return toDateStr(d)
}

function getFederalHolidays(year: number): { date: string; name: string }[] {
  const raw = [
    { date: `${year}-01-01`, name: "New Year's Day" },
    { date: nthWeekdayOfMonth(year, 0, 1, 3), name: 'MLK Day' },
    { date: nthWeekdayOfMonth(year, 1, 1, 3), name: "Presidents' Day" },
    { date: lastWeekdayOfMonth(year, 4, 1), name: 'Memorial Day' },
    { date: `${year}-06-19`, name: 'Juneteenth' },
    { date: `${year}-07-04`, name: 'Independence Day' },
    { date: nthWeekdayOfMonth(year, 8, 1, 1), name: 'Labor Day' },
    { date: nthWeekdayOfMonth(year, 9, 1, 2), name: 'Columbus Day' },
    { date: `${year}-11-11`, name: 'Veterans Day' },
    { date: nthWeekdayOfMonth(year, 10, 4, 4), name: 'Thanksgiving' },
    { date: `${year}-12-25`, name: 'Christmas' },
  ]
  return raw.map(h => ({ ...h, date: observedHolidayDate(h.date) }))
}

function getHolidaysForPeriod(monthYear: string): { date: string; name: string }[] {
  const [y, m] = monthYear.split('-').map(Number)
  const d1 = new Date(y, m - 1, 1) // new month (0-indexed)
  const d2 = new Date(y, m, 1)     // following month
  const years = [...new Set([d1.getFullYear(), d2.getFullYear()])]
  const all = years.flatMap(yr => getFederalHolidays(yr))
  return all.filter(h => {
    const hd = new Date(h.date + 'T00:00:00')
    return (
      (hd.getFullYear() === d1.getFullYear() && hd.getMonth() === d1.getMonth()) ||
      (hd.getFullYear() === d2.getFullYear() && hd.getMonth() === d2.getMonth())
    )
  })
}

function getBusinessDayNumber(date: Date, holidays: string[]): number {
  const yr = date.getFullYear()
  const mo = date.getMonth()
  const target = new Date(yr, mo, date.getDate())
  const cur = new Date(yr, mo, 1)
  let bd = 0
  while (cur <= target) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6 && !holidays.includes(toDateStr(cur))) bd++
    cur.setDate(cur.getDate() + 1)
  }
  return Math.max(1, bd)
}

function getNthBusinessDay(year: number, month0: number, n: number, holidays: string[]): Date {
  const ref = new Date(year, month0, 1)
  const yr = ref.getFullYear()
  const mo = ref.getMonth()
  const cur = new Date(yr, mo, 1)
  let bd = 0
  let lastBD = new Date(cur)
  while (cur.getFullYear() === yr && cur.getMonth() === mo) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6 && !holidays.includes(toDateStr(cur))) {
      bd++
      lastBD = new Date(cur)
      if (bd === n) return new Date(cur)
    }
    cur.setDate(cur.getDate() + 1)
  }
  return lastBD
}

function computeNewDueDate(
  oldDue: string,
  prevMonthYear: string,
  newMonthYear: string,
  newHolidays: string[],
): string {
  const prevStart = new Date(prevMonthYear + '-01')
  const dueDate = new Date(oldDue + 'T00:00:00')
  const monthOffset =
    (dueDate.getFullYear() - prevStart.getFullYear()) * 12 +
    (dueDate.getMonth() - prevStart.getMonth())
  const oldYearHols = getFederalHolidays(dueDate.getFullYear()).map(h => h.date)
  const bdNum = getBusinessDayNumber(dueDate, oldYearHols)
  const newStart = new Date(newMonthYear + '-01')
  const newDate = getNthBusinessDay(
    newStart.getFullYear(),
    newStart.getMonth() + monthOffset,
    bdNum,
    newHolidays,
  )
  return toDateStr(newDate)
}

// ── Display helpers ───────────────────────────────────────────────────────────

function getActiveCloseMonthStr(): string {
  const today = new Date()
  const day = today.getDate()
  if (day >= 20) {
    const year = today.getFullYear()
    const month = today.getMonth() + 1
    return `${year}-${String(month).padStart(2, '0')}`
  } else {
    const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
  }
}

function formatMonthYear(monthYear: string): string {
  const [year, month] = monthYear.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function getPreviousMonthStr(monthYear: string): string {
  const [year, month] = monthYear.split('-').map(Number)
  const prev = new Date(year, month - 2, 1)
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
}

function formatDueDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatCompletedAt(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function sortTasks(tasks: MonthlyTask[]): MonthlyTask[] {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    if (!a.due_date && !b.due_date) return 0
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return a.due_date.localeCompare(b.due_date)
  })
}

function isOverdue(dateStr: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(dateStr + 'T00:00:00') < today
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MonthlyTasksPage() {
  const supabase = createClient()
  const activeMonthStr = getActiveCloseMonthStr()

  const [tasksByMonth, setTasksByMonth] = useState<Record<string, MonthlyTask[]>>({})
  const [months, setMonths] = useState<string[]>([])
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set([activeMonthStr]))
  const [loading, setLoading] = useState(true)

  // Per-month add-task form state
  const [showAddTask, setShowAddTask] = useState<Record<string, boolean>>({})
  const [newTitle, setNewTitle] = useState<Record<string, string>>({})
  const [newDueDate, setNewDueDate] = useState<Record<string, string>>({})
  const [newRecurring, setNewRecurring] = useState<Record<string, boolean>>({})

  // Notes expansion
  const [notesOpenId, setNotesOpenId] = useState<string | null>(null)

  // Inline task editing
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editTitleValue, setEditTitleValue] = useState('')
  const [editDueDateValue, setEditDueDateValue] = useState('')

  // Add Month modal
  const [showAddMonth, setShowAddMonth] = useState(false)
  const [newMonthYear, setNewMonthYear] = useState('')
  const [copyRecurring, setCopyRecurring] = useState(true)
  const [addingMonth, setAddingMonth] = useState(false)

  // Delete month confirmation
  const [showDeleteMonth, setShowDeleteMonth] = useState<string | null>(null)
  const [deletingMonth, setDeletingMonth] = useState(false)

  // Holiday state for Add Month modal
  const [suggestedHolidays, setSuggestedHolidays] = useState<
    { date: string; name: string; checked: boolean }[]
  >([])
  const [customHolidays, setCustomHolidays] = useState<string[]>([])
  const [customHolidayDate, setCustomHolidayDate] = useState('')

  useEffect(() => { loadTasks() }, [])

  // Recompute suggested holidays whenever the target month changes
  useEffect(() => {
    if (!newMonthYear) {
      setSuggestedHolidays([])
      return
    }
    const h = getHolidaysForPeriod(newMonthYear)
    setSuggestedHolidays(h.map(x => ({ ...x, checked: true })))
    setCustomHolidays([])
    setCustomHolidayDate('')
  }, [newMonthYear])

  async function loadTasks() {
    setLoading(true)
    const { data } = await supabase
      .from('monthly_tasks')
      .select('*')
      .order('month_year', { ascending: false })
      .order('sort_order', { ascending: true })

    if (data && data.length > 0) {
      const grouped: Record<string, MonthlyTask[]> = {}
      for (const task of data) {
        if (!grouped[task.month_year]) grouped[task.month_year] = []
        grouped[task.month_year].push(task)
      }
      setTasksByMonth(grouped)
      const allMonths = [...new Set(data.map((t: MonthlyTask) => t.month_year))].sort((a, b) => b.localeCompare(a))
      if (!allMonths.includes(activeMonthStr)) allMonths.unshift(activeMonthStr)
      setMonths(allMonths)
    } else {
      setMonths([activeMonthStr])
    }
    setLoading(false)
  }

  async function toggleTask(task: MonthlyTask) {
    const completed = !task.completed
    const { error } = await supabase
      .from('monthly_tasks')
      .update({ completed, completed_at: completed ? new Date().toISOString() : null })
      .eq('id', task.id)
    if (!error) {
      setTasksByMonth(prev => ({
        ...prev,
        [task.month_year]: prev[task.month_year].map(t =>
          t.id === task.id ? { ...t, completed, completed_at: completed ? new Date().toISOString() : null } : t
        ),
      }))
    }
  }

  async function deleteTask(task: MonthlyTask) {
    const { error } = await supabase.from('monthly_tasks').delete().eq('id', task.id)
    if (!error) {
      setTasksByMonth(prev => ({
        ...prev,
        [task.month_year]: (prev[task.month_year] ?? []).filter(t => t.id !== task.id),
      }))
    }
  }

  async function toggleRecurring(task: MonthlyTask) {
    const is_recurring = !task.is_recurring
    await supabase.from('monthly_tasks').update({ is_recurring }).eq('id', task.id)
    setTasksByMonth(prev => ({
      ...prev,
      [task.month_year]: prev[task.month_year].map(t =>
        t.id === task.id ? { ...t, is_recurring } : t
      ),
    }))
  }

  async function updateTaskNotes(task: MonthlyTask, notes: string) {
    const trimmed = notes.trim() || null
    if (trimmed === task.notes) return
    await supabase.from('monthly_tasks').update({ notes: trimmed }).eq('id', task.id)
    setTasksByMonth(prev => ({
      ...prev,
      [task.month_year]: prev[task.month_year].map(t =>
        t.id === task.id ? { ...t, notes: trimmed } : t
      ),
    }))
  }

  function startEditTask(task: MonthlyTask) {
    setEditingTaskId(task.id)
    setEditTitleValue(task.title)
    setEditDueDateValue(task.due_date ?? '')
    setNotesOpenId(null)
  }

  function cancelEditTask() {
    setEditingTaskId(null)
    setEditTitleValue('')
    setEditDueDateValue('')
  }

  async function saveTaskEdit(task: MonthlyTask) {
    const title = editTitleValue.trim()
    if (!title) return
    const due_date = editDueDateValue || null
    await supabase.from('monthly_tasks').update({ title, due_date }).eq('id', task.id)
    setTasksByMonth(prev => ({
      ...prev,
      [task.month_year]: prev[task.month_year].map(t =>
        t.id === task.id ? { ...t, title, due_date } : t
      ),
    }))
    cancelEditTask()
  }

  async function addTask(monthYear: string) {
    const title = (newTitle[monthYear] ?? '').trim()
    if (!title) return
    const tasks = tasksByMonth[monthYear] ?? []
    const { data, error } = await supabase
      .from('monthly_tasks')
      .insert({
        month_year: monthYear,
        title,
        due_date: newDueDate[monthYear] || null,
        is_recurring: newRecurring[monthYear] ?? false,
        sort_order: tasks.length,
        completed: false,
      })
      .select()
      .single()

    if (!error && data) {
      setTasksByMonth(prev => ({ ...prev, [monthYear]: [...(prev[monthYear] ?? []), data] }))
      setNewTitle(prev => ({ ...prev, [monthYear]: '' }))
      setNewDueDate(prev => ({ ...prev, [monthYear]: '' }))
      setNewRecurring(prev => ({ ...prev, [monthYear]: false }))
      if (!months.includes(monthYear)) {
        setMonths(prev => [monthYear, ...prev].sort((a, b) => b.localeCompare(a)))
      }
    }
  }

  function closeAddMonthModal() {
    setShowAddMonth(false)
    setNewMonthYear('')
    setCopyRecurring(true)
    setSuggestedHolidays([])
    setCustomHolidays([])
    setCustomHolidayDate('')
  }

  async function deleteMonth(monthStr: string) {
    setDeletingMonth(true)
    const { error } = await supabase
      .from('monthly_tasks')
      .delete()
      .eq('month_year', monthStr)
    if (!error) {
      setTasksByMonth(prev => {
        const next = { ...prev }
        delete next[monthStr]
        return next
      })
      setMonths(prev => prev.filter(m => m !== monthStr))
    }
    setShowDeleteMonth(null)
    setDeletingMonth(false)
  }

  async function addMonth() {
    if (!newMonthYear || addingMonth) return
    setAddingMonth(true)

    if (copyRecurring) {
      const prevMonth = getPreviousMonthStr(newMonthYear)
      const recurring = (tasksByMonth[prevMonth] ?? []).filter(t => t.is_recurring)
      if (recurring.length > 0) {
        const activeHols = [
          ...suggestedHolidays.filter(h => h.checked).map(h => h.date),
          ...customHolidays,
        ]
        const { data, error } = await supabase
          .from('monthly_tasks')
          .insert(recurring.map((t, i) => ({
            month_year: newMonthYear,
            title: t.title,
            due_date: t.due_date
              ? computeNewDueDate(t.due_date, prevMonth, newMonthYear, activeHols)
              : null,
            is_recurring: true,
            sort_order: i,
            completed: false,
          })))
          .select()
        if (!error && data) {
          setTasksByMonth(prev => ({ ...prev, [newMonthYear]: data }))
        }
      }
    }

    if (!months.includes(newMonthYear)) {
      setMonths(prev => [newMonthYear, ...prev].sort((a, b) => b.localeCompare(a)))
    }
    setExpandedMonths(prev => new Set([...prev, newMonthYear]))
    closeAddMonthModal()
    setAddingMonth(false)
  }

  function toggleExpand(month: string) {
    setExpandedMonths(prev => {
      const next = new Set(prev)
      next.has(month) ? next.delete(month) : next.add(month)
      return next
    })
  }

  if (loading) {
    return (
      <div className="p-8 max-w-4xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-navy-700 rounded w-48" />
          <div className="h-64 bg-navy-800 rounded-xl" />
          <div className="h-32 bg-navy-800 rounded-xl" />
        </div>
      </div>
    )
  }

  // Derived values for Add Month modal
  const prevMonthForModal = newMonthYear ? getPreviousMonthStr(newMonthYear) : ''
  const recurringForModal = prevMonthForModal
    ? (tasksByMonth[prevMonthForModal] ?? []).filter(t => t.is_recurring)
    : []
  const recurringCountForModal = recurringForModal.length
  const recurringWithDueDates = recurringForModal.filter(t => t.due_date)
  const showHolidaySection = !!newMonthYear && copyRecurring && recurringWithDueDates.length > 0
  const activeHolsForModal = [
    ...suggestedHolidays.filter(h => h.checked).map(h => h.date),
    ...customHolidays,
  ]
  const taskPreviewForModal = showHolidaySection
    ? recurringForModal.map(t => ({
        title: t.title,
        oldDue: t.due_date,
        newDue: t.due_date && prevMonthForModal
          ? computeNewDueDate(t.due_date, prevMonthForModal, newMonthYear, activeHolsForModal)
          : null,
      }))
    : []

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-cream-100">Monthly Tasks</h1>
          <p className="text-cream-200/50 text-sm mt-1">Month-end close checklists by period</p>
        </div>
        <button
          onClick={() => setShowAddMonth(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gold-500 text-navy-900 rounded-lg font-medium text-sm hover:bg-gold-400 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Month
        </button>
      </div>

      {/* Month list */}
      <div className="space-y-4">
        {months.map(month => {
          const tasks = tasksByMonth[month] ?? []
          const completed = tasks.filter(t => t.completed).length
          const total = tasks.length
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0
          const overdueCount = tasks.filter(t => !t.completed && t.due_date && isOverdue(t.due_date)).length
          const isActive = month === activeMonthStr
          const isExpanded = expandedMonths.has(month)
          const isAddingTask = showAddTask[month]

          return (
            <div
              key={month}
              className={`rounded-xl border transition-all ${
                isActive
                  ? 'bg-navy-800 border-gold-500/40 shadow-lg shadow-navy-900/60'
                  : 'bg-navy-800 border-navy-600'
              }`}
            >
              {/* Month header row */}
              <div className="flex items-center group/mhdr">
                <button
                  className="flex-1 flex items-center gap-3 p-5 text-left min-w-0"
                  onClick={() => toggleExpand(month)}
                >
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-cream-200/40 shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-cream-200/40 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-semibold ${isActive ? 'text-cream-100' : 'text-cream-200/80'}`}>
                        {formatMonthYear(month)}
                      </span>
                      {isActive && (
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-gold-500/15 text-gold-400 border border-gold-500/25">
                          Active Close
                        </span>
                      )}
                      {!isActive && pct === 100 && total > 0 && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                          Complete
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-cream-200/35">
                        {total === 0 ? 'No tasks yet' : `${completed}/${total} complete · ${pct}%`}
                      </span>
                      {overdueCount > 0 && (
                        <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full">
                          {overdueCount} overdue
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Mini progress bar */}
                  {total > 0 && (
                    <div className="w-20 shrink-0 mr-1">
                      <div className="h-1.5 bg-navy-600 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            pct === 100 ? 'bg-emerald-500' : isActive ? 'bg-gold-500' : 'bg-navy-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </button>

                {/* Delete month — visible on hover */}
                <button
                  onClick={() => setShowDeleteMonth(month)}
                  title="Delete this month"
                  className="shrink-0 mr-4 p-1.5 rounded text-cream-200/0 group-hover/mhdr:text-cream-200/20 hover:!text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Expanded body */}
              {isExpanded && (
                <div className="px-6 pb-6 border-t border-navy-600">
                  {/* Full progress bar for active month */}
                  {isActive && total > 0 && (
                    <div className="flex items-center gap-3 pt-5 mb-5">
                      <div className="flex-1 h-2.5 bg-navy-600 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-gold-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-sm text-cream-200/60 shrink-0 font-medium tabular-nums">
                        {completed}/{total}
                      </span>
                    </div>
                  )}

                  {/* Task list */}
                  {tasks.length === 0 ? (
                    <p className="text-cream-200/30 text-sm pt-5 mb-4">No tasks yet — add one below.</p>
                  ) : (
                    <ul className={`space-y-0 ${isActive && total > 0 ? '' : 'pt-5'} mb-4`}>
                      {sortTasks(tasks).map(task => (
                        <li
                          key={task.id}
                          className={`rounded-lg border transition-colors ${
                            notesOpenId === task.id
                              ? 'border-navy-500 bg-navy-700/40'
                              : 'border-transparent'
                          }`}
                        >
                          {/* Main task row */}
                          <div className={`group flex items-center gap-3 py-1.5 px-3 rounded-lg transition-colors ${
                            task.completed || notesOpenId === task.id || editingTaskId === task.id ? '' : 'hover:bg-navy-700/50'
                          }`}>
                            {editingTaskId === task.id ? (
                              <>
                                <input
                                  autoFocus
                                  value={editTitleValue}
                                  onChange={e => setEditTitleValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') saveTaskEdit(task)
                                    if (e.key === 'Escape') cancelEditTask()
                                  }}
                                  className="flex-1 min-w-0 bg-navy-700 border border-gold-500/50 rounded-lg px-3 py-1.5 text-sm text-cream-100 focus:outline-none focus:border-gold-500"
                                />
                                <input
                                  type="date"
                                  value={editDueDateValue}
                                  onChange={e => setEditDueDateValue(e.target.value)}
                                  className="shrink-0 bg-navy-700 border border-navy-500 rounded-lg px-2 py-1.5 text-xs text-cream-100 focus:outline-none focus:border-gold-500/50 [color-scheme:dark]"
                                />
                                <button
                                  onClick={() => saveTaskEdit(task)}
                                  disabled={!editTitleValue.trim()}
                                  title="Save"
                                  className="shrink-0 text-emerald-400 hover:text-emerald-300 disabled:opacity-40 transition-colors"
                                >
                                  <Check className="w-4 h-4" strokeWidth={2.5} />
                                </button>
                                <button
                                  onClick={cancelEditTask}
                                  title="Cancel"
                                  className="shrink-0 text-cream-200/40 hover:text-cream-100 transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => toggleTask(task)}
                                  className={`w-5 h-5 shrink-0 rounded border-2 transition-colors flex items-center justify-center ${
                                    task.completed
                                      ? 'bg-emerald-500 border-emerald-500'
                                      : 'border-cream-200/25 hover:border-gold-400'
                                  }`}
                                >
                                  {task.completed && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                </button>

                                <span className={`flex-1 text-sm min-w-0 ${
                                  task.completed ? 'line-through text-cream-200/35' : 'text-cream-100'
                                }`}>
                                  {task.title}
                                </span>

                                {task.due_date && (
                                  <span className={`text-xs shrink-0 ${
                                    !task.completed && isOverdue(task.due_date)
                                      ? 'text-red-400 font-medium'
                                      : 'text-cream-200/35'
                                  }`}>
                                    {formatDueDate(task.due_date)}
                                  </span>
                                )}

                                {task.completed && task.completed_at && (
                                  <span className="text-xs text-emerald-400/60 shrink-0">
                                    ✓ {formatCompletedAt(task.completed_at)}
                                  </span>
                                )}

                                <button
                                  onClick={() => startEditTask(task)}
                                  title="Edit title or due date"
                                  className="shrink-0 text-cream-200/0 group-hover:text-cream-200/25 hover:!text-gold-400 transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => setNotesOpenId(notesOpenId === task.id ? null : task.id)}
                                  title={task.notes ? 'View/edit notes' : 'Add notes'}
                                  className={`shrink-0 transition-colors ${
                                    task.notes
                                      ? 'text-blue-400 hover:text-blue-300'
                                      : 'text-cream-200/0 group-hover:text-cream-200/25 hover:!text-blue-400'
                                  }`}
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => toggleRecurring(task)}
                                  title={task.is_recurring ? 'Recurring — click to remove' : 'Mark as recurring'}
                                  className={`shrink-0 transition-colors ${
                                    task.is_recurring
                                      ? 'text-gold-400 hover:text-gold-300'
                                      : 'text-cream-200/0 group-hover:text-cream-200/25 hover:!text-gold-400'
                                  }`}
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => deleteTask(task)}
                                  className="shrink-0 text-cream-200/0 group-hover:text-cream-200/25 hover:!text-red-400 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>

                          {/* Expandable notes */}
                          {notesOpenId === task.id && (
                            <div className="px-3 pb-3">
                              <textarea
                                key={task.id}
                                autoFocus
                                defaultValue={task.notes ?? ''}
                                onBlur={e => updateTaskNotes(task, e.target.value)}
                                placeholder="Add notes for this task…"
                                rows={2}
                                className="w-full bg-navy-700 border border-navy-600 rounded-lg text-xs text-cream-100 px-3 py-2 placeholder-cream-200/25 focus:border-gold-500/60 focus:outline-none resize-none transition-colors"
                              />
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Add task form / button */}
                  {isAddingTask ? (
                    <div className="bg-navy-700/50 rounded-lg p-4 space-y-3 mt-2">
                      <input
                        autoFocus
                        type="text"
                        placeholder="Task title"
                        value={newTitle[month] ?? ''}
                        onChange={e => setNewTitle(prev => ({ ...prev, [month]: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter') addTask(month)
                          if (e.key === 'Escape') setShowAddTask(prev => ({ ...prev, [month]: false }))
                        }}
                        className="w-full bg-navy-700 border border-navy-500 rounded-lg px-3 py-2.5 text-sm text-cream-100 placeholder-cream-200/30 focus:outline-none focus:border-gold-500/50"
                      />
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-cream-200/35 shrink-0" />
                          <input
                            type="date"
                            value={newDueDate[month] ?? ''}
                            onChange={e => setNewDueDate(prev => ({ ...prev, [month]: e.target.value }))}
                            className="bg-navy-700 border border-navy-500 rounded px-2.5 py-1.5 text-sm text-cream-100 focus:outline-none focus:border-gold-500/50 [color-scheme:dark]"
                          />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-cream-200/50 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={newRecurring[month] ?? false}
                            onChange={e => setNewRecurring(prev => ({ ...prev, [month]: e.target.checked }))}
                            className="accent-gold-500"
                          />
                          <RefreshCw className="w-3.5 h-3.5" />
                          Recurring
                        </label>
                        <div className="flex gap-2 ml-auto">
                          <button
                            onClick={() => setShowAddTask(prev => ({ ...prev, [month]: false }))}
                            className="px-3 py-1.5 text-sm text-cream-200/50 hover:text-cream-100 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => addTask(month)}
                            disabled={!(newTitle[month] ?? '').trim()}
                            className="px-4 py-1.5 bg-gold-500 text-navy-900 rounded text-sm font-medium hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddTask(prev => ({ ...prev, [month]: true }))}
                      className="flex items-center gap-2 text-sm text-cream-200/35 hover:text-gold-400 transition-colors mt-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add task
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {months.length === 0 && (
          <div className="text-center py-16 text-cream-200/35">
            <p className="text-lg mb-2">No months yet</p>
            <p className="text-sm">Click "Add Month" to create your first close checklist.</p>
          </div>
        )}
      </div>

      {/* ── Delete Month confirmation modal ─────────────────────────────────── */}
      {showDeleteMonth && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-navy-800 border border-red-500/30 rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-start gap-3 mb-5">
              <div className="shrink-0 w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-cream-100">
                  Delete {formatMonthYear(showDeleteMonth)}?
                </h2>
                <p className="text-sm text-cream-200/50 mt-1">
                  {(() => {
                    const count = (tasksByMonth[showDeleteMonth] ?? []).length
                    return count === 0
                      ? 'This month has no tasks. It will be removed from the list.'
                      : `This will permanently delete ${count} task${count !== 1 ? 's' : ''}. This cannot be undone.`
                  })()}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteMonth(null)}
                disabled={deletingMonth}
                className="flex-1 px-4 py-2 border border-navy-500 text-cream-200/70 rounded-lg text-sm hover:bg-navy-700 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMonth(showDeleteMonth)}
                disabled={deletingMonth}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg font-medium text-sm hover:bg-red-400 disabled:opacity-40 transition-colors"
              >
                {deletingMonth ? 'Deleting…' : 'Delete Month'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Month modal ──────────────────────────────────────────────────── */}
      {showAddMonth && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-navy-800 border border-navy-600 rounded-xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-cream-100">Add Month</h2>
              <button onClick={closeAddMonthModal} className="text-cream-200/40 hover:text-cream-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Month picker */}
              <div>
                <label className="block text-xs font-medium text-cream-200/50 uppercase tracking-wider mb-1.5">
                  Month & Year
                </label>
                <input
                  type="month"
                  value={newMonthYear}
                  onChange={e => setNewMonthYear(e.target.value)}
                  className="w-full bg-navy-700 border border-navy-500 rounded-lg px-3 py-2 text-sm text-cream-100 focus:outline-none focus:border-gold-500/50 [color-scheme:dark]"
                />
              </div>

              {/* Copy recurring tasks */}
              {recurringCountForModal > 0 && (
                <label className="flex items-start gap-3 p-3 bg-navy-700/50 rounded-lg cursor-pointer select-none border border-navy-500/50">
                  <input
                    type="checkbox"
                    checked={copyRecurring}
                    onChange={e => setCopyRecurring(e.target.checked)}
                    className="mt-0.5 accent-gold-500 shrink-0"
                  />
                  <div>
                    <p className="text-sm text-cream-100 font-medium flex items-center gap-1.5">
                      <Copy className="w-3.5 h-3.5 text-gold-400" />
                      Copy recurring tasks
                    </p>
                    <p className="text-xs text-cream-200/40 mt-0.5">
                      {recurringCountForModal} recurring task{recurringCountForModal !== 1 ? 's' : ''} from {formatMonthYear(prevMonthForModal)}
                      {recurringWithDueDates.length > 0
                        ? ' — due dates adjusted to matching business days'
                        : ' will be added'}
                    </p>
                  </div>
                </label>
              )}

              {/* Holidays section */}
              {showHolidaySection && (
                <div className="space-y-3 p-3 bg-navy-700/30 rounded-lg border border-navy-600/50">
                  <div>
                    <p className="text-xs font-medium text-cream-200/60 uppercase tracking-wider">
                      Holidays in schedule period
                    </p>
                    <p className="text-xs text-cream-200/35 mt-0.5">
                      Federal holidays are pre-checked. Uncheck any that should count as a working day.
                    </p>
                  </div>

                  {suggestedHolidays.length === 0 && customHolidays.length === 0 ? (
                    <p className="text-xs text-cream-200/30 italic">No federal holidays detected in this period.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {suggestedHolidays.map(h => (
                        <label key={h.date} className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={h.checked}
                            onChange={e =>
                              setSuggestedHolidays(prev =>
                                prev.map(x => x.date === h.date ? { ...x, checked: e.target.checked } : x)
                              )
                            }
                            className="accent-gold-500 shrink-0"
                          />
                          <span className="text-sm text-cream-100">{formatDueDate(h.date)}</span>
                          <span className="text-xs text-cream-200/35">— {h.name}</span>
                        </label>
                      ))}
                      {customHolidays.map(d => (
                        <div key={d} className="flex items-center gap-2.5 pl-5">
                          <span className="text-sm text-cream-100">{formatDueDate(d)}</span>
                          <span className="text-xs text-cream-200/35">— custom</span>
                          <button
                            onClick={() => setCustomHolidays(prev => prev.filter(x => x !== d))}
                            className="ml-auto text-cream-200/30 hover:text-red-400 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add custom holiday date */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="date"
                      value={customHolidayDate}
                      onChange={e => setCustomHolidayDate(e.target.value)}
                      className="flex-1 bg-navy-700 border border-navy-500 rounded px-2.5 py-1.5 text-xs text-cream-100 focus:outline-none focus:border-gold-500/50 [color-scheme:dark]"
                    />
                    <button
                      onClick={() => {
                        if (
                          customHolidayDate &&
                          !customHolidays.includes(customHolidayDate) &&
                          !suggestedHolidays.find(h => h.date === customHolidayDate)
                        ) {
                          setCustomHolidays(prev => [...prev, customHolidayDate].sort())
                          setCustomHolidayDate('')
                        }
                      }}
                      disabled={!customHolidayDate}
                      className="shrink-0 px-3 py-1.5 text-xs bg-navy-600 border border-navy-500 text-cream-200/60 rounded hover:bg-navy-500 disabled:opacity-40 transition-colors"
                    >
                      Add date
                    </button>
                  </div>
                </div>
              )}

              {/* Schedule preview */}
              {taskPreviewForModal.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-cream-200/50 uppercase tracking-wider mb-2">
                    Schedule preview
                  </p>
                  <div className="bg-navy-700/40 rounded-lg divide-y divide-navy-600/40 max-h-44 overflow-y-auto">
                    {taskPreviewForModal.map((t, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2">
                        <span className="flex-1 text-xs text-cream-200/70 truncate min-w-0">{t.title}</span>
                        {t.oldDue ? (
                          <span className="shrink-0 text-xs font-mono whitespace-nowrap">
                            <span className="text-cream-200/30">{formatDueDate(t.oldDue)}</span>
                            <span className="text-cream-200/20 mx-1.5">→</span>
                            <span className="text-gold-400">{t.newDue ? formatDueDate(t.newDue) : '—'}</span>
                          </span>
                        ) : (
                          <span className="shrink-0 text-xs text-cream-200/20">no due date</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={closeAddMonthModal}
                className="flex-1 px-4 py-2 border border-navy-500 text-cream-200/70 rounded-lg text-sm hover:bg-navy-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addMonth}
                disabled={!newMonthYear || addingMonth}
                className="flex-1 px-4 py-2 bg-gold-500 text-navy-900 rounded-lg font-medium text-sm hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {addingMonth ? 'Creating…' : 'Create Month'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
