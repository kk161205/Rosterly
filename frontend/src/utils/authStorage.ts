import { UserProfile } from '@/types/auth'

const ACCESS_TOKEN_KEY = 'rosterly_access_token'
const REFRESH_TOKEN_KEY = 'rosterly_refresh_token'
const USER_PROFILE_KEY = 'rosterly_user_profile'

export const authStorage = {
  getAccessToken(): string | null {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY)
  },

  getRefreshToken(): string | null {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY)
  },

  getUser(): UserProfile | null {
    try {
      const raw = sessionStorage.getItem(USER_PROFILE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },

  getUserRole(): import('@/types/dashboard').UserRole | null {
    const user = this.getUser()
    return (user?.role as import('@/types/dashboard').UserRole) || null
  },

  setAccessToken(token: string) {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token)
  },

  setRefreshToken(token: string) {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, token)
  },

  setUser(user: UserProfile) {
    sessionStorage.setItem(USER_PROFILE_KEY, JSON.stringify(user))
  },

  clearTokens() {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY)
    sessionStorage.removeItem(REFRESH_TOKEN_KEY)
    sessionStorage.removeItem(USER_PROFILE_KEY)
  },
}
