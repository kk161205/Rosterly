import { apiClient } from '@/lib/api-client'
import type {
  MaintenanceTicket,
  MaintenanceTicketListResponse,
  MaintenanceTicketUpdatePayload,
  TicketPriority,
  TicketStatus,
} from '@/features/assets/types/assets'

export interface TicketFilters {
  status?: TicketStatus
  priority?: TicketPriority
  assigned_to?: string
  page?: number
  page_size?: number
}

export interface PickableAsset {
  id: string
  asset_tag: string
  name: string
}

export interface Assignee {
  id: string
  full_name: string
}

/** Maintenance queue (§5.10). The API scopes the list: IT and auditors see all, others their own reports. */
export const maintenanceService = {
  async list(filters: TicketFilters): Promise<MaintenanceTicketListResponse> {
    const { data } = await apiClient.get<MaintenanceTicketListResponse>('/maintenance-tickets', { params: filters })
    return data
  },

  async update(id: string, changes: MaintenanceTicketUpdatePayload): Promise<MaintenanceTicket> {
    const { data } = await apiClient.patch<MaintenanceTicket>(`/maintenance-tickets/${id}`, changes)
    return data
  },

  /** Assets a ticket can be raised for: any (IT, via search) or the caller's own (§5.10 rule). */
  async pickableAssets(opts: { search: string; anyAsset: boolean; userId: string }): Promise<PickableAsset[]> {
    if (opts.anyAsset) {
      const { data } = await apiClient.get<{ items: PickableAsset[] }>('/assets', {
        params: { search: opts.search || undefined, page_size: 8 },
      })
      return data.items
    }
    const { data } = await apiClient.get<{ current: { asset_id: string; asset_tag: string; asset_name: string }[] }>(
      `/employees/${opts.userId}/assets`,
    )
    const q = opts.search.toLowerCase()
    return data.current
      .map((a) => ({ id: a.asset_id, asset_tag: a.asset_tag, name: a.asset_name }))
      .filter((a) => !q || a.name.toLowerCase().includes(q) || a.asset_tag.toLowerCase().includes(q))
  },

  /** People who work tickets: IT admins and super admins, from the open directory (§5.3). */
  async assignees(): Promise<Assignee[]> {
    const fetchRole = async (role: string) =>
      (await apiClient.get<{ items: Assignee[] }>('/employees', { params: { role, page_size: 100 } })).data.items
    const [it, sa] = await Promise.all([fetchRole('it_admin'), fetchRole('super_admin')])
    return [...it, ...sa].sort((a, b) => a.full_name.localeCompare(b.full_name))
  },
}
