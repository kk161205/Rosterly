import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { approvalChainService } from '@/features/approvalChains/services/approvalChainService'
import type {
  ChainRequestType,
  ChainTemplateCreate,
  ChainTemplateUpdate,
} from '@/features/approvalChains/types/approvalChains'

export const APPROVAL_CHAINS_KEY = ['approval-chains'] as const

export function useApprovalChains(requestType?: ChainRequestType) {
  return useQuery({
    queryKey: [...APPROVAL_CHAINS_KEY, requestType],
    queryFn: () => approvalChainService.list(requestType),
  })
}

export { useAssignableRoles } from '@/features/admin/hooks/useAssignableRoles'

export function useApprovalChainMutations() {
  const queryClient = useQueryClient()

  const createTemplate = useMutation({
    mutationFn: (data: ChainTemplateCreate) => approvalChainService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: APPROVAL_CHAINS_KEY })
    },
  })

  const updateTemplate = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ChainTemplateUpdate }) =>
      approvalChainService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: APPROVAL_CHAINS_KEY })
    },
  })

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => approvalChainService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: APPROVAL_CHAINS_KEY })
    },
  })

  return { createTemplate, updateTemplate, deleteTemplate }
}
