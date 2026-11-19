import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { auditService } from '@/features/audit/services/auditService'
import type { AuditLogFilterParams } from '@/features/audit/types/audit'

export const AUDIT_LOGS_KEY = ['audit-logs'] as const

export function useAuditLogs(params: AuditLogFilterParams, enabled = true) {
  return useQuery({
    queryKey: [...AUDIT_LOGS_KEY, params],
    queryFn: () => auditService.list(params),
    enabled,
    placeholderData: keepPreviousData,
  })
}
