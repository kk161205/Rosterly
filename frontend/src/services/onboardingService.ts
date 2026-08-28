import { apiClient } from '@/lib/api-client'
import { employeeService } from '@/services/employeeService'
import {
  OnboardingChecklist,
  OnboardingListResponse,
  OnboardingCreateRequest,
  ChecklistItemStatus,
  ChecklistItem,
  AISuggestionResponse,
  OnboardingSummaryMetrics,
} from '@/types/onboarding'

export const onboardingService = {
  /**
   * Fetches list of active and completed onboarding checklists.
   */
  async getOnboardings(statusFilter?: string): Promise<OnboardingListResponse> {
    const params = statusFilter && statusFilter !== 'all' ? `?status=${statusFilter}` : ''
    const response = await apiClient.get<OnboardingListResponse | OnboardingChecklist[]>(`/onboarding${params}`)

    let checklists: OnboardingChecklist[] = []
    if (Array.isArray(response.data)) {
      checklists = response.data
    } else if (response.data && Array.isArray(response.data.checklists)) {
      checklists = response.data.checklists
    }

    if (statusFilter && statusFilter !== 'all') {
      checklists = checklists.filter((c) => c.status === statusFilter)
    }

    return {
      checklists,
      total: checklists.length,
    }
  },

  /**
   * Fetches single onboarding checklist detail by ID.
   */
  async getOnboardingById(checklistId: string): Promise<OnboardingChecklist> {
    const response = await apiClient.get<{ checklist?: OnboardingChecklist; items?: ChecklistItem[] } & OnboardingChecklist>(
      `/onboarding/${checklistId}`
    )
    if (response.data.items && response.data.id) {
      return response.data as OnboardingChecklist
    }
    return response.data
  },

  /**
   * Initiates a new onboarding workflow for an employee.
   * NOTE: the real backend (doc §5.5) only accepts `{employee_id}` in Phase 1 —
   * it seeds a fixed template server-side and rejects any other field
   * (`extra="forbid"`). `joining_date`/`custom_tasks` on the request type exist
   * for a possible future backend capability but must never actually be sent.
   */
  async createOnboarding(payload: OnboardingCreateRequest): Promise<OnboardingChecklist> {
    const response = await apiClient.post<OnboardingChecklist>('/onboarding', {
      employee_id: payload.employee_id,
    })
    return response.data
  },

  /**
   * Updates status of a checklist item. Cascades completion if all items become done.
   */
  async updateChecklistItem(
    checklistId: string,
    itemId: string,
    status: ChecklistItemStatus
  ): Promise<ChecklistItem> {
    const response = await apiClient.patch<ChecklistItem>(
      `/onboarding/${checklistId}/items/${itemId}`,
      { status }
    )
    return response.data
  },

  /**
   * TEMP: client-side placeholder until the AI service exposes a real
   * checklist-suggestion endpoint (doc §8.4.2 — out of scope for the 5.1-5.5
   * backend built so far). Output is advisory only: the recommended tasks are
   * displayed to the HR admin for reference and are never merged into the
   * actual POST /onboarding payload, since Phase 1's fixed template doesn't
   * support custom items.
   */
  async suggestChecklistWithAI(department: string, designation: string): Promise<AISuggestionResponse> {
    await new Promise((resolve) => setTimeout(resolve, 800))

    const isEng = department.toLowerCase().includes('eng') || designation.toLowerCase().includes('developer')
    const isDesign = department.toLowerCase().includes('design') || designation.toLowerCase().includes('ux')

    return {
      summary: `Suggested ${isEng ? 'Engineering' : isDesign ? 'Design' : 'Standard'} onboarding focus areas for ${designation} in ${department}. These are advisory only — Phase 1 onboarding checklists always use the standard fixed template.`,
      recommended_tasks: [
        {
          task_name: isEng
            ? 'Provision high-spec laptop & hardware security key'
            : isDesign
            ? 'Provision color-calibrated display workstation'
            : 'Provision standard enterprise laptop & docking station',
          owner_role_name: 'it_admin',
          category: 'Hardware Provisioning',
          reasoning: 'Tailored workstation specifications based on role compute requirements.',
        },
        {
          task_name: isEng
            ? 'Assign source control, cloud IAM & observability seats'
            : isDesign
            ? 'Assign design tooling & creative suite seats'
            : 'Assign productivity suite & chat seats',
          owner_role_name: 'it_admin',
          category: 'Software Licenses',
          reasoning: 'Automated SaaS license allocation based on department role template.',
        },
        {
          task_name: 'Schedule security & compliance awareness training',
          owner_role_name: 'hr_admin',
          category: 'Compliance',
          reasoning: 'Mandatory zero-trust security policy onboarding for all new hires.',
        },
      ],
    }
  },

  /**
   * Aggregates summary KPI metrics for top header ribbon.
   */
  async getSummaryMetrics(): Promise<OnboardingSummaryMetrics> {
    const list = await this.getOnboardings()
    const active = list.checklists.filter((c) => c.status === 'in_progress')

    let pendingIT = 0
    let pendingHR = 0
    active.forEach((c) => {
      c.items.forEach((item) => {
        if (item.status !== 'done') {
          if (item.owner_role_name === 'it_admin') pendingIT++
          if (item.owner_role_name === 'hr_admin') pendingHR++
        }
      })
    })

    const completed = list.checklists.filter((c) => c.status === 'completed' && c.completed_at)
    const avgCompletionDays =
      completed.length > 0
        ? completed.reduce((sum, c) => {
            const days = (new Date(c.completed_at as string).getTime() - new Date(c.created_at).getTime()) / 86_400_000
            return sum + Math.max(days, 0)
          }, 0) / completed.length
        : 0

    const completionRate = list.total > 0 ? Math.round((completed.length / list.total) * 100) : 100

    return {
      total_active_onboardings: active.length,
      pending_it_tasks: pendingIT,
      pending_hr_tasks: pendingHR,
      avg_completion_days: Math.round(avgCompletionDays * 10) / 10,
      completion_rate: completionRate,
    }
  },

  /**
   * Fetches employees eligible for onboarding (status=onboarding — new hires
   * who haven't been assigned a checklist yet) for the "Start Onboarding" modal.
   */
  async getEligibleEmployees(): Promise<
    Array<{ id: string; name: string; designation: string; department: string; date_of_joining?: string | null }>
  > {
    const result = await employeeService.getEmployees({ status: 'onboarding', page_size: 100 })
    return result.items.map((emp) => ({
      id: emp.id,
      name: emp.full_name,
      designation: emp.designation,
      department: emp.department_name || 'Unassigned',
      date_of_joining: emp.date_of_joining || emp.joining_date || null,
    }))
  },
}
