import { createClient } from '@/lib/supabase/server'
import { Clock, FolderKanban, CalendarDays, Lightbulb, ArrowRight, Circle } from 'lucide-react'
import { formatDate, isDueSoon, isOverdue } from '@/lib/utils'
import { Idea, Project, MonthlyTask } from '@/lib/types'
import Link from 'next/link'

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
  const todayStr = new Date().toISOString().split('T')[0]
  const nextWeekDate = new Date()
  nextWeekDate.setDate(nextWeekDate.getDate() + 7)
  const nextWeekStr = nextWeekDate.toISOString().split('T')[0]

  const [
    { data: ideas },
    { data: projects },
    { data: closeTasks },
    { data: upcomingMeetings },
  ] = await Promise.all([
    supabase.from('ideas').select('*').order('created_at', { ascending: false }),
    supabase.from('projects').select('id, name, status, due_date, area').order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('monthly_tasks').select('*').eq('month_year', activeMonthStr).order('sort_order', { ascending: true }),
    supabase.from('meetings').select('id, title, meeting_date, meeting_time, type').gte('meeting_date', todayStr).neq('status', 'cancelled').order('meeting_date', { ascending: true }).limit(5),
  ])

  const totalClose = (closeTasks ?? []).length
  const doneClose = (closeTasks ?? []).filter((t: MonthlyTask) => t.completed).length
  const closePct = totalClose > 0 ? Math.round((doneClose / totalClose) * 100) : 0
  const openIdeas = (ideas ?? []).filter((i: Idea) => ['raw', 'exploring'].includes(i.status)).length
  const openProjects = (projects ?? []).filter((p: Project) => p.status !== 'delivered').length
  const meetingsThisWeek = (upcomingMeetings ?? []).filter((m: { meeting_date: string }) => m.meeting_date <= nextWeekStr).length
  const dueSoonProjects = (projects ?? []).filter((p: Project) => (isDueSoon(p.due_date ?? undefined) || isOverdue(p.due_date ?? undefined)) && p.status !== 'delivered')
  const recentIdeas = (ideas ?? []).slice(0, 5)
  const pendingCloseTasks = (closeTasks ?? []).filter((t: MonthlyTask) => !t.completed).slice(0, 5)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-cream-100">{greeting}, Jon</h1>
        <p className="text-cream-200/50 text-sm mt-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Link href="/monthly-tasks">
          <StatCard
            label={`${formatMonthYear(activeMonthStr)} Close`}
            value={totalClose > 0 ? `${doneClose}/${totalClose}` : '—'}
            sub={totalClose > 0 ? `${closePct}% complete` : 'No tasks yet'}
            color="text-blue-400"
            pct={totalClose > 0 ? closePct : null}
          />
        </Link>
        <Link href="/projects">
          <StatCard label="Open Projects" value={String(openProjects)} color="text-gold-400" />
        </Link>
        <Link href="/meetings">
          <StatCard label="Meetings This Week" value={String(meetingsThisWeek)} color="text-purple-400" />
        </Link>
        <Link href="/ideas">
          <StatCard label="Open Ideas" value={String(openIdeas)} color="text-yellow-400" />
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Active Close */}
        <section className="bg-navy-800 border border-navy-600 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-cream-200/70 uppercase tracking-wider">
              {formatMonthYear(activeMonthStr)} Close
            </h2>
            <Link href="/monthly-tasks" className="text-[10px] text-gold-400 hover:text-gold-300 flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {totalClose === 0 ? (
            <p className="text-cream-200/40 text-sm">No close tasks yet.{' '}
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
              <ul className="space-y-2">
                {pendingCloseTasks.map((task: MonthlyTask) => (
                  <li key={task.id} className="flex items-center gap-2.5">
                    <Circle className="w-3.5 h-3.5 text-cream-200/30 shrink-0" />
                    <span className="text-sm text-cream-100 flex-1 truncate">{task.title}</span>
                    {task.due_date && <span className="text-[10px] text-gold-400/70 shrink-0">{formatDate(task.due_date)}</span>}
                  </li>
                ))}
                {(closeTasks ?? []).filter((t: MonthlyTask) => !t.completed).length > 5 && (
                  <li className="text-[10px] text-cream-200/30 pl-6">
                    +{(closeTasks ?? []).filter((t: MonthlyTask) => !t.completed).length - 5} more pending
                  </li>
                )}
              </ul>
            </>
          )}
        </section>

        {/* Upcoming Meetings */}
        <section className="bg-navy-800 border border-navy-600 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-cream-200/70 uppercase tracking-wider">Upcoming Meetings</h2>
            <Link href="/meetings" className="text-[10px] text-gold-400 hover:text-gold-300 flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {(upcomingMeetings ?? []).length === 0 ? (
            <p className="text-cream-200/40 text-sm">No upcoming meetings scheduled.</p>
          ) : (
            <ul className="divide-y divide-navy-600">
              {(upcomingMeetings ?? []).map((m: { id: string; title: string; meeting_date: string; meeting_time: string | null }) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <CalendarDays className="w-3.5 h-3.5 text-gold-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-cream-100 truncate">{m.title}</p>
                    <p className="text-[10px] text-cream-200/40">{formatDate(m.meeting_date)}{m.meeting_time ? ` · ${m.meeting_time.slice(0, 5)}` : ''}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Projects Due Soon */}
        <section className="bg-navy-800 border border-navy-600 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-cream-200/70 uppercase tracking-wider">Projects Due Soon</h2>
            <Link href="/projects" className="text-[10px] text-gold-400 hover:text-gold-300 flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {dueSoonProjects.length === 0 ? (
            <p className="text-cream-200/40 text-sm">No projects due in the next 7 days.</p>
          ) : (
            <ul className="divide-y divide-navy-600">
              {dueSoonProjects.map((p: Project) => {
                const overdue = isOverdue(p.due_date ?? undefined)
                return (
                  <li key={p.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <Clock className={`w-3.5 h-3.5 shrink-0 ${overdue ? 'text-red-400' : 'text-gold-500'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-cream-100 truncate">{p.name}</p>
                      {p.area && <p className="text-[10px] text-cream-200/40">{p.area}</p>}
                    </div>
                    <span className={`text-xs shrink-0 ${overdue ? 'text-red-400' : 'text-cream-200/40'}`}>
                      {formatDate(p.due_date ?? undefined)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Recent Ideas */}
        <section className="bg-navy-800 border border-navy-600 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-cream-200/70 uppercase tracking-wider">Recent Ideas</h2>
            <Link href="/ideas" className="text-[10px] text-gold-400 hover:text-gold-300 flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {recentIdeas.length === 0 ? (
            <p className="text-cream-200/40 text-sm">No ideas yet. Head to Idea Lab to start capturing.</p>
          ) : (
            <ul className="divide-y divide-navy-600">
              {recentIdeas.map((idea: Idea) => (
                <li key={idea.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${ideaStatusColor(idea.status)}`} />
                  <div className="min-w-0">
                    <p className="text-sm text-cream-100 truncate">{idea.title}</p>
                    <p className="text-[10px] text-cream-200/40">{formatDate(idea.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, color, pct }: {
  label: string; value: string; sub?: string; color: string; pct?: number | null
}) {
  return (
    <div className="bg-navy-800 border border-navy-600 rounded-xl p-5 hover:border-navy-500 transition-colors cursor-pointer h-full">
      <p className="text-xs font-medium text-cream-200/50 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-cream-200/40 mt-1">{sub}</p>}
      {pct !== null && pct !== undefined && (
        <div className="mt-2 h-1 bg-navy-600 rounded-full overflow-hidden">
          <div className="h-full bg-gold-500/60 rounded-full" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

function ideaStatusColor(status: string) {
  return { raw: 'bg-cream-200/30', exploring: 'bg-blue-400', 'in-progress': 'bg-gold-500', implemented: 'bg-emerald-400', shelved: 'bg-navy-500' }[status] ?? 'bg-navy-500'
}
