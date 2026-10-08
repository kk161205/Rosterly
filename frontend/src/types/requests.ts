export type RequestType = 'hardware' | 'software' | 'maintenance' | 'transfer' | 'other';
export type RequestStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'fulfilled' | 'cancelled';
export type RequestPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ApprovalStep {
  id: string | number;
  step_order: number;
  approver_role: string;
  approver_id?: string | number | null;
  approver_name?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  comments?: string | null;
  action_date?: string | null;
}

export interface RequestItem {
  id: string | number;
  ticket_number?: string;
  title: string;
  request_type: RequestType;
  priority: RequestPriority;
  status: RequestStatus;
  requester_id: string | number;
  requester_name: string;
  department: string;
  justification: string;
  estimated_cost?: number | null;
  required_by_date?: string | null;
  specifications?: Record<string, any>;
  steps?: ApprovalStep[];
  current_step_order?: number;
  created_at: string;
  updated_at?: string;
}

export interface CreateRequestPayload {
  title: string;
  request_type: RequestType;
  priority: RequestPriority;
  department?: string;
  justification: string;
  estimated_cost?: number;
  required_by_date?: string;
  specifications?: Record<string, any>;
}

export interface RequestFilters {
  request_type?: string;
  status?: string;
  priority?: string;
  search?: string;
}
