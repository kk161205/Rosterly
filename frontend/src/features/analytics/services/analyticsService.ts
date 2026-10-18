import { apiClient } from '@/lib/api-client'
import type { Budget, DateRange, DepartmentCost, FollowUps, Savings, Turnaround } from '@/features/analytics/types/analytics'

/** Analytics (§5.15). Each report has its own permission; the page only asks for what the caller may see. */
export const analyticsService = {
  async savings(): Promise<Savings> {
    return (await apiClient.get<Savings>('/analytics/savings')).data
  },
  async costByDepartment(range: DateRange): Promise<DepartmentCost[]> {
    return (await apiClient.get<{ series: DepartmentCost[] }>('/analytics/cost-by-department', { params: range })).data.series
  },
  async budget(): Promise<Budget> {
    return (await apiClient.get<Budget>('/analytics/budget')).data
  },
  async followUps(range: DateRange): Promise<FollowUps> {
    return (await apiClient.get<FollowUps>('/analytics/follow-ups', { params: range })).data
  },
  async turnaround(range: DateRange): Promise<Turnaround> {
    return (await apiClient.get<Turnaround>('/analytics/turnaround', { params: range })).data
  },
}
