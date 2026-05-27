'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MonthlyTask } from '@/lib/types'
import {
  Plus, Check, ChevronDown, ChevronRight,
  RefreshCw, Trash2, Calendar, X, Copy,
} from 'lucide-react'

// Active close month: day >= 20 = current month, else previous month
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
    // Incomplete tasks first
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    // Within each group: sort by due date ascending, nulls at end
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

  // Add Month modal
  const [showAddMonth, setShowAddMonth] = useState(false)
  const [newMonthYear, setNewMonthYear] = useState('')
  const [copyRecurring, setCopyRecurring] = useState(true)
  const [addingMonth, setAddingMonth] = useState(false)

  useEffect(() => { loadTasks() }, [])

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
      // Ensure month stays in list
      if (!months.includes(monthYear)) {
        setMonths(prev => [monthYear, ...prev].sort((a, b) => b.localeCompare(a)))
      }
    }
  }

  async function addMonth() {
    if (!newMonthYear || addingMonth) return
    setAddingMonth(true)

    if (copyRecurring) {
      const prevMonth = getPreviousMonthStr(newMonthYear)
      const recurring = (tasksByMonth[prevMonth] ?? []).filter(t => t.is_recurring)
      if (recurring.length > 0) {
        const { data, error } = await supabase
          .from('monthly_tasks')
          .insert(recurring.map((t, i) => ({
            month_year: newMonthYear,
            title: t.title,
            due_date: null,
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
    setShowAddMonth(false)
    setNewMonthYear('')
    setCopyRecurring(true)
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
              <button
                className="w-full flex items-center gap-3 p-5 text-left"
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
                  <p className="text-xs text-cream-200/35 mt-0.5">
                    {total === 0 ? 'No tasks yet' : `${completed}/${total} complete · ${pct}%`}
                  </p>
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
                    <ul className={`space-y-1 ${isActive && total > 0 ? '' : 'pt-5'} mb-4`}>
                      {sortTasks(tasks).map(task => (
                        <li
                          key={task.id}
                          className={`group flex items-center gap-3 py-3 px-3 rounded-lg transition-colors ${
                            task.completed ? '' : 'hover:bg-navy-700/50'
                          }`}
                        >
                          {/* Checkbox */}
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

                          {/* Title */}
                          <span className={`flex-1 text-sm min-w-0 ${
                            task.completed ? 'line-through text-cream-200/35' : 'text-cream-100'
                          }`}>
                            {task.title}
                          </span>

                          {/* Due date */}
                          {task.due_date && (
                            <span className={`text-xs shrink-0 ${
                              !task.completed && isOverdue(task.due_date)
                                ? 'text-red-400 font-medium'
                                : 'text-cream-200/35'
                            }`}>
                              {formatDueDate(task.due_date)}
                            </span>
                          )}

                          {/* Completion date — shown when checked, hidden when unchecked */}
                          {task.completed && task.completed_at && (
                            <span className="text-xs text-emerald-400/60 shrink-0">
                              ✓ {formatCompletedAt(task.completed_at)}
                            </span>
                          )}

                          {/* Recurring toggle — always visible if set, hover-only if not */}
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

                          {/* Delete */}
                          <button
                            onClick={() => deleteTask(task)}
                            className="shrink-0 text-cream-200/0 group-hover:text-cream-200/25 hover:!text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* Add Month modal */}
      {showAddMonth && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-navy-800 border border-navy-600 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-cream-100">Add Month</h2>
              <button onClick={() => { setShowAddMonth(false); setNewMonthYear('') }} className="text-cream-200/40 hover:text-cream-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
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

              {/* Copy recurring option — only shown when previous month has recurring tasks */}
              {(() => {
                if (!newMonthYear) return null
                const prevMonth = getPreviousMonthStr(newMonthYear)
                const recurringCount = (tasksByMonth[prevMonth] ?? []).filter(t => t.is_recurring).length
                if (recurringCount === 0) return null
                return (
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
                        {recurringCount} recurring task{recurringCount !== 1 ? 's' : ''} from {formatMonthYear(prevMonth)} will be added
                      </p>
                    </div>
                  </label>
                )
              })()}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowAddMonth(false); setNewMonthYear('') }}
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
