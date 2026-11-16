export interface AuditActor {
  id: string
  full_name: string
  email: string
}

export interface AuditLogItem {
  id: string
  actor: AuditActor | null
  action: string
  entity_type: string
  entity_id: string
  before_state: Record<string, unknown> | null
  after_state: Record<string, unknown> | null
  ip_address: string
  created_at: string
}

export interface AuditLogListResponse {
  items: AuditLogItem[]
  total: number
}

export interface AuditLogFilterParams {
  actor_id?: string
  action?: string
  entity_type?: string
  from?: string
  to?: string
  page?: number
  page_size?: number
}
