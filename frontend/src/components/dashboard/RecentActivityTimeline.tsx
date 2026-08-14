import React from 'react'
import {
  Clock,
  Laptop,
  CheckCircle2,
  UserPlus,
  Wrench,
  ShieldCheck,
  ExternalLink,
  ChevronRight,
} from 'lucide-react'
import { ActivityTimelineItem } from '@/types/dashboard'

interface RecentActivityTimelineProps {
  activities: ActivityTimelineItem[]
  title?: string
  subtitle?: string
}

export const RecentActivityTimeline: React.FC<RecentActivityTimelineProps> = ({
  activities,
  title = 'Recent Activity Timeline',
  subtitle = 'Chronological event stream & shortcuts',
}) => {
  const getActivityIcon = (type?: ActivityTimelineItem['activity_type']) => {
    switch (type) {
      case 'asset':
        return <Laptop className="w-4 h-4 text-primary" />
      case 'approval':
        return <CheckCircle2 className="w-4 h-4 text-accent" />
      case 'onboarding':
        return <UserPlus className="w-4 h-4 text-tertiary" />
      case 'ticket':
        return <Wrench className="w-4 h-4 text-error" />
      case 'system':
      default:
        return <ShieldCheck className="w-4 h-4 text-secondary" />
    }
  }

  const formatTimestamp = (isoString: string) => {
    try {
      const date = new Date(isoString)
      const now = new Date()
      const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
      if (diffMinutes < 60) return `${diffMinutes || 5} mins ago`
      const diffHours = Math.floor(diffMinutes / 60)
      if (diffHours < 24) return `${diffHours} hours ago`
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } catch {
      return 'Recently'
    }
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-6 flex flex-col justify-between shadow-sm">
      {/* Timeline Header */}
      <div className="flex items-center justify-between pb-4 border-b border-outline-variant/80">
        <div>
          <h2 className="text-title-md font-sans font-semibold text-on-surface">
            {title}
          </h2>
          <p className="text-body-sm font-body text-on-surface-variant mt-0.5">
            {subtitle}
          </p>
        </div>
        <span className="text-label-caps font-mono px-2 py-0.5 rounded bg-surface-container text-on-surface-variant">
          Live Stream
        </span>
      </div>

      {/* Activity Timeline Stream */}
      <div className="mt-4 space-y-4 min-h-[220px]">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-on-surface-variant">
            <Clock className="w-8 h-8 text-outline mb-2" />
            <p className="text-body-sm">No recent activity recorded yet.</p>
          </div>
        ) : (
          activities.map((act, index) => (
            <div key={act.id} className="relative flex gap-3 group">
              {/* Vertical Connector Hairline */}
              {index !== activities.length - 1 && (
                <span className="absolute left-4 top-8 -bottom-4 w-px bg-outline-variant/60 group-hover:bg-outline" />
              )}

              {/* Avatar / Category Badge */}
              <div className="w-8 h-8 rounded-full bg-surface-container-low border border-outline-variant flex items-center justify-center flex-shrink-0 z-10 group-hover:border-accent transition-colors">
                {getActivityIcon(act.activity_type)}
              </div>

              {/* Activity Details */}
              <div className="flex-1 min-w-0 bg-surface-container-low/40 border border-outline-variant/60 rounded-md p-3 group-hover:bg-surface-container-low transition-colors">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-body-sm font-sans font-semibold text-on-surface truncate">
                    {act.title}
                  </span>
                  <span className="text-[11px] font-mono text-on-surface-variant flex items-center gap-1 flex-shrink-0">
                    <Clock className="w-3 h-3 text-outline" />
                    {formatTimestamp(act.created_at)}
                  </span>
                </div>

                <p className="text-body-sm font-body text-on-surface-variant leading-relaxed">
                  {act.message}
                </p>

                {act.actor_name && (
                  <div className="mt-2 pt-2 border-t border-outline-variant/40 flex items-center justify-between">
                    <span className="text-[11px] font-mono text-outline">
                      Actor: <strong className="text-on-surface-variant font-medium">{act.actor_name}</strong>
                    </span>
                    <button
                      type="button"
                      className="text-[11px] font-mono text-accent hover:underline flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <span>Shortcut</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Shortcut */}
      <div className="mt-4 pt-3 border-t border-outline-variant/60 flex items-center justify-between text-body-sm">
        <span className="font-mono text-xs text-on-surface-variant">
          Showing {activities.length} recent events
        </span>
        <button
          type="button"
          className="font-sans font-semibold text-accent text-xs hover:underline inline-flex items-center gap-1"
        >
          <span>Full Audit Feed</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
