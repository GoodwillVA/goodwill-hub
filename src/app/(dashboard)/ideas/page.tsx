'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Idea, IdeaCategory, IdeaStatus, ChatMessage } from '@/lib/types'
import { toast } from 'sonner'
import { Plus, Lightbulb, Send, Trash2, ChevronRight, Sparkles, FolderKanban, CheckSquare, Square, Archive, X } from 'lucide-react'
import { formatDate } from '@/lib/utils'

const CATEGORIES: { value: IdeaCategory; label: string }[] = [
  { value: 'process-improvement', label: 'Process Improvement' },
  { value: 'reporting', label: 'Reporting & Analytics' },
  { value: 'controls', label: 'Internal Controls' },
  { value: 'technology', label: 'Technology & Systems' },
  { value: 'team', label: 'Team & Training' },
  { value: 'other', label: 'Other' },
]

const STATUSES: { value: IdeaStatus; label: string; color: string }[] = [
  { value: 'raw', label: 'Raw', color: 'bg-cream-200/20 text-cream-200/60' },
  { value: 'exploring', label: 'Exploring', color: 'bg-blue-500/20 text-blue-300' },
  { value: 'in-progress', label: 'In Progress', color: 'bg-gold-500/20 text-gold-400' },
  { value: 'implemented', label: 'Implemented', color: 'bg-emerald-500/20 text-emerald-400' },
  { value: 'shelved', label: 'Shelved', color: 'bg-navy-600/60 text-cream-200/30' },
]

