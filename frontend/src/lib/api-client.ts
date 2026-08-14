import axios, { AxiosError } from 'axios'
import { authStorage } from '@/utils/authStorage'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
})

apiClient.interceptors.request.use((config) => {
  const token = authStorage.getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      authStorage.clearTokens()
    }
    return Promise.reject(error)
  }
)

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
