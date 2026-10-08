export interface ApprovalQueueItem {
  id: string | number; // ApprovalStep id
  request_id: string | number;
  ticket_number?: string;
  title: string;
  request_type: string;
  priority: string;
  requester_id: string | number;
  requester_name: string;
  requester_department: string;
  justification: string;
  estimated_cost?: number | null;
  step_order: number;
  approver_role: string;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  created_at: string;
}

export interface ApprovalActionPayload {
  comments?: string;
}

export interface BulkApprovalPayload {
  step_ids: Array<string | number>;
  action: 'approve' | 'reject';
  comments?: string;
}
