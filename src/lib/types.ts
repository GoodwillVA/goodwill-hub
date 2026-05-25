export type IdeaCategory = 'quick-revenue' | 'new-service' | 'product' | 'partnership' | 'other'
export type IdeaStatus = 'raw' | 'exploring' | 'in-progress' | 'implemented' | 'shelved'
export type ContactStage = 'discovery' | 'proposal' | 'active' | 'complete' | 'lost'
export type ProjectStatus = 'scoping' | 'in-progress' | 'review' | 'delivered'
export type ContentType = 'linkedin' | 'blog' | 'email' | 'other'
export type ContentStatus = 'idea' | 'draft' | 'scheduled' | 'published'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface Idea {
  id: string
  title: string
  body: string | null
  category: IdeaCategory
  ai_thread: ChatMessage[]
  status: IdeaStatus
  created_at: string
}

export interface Contact {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  stage: ContactStage
  notes: string | null
  proposal_value: number | null
  invoiced: number | null
  collected: number | null
  next_followup: string | null
  created_at: string
}

export interface Project {
  id: string
  contact_id: string | null
  name: string
  description: string | null
  status: ProjectStatus
  start_date: string | null
  due_date: string | null
  value: number | null
  created_at: string
  contact?: Contact
  tasks?: Task[]
}

export interface Task {
  id: string
  project_id: string
  title: string
  status: 'todo' | 'done'
  due_date: string | null
  created_at: string
}

export interface ContentItem {
  id: string
  title: string
  type: ContentType
  body: string | null
  status: ContentStatus
  publish_date: string | null
  tags: string[]
  notes: string | null
  case_study_ref: string | null
  ai_style: string | null
  created_at: string
}
