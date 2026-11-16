export type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'on_leave' | 'holiday'

export interface AttendanceRecord {
  id: string
  employee_id: string
  date: string
  status: AttendanceStatus
  check_in_time?: string | null
  check_out_time?: string | null
}

export interface AttendanceListResponse {
  records: AttendanceRecord[]
  total: number
  page: number
  page_size: number
}

export interface AttendanceFilterParams {
  employee_id?: string
  from?: string
  to?: string
  page?: number
  page_size?: number
}
