// GET /inbox — mirrors backend app/modules/inbox/schemas.py (§5.2a)

export type InboxKind = 'approval' | 'task' | 'ticket'
export type CheckStatus = 'pass' | 'attention' | 'info'

export interface PersonRef {
  id: string
  full_name: string
  department: string | null
}

export interface AssetRef {
  id: string
  asset_tag: string
  name: string
  status: string | null
}

export interface ApprovalCheck {
  status: CheckStatus
  text: string
}

export interface ChainStep {
  step_order: number
  role_name: string | null
  approver_name: string | null
  status: string
  is_current: boolean
}

export interface ApprovalDetail {
  request_id: string
  request_type: string
  description: string
  priority: string
  estimated_cost: string | null
  requester: PersonRef
  related_asset: AssetRef | null
  current_step: number
  total_steps: number
  chain: ChainStep[]
  checks: ApprovalCheck[]
  attention_count: number
}

export interface TaskDetail {
  checklist_id: string
  item_id: string
  checklist_type: 'onboarding' | 'offboarding'
  task_name: string
  status: string
  employee: PersonRef
  key_date: string | null
  asset: AssetRef | null
}

export interface TicketDetail {
  ticket_id: string
  issue_description: string
  priority: string
  status: string
  asset: AssetRef
  reported_by: string | null
  assigned_to_me: boolean
}

export interface InboxItem {
  id: string
  kind: InboxKind
  title: string
  meta: string
  created_at: string
  approval: ApprovalDetail | null
  task: TaskDetail | null
  ticket: TicketDetail | null
}

export interface DoneItem {
  id: string
  kind: InboxKind
  title: string
  outcome: string
  done_at: string
}

export interface InboxCounts {
  decisions: number
  tasks: number
  tickets: number
}

export interface InboxResponse {
  items: InboxItem[]
  done_today: DoneItem[]
  counts: InboxCounts
}
