import { apiClient } from '@/lib/api-client'
import {
  LoginRequest,
  LoginResponse,
  MFAVerifyRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  MessageResponse,
  UserProfile,
} from '@/features/auth/types/auth'
import { getDeviceFingerprint } from '@/lib/fingerprint'

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

  /** POST /auth/mfa/setup — start setting up two-step sign-in (secret + QR-code URI). */
  async startMfaSetup(): Promise<{ secret: string; otpauth_uri: string }> {
    return (await apiClient.post<{ secret: string; otpauth_uri: string }>('/auth/mfa/setup')).data
  },

  /** POST /auth/mfa/enable — confirm with a current code; returns one-time recovery codes. */
  async enableMfa(code: string): Promise<{ recovery_codes: string[] }> {
    return (await apiClient.post<{ recovery_codes: string[] }>('/auth/mfa/enable', { code })).data
  },

  /** POST /auth/mfa/disable — needs the password and a current (or recovery) code. */
  async disableMfa(password: string, code: string): Promise<MessageResponse> {
    return (await apiClient.post<MessageResponse>('/auth/mfa/disable', { password, code })).data
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

  /** POST /auth/logout — revokes this session only. */
  async logout(): Promise<void> {
    await apiClient.post('/auth/logout')
  },

  /** POST /auth/logout-all-devices — revokes every session for this user. */
  async logoutAllDevices(): Promise<void> {
    await apiClient.post('/auth/logout-all-devices')
  },
}
