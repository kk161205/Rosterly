import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { authStorage } from '@/lib/authStorage'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1'
/** The AI service. Empty = no AI: the Guide uses the page map only. */
export const AI_BASE_URL = ((import.meta.env.VITE_AI_BASE_URL as string) || '').replace(/\/$/, '')

/** Fired when the API says two-step sign-in must be set up first (403 mfa_setup_required). */
export const MFA_REQUIRED_EVENT = 'rosterly:mfa-setup-required'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Long enough for a free-tier host to wake from sleep (about a minute).
  timeout: 70000,
})

// Attach live access token to every outgoing request
apiClient.interceptors.request.use((config) => {
  const token = authStorage.getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Silent token refresh state & queue
let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (token) {
      prom.resolve(token)
    } else {
      prom.reject(error)
    }
  })
  failedQueue = []
}

interface ExtendedAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const code = (error.response?.data as { error?: { code?: string } } | undefined)?.error?.code
    if (error.response?.status === 403 && code === 'mfa_setup_required' && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(MFA_REQUIRED_EVENT))
    }
    const originalRequest = error.config as ExtendedAxiosRequestConfig | undefined

    // Bypass refresh logic for unauthenticated public auth endpoints
    const requestUrl = originalRequest?.url || ''
    const isAuthEndpoint =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/refresh') ||
      requestUrl.includes('/auth/forgot-password') ||
      requestUrl.includes('/auth/reset-password') ||
      requestUrl.includes('/auth/mfa/verify')

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      const refreshToken = authStorage.getRefreshToken()

      if (!refreshToken) {
        authStorage.clearTokens()
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((newAccessToken) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
            }
            return apiClient(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        // Direct axios call without interceptor to prevent loop
        const refreshResponse = await axios.post<{
          access_token: string
          refresh_token: string
          expires_in: number
        }>(`${API_BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        })

        const { access_token, refresh_token: newRefreshToken } = refreshResponse.data
        authStorage.setAccessToken(access_token)
        if (newRefreshToken) {
          authStorage.setRefreshToken(newRefreshToken)
        }

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`
        }

        processQueue(null, access_token)
        return apiClient(originalRequest)
      } catch (refreshErr) {
        processQueue(refreshErr, null)
        // Only an invalid or expired refresh token ends the session. A timeout, a busy
        // server (429/5xx) or a dropped connection must not sign someone out mid-form.
        const status = axios.isAxiosError(refreshErr) ? refreshErr.response?.status : undefined
        if (status === 400 || status === 401) {
          authStorage.clearTokens()
          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            window.location.href = '/login'
          }
        }
        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

/**
 * Wakes the API if it's asleep (free hosting sleeps after a quiet spell), so
 * by the time someone has typed their password the server is ready. Errors
 * are ignored — this is only a nudge.
 */
export function wakeServer(): void {
  const healthUrl = API_BASE_URL.replace(/\/api\/v\d+\/?$/, '') + '/health'
  fetch(healthUrl, { method: 'GET', cache: 'no-store' }).catch(() => undefined)
  // The AI service sleeps too; wake it alongside so the Guide is ready (Deployment).
  if (AI_BASE_URL) fetch(`${AI_BASE_URL}/health`, { method: 'GET', cache: 'no-store' }).catch(() => undefined)
}
