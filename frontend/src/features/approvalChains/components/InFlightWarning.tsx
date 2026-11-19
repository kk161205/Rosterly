import React from 'react'
import { ShieldAlert } from 'lucide-react'

export const InFlightWarning: React.FC<{ pendingCount?: number; className?: string }> = ({
  pendingCount,
  className,
}) => {
  return (
    <div
      role="note"
      className={`flex items-start gap-3 rounded-card border border-status-warn/40 bg-ground p-4 text-body ${
        className || ''
      }`}
    >
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-status-warn" aria-hidden="true" />
      <div className="flex flex-col gap-1 text-ink">
        <span className="font-semibold">Active Versioning Protection</span>
        <p className="text-meta text-muted leading-relaxed">
          Updates and new templates apply strictly to future submissions. Any active requests currently in flight continue along their originally assigned approval path.
          {pendingCount !== undefined && pendingCount > 0 && (
            <span className="mt-1 block font-medium text-status-warn">
              Notice: {pendingCount} requests are currently pending in flight across configured chains and cannot be orphaned.
            </span>
          )}
        </p>
      </div>
    </div>
  )
}
