import { apiClient } from '@/lib/api-client'
import type {
  RequestCreatePayload,
  RequestDetail,
  RequestListResponse,
  RequestStatus,
} from '@/features/requests/types/requests'

/** Request portal. Decisions on others' requests happen in the Inbox. */
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

  /** Approved and in-progress requests the caller's team fulfils. */
  async toFulfil(params: { status?: RequestStatus; page: number; page_size: number }): Promise<RequestListResponse> {
    return (await apiClient.get<RequestListResponse>('/requests/to-fulfil', { params })).data
  },

  /** approved → in_progress → completed, with an optional note for the requester. */
  async fulfil(id: string, status: 'in_progress' | 'completed', note?: string): Promise<RequestDetail> {
    return (await apiClient.post<RequestDetail>(`/requests/${id}/fulfilment`, { status, note: note || null })).data
  },
}
