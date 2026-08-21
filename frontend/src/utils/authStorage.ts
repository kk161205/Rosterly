import { UserProfile } from '@/types/auth'

const ACCESS_TOKEN_KEY = 'rosterly_access_token'
const REFRESH_TOKEN_KEY = 'rosterly_refresh_token'
const USER_PROFILE_KEY = 'rosterly_user_profile'

export const authStorage = {
  getAccessToken(): string | null {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem(ACCESS_TOKEN_KEY)
  },

  getRefreshToken(): string | null {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY) || localStorage.getItem(REFRESH_TOKEN_KEY)
  },

  getUser(): UserProfile | null {
    try {
      const raw = sessionStorage.getItem(USER_PROFILE_KEY) || localStorage.getItem(USER_PROFILE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },

  getUserRole(): import('@/types/dashboard').UserRole | null {
    const user = this.getUser()
    return (user?.role as import('@/types/dashboard').UserRole) || null
  },

  setUserRole(role: import('@/types/dashboard').UserRole) {
    const user = this.getUser()
    if (user) {
      this.setUser({ ...user, role })
    }
  },

  setAccessToken(token: string) {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token)
    localStorage.setItem(ACCESS_TOKEN_KEY, token)
  },

  setRefreshToken(token: string) {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, token)
    localStorage.setItem(REFRESH_TOKEN_KEY, token)
  },

  setUser(user: UserProfile) {
    const serialized = JSON.stringify(user)
    sessionStorage.setItem(USER_PROFILE_KEY, serialized)
    localStorage.setItem(USER_PROFILE_KEY, serialized)
  },

  clearTokens() {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY)
    sessionStorage.removeItem(REFRESH_TOKEN_KEY)
    sessionStorage.removeItem(USER_PROFILE_KEY)
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(USER_PROFILE_KEY)
  },
}
