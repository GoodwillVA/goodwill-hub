'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Project, Task, Contact, ProjectStatus } from '@/lib/types'
import { toast } from 'sonner'
import { Plus, X, FolderKanban, CheckCircle2, Circle, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { formatCurrency, formatDate, isOverdue, isDueSoon } from '@/lib/utils'

const STATUSES: { value: ProjectStatus; label: string; color: string }[] = [
  { value: 'scoping', label: 'Scoping', color: 'bg-blue-500/20 text-blue-300' },
  { value: 'in-progress', label: 'In Progress', color: 'bg-gold-500/20 text-gold-400' },
  { value: 'review', label: 'In Review', color: 'bg-purple-500/20 text-purple-300' },
  { value: 'delivered', label: 'Delivered', color: 'bg-emerald-500/20 text-emerald-400' },
]

const EMPTY_FORM = { name: '', description: '', contact_id: '', status: 'scoping' as ProjectStatus, start_date: '', due_date: '', value: '' }

export default function ProjectsPage() {
  const supabase = createClient()
  const [projects, setProjects] = useState<(Project & { tasks: Task[]; contact: Contact | null })[]>([])
  const [contacts, setContacts] = useState<Pick<Contact, 'id' | 'name' | 'company'>[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [newTaskText, setNewTaskText] = useState<Record<string, string>>({})

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: projs }, { data: tasks }, { data: conts }] = await Promise.all([
      supabase.from('projects').select('*, contact:contacts(*)').order('created_at', { ascending: false }),
      supabase.from('tasks').select('*').order('created_at', { ascending: true }),
      supabase.from('contacts').select('id,name,company').order('name'),
    ])
    const projectsWithTasks = (projs ?? []).map((p: Project & { contact: Contact | null }) => ({
      ...p,
      tasks: (tasks ?? []).filter((t: Task) => t.project_id === p.id),
    }))
    setProjects(projectsWithTasks)
    setContacts(conts ?? [])
  }

  function openAdd() { setEditing(null); setForm(EMPTY_FORM); setShowModal(true) }
  function openEdit(p: Project) {
    setEditing(p)
    setForm({
      name: p.name, description: p.description ?? '', contact_id: p.contact_id ?? '',
      status: p.status, start_date: p.start_date ?? '', due_date: p.due_date ?? '',
      value: p.value != null ? String(p.value) : '',
    })
    setShowModal(true)
  }

  async function saveProject() {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      description: form.description || null,
      contact_id: form.contact_id || null,
      status: form.status,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      value: form.value ? parseFloat(form.value) : null,
    }
    if (editing) {
      const { data, error } = await supabase.from('projects').update(payload).eq('id', editing.id).select('*, contact:contacts(*)').single()
      if (error) { toast.error('Failed to save'); setSaving(false); return }
      setProjects(prev => prev.map(p => p.id === editing.id ? { ...data, tasks: p.tasks } : p))
      toast.success('Project updated')
    } else {
      const { data, error } = await supabase.from('projects').insert(payload).select('*, contact:contacts(*)').single()
      if (error) { toast.error('Failed to save'); setSaving(false); return }
      setProjects(prev => [{ ...data, tasks: [] }, ...prev])
      toast.success('Project created')
    }
    setSaving(false)
    setShowModal(false)
  }

  async function deleteProject(id: string) {
    await supabase.from('projects').delete().eq('id', id)
    setProjects(prev => prev.filter(p => p.id !== id))
    toast.success('Project deleted')
  }

  async function addTask(projectId: string) {
    const text = newTaskText[projectId]?.trim()
    if (!text) return
    const { data, error } = await supabase.from('tasks').insert({ project_id: projectId, title: text }).select().single()
    if (error) { toast.error('Failed to add task'); return }
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, tasks: [...p.tasks, data] } : p))
    setNewTaskText(prev => ({ ...prev, [projectId]: '' }))
  }

  async function toggleTask(projectId: string, task: Task) {
    const newStatus = task.status === 'done' ? 'todo' : 'done'
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id)
    setProjects(prev => prev.map(p => p.id === projectId
      ? { ...p, tasks: p.tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t) }
      : p
    ))
  }

  async function deleteTask(projectId: string, taskId: string) {
    await supabase.from('tasks').delete().eq('id', taskId)
    setProjects(prev => prev.map(p => p.id === projectId
      ? { ...p, tasks: p.tasks.filter(t => t.id !== taskId) }
      : p
    ))
  }

  function toggleExpand(id: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  const statusObj = (s: ProjectStatus) => STATUSES.find(x => x.value === s)!

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-cream-100 flex items-center gap-2"><FolderKanban className="w-5 h-5 text-gold-500" /> Projects</h1>
        <button onClick={openAdd} className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-400 text-navy-900 font-semibold text-sm px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> New Project
        </button>
      </div>

      <div className="space-y-3">
        {projects.length === 0 && <p className="text-cream-200/40 text-sm py-8 text-center">No projects yet.</p>}
        {projects.map(project => {
          const doneTasks = project.tasks.filter(t => t.status === 'done').length
          const pct = project.tasks.length ? Math.round((doneTasks / project.tasks.length) * 100) : 0
          const isOpen = expanded.has(project.id)
          const dueSoon = isDueSoon(project.due_date ?? undefined)
          const overdue = isOverdue(project.due_date ?? undefined) && project.status !== 'delivered'

          return (
            <div key={project.id} className={`bg-navy-800 border rounded-xl overflow-hidden ${overdue ? 'border-red-500/40' : dueSoon ? 'border-gold-500/30' : 'border-navy-600'}`}>
              <div className="p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-cream-100">{project.name}</h3>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusObj(project.status).color}`}>{statusObj(project.status).label}</span>
                    {overdue && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Overdue</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-cream-200/40 flex-wrap">
                    {project.contact && <span>{(project.contact as Contact).name}</span>}
                    {project.value && <span className="text-gold-400/70">{formatCurrency(project.value)}</span>}
                    {project.due_date && <span className={overdue ? 'text-red-400' : ''}>Due {formatDate(project.due_date)}</span>}
                  </div>
                  {project.tasks.length > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-navy-600 rounded-full overflow-hidden">
                        <div className="h-full bg-gold-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-cream-200/40">{doneTasks}/{project.tasks.length}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(project)} className="text-xs text-cream-200/40 hover:text-cream-100 px-2 py-1 rounded hover:bg-navy-700 transition-colors">Edit</button>
                  <button onClick={() => toggleExpand(project.id)} className="text-cream-200/40 hover:text-cream-100 p-1 rounded hover:bg-navy-700 transition-colors">
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-navy-600 px-4 py-3">
                  {project.description && <p className="text-sm text-cream-200/60 mb-3">{project.description}</p>}
                  <ul className="space-y-1 mb-3">
                    {project.tasks.map(task => (
                      <li key={task.id} className="flex items-center gap-2 group">
                        <button onClick={() => toggleTask(project.id, task)} className="shrink-0">
                          {task.status === 'done'
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            : <Circle className="w-4 h-4 text-cream-200/30 hover:text-cream-200/60" />
                          }
                        </button>
                        <span className={`text-sm flex-1 ${task.status === 'done' ? 'line-through text-cream-200/30' : 'text-cream-100'}`}>{task.title}</span>
                        <button onClick={() => deleteTask(project.id, task.id)} className="opacity-0 group-hover:opacity-100 text-cream-200/30 hover:text-red-400 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <input
                      value={newTaskText[project.id] ?? ''}
                      onChange={e => setNewTaskText(prev => ({ ...prev, [project.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addTask(project.id)}
                      placeholder="Add a task…"
                      className="flex-1 bg-navy-700 border border-navy-600 rounded-lg text-xs text-cream-100 px-3 py-1.5 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none"
                    />
                    <button onClick={() => addTask(project.id)} className="text-xs bg-navy-600 hover:bg-navy-500 text-cream-100 rounded-lg px-3 py-1.5 transition-colors">Add</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-navy-800 border border-navy-600 rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-navy-600">
              <h2 className="font-bold text-cream-100">{editing ? 'Edit Project' : 'New Project'}</h2>
              <button onClick={() => setShowModal(false)}><X className="w-4 h-4 text-cream-200/50" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Workflow Automation Engagement"
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Client</label>
                  <select value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}
                    className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2">
                    <option value="">— None —</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as ProjectStatus }))}
                    className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2">
                    {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Due Date</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Value $</label>
                  <input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="5000"
                    className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/30" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none resize-none"
                  placeholder="Scope, deliverables…" />
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              {editing && <button onClick={() => { deleteProject(editing.id); setShowModal(false) }} className="text-xs text-red-400 hover:text-red-300 transition-colors mr-auto">Delete</button>}
              <button onClick={() => setShowModal(false)} className="flex-1 bg-navy-700 hover:bg-navy-600 text-cream-100 text-sm font-medium rounded-lg py-2.5 transition-colors">Cancel</button>
              <button onClick={saveProject} disabled={saving} className="flex-1 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-900 text-sm font-semibold rounded-lg py-2.5 transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
