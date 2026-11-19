import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { licenseService } from '@/features/licenses/services/licenseService'
import type { LicenseCreate, LicenseUpdate } from '@/features/licenses/types/licenses'

export const LICENSES_KEY = ['software-licenses'] as const

export function useLicenses(page = 1, pageSize = 25) {
  return useQuery({
    queryKey: [...LICENSES_KEY, page, pageSize],
    queryFn: () => licenseService.list(page, pageSize),
  })
}

export function useLicenseHolders(licenseId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...LICENSES_KEY, 'holders', licenseId],
    queryFn: () => licenseService.getHolders(licenseId!),
    enabled: Boolean(licenseId) && enabled,
  })
}

export function useLicenseMutations() {
  const queryClient = useQueryClient()

  const createLicense = useMutation({
    mutationFn: (data: LicenseCreate) => licenseService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LICENSES_KEY })
    },
  })

  const updateLicense = useMutation({
    mutationFn: ({ id, data }: { id: string; data: LicenseUpdate }) =>
      licenseService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LICENSES_KEY })
    },
  })

  return { createLicense, updateLicense }
}
