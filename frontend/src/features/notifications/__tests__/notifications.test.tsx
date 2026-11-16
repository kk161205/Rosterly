import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationCenterPage } from '@/features/notifications/pages/NotificationCenterPage'
import { notificationService } from '@/features/notifications/services/notificationService'
import { mockUser, renderPage } from '@/test/render'

vi.mock('@/features/auth/services/authService', () => ({
  authService: { getCurrentUser: vi.fn() },
}))

vi.mock('@/features/notifications/services/notificationService', () => ({
  notificationService: {
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}))

describe('Notifications Center (§5.16)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser('employee', ['request:read'])

    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    vi.mocked(notificationService.list).mockResolvedValue({
      items: [
        {
          id: 'notif-1',
          type: 'approval_needed',
          title: 'New laptop request needs approval',
          message: 'Rahul Sharma submitted a MacBook Air request.',
          related_entity_type: 'request',
          related_entity_id: 'req-123',
          is_critical: false,
          is_read: false,
          created_at: now.toISOString(),
        },
        {
          id: 'notif-2',
          type: 'warranty_expiring',
          title: 'Warranty expiring in 15 days',
          message: 'Dell XPS 15 warranty renewal pending.',
          related_entity_type: 'asset',
          related_entity_id: 'ast-456',
          is_critical: true,
          is_read: true,
          created_at: yesterday.toISOString(),
        },
      ],
      total: 2,
      unread_count: 1,
    })

    vi.mocked(notificationService.markRead).mockResolvedValue({
      id: 'notif-1',
      type: 'approval_needed',
      title: 'New laptop request needs approval',
      message: 'Rahul Sharma submitted a MacBook Air request.',
      related_entity_type: 'request',
      related_entity_id: 'req-123',
      is_critical: false,
      is_read: true,
      created_at: now.toISOString(),
    })

    vi.mocked(notificationService.markAllRead).mockResolvedValue({
      updated_count: 1,
    })
  })

  it('renders notifications grouped by date with accent bar for unread item', async () => {
    renderPage(<NotificationCenterPage />)

    expect(await screen.findByText('New laptop request needs approval')).toBeInTheDocument()
    expect(screen.getByText('Notifications')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Yesterday')).toBeInTheDocument()
    expect(screen.getByText('Warranty expiring in 15 days')).toBeInTheDocument()
  })

  it('calls markRead on clicking the mark read button', async () => {
    renderPage(<NotificationCenterPage />)

    const markButton = await screen.findByRole('button', { name: /mark notification as read/i })
    fireEvent.click(markButton)

    await waitFor(() => {
      expect(notificationService.markRead).toHaveBeenCalledWith('notif-1')
    })
  })

  it('calls markAllRead on clicking Mark all as read button', async () => {
    renderPage(<NotificationCenterPage />)

    const markAllButton = await screen.findByRole('button', { name: /mark all as read/i })
    fireEvent.click(markAllButton)

    await waitFor(() => {
      expect(notificationService.markAllRead).toHaveBeenCalled()
    })
  })

  it('filters by category pills', async () => {
    renderPage(<NotificationCenterPage />)

    const hardwareTab = await screen.findByRole('tab', { name: /hardware/i })
    fireEvent.click(hardwareTab)

    await waitFor(() => {
      expect(notificationService.list).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'hardware' }),
      )
    })
  })

  it('shows empty state when list has no notifications', async () => {
    vi.mocked(notificationService.list).mockResolvedValueOnce({
      items: [],
      total: 0,
      unread_count: 0,
    })

    renderPage(<NotificationCenterPage />)

    expect(await screen.findByText('No notifications')).toBeInTheDocument()
  })
})
