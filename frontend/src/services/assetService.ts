import { apiClient } from '@/lib/api-client'
import {
  Asset,
  AssetListResponse,
  AssetQueryFilters,
  AssetCreatePayload,
  AssetUpdatePayload,
  AssetBulkUpdatePayload,
  AssetMetaResponse,
  AssetSummaryStats,
} from '@/types/assets'
import { Department } from '@/types/employee'

export const assetService = {
  /**
   * Fetches paginated list of assets with search and filter support.
   */
  async getAssets(filters: AssetQueryFilters = {}): Promise<AssetListResponse> {
    const params = new URLSearchParams()
    if (filters.search) params.append('search', filters.search)
    if (filters.category && filters.category !== 'all') params.append('category', filters.category)
    if (filters.status && filters.status !== 'all') params.append('status', filters.status)
    if (filters.department_id && filters.department_id !== 'all') params.append('department_id', filters.department_id)
    if (filters.page) params.append('page', String(filters.page))
    if (filters.page_size) params.append('page_size', String(filters.page_size))

    const response = await apiClient.get<AssetListResponse>(`/assets?${params.toString()}`)
    return response.data
  },

  /**
   * Fetches departments for holder department filter dropdown.
   */
  async getDepartments(): Promise<Department[]> {
    const response = await apiClient.get<Department[]>('/departments')
    return response.data
  },

  /**
   * Real filter-option data for Category (distinct values in use, role-scoped)
   * and Status (fixed enum) — never hardcode these (rules.md §1.1).
   */
  async getAssetMeta(): Promise<AssetMetaResponse> {
    const response = await apiClient.get<AssetMetaResponse>('/assets/meta')
    return response.data
  },

  /**
   * Real, server-computed aggregate counts for the Summary Ribbon — computed
   * across the whole role-scoped catalog, not derived from one paginated page.
   */
  async getAssetSummary(): Promise<AssetSummaryStats> {
    const response = await apiClient.get<{
      total: number
      deployed: number
      in_stock: number
      under_maintenance: number
    }>('/assets/summary')
    return {
      total: response.data.total,
      deployed: response.data.deployed,
      inStock: response.data.in_stock,
      underMaintenance: response.data.under_maintenance,
    }
  },

  /**
   * Provisions a new asset in the catalog with server-generated tag.
   */
  async createAsset(payload: AssetCreatePayload): Promise<Asset> {
    const response = await apiClient.post<Asset>('/assets', payload)
    return response.data
  },

  /**
   * Updates an existing asset record.
   */
  async updateAsset(id: string, payload: AssetUpdatePayload): Promise<Asset> {
    const response = await apiClient.patch<Asset>(`/assets/${id}`, payload)
    return response.data
  },

  /**
   * Performs an atomic bulk status update on multiple assets.
   */
  async bulkUpdateAssets(payload: AssetBulkUpdatePayload): Promise<{ updated_count: number }> {
    const response = await apiClient.patch<{ updated_count: number }>('/assets/bulk', payload)
    return response.data
  },

  /**
   * Hard-deletes an asset (Super Admin only, reserved for data-entry mistakes).
   */
  async deleteAsset(id: string): Promise<void> {
    await apiClient.delete(`/assets/${id}`)
  },
}
