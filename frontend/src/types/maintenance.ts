export type MaintenanceTicketStatus = 'open' | 'in_progress' | 'waiting_parts' | 'resolved' | 'cancelled';
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'urgent';

export interface MaintenanceTicketItem {
  id: string | number;
  ticket_number?: string;
  asset_id: string | number;
  asset_tag: string;
  asset_name?: string;
  asset_category?: string;
  title: string;
  description: string;
  priority: MaintenancePriority;
  status: MaintenanceTicketStatus;
  assigned_to_id?: string | number | null;
  assigned_to_name?: string | null;
  created_by_id?: string | number | null;
  created_by_name?: string | null;
  estimated_cost?: number | null;
  actual_cost?: number | null;
  resolution_notes?: string | null;
  created_at: string;
  updated_at?: string;
  resolved_at?: string | null;
}

export interface MaintenanceFilters {
  status?: string;
  priority?: string;
  search?: string;
  asset_id?: string;
}

export interface CreateMaintenanceTicketPayload {
  asset_id: string | number;
  title: string;
  description: string;
  priority: MaintenancePriority;
  estimated_cost?: number;
  assigned_to_id?: string | number;
}

export interface UpdateMaintenanceTicketPayload {
  status?: MaintenanceTicketStatus;
  priority?: MaintenancePriority;
  resolution_notes?: string;
  actual_cost?: number;
  assigned_to_id?: string | number;
}
