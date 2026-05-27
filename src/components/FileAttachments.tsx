'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Attachment } from '@/lib/types'
import { Upload, Trash2, FileText, FileImage, Loader2, Paperclip } from 'lucide-react'
import { toast } from 'sonner'

const MAX_FILE_BYTES = 10 * 1024 * 1024   // 10 MB
const MAX_EXTRACT_CHARS = 8000
const ACCEPT = '.txt,.csv,.md,.pdf,.docx,.png,.jpg,.jpeg,.webp,.gif'

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentIcon({ mime }: { mime: string }) {
  if (mime.startsWith('image/')) return <FileImage className="w-3.5 h-3.5 text-blue-400 shrink-0" />
  if (mime === 'application/pdf') return <FileText className="w-3.5 h-3.5 text-red-400 shrink-0" />
  if (mime.includes('word') || mime.includes('docx')) return <FileText className="w-3.5 h-3.5 text-blue-300 shrink-0" />
  if (mime === 'text/csv') return <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
  return <FileText className="w-3.5 h-3.5 text-cream-200/50 shrink-0" />
}

async function extractText(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  // Plain text types
  if (['txt', 'csv', 'md'].includes(ext)) {
    try {
      return (await file.text()).slice(0, MAX_EXTRACT_CHARS)
    } catch { return null }
  }

  // Word documents
  if (ext === 'docx') {
    try {
      const mammoth = (await import('mammoth')).default
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
      return result.value.slice(0, MAX_EXTRACT_CHARS)
    } catch { return null }
  }

  // PDFs — client-side extraction via pdfjs-dist
  if (ext === 'pdf') {
    try {
      const pdfjs = await import('pdfjs-dist')
      // Use unpkg CDN worker matching the installed version
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc =
          `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
      }
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
      const pages: string[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        pages.push(
          content.items.map((item: any) => ('str' in item ? item.str : '')).join(' ')
        )
        if (pages.join('\n').length >= MAX_EXTRACT_CHARS) break
      }
      const result = pages.join('\n').trim()
      return result.length > 0 ? result.slice(0, MAX_EXTRACT_CHARS) : null
    } catch { return null }
  }

  // Images and unknown types — no text extraction
  return null
}

interface Props {
  entityType: 'meeting' | 'project' | 'team_member' | 'team' | 'series'
  entityId: string
}

export default function FileAttachments({ entityType, entityId }: Props) {
  const supabase = createClient()
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadingName, setUploadingName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (entityId) load()
  }, [entityId])  // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const { data } = await supabase
      .from('attachments')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
    setAttachments(data ?? [])
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ''

    if (file.size > MAX_FILE_BYTES) {
      toast.error(`File too large — max 10 MB (this file is ${fmtSize(file.size)})`)
      return
    }
    if (attachments.some(a => a.file_name === file.name)) {
      toast.error(`"${file.name}" is already attached — delete it first to replace`)
      return
    }

    setUploading(true)
    setUploadingName(file.name)

    // Extract text from supported formats
    const extracted = await extractText(file)

    // Upload file to Supabase Storage
    const storagePath = `${entityType}/${entityId}/${Date.now()}_${file.name}`
    const { error: uploadErr } = await supabase.storage
      .from('attachments')
      .upload(storagePath, file)

    if (uploadErr) {
      toast.error('Upload failed — check storage bucket is configured')
      setUploading(false)
      setUploadingName('')
      return
    }

    // Save metadata to database
    const { data, error: dbErr } = await supabase
      .from('attachments')
      .insert({
        entity_type: entityType,
        entity_id: entityId,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
        storage_path: storagePath,
        extracted_text: extracted,
      })
      .select()
      .single()

    if (dbErr) {
      toast.error('Failed to save attachment record')
      await supabase.storage.from('attachments').remove([storagePath])
    } else {
      setAttachments(prev => [data, ...prev])
      if (extracted) {
        const words = extracted.trim().split(/\s+/).length
        toast.success(`"${file.name}" attached — ${words.toLocaleString()} words available to AI`)
      } else if (file.type.startsWith('image/')) {
        toast.success(`"${file.name}" attached — image will be shown to AI`)
      } else {
        toast.success(`"${file.name}" attached`)
      }
    }

    setUploading(false)
    setUploadingName('')
  }

  async function deleteFile(a: Attachment) {
    await supabase.storage.from('attachments').remove([a.storage_path])
    await supabase.from('attachments').delete().eq('id', a.id)
    setAttachments(prev => prev.filter(x => x.id !== a.id))
    toast.success(`"${a.file_name}" removed`)
  }

  async function openFile(a: Attachment) {
    const { data } = await supabase.storage
      .from('attachments')
      .createSignedUrl(a.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    else toast.error('Could not generate download link')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold text-cream-200/40 uppercase tracking-wider flex items-center gap-1.5">
          <Paperclip className="w-3 h-3" />
          Files{attachments.length > 0 ? ` (${attachments.length})` : ''}
        </p>
        <div>
          <input ref={fileInputRef} type="file" accept={ACCEPT} onChange={handleUpload} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1 text-[10px] bg-navy-700 hover:bg-navy-600 border border-navy-600 text-cream-200/60 hover:text-cream-100 disabled:opacity-50 px-2 py-1 rounded-lg transition-colors"
          >
            {uploading
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Uploading…</>
              : <><Upload className="w-3 h-3" /> Attach file</>
            }
          </button>
        </div>
      </div>

      {attachments.length === 0 && !uploading ? (
        <p className="text-[11px] text-cream-200/25 italic py-1">
          No files yet. Attach PDFs, Word docs, CSVs, or images to give the AI more context.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {uploading && (
            <li className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-navy-700/50 border border-navy-600/50">
              <Loader2 className="w-3.5 h-3.5 text-gold-400 animate-spin shrink-0" />
              <span className="text-xs text-cream-200/40 truncate flex-1">{uploadingName}</span>
            </li>
          )}
          {attachments.map(a => (
            <li
              key={a.id}
              className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-navy-700 border border-navy-600 hover:border-navy-500 transition-colors"
            >
              <AttachmentIcon mime={a.mime_type} />
              <button
                onClick={() => openFile(a)}
                className="text-xs text-cream-100 hover:text-gold-400 truncate flex-1 text-left transition-colors"
                title={`Open ${a.file_name}`}
              >
                {a.file_name}
              </button>
              <span className="text-[9px] text-cream-200/30 shrink-0 tabular-nums">{fmtSize(a.file_size)}</span>
              {a.extracted_text && (
                <span
                  className="text-[9px] font-semibold text-emerald-400/60 shrink-0"
                  title="Text extracted — included in AI context"
                >
                  AI
                </span>
              )}
              <button
                onClick={() => deleteFile(a)}
                className="opacity-0 group-hover:opacity-100 text-cream-200/30 hover:text-red-400 transition-all shrink-0"
                title="Remove attachment"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-cream-200/20 mt-2">
        Text extracted for AI: .txt .csv .md .docx .pdf · Images stored for reference only · Max 10 MB
      </p>
    </div>
  )
}
