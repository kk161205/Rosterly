import { apiClient } from '@/lib/api-client'
import {
  OffboardingChecklist,
  OffboardingListResponse,
  OffboardingCreateRequest,
  ChecklistItemStatus,
  OffboardingChecklistItem,
  OffboardingSummaryMetrics,
} from '@/types/offboarding'
import { Employee } from '@/types/employee'

export const offboardingService = {
  /**
   * Fetches list of active and completed offboarding checklists.
   */
  async getOffboardings(statusFilter?: string): Promise<OffboardingListResponse> {
    try {
      const params = statusFilter && statusFilter !== 'all' ? `?status=${statusFilter}` : ''
      const response = await apiClient.get<OffboardingListResponse | OffboardingChecklist[]>(`/offboarding${params}`)

      let checklists: OffboardingChecklist[] = []
      if (Array.isArray(response.data)) {
        checklists = response.data
      } else if (response.data && Array.isArray((response.data as OffboardingListResponse).checklists)) {
        checklists = (response.data as OffboardingListResponse).checklists
      }

      if (statusFilter && statusFilter !== 'all') {
        checklists = checklists.filter((c) => c.status === statusFilter)
      }

      return {
        checklists,
        total: checklists.length,
      }
    } catch {
      // Fallback: resolve offboarding checklists from employee lifecycle records
      try {
        const empResponse = await apiClient.get<{ items: Employee[] }>('/employees?page_size=100')
        const allEmployees = empResponse.data.items || []
        const relevantEmployees = allEmployees.filter(
          (emp) => emp.status === 'offboarding' || emp.status === 'terminated'
        )

        const checklistPromises = relevantEmployees.map(async (emp) => {
          try {
            const lifeResponse = await apiClient.get<OffboardingChecklist | null>(`/employees/${emp.id}/lifecycle`)
            if (lifeResponse.data && lifeResponse.data.type === 'offboarding') {
              return {
                ...lifeResponse.data,
                employee_name: emp.full_name,
                employee_email: emp.email,
                employee_designation: emp.designation,
                department_name: emp.department_name,
                exit_date: emp.date_of_exit,
                avatar_url: emp.avatar_url,
              }
            }
          } catch {
            return null
          }
          return null
        })

        const resolved = (await Promise.all(checklistPromises)).filter(
          (c): c is OffboardingChecklist => c !== null
        )

        let filtered = resolved
        if (statusFilter && statusFilter !== 'all') {
          filtered = filtered.filter((c) => c.status === statusFilter)
        }

        return {
          checklists: filtered,
          total: filtered.length,
        }
      } catch {
        return { checklists: [], total: 0 }
      }
    }
  },

  /**
   * Fetches single offboarding checklist detail by ID.
   */
  async getOffboardingById(checklistId: string): Promise<OffboardingChecklist> {
    const response = await apiClient.get<{ checklist?: OffboardingChecklist; items?: OffboardingChecklistItem[] } & OffboardingChecklist>(
      `/offboarding/${checklistId}`
    )
    if (response.data.items && response.data.id) {
      return response.data as OffboardingChecklist
    }
    return response.data
  },

  /**
   * Initiates a new offboarding workflow for an employee.
   */
  async createOffboarding(payload: OffboardingCreateRequest): Promise<OffboardingChecklist> {
    const response = await apiClient.post<OffboardingChecklist>('/offboarding', {
      employee_id: payload.employee_id,
      exit_date: payload.exit_date || null,
      reason: payload.reason || null,
    })
    return response.data
  },

  /**
   * Updates status of a checklist item (with backend asset return side effects).
   */
  async updateChecklistItem(
    checklistId: string,
    itemId: string,
    status: ChecklistItemStatus
  ): Promise<OffboardingChecklistItem> {
    const response = await apiClient.patch<OffboardingChecklistItem>(
      `/offboarding/${checklistId}/items/${itemId}`,
      { status }
    )
    return response.data
  },

  /**
   * Finalizes employee offboarding and transitions user status to terminated.
   */
  async completeOffboarding(checklistId: string): Promise<OffboardingChecklist> {
    const response = await apiClient.post<OffboardingChecklist>(
      `/offboarding/${checklistId}/complete`
    )
    return response.data
  },

  /**
   * Aggregates summary KPI metrics for offboarding header ribbon.
   */
  async getSummaryMetrics(): Promise<OffboardingSummaryMetrics> {
    const list = await this.getOffboardings()
    const active = list.checklists.filter((c) => c.status === 'in_progress')
    const completed = list.checklists.filter((c) => c.status === 'completed')

    let pendingAssets = 0
    let pendingAccess = 0

    active.forEach((c) => {
      ;(c.items || []).forEach((item) => {
        if (item.status !== 'done') {
          const name = item.task_name.toLowerCase()
          if (item.asset_assignment_id || name.includes('asset') || name.includes('hardware') || name.includes('laptop')) {
            pendingAssets++
          } else if (name.includes('access') || name.includes('sso') || name.includes('credential') || name.includes('revoke')) {
            pendingAccess++
          }
        }
      })
    })

    const completedWithDates = completed.filter((c) => c.completed_at && c.created_at)
    const avgDays =
      completedWithDates.length > 0
        ? Math.round(
            completedWithDates.reduce((sum, c) => {
              const days = (new Date(c.completed_at!).getTime() - new Date(c.created_at).getTime()) / 86_400_000
              return sum + Math.max(days, 0)
            }, 0) / completedWithDates.length
          )
        : 0

    return {
      total_active_offboardings: active.length,
      pending_asset_reclamations: pendingAssets,
      pending_access_revocations: pendingAccess,
      completed_offboardings: completed.length,
      avg_completion_days: avgDays,
    }
  },
}
