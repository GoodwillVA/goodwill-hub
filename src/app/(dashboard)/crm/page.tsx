'use client'

import { useEffect, useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { createClient } from '@/lib/supabase/client'
import { Contact, ContactStage } from '@/lib/types'
import { toast } from 'sonner'
import { Plus, X, Users, Phone, Mail, Building2, DollarSign, CalendarClock } from 'lucide-react'
import { formatCurrency, formatDate, isOverdue } from '@/lib/utils'

const STAGES: { value: ContactStage; label: string; color: string }[] = [
  { value: 'discovery', label: 'Discovery', color: 'border-blue-500/40' },
  { value: 'proposal', label: 'Proposal', color: 'border-gold-500/40' },
  { value: 'active', label: 'Active', color: 'border-emerald-500/40' },
  { value: 'complete', label: 'Complete', color: 'border-navy-500' },
  { value: 'lost', label: 'Lost', color: 'border-red-500/30' },
]

const EMPTY_FORM = { name: '', company: '', email: '', phone: '', stage: 'discovery' as ContactStage, notes: '', proposal_value: '', invoiced: '', collected: '', next_followup: '' }

export default function CRMPage() {
  const supabase = createClient()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('contacts').select('*').order('created_at', { ascending: false })
    setContacts(data ?? [])
  }

  function openAdd() { setEditing(null); setForm(EMPTY_FORM); setShowModal(true) }
  function openEdit(c: Contact) {
    setEditing(c)
    setForm({
      name: c.name, company: c.company ?? '', email: c.email ?? '', phone: c.phone ?? '',
      stage: c.stage, notes: c.notes ?? '',
      proposal_value: c.proposal_value != null ? String(c.proposal_value) : '',
      invoiced: c.invoiced != null ? String(c.invoiced) : '',
      collected: c.collected != null ? String(c.collected) : '',
      next_followup: c.next_followup ?? '',
    })
    setShowModal(true)
  }

  async function saveContact() {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      company: form.company || null,
      email: form.email || null,
      phone: form.phone || null,
      stage: form.stage,
      notes: form.notes || null,
      proposal_value: form.proposal_value ? parseFloat(form.proposal_value) : null,
      invoiced: form.invoiced ? parseFloat(form.invoiced) : null,
      collected: form.collected ? parseFloat(form.collected) : null,
      next_followup: form.next_followup || null,
    }
    if (editing) {
      const { data, error } = await supabase.from('contacts').update(payload).eq('id', editing.id).select().single()
      if (error) { toast.error('Failed to save'); setSaving(false); return }
      setContacts(prev => prev.map(c => c.id === editing.id ? data : c))
      toast.success('Contact updated')
    } else {
      const { data, error } = await supabase.from('contacts').insert(payload).select().single()
      if (error) { toast.error('Failed to save'); setSaving(false); return }
      setContacts(prev => [data, ...prev])
      toast.success('Contact added')
    }
    setSaving(false)
    setShowModal(false)
  }

  async function deleteContact(id: string) {
    await supabase.from('contacts').delete().eq('id', id)
    setContacts(prev => prev.filter(c => c.id !== id))
    toast.success('Contact deleted')
  }

  async function onDragEnd(result: DropResult) {
    if (!result.destination) return
    const contactId = result.draggableId
    const newStage = result.destination.droppableId as ContactStage
    const contact = contacts.find(c => c.id === contactId)
    if (!contact || contact.stage === newStage) return
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, stage: newStage } : c))
    await supabase.from('contacts').update({ stage: newStage }).eq('id', contactId)
  }

  const pipelineValue = contacts
    .filter(c => ['discovery', 'proposal', 'active'].includes(c.stage))
    .reduce((sum, c) => sum + (c.proposal_value ?? 0), 0)
  const collected = contacts.reduce((sum, c) => sum + (c.collected ?? 0), 0)

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-cream-100 flex items-center gap-2"><Users className="w-5 h-5 text-gold-500" /> CRM</h1>
          <p className="text-xs text-cream-200/40 mt-1">Pipeline: {formatCurrency(pipelineValue)} · Collected: {formatCurrency(collected)}</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-400 text-navy-900 font-semibold text-sm px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Add Contact
        </button>
      </div>

      {/* Kanban */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          {STAGES.map(stage => {
            const cols = contacts.filter(c => c.stage === stage.value)
            return (
              <div key={stage.value} className={`w-60 shrink-0 flex flex-col bg-navy-800 rounded-xl border ${stage.color}`}>
                <div className="px-4 py-3 border-b border-navy-600 flex items-center justify-between">
                  <span className="text-xs font-semibold text-cream-200/70 uppercase tracking-wider">{stage.label}</span>
                  <span className="text-xs text-cream-200/40 bg-navy-700 rounded-full px-2 py-0.5">{cols.length}</span>
                </div>
                <Droppable droppableId={stage.value}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 p-2 space-y-2 overflow-y-auto min-h-24 transition-colors ${snapshot.isDraggingOver ? 'bg-navy-700/50' : ''}`}
                    >
                      {cols.map((contact, index) => (
                        <Draggable key={contact.id} draggableId={contact.id} index={index}>
                          {(drag, snap) => (
                            <div
                              ref={drag.innerRef}
                              {...drag.draggableProps}
                              {...drag.dragHandleProps}
                              onClick={() => openEdit(contact)}
                              className={`bg-navy-700 border border-navy-600 rounded-lg p-3 cursor-pointer hover:border-gold-500/40 transition-colors ${snap.isDragging ? 'shadow-xl border-gold-500/40 rotate-1' : ''}`}
                            >
                              <p className="text-sm font-semibold text-cream-100">{contact.name}</p>
                              {contact.company && <p className="text-xs text-cream-200/50 mt-0.5 flex items-center gap-1"><Building2 className="w-3 h-3" />{contact.company}</p>}
                              {contact.proposal_value && <p className="text-xs text-gold-400 mt-1.5 flex items-center gap-1"><DollarSign className="w-3 h-3" />{formatCurrency(contact.proposal_value)}</p>}
                              {contact.next_followup && (
                                <p className={`text-[10px] mt-1 flex items-center gap-1 ${isOverdue(contact.next_followup) ? 'text-red-400' : 'text-cream-200/40'}`}>
                                  <CalendarClock className="w-3 h-3" />{formatDate(contact.next_followup)}
                                </p>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            )
          })}
        </div>
      </DragDropContext>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-navy-800 border border-navy-600 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-navy-600">
              <h2 className="font-bold text-cream-100">{editing ? 'Edit Contact' : 'Add Contact'}</h2>
              <button onClick={() => setShowModal(false)}><X className="w-4 h-4 text-cream-200/50" /></button>
            </div>
            <div className="p-6 space-y-4">
              <FormField label="Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Jane Smith" />
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Company" value={form.company} onChange={v => setForm(f => ({ ...f, company: v }))} placeholder="Acme Co." />
                <div>
                  <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Stage</label>
                  <select value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value as ContactStage }))}
                    className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2">
                    {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Email" type="email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="jane@acme.com" icon={<Mail className="w-3.5 h-3.5" />} />
                <FormField label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="555-1234" icon={<Phone className="w-3.5 h-3.5" />} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <FormField label="Proposal $" type="number" value={form.proposal_value} onChange={v => setForm(f => ({ ...f, proposal_value: v }))} placeholder="5000" />
                <FormField label="Invoiced $" type="number" value={form.invoiced} onChange={v => setForm(f => ({ ...f, invoiced: v }))} placeholder="0" />
                <FormField label="Collected $" type="number" value={form.collected} onChange={v => setForm(f => ({ ...f, collected: v }))} placeholder="0" />
              </div>
              <FormField label="Follow-up Date" type="date" value={form.next_followup} onChange={v => setForm(f => ({ ...f, next_followup: v }))} />
              <div>
                <label className="block text-xs font-medium text-cream-200/60 mb-1.5">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                  className="w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 px-3 py-2 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none resize-none"
                  placeholder="Context, next steps…" />
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              {editing && <button onClick={() => { deleteContact(editing.id); setShowModal(false) }} className="text-xs text-red-400 hover:text-red-300 transition-colors mr-auto">Delete</button>}
              <button onClick={() => setShowModal(false)} className="flex-1 bg-navy-700 hover:bg-navy-600 text-cream-100 text-sm font-medium rounded-lg py-2.5 transition-colors">Cancel</button>
              <button onClick={saveContact} disabled={saving} className="flex-1 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-900 text-sm font-semibold rounded-lg py-2.5 transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FormField({ label, value, onChange, placeholder, type = 'text', icon }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; icon?: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-cream-200/60 mb-1.5">{label}</label>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-200/30">{icon}</span>}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-navy-700 border border-navy-600 rounded-lg text-sm text-cream-100 py-2 placeholder-cream-200/30 focus:border-gold-500 focus:outline-none transition-colors ${icon ? 'pl-8 pr-3' : 'px-3'}`}
        />
      </div>
    </div>
  )
}
