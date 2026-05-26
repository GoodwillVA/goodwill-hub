export type IdeaCategory = 'process-improvement' | 'reporting' | 'controls' | 'technology' | 'team' | 'other'
export type IdeaStatus = 'raw' | 'exploring' | 'in-progress' | 'implemented' | 'shelved'
export type ContactStage = 'discovery' | 'proposal' | 'active' | 'complete' | 'lost'
export type ProjectStatus = 'scoping' | 'in-progress' | 'review' | 'delivered'
export type ContentType = 'linkedin' | 'blog' | 'email' | 'other'
export type ContentStatus = 'idea' | 'draft' | 'scheduled' | 'published'
export type MeetingType = 'client-call' | 'discovery' | 'internal' | 'follow-up' | 'board' | 'training' | 'external' | 'other'
export type MeetingStatus = 'scheduled' | 'completed' | 'cancelled'

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
  area: string | null
  is_general: boolean
  ai_thread: ChatMessage[]
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

export interface ActionItem {
  id: string
  title: string
  owner: string | null
  due_date: string | null
  done: boolean
}

export interface MeetingAttendee {
  name: string
  position: string | null
  organization: string | null
}

export interface MeetingSeries {
  id: string
  name: string
  created_at: string
}

export interface SavedAttendee {
  id: string
  name: string
  position: string | null
  organization: string | null
  created_at: string
}

export interface Meeting {
  id: string
  title: string
  meeting_date: string
  meeting_time: string | null
  duration_minutes: number | null
  type: MeetingType
  contact_id: string | null
  project_id: string | null
  notes: string | null
  transcript: string | null
  summary: string | null
  action_items: ActionItem[]
  followup_email: string | null
  status: MeetingStatus
  attendees: MeetingAttendee[]
  series_id: string | null
  created_at: string
  contact?: { id: string; name: string; company: string | null }
  project?: { id: string; name: string }
  series?: MeetingSeries
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

export interface MonthlyTask {
  id: string
  month_year: string
  title: string
  completed: boolean
  completed_at: string | null
  due_date: string | null
  notes: string | null
  sort_order: number
  is_recurring: boolean
  created_at: string
}

export type GoalStatus = 'not_started' | 'in_progress' | 'completed' | 'at_risk'

export interface TeamMember {
  id: string
  name: string
  title: string | null
  notes: string | null
  ai_thread: ChatMessage[]
  sort_order: number
  created_at: string
}

export interface TeamMemberLog {
  id: string
  member_id: string
  content: string
  log_date: string
  created_at: string
}

export interface TeamMemberGoal {
  id: string
  member_id: string
  title: string
  period: string
  status: GoalStatus
  notes: string | null
  sort_order: number
  created_at: string
}

export interface DayFocusItem {
  id: string
  focus_date: string          // 'YYYY-MM-DD'
  item_type: 'task' | 'monthly_task' | 'freeform'
  title: string | null        // freeform text OR cached display title
  task_id: string | null
  monthly_task_id: string | null
  sort_order: number
  completed: boolean          // freeform only; linked items use source table
  created_at: string
}
