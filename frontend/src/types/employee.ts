export type EmployeeStatus = 'active' | 'onboarding' | 'inactive'

export type EmployeeRole = 'employee' | 'manager' | 'hr_admin' | 'it_admin' | 'super_admin' | 'auditor'

export interface Employee {
  id: string
  full_name: string
  email: string
  designation: string
  department_id: string
  department_name: string
  manager_id?: string | null
  manager_name?: string | null
  status: EmployeeStatus
  role: EmployeeRole
  avatar_url?: string | null
  phone?: string | null
  joining_date?: string | null
  location?: string | null
}

export interface Department {
  id: string
  name: string
  code: string
  head_count: number
}

export interface EmployeeQueryFilters {
  search?: string
  department_id?: string
  status?: string
  role?: string
  view?: 'list' | 'tree'
  page?: number
  page_size?: number
}

export interface EmployeePaginatedResponse {
  items: Employee[]
  total: number
  page: number
  page_size: number
}

export interface OrgChartNode {
  id: string
  full_name: string
  designation: string
  department_name: string
  status: EmployeeStatus
  avatar_url?: string | null
  manager_id?: string | null
  direct_reports?: OrgChartNode[]
}
