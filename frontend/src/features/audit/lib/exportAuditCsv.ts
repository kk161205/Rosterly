import { downloadCsv } from '@/lib/csv'
import { localISODate } from '@/lib/format'
import { auditService } from '@/features/audit/services/auditService'
import { actionLabel, recordLabel } from '@/features/audit/lib/labels'
import type { AuditLogFilterParams, AuditLogItem } from '@/features/audit/types/audit'

const PAGE = 100 // the API's largest page
export const EXPORT_LIMIT = 10_000

/**
 * Download every event matching the filters (not just the page on screen),
 * with the plain words and the raw codes side by side.
 */
export async function exportAuditCsv(filters: AuditLogFilterParams): Promise<void> {
  const rows: AuditLogItem[] = []
  for (let page = 1; rows.length < EXPORT_LIMIT; page++) {
    const res = await auditService.list({ ...filters, page, page_size: PAGE })
    rows.push(...res.items)
    if (res.items.length < PAGE || rows.length >= res.total) break
  }
  downloadCsv(
    `rosterly-audit-log-${localISODate()}`,
    ['When (UTC)', 'What happened', 'Action code', 'Who', 'Email', 'Record', 'Record type', 'Record ID', 'From address', 'Event ID'],
    rows.map((r) => [
      r.created_at,
      actionLabel(r.action),
      r.action,
      r.actor?.full_name ?? 'Rosterly (automatic)',
      r.actor?.email ?? '',
      recordLabel(r.entity_type),
      r.entity_type,
      r.entity_id,
      r.ip_address,
      r.id,
    ]),
  )
}
