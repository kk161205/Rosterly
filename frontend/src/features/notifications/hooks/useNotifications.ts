import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notificationService } from '@/features/notifications/services/notificationService'
import type { NotificationCategory } from '@/features/notifications/types/notifications'

export const NOTIFICATIONS_KEY = ['notifications'] as const

export function useNotifications(params?: {
  unread_only?: boolean
  category?: NotificationCategory
  page?: number
  page_size?: number
}, enabled = true) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, params],
    queryFn: () => notificationService.list(params),
    enabled,
    refetchInterval: 30_000,
  })
}

export function useNotificationMutations() {
  const queryClient = useQueryClient()

  const markRead = useMutation({
    mutationFn: (id: string) => notificationService.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY })
    },
  })

  const markAllRead = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY })
    },
  })

  return { markRead, markAllRead }
}
