import { apiClient } from '@/lib/api-client'
import type {
  Checklist,
  ChecklistItem,
  ChecklistItemStatus,
  ChecklistListResponse,
  ChecklistStatus,
  ChecklistType,
  NewJoinerPayload,
  NewJoinerResult,
} from '@/features/lifecycle/types/checklist'

/** Onboarding and offboarding share one shape; the path picks the type. */
export const lifecycleService = {
  async list(type: ChecklistType, params: { status?: ChecklistStatus; page: number; page_size: number }): Promise<ChecklistListResponse> {
    const { data } = await apiClient.get<ChecklistListResponse>(`/${type}`, { params })
    return data
  },

  async get(type: ChecklistType, id: string): Promise<Checklist> {
    const { data } = await apiClient.get<Checklist>(`/${type}/${id}`)
    return data
  },

  async setItemStatus(type: ChecklistType, checklistId: string, itemId: string, status: ChecklistItemStatus): Promise<ChecklistItem> {
    const { data } = await apiClient.patch<ChecklistItem>(`/${type}/${checklistId}/items/${itemId}`, { status })
    return data
  },

  /** POST /onboarding/new-joiner — creates the account and its checklist; returns a set-password link. */
  async addNewJoiner(payload: NewJoinerPayload): Promise<NewJoinerResult> {
    const { data } = await apiClient.post<NewJoinerResult>('/onboarding/new-joiner', payload)
    return data
  },

  /** POST /onboarding — for someone who already has an account (e.g. rejoining). */
  async startOnboarding(employeeId: string): Promise<Checklist> {
    const { data } = await apiClient.post<Checklist>('/onboarding', { employee_id: employeeId })
    return data
  },

  /** POST /offboarding — marks the person offboarding and lists their assets to collect. */
  async startOffboarding(payload: { employee_id: string; exit_date?: string; reason?: string }): Promise<Checklist> {
    const { data } = await apiClient.post<Checklist>('/offboarding', payload)
    return data
  },

  /** POST /offboarding/{id}/complete — only when every item is done; terminates and signs them out. */
  async completeOffboarding(id: string): Promise<Checklist> {
    const { data } = await apiClient.post<Checklist>(`/offboarding/${id}/complete`)
    return data
  },
}
