import React, { useState } from 'react'
import { Button, DetailRow, SidePanel } from '@/ui'
import { humanize } from '@/lib/format'
import { actionLabel, recordLabel, whenText } from '@/features/audit/lib/labels'
import type { AuditLogItem } from '@/features/audit/types/audit'

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  return JSON.stringify(v)
}

/** One audit event: who, what, when, and each field before → after. */
export const AuditDiffDrawer: React.FC<{ log: AuditLogItem | null; onClose: () => void }> = ({ log, onClose }) => {
  const [raw, setRaw] = useState(false)
  if (!log) return null

  const before = log.before_state ?? {}
  const after = log.after_state ?? {}
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort()
  const changed = keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
  const hasBefore = log.before_state !== null && Object.keys(before).length > 0

  return (
    <SidePanel
      open
      onOpenChange={(open) => !open && onClose()}
      title={actionLabel(log.action)}
      description={whenText(log.created_at)}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setRaw((r) => !r)} aria-pressed={raw}>
            {raw ? 'Show changes' : 'Show raw data'}
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-8">
        <section>
          <DetailRow label="Who">{log.actor ? `${log.actor.full_name} (${log.actor.email})` : 'Rosterly (automatic)'}</DetailRow>
          <DetailRow label="Record">
            {recordLabel(log.entity_type)} <span className="font-mono text-meta text-muted">{log.entity_id}</span>
          </DetailRow>
          <DetailRow label="From address">
            <span className="font-mono text-meta">{log.ip_address}</span>
          </DetailRow>
          <DetailRow label="Action code">
            <span className="font-mono text-meta text-muted">{log.action}</span>
          </DetailRow>
        </section>

        {raw ? (
          <section className="flex flex-col gap-4">
            {(['before_state', 'after_state'] as const).map((k) => (
              <div key={k}>
                <h3 className="border-b border-ink pb-2 text-section text-ink">{k === 'before_state' ? 'Before' : 'After'}</h3>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all pt-2 font-mono text-meta text-ink">
                  {JSON.stringify(log[k], null, 2) ?? 'null'}
                </pre>
              </div>
            ))}
          </section>
        ) : (
          <section aria-labelledby="audit-changes">
            <h3 id="audit-changes" className="border-b border-ink pb-2 text-section text-ink">
              {hasBefore ? 'What changed' : 'Recorded details'}
            </h3>
            {(hasBefore ? changed : keys).length === 0 ? (
              <p className="pt-3 text-body text-muted">No details were recorded for this event.</p>
            ) : (
              <dl>
                {(hasBefore ? changed : keys).map((k) => (
                  <div key={k} className="grid grid-cols-1 gap-1 border-b border-line-soft py-3 last:border-b-0 sm:grid-cols-[10rem_1fr]">
                    <dt className="text-meta text-muted">{humanize(k)}</dt>
                    <dd className="break-words text-body text-ink">
                      {hasBefore ? (
                        <>
                          <span className="text-muted line-through">{show(before[k])}</span>
                          <span className="px-1.5 text-muted" aria-label="changed to">
                            →
                          </span>
                          <span>{show(after[k])}</span>
                        </>
                      ) : (
                        show(after[k])
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        )}
      </div>
    </SidePanel>
  )
}
