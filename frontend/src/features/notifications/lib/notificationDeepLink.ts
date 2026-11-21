/**
 * Maps notification related_entity_type to its corresponding target URL in Rosterly.
 */
export function getNotificationDeepLink(
  entityType: string | null | undefined,
  entityId: string | null | undefined,
  type?: string | null,
): string {
  // Decisions are made in Home's "Waiting on you"; a request needing approval isn't in the approver's own list.
  if (type === 'approval_needed') return '/home'
  if (!entityType) return '/home'

  switch (entityType.toLowerCase()) {
    case 'request':
      return entityId ? `/requests?id=${encodeURIComponent(entityId)}` : '/requests'
    case 'asset':
      return entityId ? `/assets/${encodeURIComponent(entityId)}` : '/assets'
    case 'maintenance_ticket':
    case 'maintenance':
      return '/maintenance'
    case 'leave_request':
    case 'leave':
      return '/leave'
    case 'user':
      return '/profile' // "your role changed", "two-step reset" — about the reader's own account
    case 'checklist':
      return type?.includes('offboarding') ? '/offboarding' : '/onboarding'
    case 'license':
    case 'software_license':
      return '/licenses'
    default:
      return '/home'
  }
}
