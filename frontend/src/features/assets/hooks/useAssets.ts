import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { assetService } from '@/features/assets/services/assetService'
import type { AssetQueryFilters } from '@/features/assets/types/assets'
import { useCurrentUser } from '@/features/auth/hooks/useCurrentUser'
import { INBOX_KEY } from '@/features/inbox/hooks/useInbox'

export const ASSETS_KEY = ['assets'] as const

export function useAssetList(filters: AssetQueryFilters) {
  return useQuery({
    queryKey: [...ASSETS_KEY, 'list', filters],
    queryFn: () => assetService.getAssets(filters),
    placeholderData: keepPreviousData,
  })
}

/** Tab counts: the summary endpoint plus retired and lost, which it doesn't group. */
export function useAssetCounts() {
  return useQuery({
    queryKey: [...ASSETS_KEY, 'counts'],
    queryFn: async () => {
      const [summary, retired, lost] = await Promise.all([
        assetService.getAssetSummary(),
        assetService.countByStatus('retired'),
        assetService.countByStatus('lost'),
      ])
      return {
        all: summary.total,
        in_stock: summary.inStock,
        assigned: summary.deployed,
        under_maintenance: summary.underMaintenance,
        retired,
        lost,
      }
    },
  })
}

export function useAssetMeta() {
  return useQuery({ queryKey: [...ASSETS_KEY, 'meta'], queryFn: assetService.getAssetMeta, staleTime: 5 * 60_000 })
}

export function useAssetDetail(id: string | undefined) {
  return useQuery({
    queryKey: [...ASSETS_KEY, 'detail', id],
    queryFn: () => assetService.getAssetDetail(id!),
    enabled: Boolean(id),
  })
}

export function useAssetHistory(id: string | undefined, canSeeMaintenance: boolean) {
  const assignments = useQuery({
    queryKey: [...ASSETS_KEY, 'assignments', id],
    queryFn: () => assetService.getAssetAssignments(id!),
    enabled: Boolean(id),
  })
  const maintenance = useQuery({
    queryKey: [...ASSETS_KEY, 'maintenance', id],
    queryFn: () => assetService.getAssetMaintenance(id!),
    enabled: Boolean(id) && canSeeMaintenance,
  })
  return { assignments, maintenance }
}

/** After any change: every asset view and the Inbox (tasks and tickets reference assets). */
export function useRefreshAssets() {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ASSETS_KEY }),
      queryClient.invalidateQueries({ queryKey: INBOX_KEY }),
    ])
  }
}

/** What the caller may do — mirrors the API's checks so we only offer real actions. */
export function useAssetPermissions() {
  const { user, can } = useCurrentUser()
  return {
    userId: user?.id ?? null,
    canCreate: can('assets:create'),
    canUpdate: can('assets:update'),
    canBulk: can('assets:bulk_update'),
    canDelete: can('assets:delete'),
    canRaiseAny: can('maintenance_ticket:create'),
    canReadTickets: can('maintenance_ticket:read'),
  }
}
