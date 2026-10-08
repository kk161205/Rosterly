import { apiClient } from '@/lib/api-client';
import type {
  MaintenanceTicketItem,
  MaintenanceFilters,
  CreateMaintenanceTicketPayload,
  UpdateMaintenanceTicketPayload,
} from '../types/maintenance';

export const maintenanceService = {
  /**
   * Fetches maintenance tickets with optional search and status filtering.
   */
  async getTickets(filters: MaintenanceFilters = {}): Promise<MaintenanceTicketItem[]> {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters.priority && filters.priority !== 'all') params.append('priority', filters.priority);
    if (filters.search) params.append('search', filters.search);
    if (filters.asset_id) params.append('asset_id', filters.asset_id);

    const response = await apiClient.get<MaintenanceTicketItem[]>(
      `/maintenance-tickets?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Fetches single maintenance ticket details.
   */
  async getTicketById(id: string | number): Promise<MaintenanceTicketItem> {
    const response = await apiClient.get<MaintenanceTicketItem>(`/maintenance-tickets/${id}`);
    return response.data;
  },

  /**
   * Creates a new maintenance ticket.
   */
  async createTicket(payload: CreateMaintenanceTicketPayload): Promise<MaintenanceTicketItem> {
    const response = await apiClient.post<MaintenanceTicketItem>('/maintenance-tickets', payload);
    return response.data;
  },

  /**
   * Updates status, assigned technician, or resolution details of a ticket.
   */
  async updateTicket(
    id: string | number,
    payload: UpdateMaintenanceTicketPayload
  ): Promise<MaintenanceTicketItem> {
    const response = await apiClient.patch<MaintenanceTicketItem>(
      `/maintenance-tickets/${id}`,
      payload
    );
    return response.data;
  },

  /**
   * Closes or resolves a maintenance ticket with resolution notes and cost.
   */
  async resolveTicket(
    id: string | number,
    resolutionNotes: string,
    actualCost?: number
  ): Promise<MaintenanceTicketItem> {
    const response = await apiClient.post<MaintenanceTicketItem>(
      `/maintenance-tickets/${id}/resolve`,
      {
        resolution_notes: resolutionNotes,
        actual_cost: actualCost,
      }
    );
    return response.data;
  },
};
