import { apiClient } from '@/lib/api-client'
import {
  Employee,
  EmployeeUpdatePayload,
  Department,
  EmployeeQueryFilters,
  EmployeePaginatedResponse,
  EmployeeFiltersMeta,
} from '@/features/employees/types/employee'

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

  /** POST /departments (hr_admin, super_admin). */
  async createDepartment(payload: { name: string; manager_id?: string | null }): Promise<Department> {
    return (await apiClient.post<Department>('/departments', payload)).data
  },

  /** PATCH /departments/{id}: rename and/or set the head. */
  async updateDepartment(id: string, payload: { name?: string; manager_id?: string | null }): Promise<Department> {
    return (await apiClient.patch<Department>(`/departments/${id}`, payload)).data
  },

  /** DELETE /departments/{id}: only when nobody is in it. */
  async deleteDepartment(id: string): Promise<void> {
    await apiClient.delete(`/departments/${id}`)
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
  async updateEmployee(employeeId: string, payload: EmployeeUpdatePayload): Promise<Employee> {
    const response = await apiClient.patch<Employee>(`/employees/${employeeId}`, payload)
    return response.data
  },

  /**
   * Soft-deletes an employee record (Super Admin only) — sets status=terminated,
   * preserving the row for audit history. Reversible by a later
   * status change; not a hard delete.
   */
  async deleteEmployee(employeeId: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.delete<{ success: boolean; message: string }>(`/employees/${employeeId}`)
    return response.data
  },

}
