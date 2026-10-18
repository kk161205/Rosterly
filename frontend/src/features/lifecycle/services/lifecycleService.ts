import { apiClient } from '@/lib/api-client'
import type { Checklist, ChecklistItem, ChecklistItemStatus, ChecklistListResponse, ChecklistStatus, ChecklistType } from '@/features/lifecycle/types/checklist'

/** Onboarding (§5.5) and offboarding (§5.6) share one shape; the path picks the type. */
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

  /** POST /onboarding — creates the checklist from the template. */
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
