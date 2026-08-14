import { apiClient } from '@/lib/api-client'
import {
  LoginRequest,
  LoginResponse,
  MFAVerifyRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  MessageResponse,
  UserProfile,
} from '@/types/auth'
import { getDeviceFingerprint } from '@/utils/fingerprint'

export const authService = {
  /**
   * GET /auth/me
   * Fetches currently authenticated user profile from active zero-trust session.
   */
  async getCurrentUser(): Promise<UserProfile> {
    const response = await apiClient.get<UserProfile>('/auth/me')
    return response.data
  },

  /**
   * POST /auth/login
   * Authenticates email & password. Returns tokens or mfa_required state.
   */
  async login(credentials: Omit<LoginRequest, 'device_fingerprint'>): Promise<LoginResponse> {
    const payload: LoginRequest = {
      ...credentials,
      device_fingerprint: getDeviceFingerprint(),
    }
    const response = await apiClient.post<LoginResponse>('/auth/login', payload)
    return response.data
  },

  /**
   * POST /auth/mfa/verify
   * Verifies 6-digit MFA code using mfa_session_id.
   */
  async verifyMFA(data: MFAVerifyRequest): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>('/auth/mfa/verify', data)
    return response.data
  },

  /**
   * POST /auth/forgot-password
   * Requests password reset link. Returns standard message response.
   */
  async forgotPassword(data: ForgotPasswordRequest): Promise<MessageResponse> {
    const response = await apiClient.post<MessageResponse>('/auth/forgot-password', data)
    return response.data
  },

  /**
   * POST /auth/reset-password
   * Resets password using token and new password.
   */
  async resetPassword(data: ResetPasswordRequest): Promise<MessageResponse> {
    const response = await apiClient.post<MessageResponse>('/auth/reset-password', data)
    return response.data
  },

  /**
   * POST /auth/refresh
   * Rotates refresh token.
   */
  async refresh(refreshToken: string): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>('/auth/refresh', {
      refresh_token: refreshToken,
    })
    return response.data
  },
}
