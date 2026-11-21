import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

/** A company-editable setting. */
export interface CompanySetting {
  key: string
  value: unknown
  can_edit: boolean
}

export const COMPANY_SETTINGS_KEY = ['company-settings'] as const

export const companySettingsService = {
  async list(): Promise<CompanySetting[]> {
    return (await apiClient.get<CompanySetting[]>('/company-settings')).data
  },
  async update(key: string, value: unknown): Promise<CompanySetting> {
    return (await apiClient.put<CompanySetting>(`/company-settings/${key}`, { value })).data
  },
}

/** Every setting, read by any signed-in page that adapts to it. */
export function useCompanySettings() {
  return useQuery({ queryKey: COMPANY_SETTINGS_KEY, queryFn: companySettingsService.list })
}

export function settingValue(settings: CompanySetting[] | undefined, key: string): unknown {
  return settings?.find((s) => s.key === key)?.value
}
