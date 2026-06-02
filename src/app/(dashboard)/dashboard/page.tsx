import { createClient } from '@/lib/supabase/server'
import { ArrowRight } from 'lucide-react'
import { MonthlyTask } from '@/lib/types'
import Link from 'next/link'
import DayView from './DayView'
import CloseTaskList from './CloseTaskList'
import WeekCalendar from './WeekCalendar'

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

export default async function DashboardPage() {
  const supabase = await createClient()
  const activeMonthStr = getActiveCloseMonthStr()

  const { data: closeTasks } = await supabase
    .from('monthly_tasks')
    .select('*')
    .eq('month_year', activeMonthStr)
    .order('sort_order', { ascending: true })

  const totalClose = (closeTasks ?? []).length
  const doneClose = (closeTasks ?? []).filter((t: MonthlyTask) => t.completed).length
  const closePct = totalClose > 0 ? Math.round((doneClose / totalClose) * 100) : 0

  const pendingCloseTasks = (closeTasks ?? [])
    .filter((t: MonthlyTask) => !t.completed)
    .sort((a: MonthlyTask, b: MonthlyTask) => {
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date.localeCompare(b.due_date)
    })

  const easternHour = parseInt(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }).format(new Date())
  )
  const greeting = easternHour < 12 ? 'Good morning' : easternHour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="p-8 w-full">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-cream-100">{greeting}, Jon</h1>
        <p className="text-cream-200/50 text-sm mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* 3-Day Focus View */}
      <DayView />

      {/* Calendar + Close sidebar */}
      <div className="flex gap-6 items-start">

        {/* Calendar — takes remaining width */}
        <div className="flex-1 min-w-0">
          <WeekCalendar />
        </div>

        {/* Close sidebar */}
        <div className="w-[22rem] shrink-0 flex flex-col gap-4 sticky top-8">

          {/* Stat card */}
          <Link href="/monthly-tasks">
            <div className="bg-navy-800 border border-navy-600 rounded-xl p-5 hover:border-navy-500 transition-colors cursor-pointer">
              <p className="text-xs font-medium text-cream-200/50 uppercase tracking-wider mb-2">
                {formatMonthYear(activeMonthStr)} Close
              </p>
              <p className="text-3xl font-bold text-blue-400">
                {totalClose > 0 ? `${doneClose}/${totalClose}` : '—'}
              </p>
              <p className="text-[11px] text-cream-200/40 mt-1">
                {totalClose > 0 ? `${closePct}% complete` : 'No tasks yet'}
              </p>
              {totalClose > 0 && (
                <div className="mt-3 h-1.5 bg-navy-600 rounded-full overflow-hidden">
                  <div className="h-full bg-gold-500/60 rounded-full transition-all" style={{ width: `${closePct}%` }} />
                </div>
              )}
            </div>
          </Link>

          {/* Task list */}
          <section className="bg-navy-800 border border-navy-600 rounded-xl p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-cream-200/70 uppercase tracking-wider">Pending Tasks</h2>
              <Link href="/monthly-tasks" className="text-[10px] text-gold-400 hover:text-gold-300 flex items-center gap-1 transition-colors">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {totalClose === 0 ? (
              <p className="text-cream-200/40 text-sm">
                No close tasks yet.{' '}
                <Link href="/monthly-tasks" className="text-gold-400 hover:underline">Add tasks →</Link>
              </p>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-2 bg-navy-600 rounded-full overflow-hidden">
                    <div className="h-full bg-gold-500 rounded-full transition-all" style={{ width: `${closePct}%` }} />
                  </div>
                  <span className="text-xs text-cream-200/60 shrink-0">{doneClose}/{totalClose}</span>
                </div>
                <div className="overflow-y-auto max-h-[60vh]">
                  <CloseTaskList tasks={pendingCloseTasks} extraCount={0} />
                </div>
              </>
            )}
          </section>

        </div>
      </div>
    </div>
  )
}
