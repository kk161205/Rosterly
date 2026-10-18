import { apiClient } from '@/lib/api-client'
import type {
  RequestCreatePayload,
  RequestDetail,
  RequestListResponse,
  RequestStatus,
} from '@/features/requests/types/requests'

/** Request portal (§5.11). Decisions on others' requests happen in the Inbox (§5.12). */
export const requestService = {
  async mine(params: { status?: RequestStatus; page: number; page_size: number }): Promise<RequestListResponse> {
    const { data } = await apiClient.get<RequestListResponse>('/requests/mine', { params })
    return data
  },

  async get(id: string): Promise<RequestDetail> {
    const { data } = await apiClient.get<RequestDetail>(`/requests/${id}`)
    return data
  },

  async create(payload: RequestCreatePayload): Promise<RequestDetail> {
    const { data } = await apiClient.post<RequestDetail>('/requests', payload)
    return data
  },

  async cancel(id: string): Promise<RequestDetail> {
    const { data } = await apiClient.post<RequestDetail>(`/requests/${id}/cancel`)
    return data
  },
}
