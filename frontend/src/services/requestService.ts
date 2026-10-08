import { apiClient } from '@/lib/api-client';
import type {
  RequestItem,
  RequestFilters,
  CreateRequestPayload,
} from '../types/requests';

export const requestService = {
  /**
   * Fetches requests submitted by the logged in user or team.
   */
  async getMyRequests(filters: RequestFilters = {}): Promise<RequestItem[]> {
    const params = new URLSearchParams();
    if (filters.request_type && filters.request_type !== 'all') {
      params.append('request_type', filters.request_type);
    }
    if (filters.status && filters.status !== 'all') {
      params.append('status', filters.status);
    }
    if (filters.priority && filters.priority !== 'all') {
      params.append('priority', filters.priority);
    }
    if (filters.search) {
      params.append('search', filters.search);
    }

    const response = await apiClient.get<RequestItem[]>(`/requests?${params.toString()}`);
    return response.data;
  },

  /**
   * Fetches details of a single request including its multi-tier approval steps.
   */
  async getRequestById(id: string | number): Promise<RequestItem> {
    const response = await apiClient.get<RequestItem>(`/requests/${id}`);
    return response.data;
  },

  /**
   * Creates a new hardware/software/service request.
   */
  async createRequest(payload: CreateRequestPayload): Promise<RequestItem> {
    const response = await apiClient.post<RequestItem>('/requests', payload);
    return response.data;
  },

  /**
   * Cancels a pending request.
   */
  async cancelRequest(id: string | number): Promise<RequestItem> {
    const response = await apiClient.post<RequestItem>(`/requests/${id}/cancel`);
    return response.data;
  },
};
