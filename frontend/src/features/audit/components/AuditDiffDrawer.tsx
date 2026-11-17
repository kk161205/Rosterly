import React, { useState } from 'react'
import { SidePanel, DetailRow, Button } from '@/ui'
import { AuditActionChip } from '@/features/audit/components/AuditActionChip'
import type { AuditLogItem } from '@/features/audit/types/audit'

interface AuditDiffDrawerProps {
  log: AuditLogItem | null
  onClose: () => void
}

export const AuditDiffDrawer: React.FC<AuditDiffDrawerProps> = ({ log, onClose }) => {
  const [viewMode, setViewMode] = useState<'diff' | 'raw'>('diff')

  if (!log) return null

  const before = log.before_state || {}
  const after = log.after_state || {}

  const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort()

  const formattedDate = new Date(log.created_at).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <SidePanel
      open={Boolean(log)}
      onOpenChange={(open) => !open && onClose()}
      title="Audit Event Details"
      description={`Change inspection for ${log.action} on ${log.entity_type}`}
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setViewMode('diff')}
              className={`rounded-pill px-3 py-1 text-meta font-medium transition-colors ${
                viewMode === 'diff' ? 'bg-ink text-paper' : 'bg-ground text-muted hover:text-ink'
              }`}
            >
              Field Diff
            </button>
            <button
              type="button"
              onClick={() => setViewMode('raw')}
              className={`rounded-pill px-3 py-1 text-meta font-medium transition-colors ${
                viewMode === 'raw' ? 'bg-ink text-paper' : 'bg-ground text-muted hover:text-ink'
              }`}
            >
              Raw JSON
            </button>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Event metadata */}
        <section className="flex flex-col rounded-card border border-line bg-ground/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-micro text-muted">ID: {log.id}</span>
            <AuditActionChip action={log.action} />
          </div>
          <DetailRow label="Timestamp">{formattedDate}</DetailRow>
          <DetailRow label="Actor">
            {log.actor ? `${log.actor.full_name} (${log.actor.email})` : 'System (automated)'}
          </DetailRow>
          <DetailRow label="Target Resource">
            <span className="font-mono text-meta font-medium">
              {log.entity_type} / {log.entity_id}
            </span>
          </DetailRow>
          <DetailRow label="Client IP">
            <span className="font-mono text-meta">{log.ip_address}</span>
          </DetailRow>
        </section>

        {/* Diff view */}
        {viewMode === 'diff' ? (
          <section className="flex flex-col gap-3">
            <h4 className="text-body font-semibold text-ink">Field Changes</h4>
            {allKeys.length === 0 ? (
              <p className="text-meta text-muted">No state payload recorded for this event.</p>
            ) : (
              <div className="flex flex-col divide-y divide-line-soft rounded-card border border-line bg-paper">
                {allKeys.map((key) => {
                  const bVal = before[key]
                  const aVal = after[key]
                  const hasBefore = key in before
                  const hasAfter = key in after
                  const isModified = hasBefore && hasAfter && JSON.stringify(bVal) !== JSON.stringify(aVal)
                  const isAdded = !hasBefore && hasAfter
                  const isDeleted = hasBefore && !hasAfter

                  return (
                    <div key={key} className="flex flex-col gap-1.5 p-3 text-body">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-meta font-semibold text-ink">{key}</span>
                        {isModified && (
                          <span className="rounded-pill bg-navy-tint px-2 py-0.5 text-micro font-medium text-status-info">
                            Modified
                          </span>
                        )}
                        {isAdded && (
                          <span className="rounded-pill bg-row-selected px-2 py-0.5 text-micro font-medium text-status-ok">
                            Added
                          </span>
                        )}
                        {isDeleted && (
                          <span className="rounded-pill bg-bad-tint px-2 py-0.5 text-micro font-medium text-status-bad">
                            Deleted
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-2 pt-1 font-mono text-micro sm:grid-cols-2">
                        <div className="flex flex-col rounded bg-ground p-2">
                          <span className="text-micro font-medium uppercase text-muted">Before</span>
                          <span className="mt-1 break-all text-ink">
                            {hasBefore ? JSON.stringify(bVal, null, 2) : <em className="text-muted">empty</em>}
                          </span>
                        </div>
                        <div
                          className={`flex flex-col rounded p-2 ${
                            isModified || isAdded ? 'bg-navy-tint/40' : 'bg-ground'
                          }`}
                        >
                          <span className="text-micro font-medium uppercase text-muted">After</span>
                          <span className="mt-1 break-all text-ink">
                            {hasAfter ? JSON.stringify(aVal, null, 2) : <em className="text-muted">removed</em>}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        ) : (
          <section className="flex flex-col gap-4 font-mono text-micro">
            <div>
              <h5 className="mb-1.5 text-meta font-semibold text-muted">Before State</h5>
              <pre className="max-h-48 overflow-auto rounded-card border border-line bg-ground p-3 text-ink">
                {JSON.stringify(log.before_state, null, 2) || 'null'}
              </pre>
            </div>
            <div>
              <h5 className="mb-1.5 text-meta font-semibold text-muted">After State</h5>
              <pre className="max-h-48 overflow-auto rounded-card border border-line bg-ground p-3 text-ink">
                {JSON.stringify(log.after_state, null, 2) || 'null'}
              </pre>
            </div>
          </section>
        )}
      </div>
    </SidePanel>
  )
}
