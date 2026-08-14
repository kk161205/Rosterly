const ACCESS_TOKEN_KEY = 'rosterly_access_token'
const REFRESH_TOKEN_KEY = 'rosterly_refresh_token'

export const authStorage = {
  getAccessToken(): string | null {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem(ACCESS_TOKEN_KEY)
  },

  getRefreshToken(): string | null {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY) || localStorage.getItem(REFRESH_TOKEN_KEY)
  },

  setAccessToken(token: string) {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token)
    localStorage.setItem(ACCESS_TOKEN_KEY, token)
  },

  setRefreshToken(token: string) {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, token)
    localStorage.setItem(REFRESH_TOKEN_KEY, token)
  },

  clearTokens() {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY)
    sessionStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  },
}
