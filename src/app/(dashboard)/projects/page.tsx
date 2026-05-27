'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Project, Task, Meeting, ChatMessage } from '@/lib/types'
import { toast } from 'sonner'
import {
  Plus, X, FolderKanban, CheckCircle2, Circle, Trash2,
  ChevronDown, ChevronUp, CalendarDays, ArrowRight,
  Sparkles, Send, RotateCcw, BrainCircuit,
} from 'lucide-react'
import { formatDate, isOverdue, isDueSoon } from '@/lib/utils'
import FileAttachments from '@/components/FileAttachments'

const AREAS = ['Accounting', 'Finance', 'Audit', 'IT & Systems', 'Operations', 'HR', 'Other']
const EMPTY_FORM = { name: '', description: '', area: '', start_date: '', due_date: '' }
type ProjectTab = 'tasks' | 'meetings' | 'files' | 'ai'

type RichProject = Project & {
  tasks: Task[]
  meetings: Meeting[]
  ai_thread: ChatMessage[]
}

export default function ProjectsPage() {
  const supabase = createClient()
  const [projects, setProjects] = useState<RichProject[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [activeTabs, setActiveTabs] = useState<Record<string, ProjectTab>>({})
  const [newTaskText, setNewTaskText] = useState<Record<string, string>>({})

  // AI state
  const [aiInputs, setAiInputs] = useState<Record<string, string>>({})
  const [streamingFor, setStreamingFor] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const chatContainerRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => { load() }, [])

  // Auto-scroll chat to bottom when streaming
  useEffect(() => {
    if (streamingFor && chatContainerRefs.current[streamingFor]) {
      const el = chatContainerRefs.current[streamingFor]!
      el.scrollTop = el.scrollHeight
    }
  }, [streamingText, streamingFor])

  async function load() {
    const [{ data: projs }, { data: tasks }, { data: meetings }] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('tasks').select('*').order('created_at', { ascending: true }),
      supabase.from('meetings').select('*').order('meeting_date', { ascending: false }),
    ])

    const sorted = [...(projs ?? [])].sort((a, b) => {
      if (a.is_general) return -1
      if (b.is_general) return 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    const projectsWithData: RichProject[] = sorted.map((p: Project) => ({
      ...p,
      is_general: p.is_general ?? false,
      ai_thread: (p.ai_thread as ChatMessage[]) ?? [],
      tasks: (tasks ?? []).filter((t: Task) => t.project_id === p.id),
      meetings: (meetings ?? []).filter((m: Meeting) => m.project_id === p.id),
    }))
    setProjects(projectsWithData)
  }

  function openAdd() { setEditing(null); setForm(EMPTY_FORM); setShowModal(true) }

  function openEdit(p: Project) {
    setEditing(p)
    setForm({
      name: p.name,
      description: p.description ?? '',
      area: p.area ?? '',
      start_date: p.start_date ?? '',
      due_date: p.due_date ?? '',
    })
    setShowModal(true)
  }

  async function saveProject() {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      description: form.description || null,
      area: form.area || null,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      status: editing?.status ?? 'scoping',
      contact_id: null,
      value: null,
    }
    if (editing) {
      const { data, error } = await supabase.from('projects').update(payload).eq('id', editing.id).select().single()
      if (error) { toast.error('Failed to save'); setSaving(false); return }
      setProjects(prev => prev.map(p => p.id === editing.id
        ? { ...data, is_general: p.is_general, ai_thread: p.ai_thread, tasks: p.tasks, meetings: p.meetings }
        : p
      ))
      toast.success('Project updated')
    } else {
      const { data, error } = await supabase.from('projects').insert(payload).select().single()
      if (error) { toast.error('Failed to save'); setSaving(false); return }
      setProjects(prev => {
        const generalIdx = prev.findIndex(p => p.is_general)
        const newProj: RichProject = { ...data, is_general: false, ai_thread: [], tasks: [], meetings: [] }
        if (generalIdx >= 0) {
          const next = [...prev]
          next.splice(generalIdx + 1, 0, newProj)
          return next
        }
        return [newProj, ...prev]
      })
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

  // ── AI ─────────────────────────────────────────────────────────────────────

  async function sendAiMessage(projectId: string) {
    const input = (aiInputs[projectId] ?? '').trim()
    if (!input || streamingFor) return

    const project = projects.find(p => p.id === projectId)
    if (!project) return

    const userMsg: ChatMessage = { role: 'user', content: input }
    const updatedThread = [...project.ai_thread, userMsg]

    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, ai_thread: updatedThread } : p))
    setAiInputs(prev => ({ ...prev, [projectId]: '' }))
    setStreamingFor(projectId)
    setStreamingText('')

    await supabase.from('projects').update({ ai_thread: updatedThread }).eq('id', projectId)

    try {
      const res = await fetch('/api/projects/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedThread, projectId }),
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

      await supabase.from('projects').update({ ai_thread: finalThread }).eq('id', projectId)
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, ai_thread: finalThread } : p))
    } catch {
      toast.error('AI request failed')
    }

    setStreamingFor(null)
    setStreamingText('')
  }

  async function clearAiThread(projectId: string) {
    await supabase.from('projects').update({ ai_thread: [] }).eq('id', projectId)
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, ai_thread: [] } : p))
  }

  // ── Expand / Tab ───────────────────────────────────────────────────────────

  function toggleExpand(id: string, isGeneral: boolean) {
    setExpanded(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
    if (!activeTabs[id]) {
      setActiveTabs(prev => ({ ...prev, [id]: isGeneral ? 'ai' : 'tasks' }))
    }
  }

  function setTab(projectId: string, tab: ProjectTab) {
    setActiveTabs(prev => ({ ...prev, [projectId]: tab }))
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 w-full max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-cream-100 flex items-center gap-2">
          <FolderKanban className="w-5 h-5 text-gold-500" /> Projects
        </h1>
        <button onClick={openAdd} className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-400 text-navy-900 font-semibold text-sm px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> New Project
        </button>
      </div>

      <div className="space-y-4">
        {projects.length === 0 && <p className="text-cream-200/40 text-sm py-8 text-center">No projects yet.</p>}

        {projects.map(project => {
          const doneTasks = project.tasks.filter(t => t.status === 'done').length
          const pct = project.tasks.length ? Math.round((doneTasks / project.tasks.length) * 100) : 0
          const isOpen = expanded.has(project.id)
          const overdue = !project.is_general && isOverdue(project.due_date ?? undefined) && project.status !== 'delivered'
          const dueSoon = !project.is_general && isDueSoon(project.due_date ?? undefined) && !overdue
          const activeTab = activeTabs[project.id] ?? (project.is_general ? 'ai' : 'tasks')
          const isGenerating = streamingFor === project.id

          return (
            <div
              key={project.id}
              className={`bg-navy-800 border rounded-xl overflow-hidden transition-colors ${
                project.is_general
                  ? 'border-gold-500/30'
                  : overdue
                  ? 'border-red-500/40'
                  : dueSoon
                  ? 'border-gold-500/30'
                  : 'border-navy-600'
              }`}
            >
              {/* Project header row */}
              <div className="p-5 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {project.is_general
                      ? <BrainCircuit className="w-4 h-4 text-gold-400 shrink-0" />
                      : null
                    }
                    <h3 className={`text-sm font-bold ${project.is_general ? 'text-gold-400' : 'text-cream-100'}`}>
                      {project.name}
                    </h3>
                    {project.is_general && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold-500/15 text-gold-400 border border-gold-500/20">
                        AI Workspace
                      </span>
                    )}
                    {project.area && !project.is_general && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-navy-600 text-cream-200/60">{project.area}</span>
                    )}
                    {overdue && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Overdue</span>}
                  </div>

                  {project.is_general ? (
                    <p className="text-xs text-cream-200/40 mt-0.5">Brainstorm ideas, draft documents, or ask anything</p>
                  ) : (
                    <div className="flex items-center gap-3 mt-1 text-xs text-cream-200/40 flex-wrap">
                      {project.due_date && <span className={overdue ? 'text-red-400' : ''}>Due {formatDate(project.due_date)}</span>}
                      {project.meetings.length > 0 && (
                        <span className="flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />{project.meetings.length} meeting{project.meetings.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  )}

                  {!project.is_general && project.tasks.length > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-navy-600 rounded-full overflow-hidden">
                        <div className="h-full bg-gold-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-cream-200/40">{doneTasks}/{project.tasks.length}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {!project.is_general && (
                    <button onClick={() => openEdit(project)} className="text-xs text-cream-200/40 hover:text-cream-100 px-2 py-1 rounded hover:bg-navy-700 transition-colors">
                      Edit
                    </button>
                  )}
                  <button onClick={() => toggleExpand(project.id, project.is_general)} className="text-cream-200/40 hover:text-cream-100 p-1 rounded hover:bg-navy-700 transition-colors">
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Expanded panel */}
              {isOpen && (
                <div className="border-t border-navy-600">
                  {/* Tabs */}
                  <div className="flex border-b border-navy-600">
                    {!project.is_general && (
                      <>
                        <button
                          onClick={() => setTab(project.id, 'tasks')}
                          className={`px-5 py-2.5 text-sm font-medium transition-colors ${activeTab === 'tasks' ? 'text-gold-400 border-b-2 border-gold-500 -mb-px' : 'text-cream-200/50 hover:text-cream-100'}`}
                        >
                          Tasks {project.tasks.length > 0 && `(${doneTasks}/${project.tasks.length})`}
                        </button>
                        <button
                          onClick={() => setTab(project.id, 'meetings')}
                          className={`px-5 py-2.5 text-sm font-medium transition-colors ${activeTab === 'meetings' ? 'text-gold-400 border-b-2 border-gold-500 -mb-px' : 'text-cream-200/50 hover:text-cream-100'}`}
                        >
                          Meetings {project.meetings.length > 0 && `(${project.meetings.length})`}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setTab(project.id, 'files')}
                      className={`px-5 py-2.5 text-sm font-medium transition-colors ${activeTab === 'files' ? 'text-gold-400 border-b-2 border-gold-500 -mb-px' : 'text-cream-200/50 hover:text-cream-100'}`}
                    >
                      Files
                    </button>
                    <button
                      onClick={() => setTab(project.id, 'ai')}
                      className={`px-5 py-2.5 text-sm font-medium flex items-center gap-1.5 transition-colors ${activeTab === 'ai' ? 'text-gold-400 border-b-2 border-gold-500 -mb-px' : 'text-cream-200/50 hover:text-cream-100'}`}
                    >
                      <Sparkles className="w-3 h-3" />
                      {project.is_general ? 'AI Assistant' : 'AI'}
                      {project.ai_thread.length > 0 && (
                        <span className="text-[9px] bg-gold-500/20 text-gold-400 rounded-full px-1.5 py-0.5">
                          {Math.floor(project.ai_thread.length / 2)}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Tab content */}
                  <div>
                    {/* Tasks */}
                    {activeTab === 'tasks' && (
                      <div className="px-5 py-4">
                        {project.description && (
                          <p className="text-sm text-cream-200/60 mb-4">{project.description}</p>
                        )}
                        <ul className="space-y-1.5 mb-4">
                          {project.tasks.map(task => (
                            <li key={task.id} className="flex items-center gap-3 group py-1">
                              <button onClick={() => toggleTask(project.id, task)} className="shrink-0">
                                {task.status === 'done'
                                  ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                  : <Circle className="w-5 h-5 text-cream-200/30 hover:text-cream-200/60" />
                                }
                              </button>
                              <span className={`text-sm flex-1 ${task.status === 'done' ? 'line-through text-cream-200/30' : 'text-cream-100'}`}>{task.title}</span>
                              <button onClick={() => deleteTask(project.id, task.id)} className="opacity-0 group-hover:opacity-100 text-cream-200/30 hover:text-red-400 transition-all">
                                <Trash2 className="w-4 h-4" />
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
                            className="flex-1 bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none"
                          />
                          <button onClick={() => addTask(project.id)} className="text-sm bg-navy-600 hover:bg-navy-500 text-cream-100 rounded-lg px-4 py-2 transition-colors">Add</button>
                        </div>
                      </div>
                    )}

                    {/* Meetings */}
                    {activeTab === 'meetings' && (
                      <div className="px-5 py-4">
                        {project.meetings.length === 0 ? (
                          <p className="text-sm text-cream-200/40 py-2">No meetings linked to this project yet.</p>
                        ) : (
                          <ul className="space-y-3 mb-4">
                            {project.meetings.map(m => (
                              <li key={m.id} className="p-4 bg-navy-700 rounded-lg border border-navy-600">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-cream-100 truncate">{m.title}</p>
                                    <p className="text-xs text-cream-200/40 mt-1">
                                      {formatDate(m.meeting_date)}{m.meeting_time ? ` · ${m.meeting_time.slice(0, 5)}` : ''}
                                      {m.attendees?.length > 0 && ` · ${m.attendees.map((a) => a.name).join(', ')}`}
                                    </p>
                                  </div>
                                  {m.summary && <span className="text-xs text-emerald-400 shrink-0">✓ AI</span>}
                                </div>
                                {m.summary && (
                                  <p className="text-sm text-cream-200/50 mt-2 line-clamp-2">{m.summary}</p>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        <a href="/meetings" className="flex items-center gap-1.5 text-sm text-gold-400 hover:text-gold-300 transition-colors">
                          <ArrowRight className="w-4 h-4" /> Add or view meetings in Meetings module
                        </a>
                      </div>
                    )}

                    {/* Files */}
                    {activeTab === 'files' && (
                      <div className="px-5 py-4">
                        <FileAttachments entityType="project" entityId={project.id} />
                      </div>
                    )}

                    {/* AI Chat */}
                    {activeTab === 'ai' && (
                      <div className="flex flex-col" style={{ height: '540px' }}>
                        {/* Messages */}
                        <div
                          ref={el => { chatContainerRefs.current[project.id] = el }}
                          className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
                        >
                          {project.ai_thread.length === 0 && !isGenerating ? (
                            <div className="flex flex-col items-center justify-center h-full text-center text-cream-200/30 py-8">
                              <Sparkles className="w-10 h-10 mb-4 text-gold-500/20" />
                              {project.is_general ? (
                                <>
                                  <p className="text-base font-medium text-cream-200/50">General AI Workspace</p>
                                  <p className="text-sm mt-1.5">Ask anything — finance questions, draft documents, brainstorm ideas</p>
                                </>
                              ) : (
                                <>
                                  <p className="text-base font-medium text-cream-200/50">Project AI Assistant</p>
                                  <p className="text-sm mt-1.5">Brainstorm approaches, identify risks, draft communications</p>
                                </>
                              )}
                            </div>
                          ) : (
                            <>
                              {project.ai_thread.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                                    msg.role === 'user'
                                      ? 'bg-gold-500/15 text-cream-100 border border-gold-500/20'
                                      : 'bg-navy-700 text-cream-200/90 border border-navy-600'
                                  }`}>
                                    {msg.content}
                                  </div>
                                </div>
                              ))}
                              {isGenerating && streamingText && (
                                <div className="flex justify-start">
                                  <div className="max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap bg-navy-700 text-cream-200/90 border border-navy-600">
                                    {streamingText}
                                    <span className="inline-block w-1.5 h-3.5 bg-gold-400 ml-0.5 animate-pulse rounded-sm" />
                                  </div>
                                </div>
                              )}
                              {isGenerating && !streamingText && (
                                <div className="flex justify-start">
                                  <div className="bg-navy-700 border border-navy-600 rounded-xl px-4 py-3 text-sm text-cream-200/40">
                                    Thinking…
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* Input bar */}
                        <div className="px-5 pb-4 pt-3 border-t border-navy-600">
                          <div className="flex gap-2">
                            <input
                              value={aiInputs[project.id] ?? ''}
                              onChange={e => setAiInputs(prev => ({ ...prev, [project.id]: e.target.value }))}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault()
                                  sendAiMessage(project.id)
                                }
                              }}
                              placeholder={project.is_general ? 'Ask anything…' : 'Brainstorm, draft, or ask about this project…'}
                              disabled={isGenerating}
                              className="flex-1 bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-4 py-2.5 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none disabled:opacity-50"
                            />
                            <button
                              onClick={() => sendAiMessage(project.id)}
                              disabled={isGenerating || !(aiInputs[project.id]?.trim())}
                              className="bg-gold-500 hover:bg-gold-400 text-navy-900 px-4 py-2.5 rounded-lg disabled:opacity-40 transition-colors"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          </div>
                          {project.ai_thread.length > 0 && (
                            <button
                              onClick={() => clearAiThread(project.id)}
                              className="flex items-center gap-1 text-xs text-cream-200/25 hover:text-cream-200/50 mt-2 transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" /> Clear conversation
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add / Edit Modal */}
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
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Q4 Audit Preparation"
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Area</label>
                  <select value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
                    className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2">
                    <option value="">— None —</option>
                    {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Due Date</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 [color-scheme:dark]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Start Date</label>
                <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 [color-scheme:dark]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3}
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none resize-none"
                  placeholder="Scope, objectives, notes…" />
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
