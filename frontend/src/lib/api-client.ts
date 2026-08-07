/**
 * Shared API client — every request/hook in the app should go through
 * this, never a one-off fetch() call. Handles the auth token and the
 * standard error envelope from the backend (project doc §7 rule 7)
 * in one place, per rules.md §2 (no ad-hoc error handling per page).
 */
import axios, { AxiosError } from 'axios'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})

// TODO(agent): wire this to the real auth/session store once built —
// do not hardcode or fake a token here. See rules.md §1.1: a stubbed
// token that always "works" hides the fact that auth isn't wired up yet.
apiClient.interceptors.request.use((config) => {
  const token = null as string | null // replace with real token retrieval
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export interface ApiErrorShape {
  error: {
    code: string
    message: string
    field_errors: Record<string, string> | null
  }
}

export function isApiError(error: unknown): error is AxiosError<ApiErrorShape> {
  return axios.isAxiosError(error) && !!error.response?.data?.error
}
