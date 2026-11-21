export type EmployeeStatus = 'active' | 'onboarding' | 'inactive' | 'offboarding' | 'terminated'

export type EmployeeRole = 'employee' | 'manager' | 'hr_admin' | 'it_admin' | 'super_admin' | 'auditor'

export interface FilterOption {
  value: string
  label: string
  count: number
}

export interface EmployeeFiltersMeta {
  departments: FilterOption[]
  statuses: FilterOption[]
  roles: FilterOption[]
}

export interface Employee {
  id: string
  employee_code?: string
  full_name: string
  email: string
  designation: string
  department_id?: string | null
  department_name?: string | null
  manager_id?: string | null
  manager_name?: string | null
  status: EmployeeStatus
  role?: EmployeeRole | string | null
  avatar_url?: string | null
  phone?: string | null
  date_of_joining?: string | null
  joining_date?: string | null
}

export interface Department {
  id: string
  name: string
  code: string
  head_count: number
  manager_id?: string | null
  manager_name?: string | null
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

export interface EmployeeUpdatePayload {
  full_name?: string
  designation?: string
  department_id?: string | null
  role_id?: string | null
  phone?: string | null
  status?: string | null
  manager_id?: string | null
}

