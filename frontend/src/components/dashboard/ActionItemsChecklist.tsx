import React, { useState, useEffect } from 'react'
import {
  CheckSquare,
  Square,
  CheckCircle2,
  Tag,
  Calendar,
  ArrowRight,
} from 'lucide-react'
import { TaskChecklistItem } from '@/types/dashboard'
import { Card } from '@/components/common/CommonUI'

interface ActionItemsChecklistProps {
  tasks: TaskChecklistItem[]
  onCompleteTask?: (checklistId: string, taskId: string) => void
  title?: string
  subtitle?: string
}

export const ActionItemsChecklist: React.FC<ActionItemsChecklistProps> = ({
  tasks: initialTasks,
  onCompleteTask,
  title = 'Action Items & Pending Tasks',
  subtitle = 'Interactive checklist with one-click resolution',
}) => {
  const [taskList, setTaskList] = useState<TaskChecklistItem[]>(initialTasks)
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all')

  useEffect(() => {
    setTaskList(initialTasks)
  }, [initialTasks])

  const handleToggle = (task: TaskChecklistItem) => {
    if (task.status === 'done') return // completion isn't reversible from this widget
    setTaskList((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: 'done' } : t))
    )
    onCompleteTask?.(task.checklist_id, task.id)
  }

  const filteredTasks = taskList.filter((t) => {
    if (filter === 'pending') return t.status !== 'done'
    if (filter === 'completed') return t.status === 'done'
    return true
  })

  const pendingCount = taskList.filter((t) => t.status !== 'done').length

  return (
    <Card elevated className="flex flex-col justify-between">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-outline-variant/80">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-title-md font-sans font-semibold text-on-surface">
              {title}
            </h2>
            {pendingCount > 0 && (
              <span className="text-label-caps font-mono px-2 py-0.5 rounded-full bg-accent-container text-on-accent-container font-semibold">
                {pendingCount} Pending
              </span>
            )}
          </div>
          <p className="text-body-sm font-body text-on-surface-variant mt-0.5">
            {subtitle}
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-md border border-outline-variant self-start sm:self-auto">
          {(['all', 'pending', 'completed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-[11px] font-mono capitalize rounded transition-colors ${
                filter === f
                  ? 'bg-surface-container-lowest text-primary font-semibold shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Task List Items */}
      <div className="mt-4 space-y-2.5 min-h-[220px]">
        {filteredTasks.length === 0 ? (
          /* Illustrated Empty State Card per PRD spec */
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center border-2 border-dashed border-outline-variant/60 rounded-lg bg-surface-container-low/40">
            <div className="w-12 h-12 rounded-full bg-tertiary-container/30 text-tertiary flex items-center justify-center mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-title-md font-sans font-semibold text-on-surface">
              All caught up — no pending actions
            </h3>
            <p className="text-body-sm font-body text-on-surface-variant max-w-sm mt-1">
              You have completed all assigned tasks and checklist items for your role.
            </p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const isDone = task.status === 'done'
            return (
              <div
                key={task.id}
                onClick={() => handleToggle(task)}
                className={`p-3.5 rounded-md border transition-all cursor-pointer flex items-start justify-between gap-3 group ${
                  isDone
                    ? 'bg-surface-container-low/50 border-outline-variant/40 opacity-70'
                    : 'bg-surface-container-lowest border-outline-variant hover:border-accent/40 hover:bg-surface-container-low/80'
                }`}
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <button
                    type="button"
                    className="mt-0.5 text-on-surface-variant group-hover:text-accent transition-colors flex-shrink-0"
                  >
                    {isDone ? (
                      <CheckSquare className="w-5 h-5 text-emerald-600 fill-emerald-100" />
                    ) : (
                      <Square className="w-5 h-5 text-outline" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <span
                      className={`text-body-md font-sans font-medium block leading-snug ${
                        isDone ? 'line-through text-on-surface-variant' : 'text-on-surface'
                      }`}
                    >
                      {task.task_name}
                    </span>

                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {task.category && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">
                          <Tag className="w-3 h-3 text-outline" />
                          {task.category}
                        </span>
                      )}
                      {task.due_date && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                          <Calendar className="w-3 h-3 text-amber-600" />
                          Due: {task.due_date}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleToggle(task)
                  }}
                  className={`text-xs font-mono font-medium px-2.5 py-1 rounded border transition-colors ${
                    isDone
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-accent/10 text-accent border-accent/20 group-hover:bg-accent group-hover:text-on-accent'
                  }`}
                >
                  {isDone ? 'Completed' : 'Resolve'}
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Footer Banner */}
      <div className="mt-4 pt-3 border-t border-outline-variant/60 flex items-center justify-between text-body-sm text-on-surface-variant">
        <span className="font-mono text-xs">
          Showing {filteredTasks.length} of {taskList.length} items
        </span>
        <button
          onClick={() => setFilter('all')}
          className="font-sans font-semibold text-accent text-xs hover:underline inline-flex items-center gap-1"
        >
          <span>View All Tasks</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </Card>
  )
}
