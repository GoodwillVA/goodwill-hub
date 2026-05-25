import { createClient } from '@/lib/supabase/server'
import { Lightbulb, Users, DollarSign, FileText, AlertCircle, Clock } from 'lucide-react'
import { formatCurrency, formatDate, isOverdue, isDueSoon } from '@/lib/utils'
import { Contact, Idea, Project } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = await createClient()

  const [
    { data: ideas },
    { data: contacts },
    { data: projects },
    { data: content },
  ] = await Promise.all([
    supabase.from('ideas').select('*').order('created_at', { ascending: false }),
    supabase.from('contacts').select('*').order('next_followup', { ascending: true, nullsFirst: false }),
    supabase.from('projects').select('*, contact:contacts(name,company)').order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('content_items').select('*').order('publish_date', { ascending: true, nullsFirst: false }),
  ])

  const activeClients = (contacts ?? []).filter((c: Contact) => c.stage === 'active').length
  const pipelineValue = (contacts ?? [])
    .filter((c: Contact) => ['discovery', 'proposal', 'active'].includes(c.stage))
    .reduce((sum: number, c: Contact) => sum + (c.proposal_value ?? 0), 0)
  const openIdeas = (ideas ?? []).filter((i: Idea) => ['raw', 'exploring'].includes(i.status)).length
  const contentQueue = (content ?? []).filter((c: { status: string }) => ['idea', 'draft', 'scheduled'].includes(c.status)).length

  const overdueFollowups = (contacts ?? []).filter((c: Contact) => isOverdue(c.next_followup ?? undefined))
  const soonFollowups = (contacts ?? []).filter((c: Contact) => isDueSoon(c.next_followup ?? undefined) && !isOverdue(c.next_followup ?? undefined))
  const dueSoonProjects = (projects ?? []).filter((p: Project) => isDueSoon(p.due_date ?? undefined))
  const recentIdeas = (ideas ?? []).slice(0, 4)

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
        <StatCard icon={Users} label="Active Clients" value={String(activeClients)} color="text-blue-400" />
        <StatCard icon={DollarSign} label="Pipeline Value" value={formatCurrency(pipelineValue)} color="text-gold-500" />
        <StatCard icon={Lightbulb} label="Open Ideas" value={String(openIdeas)} color="text-yellow-400" />
        <StatCard icon={FileText} label="Content Queue" value={String(contentQueue)} color="text-emerald-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Follow-ups */}
        <section className="bg-navy-800 border border-navy-600 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-cream-200/70 uppercase tracking-wider mb-4">Follow-ups</h2>
          {overdueFollowups.length === 0 && soonFollowups.length === 0 ? (
            <p className="text-cream-200/40 text-sm">No follow-ups due.</p>
          ) : (
            <ul className="space-y-2">
              {overdueFollowups.map((c: Contact) => (
                <FollowUpRow key={c.id} contact={c} overdue />
              ))}
              {soonFollowups.map((c: Contact) => (
                <FollowUpRow key={c.id} contact={c} />
              ))}
            </ul>
          )}
        </section>

        {/* Recent Ideas */}
        <section className="bg-navy-800 border border-navy-600 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-cream-200/70 uppercase tracking-wider mb-4">Recent Ideas</h2>
          {recentIdeas.length === 0 ? (
            <p className="text-cream-200/40 text-sm">No ideas yet. Head to Idea Lab to start capturing.</p>
          ) : (
            <ul className="space-y-2">
              {recentIdeas.map((idea: Idea) => (
                <li key={idea.id} className="flex items-start gap-3 py-2 border-b border-navy-600 last:border-0">
                  <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${ideaStatusColor(idea.status)}`} />
                  <div className="min-w-0">
                    <p className="text-sm text-cream-100 truncate">{idea.title}</p>
                    <p className="text-xs text-cream-200/40">{formatDate(idea.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Projects due soon */}
        <section className="bg-navy-800 border border-navy-600 rounded-xl p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-cream-200/70 uppercase tracking-wider mb-4">Projects Due This Week</h2>
          {dueSoonProjects.length === 0 ? (
            <p className="text-cream-200/40 text-sm">No projects due in the next 7 days.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {dueSoonProjects.map((p: Project & { contact?: { name: string; company: string | null } }) => (
                <div key={p.id} className="flex items-center gap-3 p-3 bg-navy-700 rounded-lg border border-navy-500">
                  <Clock className="w-4 h-4 text-gold-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-cream-100 font-medium truncate">{p.name}</p>
                    <p className="text-xs text-cream-200/40">
                      {p.contact ? `${p.contact.name} · ` : ''}{formatDate(p.due_date)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div className="bg-navy-800 border border-navy-600 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-cream-200/50 uppercase tracking-wider">{label}</p>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className="text-2xl font-bold text-cream-100">{value}</p>
    </div>
  )
}

function FollowUpRow({ contact, overdue }: { contact: Contact; overdue?: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2 border-b border-navy-600 last:border-0">
      {overdue ? (
        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
      ) : (
        <Clock className="w-4 h-4 text-gold-500 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-cream-100 font-medium truncate">{contact.name}</p>
        <p className="text-xs text-cream-200/40">{contact.company}</p>
      </div>
      <span className={`text-xs font-medium ${overdue ? 'text-red-400' : 'text-gold-400'}`}>
        {formatDate(contact.next_followup ?? undefined)}
      </span>
    </li>
  )
}

function ideaStatusColor(status: string) {
  return { raw: 'bg-cream-200/30', exploring: 'bg-blue-400', 'in-progress': 'bg-gold-500', implemented: 'bg-emerald-400', shelved: 'bg-navy-500' }[status] ?? 'bg-navy-500'
}
