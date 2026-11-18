import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { attendanceService } from '@/features/leave/services/attendanceService'
import type { AttendanceFilterParams } from '@/features/leave/types/attendance'

export const ATTENDANCE_KEY = ['attendance'] as const

export function useAttendance(params?: AttendanceFilterParams, enabled = true) {
  return useQuery({
    queryKey: [...ATTENDANCE_KEY, params],
    queryFn: () => attendanceService.list(params),
    enabled,
  })
}

export function useAttendanceMutations() {
  const queryClient = useQueryClient()

  const checkIn = useMutation({
    mutationFn: () => attendanceService.checkIn(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ATTENDANCE_KEY })
    },
  })

  const checkOut = useMutation({
    mutationFn: () => attendanceService.checkOut(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ATTENDANCE_KEY })
    },
  })

  return { checkIn, checkOut }
}
