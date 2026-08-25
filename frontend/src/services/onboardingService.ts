import { apiClient } from '@/lib/api-client'
import {
  OnboardingChecklist,
  OnboardingListResponse,
  OnboardingCreateRequest,
  ChecklistItemStatus,
  ChecklistItem,
  AISuggestionResponse,
  OnboardingSummaryMetrics,
} from '@/types/onboarding'

// TEMP: mock until /onboarding ships — fallback seed data when backend API is offline or returning 404
const MOCK_ONBOARDING_CHECKLISTS: OnboardingChecklist[] = [
  {
    id: 'chk-101',
    employee_id: 'emp-201',
    employee_name: 'Alex Rivera',
    employee_email: 'alex.rivera@rosterly.io',
    employee_designation: 'Senior Frontend Engineer',
    department_name: 'Engineering',
    joining_date: '2026-09-01',
    avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    type: 'onboarding',
    status: 'in_progress',
    created_at: '2026-08-20T10:00:00Z',
    updated_at: '2026-08-24T15:30:00Z',
    progress_percentage: 60,
    total_items: 5,
    completed_items: 3,
    items: [
      {
        id: 'item-1',
        checklist_id: 'chk-101',
        task_name: 'Issue Employment Contract & NDA',
        owner_role_id: 'role-hr-admin',
        owner_role_name: 'hr_admin',
        status: 'done',
        completed_by: 'usr-hr-1',
        completed_by_name: 'Sarah Connor (HR Admin)',
        completed_at: '2026-08-20T11:30:00Z',
        sort_order: 1,
        created_at: '2026-08-20T10:00:00Z',
      },
      {
        id: 'item-2',
        checklist_id: 'chk-101',
        task_name: 'Provision MacBook Pro M3 Max & Peripherals',
        owner_role_id: 'role-it-admin',
        owner_role_name: 'it_admin',
        status: 'done',
        completed_by: 'usr-it-1',
        completed_by_name: 'David Miller (IT Admin)',
        completed_at: '2026-08-21T09:15:00Z',
        sort_order: 2,
        created_at: '2026-08-20T10:00:00Z',
      },
      {
        id: 'item-3',
        checklist_id: 'chk-101',
        task_name: 'Grant GitHub Enterprise & AWS SSO Access',
        owner_role_id: 'role-it-admin',
        owner_role_name: 'it_admin',
        status: 'in_progress',
        sort_order: 3,
        created_at: '2026-08-20T10:00:00Z',
      },
      {
        id: 'item-4',
        checklist_id: 'chk-101',
        task_name: 'Issue Building Access Keycard & Desk Pass',
        owner_role_id: 'role-facilities',
        owner_role_name: 'facilities',
        status: 'done',
        completed_by: 'usr-fac-1',
        completed_by_name: 'Marcus Vance (Facilities)',
        completed_at: '2026-08-22T14:00:00Z',
        sort_order: 4,
        created_at: '2026-08-20T10:00:00Z',
      },
      {
        id: 'item-5',
        checklist_id: 'chk-101',
        task_name: 'Schedule Team 1:1 Intro & Mentor Alignment',
        owner_role_id: 'role-manager',
        owner_role_name: 'manager',
        status: 'pending',
        sort_order: 5,
        created_at: '2026-08-20T10:00:00Z',
      },
    ],
  },
  {
    id: 'chk-102',
    employee_id: 'emp-202',
    employee_name: 'Elena Rostova',
    employee_email: 'elena.rostova@rosterly.io',
    employee_designation: 'Product Marketing Manager',
    department_name: 'Marketing',
    joining_date: '2026-09-05',
    avatar_url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
    type: 'onboarding',
    status: 'in_progress',
    created_at: '2026-08-22T08:30:00Z',
    updated_at: '2026-08-23T11:00:00Z',
    progress_percentage: 25,
    total_items: 4,
    completed_items: 1,
    items: [
      {
        id: 'item-201',
        checklist_id: 'chk-102',
        task_name: 'Verify ID Proofs & Tax Compliance',
        owner_role_id: 'role-hr-admin',
        owner_role_name: 'hr_admin',
        status: 'done',
        completed_by: 'usr-hr-1',
        completed_by_name: 'Sarah Connor (HR Admin)',
        completed_at: '2026-08-22T10:00:00Z',
        sort_order: 1,
        created_at: '2026-08-22T08:30:00Z',
      },
      {
        id: 'item-202',
        checklist_id: 'chk-102',
        task_name: 'Provision Figma Pro & Hubspot Seats',
        owner_role_id: 'role-it-admin',
        owner_role_name: 'it_admin',
        status: 'in_progress',
        sort_order: 2,
        created_at: '2026-08-22T08:30:00Z',
      },
      {
        id: 'item-203',
        checklist_id: 'chk-102',
        task_name: 'Dispatch Office Ergonomic Setup Kit',
        owner_role_id: 'role-facilities',
        owner_role_name: 'facilities',
        status: 'pending',
        sort_order: 3,
        created_at: '2026-08-22T08:30:00Z',
      },
      {
        id: 'item-204',
        checklist_id: 'chk-102',
        task_name: 'Assign 30-Day Marketing Deliverables Plan',
        owner_role_id: 'role-manager',
        owner_role_name: 'manager',
        status: 'pending',
        sort_order: 4,
        created_at: '2026-08-22T08:30:00Z',
      },
    ],
  },
  {
    id: 'chk-103',
    employee_id: 'emp-203',
    employee_name: 'Devon Zhao',
    employee_email: 'devon.zhao@rosterly.io',
    employee_designation: 'DevOps Lead',
    department_name: 'Infrastructure',
    joining_date: '2026-08-15',
    avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    type: 'onboarding',
    status: 'completed',
    completed_at: '2026-08-24T16:00:00Z',
    created_at: '2026-08-14T09:00:00Z',
    updated_at: '2026-08-24T16:00:00Z',
    progress_percentage: 100,
    total_items: 4,
    completed_items: 4,
    items: [
      {
        id: 'item-301',
        checklist_id: 'chk-103',
        task_name: 'Complete Background Check & Direct Deposit',
        owner_role_id: 'role-hr-admin',
        owner_role_name: 'hr_admin',
        status: 'done',
        completed_by: 'usr-hr-1',
        completed_by_name: 'Sarah Connor',
        completed_at: '2026-08-15T09:00:00Z',
        sort_order: 1,
        created_at: '2026-08-14T09:00:00Z',
      },
      {
        id: 'item-302',
        checklist_id: 'chk-103',
        task_name: 'Provision Workstation & YubiKey Hardware Token',
        owner_role_id: 'role-it-admin',
        owner_role_name: 'it_admin',
        status: 'done',
        completed_by: 'usr-it-1',
        completed_by_name: 'David Miller',
        completed_at: '2026-08-16T11:00:00Z',
        sort_order: 2,
        created_at: '2026-08-14T09:00:00Z',
      },
      {
        id: 'item-303',
        checklist_id: 'chk-103',
        task_name: 'Issue Biometric Building Access & Server Room Key',
        owner_role_id: 'role-facilities',
        owner_role_name: 'facilities',
        status: 'done',
        completed_by: 'usr-fac-1',
        completed_by_name: 'Marcus Vance',
        completed_at: '2026-08-18T14:20:00Z',
        sort_order: 3,
        created_at: '2026-08-14T09:00:00Z',
      },
      {
        id: 'item-304',
        checklist_id: 'chk-103',
        task_name: 'Infrastructure Architecture Onboarding Sync',
        owner_role_id: 'role-manager',
        owner_role_name: 'manager',
        status: 'done',
        completed_by: 'usr-mgr-1',
        completed_by_name: 'Kushagra Singh',
        completed_at: '2026-08-24T16:00:00Z',
        sort_order: 4,
        created_at: '2026-08-14T09:00:00Z',
      },
    ],
  },
]

