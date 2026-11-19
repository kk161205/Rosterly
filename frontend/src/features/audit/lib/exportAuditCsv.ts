import type { AuditLogItem } from '@/features/audit/types/audit'

export function exportAuditCsv(items: AuditLogItem[]): void {
  if (items.length === 0) return

  const headers = [
    'Event ID',
    'Timestamp',
    'Actor Name',
    'Actor Email',
    'Action',
    'Entity Type',
    'Entity ID',
    'Client IP',
  ]

  const rows = items.map((item) => {
    return [
      item.id,
      item.created_at,
      item.actor ? `"${item.actor.full_name.replace(/"/g, '""')}"` : 'System',
      item.actor ? item.actor.email : 'system@rosterly.internal',
      item.action,
      item.entity_type,
      item.entity_id,
      item.ip_address,
    ].join(',')
  })

  const csvContent = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  const timestamp = new Date().toISOString().split('T')[0]
  link.setAttribute('download', `rosterly-audit-log-${timestamp}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
