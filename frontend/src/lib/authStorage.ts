// Session tokens live in sessionStorage (cleared when the tab closes). The
// signed-in user's profile is not cached here — it comes from GET /auth/me
// (useCurrentUser) so the role and permissions are always live.
const ACCESS_TOKEN_KEY = 'rosterly_access_token'
const REFRESH_TOKEN_KEY = 'rosterly_refresh_token'
// Written by earlier builds; still removed on sign-out so nothing stale lingers
const LEGACY_PROFILE_KEY = 'rosterly_user_profile'

export const authStorage = {
  getAccessToken(): string | null {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY)
  },

  getRefreshToken(): string | null {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY)
  },

  setAccessToken(token: string) {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token)
  },

  setRefreshToken(token: string) {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, token)
  },

  clearTokens() {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY)
    sessionStorage.removeItem(REFRESH_TOKEN_KEY)
    sessionStorage.removeItem(LEGACY_PROFILE_KEY)
  },
}