export default function IdeasPage() {
  const supabase = createClient()
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [selected, setSelected] = useState<Idea | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [filterStatus, setFilterStatus] = useState<IdeaStatus | 'all'>('all')
  const [filterCategory, setFilterCategory] = useState<IdeaCategory | 'all'>('all')
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState<IdeaCategory>('process-improvement')
  const [chatInput, setChatInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [bodyDraft, setBodyDraft] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadIdeas() }, [])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [selected?.ai_thread])
  useEffect(() => {
    setBodyDraft(selected?.body ?? '')
  }, [selected?.id])

  async function loadIdeas() {
    const { data } = await supabase.from('ideas').select('*').order('created_at', { ascending: false })
    setIdeas(data ?? [])
  }

  async function addIdea() {
    if (!newTitle.trim()) return
    const { data, error } = await supabase
      .from('ideas')
      .insert({ title: newTitle.trim(), category: newCategory, ai_thread: [] })
      .select()
      .single()
    if (error) { toast.error('Failed to save idea'); return }
    setIdeas(prev => [data, ...prev])
    setNewTitle('')
    setNewCategory('process-improvement')
    setShowAdd(false)
    toast.success('Idea captured')
  }

  async function updateStatus(idea: Idea, status: IdeaStatus) {
    await supabase.from('ideas').update({ status }).eq('id', idea.id)
    const updated = { ...idea, status }
    setIdeas(prev => prev.map(i => i.id === idea.id ? updated : i))
    if (selected?.id === idea.id) setSelected(updated)
  }

  async function deleteIdea(id: string) {
    await supabase.from('ideas').delete().eq('id', id)
    setIdeas(prev => prev.filter(i => i.id !== id))
    if (selected?.id === id) setSelected(null)
    toast.success('Idea deleted')
  }

  async function saveBody() {
    if (!selected) return
    const trimmed = bodyDraft.trim() || null
    if (trimmed === selected.body) return
    await supabase.from('ideas').update({ body: trimmed }).eq('id', selected.id)
    const updated = { ...selected, body: trimmed }
    setIdeas(prev => prev.map(i => i.id === selected.id ? updated : i))
    setSelected(updated)
  }

  async function convertToProject() {
    if (!selected) return
    const { error } = await supabase.from('projects').insert({
      name: selected.title,
      description: selected.body || null,
      status: 'scoping',
    })
    if (error) { toast.error('Failed to create project'); return }
    toast.success('Project created', {
      action: { label: 'View Projects', onClick: () => { window.location.href = '/projects' } },
    })
  }

  function toggleSelectItem(id: string) {
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  async function bulkArchive() {
    const ids = [...selectedIds]
    await supabase.from('ideas').update({ status: 'shelved' }).in('id', ids)
    setIdeas(prev => prev.map(i => selectedIds.has(i.id) ? { ...i, status: 'shelved' as IdeaStatus } : i))
    if (selected && selectedIds.has(selected.id)) setSelected(prev => prev ? { ...prev, status: 'shelved' } : prev)
    setSelectedIds(new Set())
    setSelectMode(false)
    toast.success(`${ids.length} idea${ids.length !== 1 ? 's' : ''} shelved`)
  }

  async function bulkDelete() {
    const ids = [...selectedIds]
    await supabase.from('ideas').delete().in('id', ids)
    setIdeas(prev => prev.filter(i => !selectedIds.has(i.id)))
    if (selected && selectedIds.has(selected.id)) setSelected(null)
    setSelectedIds(new Set())
    setSelectMode(false)
    toast.success(`${ids.length} idea${ids.length !== 1 ? 's' : ''} deleted`)
  }

  async function sendMessage() {
    if (!selected || !chatInput.trim() || streaming) return
    const userMsg: ChatMessage = { role: 'user', content: chatInput.trim() }
    setChatInput('')
    const newThread = [...(selected.ai_thread ?? []), userMsg]
    const withThinking = { ...selected, ai_thread: [...newThread, { role: 'assistant' as const, content: '' }] }
    setSelected(withThinking)
    setStreaming(true)
    let fullText = ''
    try {
      const res = await fetch('/api/ideas/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newThread }),
      })
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fullText += decoder.decode(value, { stream: true })
        setSelected(prev => prev ? { ...prev, ai_thread: [...newThread, { role: 'assistant', content: fullText }] } : prev)
      }
    } catch {
      toast.error('AI request failed')
    }
    const finalThread: ChatMessage[] = [...newThread, { role: 'assistant', content: fullText }]
    await supabase.from('ideas').update({ ai_thread: finalThread }).eq('id', selected.id)
    setIdeas(prev => prev.map(i => i.id === selected.id ? { ...i, ai_thread: finalThread } : i))
    setSelected(prev => prev ? { ...prev, ai_thread: finalThread } : prev)
    setStreaming(false)
  }

  const filtered = ideas.filter(i =>
    (filterStatus === 'all' || i.status === filterStatus) &&
    (filterCategory === 'all' || i.category === filterCategory)
  )
  const statusObj = (s: IdeaStatus) => STATUSES.find(x => x.value === s)!

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-72 shrink-0 border-r border-navy-600 flex flex-col h-full">
        <div className="p-4 border-b border-navy-600">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-bold text-cream-100 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-gold-500" /> Idea Lab
            </h1>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { setSelectMode(v => !v); setSelectedIds(new Set()) }}
                className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors ${selectMode ? 'bg-navy-600 text-cream-100' : 'text-cream-200/50 hover:text-cream-100 hover:bg-navy-700'}`}
              >
                Select
              </button>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1 text-xs bg-gold-500 hover:bg-gold-400 text-navy-900 font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as IdeaStatus | 'all')}
            className="w-full bg-navy-700 border border-navy-600 rounded-lg text-xs text-cream-100 px-2.5 py-1.5 mb-2"
          >
            <option value="all">All statuses</option>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value as IdeaCategory | 'all')}
            className="w-full bg-navy-700 border border-navy-600 rounded-lg text-xs text-cream-100 px-2.5 py-1.5"
          >
            <option value="all">All categories</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        {showAdd && (
          <div className="p-4 border-b border-navy-600 bg-navy-700">
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addIdea()}
              placeholder="Idea title…"
              className="w-full bg-navy-800 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 mb-2 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none"
            />
            <select
              value={newCategory}
              onChange={e => setNewCategory(e.target.value as IdeaCategory)}
              className="w-full bg-navy-800 border border-navy-600 rounded-lg text-xs text-cream-100 px-2.5 py-1.5 mb-2"
            >
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={addIdea} className="flex-1 bg-gold-500 hover:bg-gold-400 text-navy-900 font-semibold text-xs rounded-lg py-1.5 transition-colors">Save</button>
              <button onClick={() => setShowAdd(false)} className="flex-1 bg-navy-600 hover:bg-navy-500 text-cream-100 text-xs rounded-lg py-1.5 transition-colors">Cancel</button>
            </div>
          </div>
        )}

        <ul className="flex-1 overflow-y-auto divide-y divide-navy-600">
          {filtered.length === 0 && (
            <li className="p-4 text-sm text-cream-200/40">No ideas match this filter.</li>
          )}
          {filtered.map(idea => {
            const isChecked = selectedIds.has(idea.id)
            return (
              <li
                key={idea.id}
                onClick={() => selectMode ? toggleSelectItem(idea.id) : setSelected(idea)}
                className={`p-3 cursor-pointer hover:bg-navy-700 transition-colors ${!selectMode && selected?.id === idea.id ? 'bg-navy-700 border-l-2 border-gold-500' : ''} ${selectMode && isChecked ? 'bg-navy-700/60' : ''}`}
              >
                <div className="flex items-start gap-2">
                  {selectMode && (
                    <span className="mt-0.5 shrink-0 text-cream-200/50">
                      {isChecked ? <CheckSquare className="w-4 h-4 text-gold-500" /> : <Square className="w-4 h-4" />}
                    </span>
                  )}
                  <p className="text-sm text-cream-100 font-medium leading-snug line-clamp-2 flex-1">{idea.title}</p>
                  {!selectMode && <ChevronRight className="w-3.5 h-3.5 text-cream-200/30 shrink-0 mt-0.5" />}
                </div>
                <div className={`flex items-center gap-2 mt-1.5 ${selectMode ? 'pl-6' : ''}`}>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusObj(idea.status).color}`}>
                    {statusObj(idea.status).label}
                  </span>
                  <span className="text-[10px] text-cream-200/40">
                    {CATEGORIES.find(c => c.value === idea.category)?.label}
                  </span>
                  {idea.ai_thread?.length ? <span className="text-[10px] text-cream-200/30">💬</span> : null}
                  <span className="text-[10px] text-cream-200/30 ml-auto">{formatDate(idea.created_at)}</span>
                </div>
              </li>
            )
          })}
        </ul>

        {selectMode && selectedIds.size > 0 && (
          <div className="border-t border-navy-600 p-3 bg-navy-700 flex items-center gap-2">
            <span className="text-xs text-cream-200/60 flex-1">{selectedIds.size} selected</span>
            <button onClick={bulkArchive} className="flex items-center gap-1 text-xs bg-navy-600 hover:bg-navy-500 text-cream-100 px-2.5 py-1.5 rounded-lg transition-colors">
              <Archive className="w-3 h-3" /> Shelve
            </button>
            <button onClick={bulkDelete} className="flex items-center gap-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 px-2.5 py-1.5 rounded-lg transition-colors">
              <Trash2 className="w-3 h-3" /> Delete
            </button>
            <button onClick={() => { setSelectMode(false); setSelectedIds(new Set()) }} className="text-cream-200/40 hover:text-cream-100 p-1 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Right panel */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="p-5 border-b border-navy-600">
            <div className="flex items-start justify-between gap-4 mb-3">
              <h2 className="text-lg font-bold text-cream-100 leading-snug">{selected.title}</h2>
              <button onClick={() => deleteIdea(selected.id)} className="text-cream-200/30 hover:text-red-400 transition-colors shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-cream-200/50 bg-navy-700 rounded px-2 py-0.5">
                {CATEGORIES.find(c => c.value === selected.category)?.label}
              </span>
              <select
                value={selected.status}
                onChange={e => updateStatus(selected, e.target.value as IdeaStatus)}
                className="text-xs bg-navy-700 border border-navy-600 rounded px-2 py-0.5 text-cream-100"
              >
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <button
                onClick={convertToProject}
                className="flex items-center gap-1 text-xs bg-navy-700 hover:bg-navy-600 border border-navy-500 text-cream-200/70 hover:text-cream-100 px-2.5 py-1 rounded-lg transition-colors ml-auto"
              >
                <FolderKanban className="w-3 h-3" /> → Project
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="px-5 py-4 border-b border-navy-600">
            <label className="block text-[10px] font-semibold text-cream-200/40 uppercase tracking-wider mb-2">Notes</label>
            <textarea
              value={bodyDraft}
              onChange={e => setBodyDraft(e.target.value)}
              onBlur={saveBody}
              placeholder="Add context, research, details… (saves automatically)"
              rows={3}
              className="w-full bg-navy-700 border border-navy-600 rounded-xl text-sm text-cream-100 px-4 py-2.5 placeholder-cream-200/25 focus:border-gold-500 focus:outline-none resize-none transition-colors"
            />
          </div>

          {/* Chat */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {(!selected.ai_thread || selected.ai_thread.length === 0) && (
              <div className="flex flex-col items-center justify-center h-full text-center text-cream-200/40">
                <Sparkles className="w-8 h-8 mb-3 text-gold-500/40" />
                <p className="text-sm font-medium text-cream-200/50">Ask Claude to analyze this idea</p>
                <p className="text-xs mt-1 max-w-xs">e.g. "How could we automate this?" or "What are the risks and controls needed?" or "What tools would support this?"</p>
              </div>
            )}
            {(selected.ai_thread ?? []).map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-gold-500/20 text-cream-100 rounded-tr-sm'
                    : 'bg-navy-700 text-cream-100 rounded-tl-sm border border-navy-600'
                }`}>
                  {msg.role === 'assistant'
                    ? <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{msg.content || '…'}</pre>
                    : <p>{msg.content}</p>
                  }
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <div className="p-4 border-t border-navy-600">
            <div className="flex gap-3">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
                placeholder="Ask Claude about this idea…"
                disabled={streaming}
                className="flex-1 bg-navy-700 border border-navy-600 rounded-xl px-4 py-2.5 text-sm text-cream-100 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none transition-colors disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={streaming || !chatInput.trim()}
                className="bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-navy-900 p-2.5 rounded-xl transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-cream-200/30">
          <div className="text-center">
            <Lightbulb className="w-10 h-10 mx-auto mb-3 text-gold-500/20" />
            <p className="text-sm">Select an idea or add a new one</p>
          </div>
        </div>
      )}
    </div>
  )
}
