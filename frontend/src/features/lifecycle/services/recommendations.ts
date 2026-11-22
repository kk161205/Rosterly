import { useQuery } from '@tanstack/react-query'
import { AI_BASE_URL } from '@/lib/api-client'
import { authStorage } from '@/lib/authStorage'

/** One usual item for a new joiner. */
export interface UsualItem {
  key: string
  label: string
  /** The checklist task it becomes, e.g. "Give a Figma seat". */
  task: string
  owner: 'it_admin' | 'hr_admin'
  share: number
  /** "4 of the 5 most similar joiners got this". */
  reason: string
  licence_id?: string
}

export interface Recommendations {
  basis: { matches: number; label: string | null }
  usual: UsualItem[]
  sometimes: UsualItem[]
}

/**
 * GET /ai/onboarding-recommendations. Quiet by design: any failure (no AI
 * service, the company switched AI off, too little history) gives null and
 * the standard checklist stands.
 */
export async function fetchRecommendations(designation: string, departmentId?: string): Promise<Recommendations | null> {
  const token = authStorage.getAccessToken()
  if (!AI_BASE_URL || !token) return null
  const params = new URLSearchParams({ designation })
  if (departmentId) params.set('department_id', departmentId)
  try {
    const res = await fetch(`${AI_BASE_URL}/ai/onboarding-recommendations?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    return (await res.json()) as Recommendations
  } catch {
    return null
  }
}

/** Waits until the job title has settled (typing stops) before asking. */
export function useRecommendations(designation: string, departmentId: string, enabled: boolean) {
  const title = designation.trim()
  return useQuery({
    queryKey: ['onboarding-recommendations', title.toLowerCase(), departmentId],
    queryFn: () => fetchRecommendations(title, departmentId || undefined),
    enabled: enabled && Boolean(AI_BASE_URL) && title.length >= 2,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
