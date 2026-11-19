/**
 * Maps notification related_entity_type to its corresponding target URL in Rosterly.
 */
export function getNotificationDeepLink(
  entityType: string | null | undefined,
  entityId: string | null | undefined,
): string {
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
      return '/users'
    case 'license':
    case 'software_license':
      return '/licenses'
    default:
      return '/home'
  }
}
