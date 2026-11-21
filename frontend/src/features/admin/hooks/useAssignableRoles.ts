import { useQuery } from '@tanstack/react-query'
import { userManagementService } from '@/features/admin/services/userManagementService'

/** GET /users/assignable-roles — the roles the caller may give out (every role for super admins). One cache entry for every picker. */
export function useAssignableRoles(enabled = true) {
  return useQuery({
    queryKey: ['assignable-roles'],
    queryFn: () => userManagementService.assignableRoles(),
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}
