import { apiClient } from '@/lib/api-client'
import type {
  ChainRequestType,
  ChainTemplateCreate,
  ChainTemplateListResponse,
  ChainTemplateResponse,
  ChainTemplateUpdate,
} from '@/features/approvalChains/types/approvalChains'

export const approvalChainService = {
  async list(requestType?: ChainRequestType): Promise<ChainTemplateListResponse> {
    const params = requestType ? { request_type: requestType } : undefined
    return (await apiClient.get<ChainTemplateListResponse>('/approval-chains', { params })).data
  },

  async create(data: ChainTemplateCreate): Promise<ChainTemplateResponse> {
    return (await apiClient.post<ChainTemplateResponse>('/approval-chains', data)).data
  },

  async update(id: string, data: ChainTemplateUpdate): Promise<ChainTemplateResponse> {
    return (await apiClient.put<ChainTemplateResponse>(`/approval-chains/${id}`, data)).data
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/approval-chains/${id}`)
  },
}
