import { apiClient } from '@/lib/api-client'
import type { AuditLogFilterParams, AuditLogListResponse } from '@/features/audit/types/audit'

export const auditService = {
  async list(params?: AuditLogFilterParams): Promise<AuditLogListResponse> {
    return (await apiClient.get<AuditLogListResponse>('/audit-logs', { params })).data
  },
}
