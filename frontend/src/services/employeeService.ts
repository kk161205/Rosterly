import { apiClient } from '@/lib/api-client'
import {
  Employee,
  Department,
  EmployeeQueryFilters,
  EmployeePaginatedResponse,
  EmployeeFiltersMeta,
  OrgChartNode,
} from '@/types/employee'

export const employeeService = {
  /**
   * Fetches paginated list of employees with search and filter support.
   */
  async getEmployees(filters: EmployeeQueryFilters = {}): Promise<EmployeePaginatedResponse> {
    const params = new URLSearchParams()
    if (filters.search) params.append('search', filters.search)
    if (filters.department_id && filters.department_id !== 'all') params.append('department_id', filters.department_id)
    if (filters.status && filters.status !== 'all') params.append('status', filters.status)
    if (filters.role && filters.role !== 'all') params.append('role', filters.role)
    if (filters.view) params.append('view', filters.view)
    if (filters.page) params.append('page', String(filters.page))
    if (filters.page_size) params.append('page_size', String(filters.page_size))

    const response = await apiClient.get<EmployeePaginatedResponse>(`/employees?${params.toString()}`)
    return response.data
  },

  /**
   * Fetches active departments for dropdown filter controls.
   */
  async getDepartments(): Promise<Department[]> {
    const response = await apiClient.get<Department[]>('/departments')
    return response.data
  },

  /**
   * Fetches dynamic status and role filter options populated from current DB records.
   */
  async getFilterOptions(): Promise<EmployeeFiltersMeta> {
    const response = await apiClient.get<EmployeeFiltersMeta>('/employees/filters')
    return response.data
  },

  /**
   * Fetches single employee record details by ID.
   */
  async getEmployeeById(employeeId: string): Promise<Employee> {
    const response = await apiClient.get<Employee>(`/employees/${employeeId}`)
    return response.data
  },

  /**
   * Updates employee profile details (Admin or Manager).
   */
  async updateEmployee(employeeId: string, payload: import('@/types/employee').EmployeeUpdatePayload): Promise<Employee> {
    const response = await apiClient.patch<Employee>(`/employees/${employeeId}`, payload)
    return response.data
  },

  /**
   * Initiates employee offboarding transition (Admin).
   */
  async offboardEmployee(employeeId: string): Promise<Employee> {
    const response = await apiClient.post<Employee>(`/employees/${employeeId}/offboard`)
    return response.data
  },

  /**
   * Permanently deletes an employee record (Super Admin only).
   */
  async deleteEmployee(employeeId: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.delete<{ success: boolean; message: string }>(`/employees/${employeeId}`)
    return response.data
  },

  /**
   * Transforms flat employee list into hierarchical org chart node tree.
   */
  buildOrgTree(employees: Employee[]): OrgChartNode[] {
    const map = new Map<string, OrgChartNode>()
    const roots: OrgChartNode[] = []

    employees.forEach((emp) => {
      map.set(emp.id, {
        id: emp.id,
        full_name: emp.full_name,
        designation: emp.designation,
        department_name: emp.department_name || 'Unassigned',
        status: emp.status,
        avatar_url: emp.avatar_url,
        manager_id: emp.manager_id,
        direct_reports: [],
      })
    })

    employees.forEach((emp) => {
      const node = map.get(emp.id)
      if (!node) return

      if (emp.manager_id && map.has(emp.manager_id)) {
        const parent = map.get(emp.manager_id)
        if (parent) {
          parent.direct_reports = parent.direct_reports || []
          parent.direct_reports.push(node)
        }
      } else {
        roots.push(node)
      }
    })

    return roots
  },
}