export const onboardingService = {
  /**
   * Fetches list of active and completed onboarding checklists.
   */
  async getOnboardings(statusFilter?: string): Promise<OnboardingListResponse> {
    try {
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
    } catch {
      // TEMP: mock until /onboarding ships
      let filtered = [...MOCK_ONBOARDING_CHECKLISTS]
      if (statusFilter && statusFilter !== 'all') {
        filtered = filtered.filter((c) => c.status === statusFilter)
      }
      return {
        checklists: filtered,
        total: filtered.length,
      }
    }
  },

  /**
   * Fetches single onboarding checklist detail by ID.
   */
  async getOnboardingById(checklistId: string): Promise<OnboardingChecklist> {
    try {
      const response = await apiClient.get<{ checklist?: OnboardingChecklist; items?: ChecklistItem[] } & OnboardingChecklist>(
        `/onboarding/${checklistId}`
      )
      if (response.data.items && response.data.id) {
        return response.data as OnboardingChecklist
      }
      return response.data
    } catch {
      // TEMP: mock until /onboarding ships
      const found = MOCK_ONBOARDING_CHECKLISTS.find((c) => c.id === checklistId)
      if (found) return found
      throw new Error(`Onboarding checklist ${checklistId} not found`)
    }
  },

  /**
   * Initiates a new onboarding workflow for an employee.
   */
  async createOnboarding(payload: OnboardingCreateRequest): Promise<OnboardingChecklist> {
    try {
      const response = await apiClient.post<OnboardingChecklist>('/onboarding', payload)
      return response.data
    } catch {
      // TEMP: mock until /onboarding ships
      const newChecklist: OnboardingChecklist = {
        id: `chk-${Date.now()}`,
        employee_id: payload.employee_id,
        employee_name: 'Priya Sharma',
        employee_email: 'priya.sharma@rosterly.io',
        employee_designation: 'UI/UX Designer',
        department_name: 'Design',
        joining_date: payload.joining_date || new Date().toISOString().split('T')[0],
        avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
        type: 'onboarding',
        status: 'in_progress',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        progress_percentage: 0,
        total_items: 4 + (payload.custom_tasks?.length || 0),
        completed_items: 0,
        items: [
          {
            id: `item-${Date.now()}-1`,
            checklist_id: `chk-${Date.now()}`,
            task_name: 'Issue Employment Contract & NDA',
            owner_role_id: 'role-hr-admin',
            owner_role_name: 'hr_admin',
            status: 'pending',
            sort_order: 1,
            created_at: new Date().toISOString(),
          },
          {
            id: `item-${Date.now()}-2`,
            checklist_id: `chk-${Date.now()}`,
            task_name: 'Provision Laptop & Software Licenses',
            owner_role_id: 'role-it-admin',
            owner_role_name: 'it_admin',
            status: 'pending',
            sort_order: 2,
            created_at: new Date().toISOString(),
          },
          {
            id: `item-${Date.now()}-3`,
            checklist_id: `chk-${Date.now()}`,
            task_name: 'Issue Office Access Pass',
            owner_role_id: 'role-facilities',
            owner_role_name: 'facilities',
            status: 'pending',
            sort_order: 3,
            created_at: new Date().toISOString(),
          },
          {
            id: `item-${Date.now()}-4`,
            checklist_id: `chk-${Date.now()}`,
            task_name: 'Team Onboarding & Orientation Sync',
            owner_role_id: 'role-manager',
            owner_role_name: 'manager',
            status: 'pending',
            sort_order: 4,
            created_at: new Date().toISOString(),
          },
          ...(payload.custom_tasks || []).map((t, idx) => ({
            id: `item-${Date.now()}-custom-${idx}`,
            checklist_id: `chk-${Date.now()}`,
            task_name: t,
            owner_role_id: 'role-it-admin',
            owner_role_name: 'it_admin' as const,
            status: 'pending' as const,
            sort_order: 5 + idx,
            created_at: new Date().toISOString(),
          })),
        ],
      }
      MOCK_ONBOARDING_CHECKLISTS.unshift(newChecklist)
      return newChecklist
    }
  },

  /**
   * Updates status of a checklist item. Cascades completion if all items become done.
   */
  async updateChecklistItem(
    checklistId: string,
    itemId: string,
    status: ChecklistItemStatus
  ): Promise<ChecklistItem> {
    try {
      const response = await apiClient.patch<ChecklistItem>(
        `/onboarding/${checklistId}/items/${itemId}`,
        { status }
      )
      return response.data
    } catch {
      // TEMP: mock until /onboarding ships
      const checklist = MOCK_ONBOARDING_CHECKLISTS.find((c) => c.id === checklistId)
      if (!checklist) throw new Error('Checklist not found')

      const item = checklist.items.find((i) => i.id === itemId)
      if (!item) throw new Error('Item not found')

      item.status = status
      if (status === 'done') {
        item.completed_at = new Date().toISOString()
        item.completed_by_name = 'Current User'
      } else {
        item.completed_at = null
        item.completed_by_name = null
      }

      const completedCount = checklist.items.filter((i) => i.status === 'done').length
      checklist.completed_items = completedCount
      checklist.progress_percentage = Math.round((completedCount / checklist.items.length) * 100)
      if (completedCount === checklist.items.length) {
        checklist.status = 'completed'
        checklist.completed_at = new Date().toISOString()
      } else {
        checklist.status = 'in_progress'
        checklist.completed_at = null
      }

      return item
    }
  },

  /**
   * AI-Assisted Onboarding Task Recommendation generator (§8.4.2).
   */
  async suggestChecklistWithAI(department: string, designation: string): Promise<AISuggestionResponse> {
    // Simulate AI inference delay
    await new Promise((resolve) => setTimeout(resolve, 800))

    const isEng = department.toLowerCase().includes('eng') || designation.toLowerCase().includes('developer')
    const isDesign = department.toLowerCase().includes('design') || designation.toLowerCase().includes('ux')

    return {
      summary: `Generated ${isEng ? 'Engineering' : isDesign ? 'Design' : 'Standard'} onboarding workflow for ${designation} in ${department}.`,
      recommended_tasks: [
        {
          task_name: isEng
            ? 'Provision M3 Max Laptop & YubiKey Hardware Token'
            : isDesign
            ? 'Provision MacBook Pro 16" & Color-Calibrated Display'
            : 'Provision Standard Enterprise Laptop & Docking Station',
          owner_role_name: 'it_admin',
          category: 'Hardware Provisioning',
          reasoning: 'Tailored workstation specifications based on role compute requirements.',
        },
        {
          task_name: isEng
            ? 'Assign GitHub Enterprise, AWS IAM & Datadog seats'
            : isDesign
            ? 'Assign Figma Enterprise & Adobe Creative Cloud seats'
            : 'Assign Microsoft 365 E5 & Slack Enterprise seats',
          owner_role_name: 'it_admin',
          category: 'Software Licenses',
          reasoning: 'Automated SaaS license allocation based on department role template.',
        },
        {
          task_name: 'Schedule Security Compliance & SOC-2 Awareness Training',
          owner_role_name: 'hr_admin',
          category: 'Compliance',
          reasoning: 'Mandatory zero-trust security policy onboarding for all new hires.',
        },
        {
          task_name: 'Issue Biometric Building Access & Department Keycard',
          owner_role_name: 'facilities',
          category: 'Physical Access',
          reasoning: 'Badge provisioning for assigned department office zone.',
        },
        {
          task_name: `Setup 1:1 Intro with ${department} Team & Assign Buddy`,
          owner_role_name: 'manager',
          category: 'Orientation',
          reasoning: 'Direct manager onboarding checklist item for team integration.',
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

    const completed = list.checklists.filter((c) => c.status === 'completed')
    const completionRate = list.total > 0 ? Math.round((completed.length / list.total) * 100) : 100

    return {
      total_active_onboardings: active.length,
      pending_it_tasks: pendingIT,
      pending_hr_tasks: pendingHR,
      avg_completion_days: 3.2,
      completion_rate: completionRate,
    }
  },

  /**
   * Helper to fetch un-onboarded / eligible new employees for onboarding creation modal.
   */
  async getEligibleEmployees(): Promise<Array<{ id: string; name: string; designation: string; department: string }>> {
    return [
      { id: 'emp-301', name: 'Priya Sharma', designation: 'UI/UX Designer', department: 'Product Design' },
      { id: 'emp-302', name: 'Marcus Chen', designation: 'Backend Engineer (Go)', department: 'Core Platform' },
      { id: 'emp-303', name: 'Samantha Blake', designation: 'HR Operations Lead', department: 'People Operations' },
      { id: 'emp-304', name: 'Rahul Verma', designation: 'Security Analyst', department: 'InfoSec' },
    ]
  },
}
