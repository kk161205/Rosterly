import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { TileDesignId } from '@/guide/designs'

export interface Preferences {
  /** The Guide tile's design (stored as `accent` for older saved choices). */
  accent: TileDesignId
  assistant_enabled: boolean
  guide_style: 'show' | 'take'
  voice_enabled: boolean
  /** The company switch (Access → Settings); when false, no AI feature shows for anyone. */
  company_assistant_enabled: boolean
}

export type PreferencesUpdate = Partial<Pick<Preferences, 'accent' | 'assistant_enabled' | 'guide_style' | 'voice_enabled'>>

export const PREFERENCES_KEY = ['me', 'preferences'] as const

export const preferencesService = {
  async get(): Promise<Preferences> {
    return (await apiClient.get<Preferences>('/me/preferences')).data
  },
  async update(data: PreferencesUpdate): Promise<Preferences> {
    return (await apiClient.patch<Preferences>('/me/preferences', data)).data
  },
}

/** GET /me/preferences. */
export function usePreferences(enabled = true) {
  return useQuery({ queryKey: PREFERENCES_KEY, queryFn: preferencesService.get, enabled, staleTime: 5 * 60 * 1000 })
}

const SAVE_KEY = ['preferences', 'save']

/**
 * PATCH /me/preferences, updating the cache straight away so the change shows
 * instantly. Saves run one after another (one scope), so quick clicks reach
 * the server in order and the last choice is the one kept.
 */
export function useUpdatePreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: SAVE_KEY,
    scope: { id: 'preferences' },
    mutationFn: preferencesService.update,
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: PREFERENCES_KEY })
      const before = queryClient.getQueryData<Preferences>(PREFERENCES_KEY)
      if (before) queryClient.setQueryData<Preferences>(PREFERENCES_KEY, { ...before, ...change })
      return { before }
    },
    onError: (_err, _change, context) => {
      if (queryClient.isMutating({ mutationKey: SAVE_KEY }) > 1) void queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY })
      else if (context?.before) queryClient.setQueryData(PREFERENCES_KEY, context.before)
    },
    // An older save's reply mustn't overwrite a newer choice still on its way
    onSuccess: (saved) => {
      if (queryClient.isMutating({ mutationKey: SAVE_KEY }) <= 1) queryClient.setQueryData(PREFERENCES_KEY, saved)
    },
  })
}

/** True when the Guide may appear for this person: the company allows it and they haven't turned it off. */
export const guideAllowed = (p: Preferences | undefined) => Boolean(p && p.company_assistant_enabled && p.assistant_enabled)
