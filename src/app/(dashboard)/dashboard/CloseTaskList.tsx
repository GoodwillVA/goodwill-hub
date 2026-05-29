'use client'

import { MonthlyTask } from '@/lib/types'
import { formatDate, isOverdue } from '@/lib/utils'
import { GripVertical, Circle } from 'lucide-react'

interface Props {
  tasks: MonthlyTask[]
  extraCount: number
}

export default function CloseTaskList({ tasks, extraCount }: Props) {
  function handleDragStart(e: React.DragEvent, task: MonthlyTask) {
    e.dataTransfer.setData('application/close-task', JSON.stringify({
      id: task.id,
      title: task.title,
      month_year: task.month_year,
    }))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <ul className="space-y-2">
      {tasks.map(task => (
        <li
          key={task.id}
          draggable
          onDragStart={e => handleDragStart(e, task)}
          className="group flex items-center gap-2 px-1 py-0.5 rounded-lg hover:bg-navy-700/60 cursor-grab active:cursor-grabbing active:opacity-50 transition-all"
          title="Drag onto a day in the Day View above"
        >
          <GripVertical className="w-3 h-3 text-cream-200/0 group-hover:text-cream-200/30 shrink-0 transition-colors" />
          <Circle className="w-3.5 h-3.5 text-cream-200/30 shrink-0" />
          <span className="text-sm text-cream-100 flex-1 truncate">{task.title}</span>
          {task.due_date && (
            <span className={`text-[10px] shrink-0 font-medium ${isOverdue(task.due_date) ? 'text-red-400' : 'text-gold-400/70'}`}>
              {formatDate(task.due_date)}
            </span>
          )}
        </li>
      ))}
      {extraCount > 0 && (
        <li className="text-[10px] text-cream-200/30 pl-6">+{extraCount} more pending</li>
      )}
    </ul>
  )
}
