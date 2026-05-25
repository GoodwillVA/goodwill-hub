'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ContentItem, ContentType, ContentStatus } from '@/lib/types'
import { toast } from 'sonner'
import { Plus, X, FileText, Send, Sparkles, Pencil, Trash2, ExternalLink, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import { formatDate } from '@/lib/utils'

const TYPES: { value: ContentType; label: string; icon: string }[] = [
  { value: 'linkedin', label: 'LinkedIn', icon: '💼' },
  { value: 'blog', label: 'Blog', icon: '✍️' },
  { value: 'email', label: 'Email', icon: '📧' },
  { value: 'other', label: 'Other', icon: '📄' },
]

const STATUSES: { value: ContentStatus; label: string; color: string }[] = [
  { value: 'idea', label: 'Idea', color: 'bg-navy-600/80 text-cream-200/60' },
  { value: 'draft', label: 'Draft', color: 'bg-blue-500/20 text-blue-300' },
  { value: 'scheduled', label: 'Scheduled', color: 'bg-gold-500/20 text-gold-400' },
  { value: 'published', label: 'Published', color: 'bg-emerald-500/20 text-emerald-400' },
]

export const DEFAULT_STYLE = `You are a ghostwriter for Jon, founder of AI Business Concepts — a CPA-led AI consulting firm for small businesses.

Jon's voice and brand:
- Professional but approachable — not overly corporate, not casual
- Leads with measurable outcomes (hours saved, money saved, ROI)
- Draws on 25+ years of finance/accounting/operations experience
- Practical and implementation-focused, not just theoretical AI hype
- Speaks to small business owners, not enterprise executives
- Core message: AI removes busywork so owners can focus on growing their business

For LinkedIn posts:
- 150-200 words maximum
- Hook in the first line (no "I" to start, no generic openers)
- Short paragraphs, line breaks for readability
- End with a call to action or engaging question
- No hashtag spam (1-2 max if truly relevant)

For blog posts: provide an outline with key sections and 1-2 sentences per section.
For emails: subject line + body, professional but warm.

Write in first person as Jon. Make it sound human, not AI-generated.`

const EMPTY_FORM = { title: '', type: 'linkedin' as ContentType, status: 'idea' as ContentStatus, body: '', notes: '', publish_date: '', case_study_ref: '', tags: '', ai_style: '' }

export default function ContentPage() {
  const supabase = createClient()
  const [items, setItems] = useState<ContentItem[]>([])
  const [selected, setSelected] = useState<ContentItem | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ContentItem | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState<ContentStatus | 'all'>('all')
  const [filterType, setFilterType] = useState<ContentType | 'all'>('all')
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiOutput, setAiOutput] = useState('')
  const [aiStreaming, setAiStreaming] = useState(false)
  const [showStyleEditor, setShowStyleEditor] = useState(false)
  const aiEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { load() }, [])
  useEffect(() => { aiEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [aiOutput])

  async function load() {
    const { data } = await supabase.from('content_items').select('*').order('created_at', { ascending: false })
    setItems(data ?? [])
  }

  function openAdd() { setEditing(null); setForm(EMPTY_FORM); setShowModal(true) }
  function openEdit(item: ContentItem) {
    setEditing(item)
    setForm({
      title: item.title, type: item.type, status: item.status,
      body: item.body ?? '', notes: item.notes ?? '',
      publish_date: item.publish_date ?? '', case_study_ref: item.case_study_ref ?? '',
      tags: item.tags?.join(', ') ?? '',
      ai_style: item.ai_style ?? '',
    })
    setShowStyleEditor(false)
    setShowModal(true)
  }

  async function saveItem() {
    if (!form.title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean)
    const payload = {
      title: form.title.trim(), type: form.type, status: form.status,
      body: form.body || null, notes: form.notes || null,
      publish_date: form.publish_date || null,
      case_study_ref: form.case_study_ref || null,
      ai_style: form.ai_style || null,
      tags,
    }
    if (editing) {
      const { data, error } = await supabase.from('content_items').update(payload).eq('id', editing.id).select().single()
      if (error) { toast.error('Failed to save'); setSaving(false); return }
      setItems(prev => prev.map(i => i.id === editing.id ? data : i))
      if (selected?.id === editing.id) setSelected(data)
      toast.success('Updated')
    } else {
      const { data, error } = await supabase.from('content_items').insert(payload).select().single()
      if (error) { toast.error('Failed to save'); setSaving(false); return }
      setItems(prev => [data, ...prev])
      toast.success('Content item added')
    }
    setSaving(false)
    setShowModal(false)
  }

  async function deleteItem(id: string) {
    await supabase.from('content_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
    if (selected?.id === id) setSelected(null)
    toast.success('Deleted')
  }

  async function generateContent() {
    if (!aiPrompt.trim() || aiStreaming) return
    setAiOutput('')
    setAiStreaming(true)
    try {
      const context = selected ? `Content type: ${selected.type}\nTitle: ${selected.title}\n${selected.case_study_ref ? `Client win: ${selected.case_study_ref}` : ''}` : ''
      const res = await fetch('/api/content/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt, context, styleOverride: selected?.ai_style || null }),
      })
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        setAiOutput(full)
      }
    } catch {
      toast.error('AI request failed')
    }
    setAiStreaming(false)
  }

  async function useGeneratedContent() {
    if (!selected || !aiOutput) return
    const { data, error } = await supabase.from('content_items').update({ body: aiOutput }).eq('id', selected.id).select().single()
    if (error) { toast.error('Failed to save draft'); return }
    setItems(prev => prev.map(i => i.id === selected.id ? data : i))
    setSelected(data)
    setAiOutput('')
    toast.success('Draft saved to content item')
  }

  const filtered = items.filter(i =>
    (filterStatus === 'all' || i.status === filterStatus) &&
    (filterType === 'all' || i.type === filterType)
  )

  const statusObj = (s: ContentStatus) => STATUSES.find(x => x.value === s)!
  const typeObj = (t: ContentType) => TYPES.find(x => x.value === t)!

  return (
    <div className="flex h-full">
      {/* Left: list */}
      <div className="w-72 shrink-0 border-r border-navy-600 flex flex-col h-full">
        <div className="p-4 border-b border-navy-600">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-bold text-cream-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-gold-500" /> Content
            </h1>
            <button onClick={openAdd} className="flex items-center gap-1 text-xs bg-gold-500 hover:bg-gold-400 text-navy-900 font-semibold px-2.5 py-1.5 rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as ContentStatus | 'all')}
            className="w-full bg-navy-700 border border-navy-600 rounded-lg text-xs text-cream-100 px-2.5 py-1.5 mb-2">
            <option value="all">All statuses</option>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value as ContentType | 'all')}
            className="w-full bg-navy-700 border border-navy-600 rounded-lg text-xs text-cream-100 px-2.5 py-1.5">
            <option value="all">All types</option>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
          </select>
        </div>

        <ul className="flex-1 overflow-y-auto divide-y divide-navy-600">
          {filtered.length === 0 && <li className="p-4 text-sm text-cream-200/40">No content items.</li>}
          {filtered.map(item => (
            <li key={item.id} onClick={() => setSelected(item)}
              className={`p-3 cursor-pointer hover:bg-navy-700 transition-colors ${selected?.id === item.id ? 'bg-navy-700 border-l-2 border-gold-500' : ''}`}>
              <div className="flex items-start gap-2">
                <span className="text-sm shrink-0 mt-0.5">{typeObj(item.type).icon}</span>
                <p className="text-sm text-cream-100 font-medium leading-snug line-clamp-2 flex-1">{item.title}</p>
              </div>
              <div className="flex items-center gap-2 mt-1.5 pl-6">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusObj(item.status).color}`}>{statusObj(item.status).label}</span>
                {item.publish_date && <span className="text-[10px] text-cream-200/30">{formatDate(item.publish_date)}</span>}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Right: detail + AI */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header */}
          <div className="p-5 border-b border-navy-600 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span>{typeObj(selected.type).icon}</span>
                <h2 className="text-base font-bold text-cream-100 truncate">{selected.title}</h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusObj(selected.status).color}`}>{statusObj(selected.status).label}</span>
                {selected.publish_date && <span className="text-xs text-cream-200/40">Publish: {formatDate(selected.publish_date)}</span>}
                {selected.tags?.length > 0 && selected.tags.map(tag => (
                  <span key={tag} className="text-[10px] bg-navy-600 text-cream-200/50 rounded px-1.5 py-0.5">{tag}</span>
                ))}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => openEdit(selected)} className="text-cream-200/40 hover:text-cream-100 p-1.5 rounded-lg hover:bg-navy-700 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => deleteItem(selected.id)} className="text-cream-200/40 hover:text-red-400 p-1.5 rounded-lg hover:bg-navy-700 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Draft/Body */}
            {selected.body && (
              <div>
                <p className="text-xs font-semibold text-cream-200/40 uppercase tracking-wider mb-2">Draft</p>
                <pre className="whitespace-pre-wrap font-sans text-sm text-cream-100 bg-navy-700 rounded-xl p-4 border border-navy-600 leading-relaxed">{selected.body}</pre>
              </div>
            )}
            {selected.notes && (
              <div>
                <p className="text-xs font-semibold text-cream-200/40 uppercase tracking-wider mb-2">Notes</p>
                <p className="text-sm text-cream-200/70">{selected.notes}</p>
              </div>
            )}
            {selected.case_study_ref && (
              <div>
                <p className="text-xs font-semibold text-cream-200/40 uppercase tracking-wider mb-2">Client Win / Case Study</p>
                <p className="text-sm text-cream-200/70 bg-navy-700 rounded-xl p-3 border border-navy-600">{selected.case_study_ref}</p>
              </div>
            )}

            {/* AI Writer */}
            <div className="border-t border-navy-600 pt-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-gold-500" />
                <p className="text-xs font-semibold text-cream-200/60 uppercase tracking-wider">AI Writing Assistant</p>
              </div>
              {aiOutput && (
                <div className="relative mb-3">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-cream-100 bg-navy-700 rounded-xl p-4 border border-gold-500/20 leading-relaxed">{aiOutput}</pre>
                  <button onClick={useGeneratedContent}
                    className="absolute top-2 right-2 flex items-center gap-1 text-[10px] bg-gold-500 hover:bg-gold-400 text-navy-900 font-semibold px-2 py-1 rounded-lg transition-colors">
                    <ExternalLink className="w-3 h-3" /> Use as draft
                  </button>
                </div>
              )}
              <div ref={aiEndRef} />
              <div className="flex gap-2">
                <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), generateContent())}
                  placeholder={`Draft a ${selected.type} post about this topic…`}
                  disabled={aiStreaming}
                  className="flex-1 bg-navy-700 border border-navy-600 rounded-xl px-4 py-2.5 text-sm text-cream-100 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none transition-colors disabled:opacity-50"
                />
                <button onClick={generateContent} disabled={aiStreaming || !aiPrompt.trim()}
                  className="bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-navy-900 p-2.5 rounded-xl transition-colors">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-cream-200/30">
          <div className="text-center">
            <FileText className="w-10 h-10 mx-auto mb-3 text-gold-500/20" />
            <p className="text-sm">Select a content item or add a new one</p>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-navy-800 border border-navy-600 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-navy-600">
              <h2 className="font-bold text-cream-100">{editing ? 'Edit' : 'Add'} Content Item</h2>
              <button onClick={() => setShowModal(false)}><X className="w-4 h-4 text-cream-200/50" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. How AI Saved Our Client 40 Hours/Month"
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as ContentType }))}
                    className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2">
                    {TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as ContentStatus }))}
                    className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2">
                    {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Publish Date</label>
                <input type="date" value={form.publish_date} onChange={e => setForm(f => ({ ...f, publish_date: e.target.value }))}
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Tags (comma separated)</label>
                <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="automation, finance, small-business"
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Client Win / Case Study (for AI context)</label>
                <textarea value={form.case_study_ref} onChange={e => setForm(f => ({ ...f, case_study_ref: e.target.value }))} rows={2}
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none resize-none"
                  placeholder="e.g. Client saved 12 hrs/week on invoice processing…" />
              </div>
              <div>
                <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none resize-none"
                  placeholder="Angle, hook, references…" />
              </div>

              {/* AI Writing Style */}
              <div className="border border-navy-600 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowStyleEditor(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-navy-700 hover:bg-navy-600 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-gold-500" />
                    <span className="text-xs font-medium text-cream-200/80">AI Writing Style</span>
                    {form.ai_style
                      ? <span className="text-[10px] bg-gold-500/20 text-gold-400 px-1.5 py-0.5 rounded">customized</span>
                      : <span className="text-[10px] text-cream-200/30">default</span>
                    }
                  </div>
                  {showStyleEditor ? <ChevronUp className="w-3.5 h-3.5 text-cream-200/40" /> : <ChevronDown className="w-3.5 h-3.5 text-cream-200/40" />}
                </button>
                {showStyleEditor && (
                  <div className="p-3 bg-navy-800 border-t border-navy-600">
                    <p className="text-[10px] text-cream-200/40 mb-2">This is the style guide Claude uses when writing for this content item. Edit it to change the tone, format, or voice for this specific piece.</p>
                    <textarea
                      value={form.ai_style || DEFAULT_STYLE}
                      onChange={e => setForm(f => ({ ...f, ai_style: e.target.value }))}
                      rows={10}
                      className="w-full bg-navy-700 border border-navy-600 rounded-lg text-xs text-cream-100 px-3 py-2 focus:border-gold-500 focus:outline-none resize-y font-mono leading-relaxed"
                    />
                    {form.ai_style && (
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, ai_style: '' }))}
                        className="flex items-center gap-1 text-[10px] text-cream-200/40 hover:text-cream-200/70 mt-2 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" /> Reset to default
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              {editing && <button onClick={() => { deleteItem(editing.id); setShowModal(false) }} className="text-xs text-red-400 hover:text-red-300 transition-colors mr-auto">Delete</button>}
              <button onClick={() => setShowModal(false)} className="flex-1 bg-navy-700 hover:bg-navy-600 text-cream-100 text-sm font-medium rounded-lg py-2.5 transition-colors">Cancel</button>
              <button onClick={saveItem} disabled={saving} className="flex-1 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-900 text-sm font-semibold rounded-lg py-2.5 transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
