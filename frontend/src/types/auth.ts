export interface User {
  id: string
  employee_code: string
  full_name: string
  email: string
  role_id: string
  department_id?: string | null
  designation?: string | null
  status: 'active' | 'inactive' | 'onboarding' | 'offboarding' | 'terminated'
  mfa_enabled: boolean
}

export interface UserProfile {
  id: string
  email: string
  full_name: string
  role: string
}

export interface LoginRequest {
  email: string
  password: string
  device_fingerprint?: string
}

export interface LoginResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  mfa_required?: boolean
  mfa_session_id?: string
}

export interface MFAVerifyRequest {
  mfa_session_id: string
  code: string
}

export interface ForgotPasswordRequest {
  email: string
}

export interface ResetPasswordRequest {
  token: string
  new_password: string
}

export interface MessageResponse {
  message: string
}

export interface ApiErrorResponse {
  error: {
    message: string
    code: string
    details?: unknown
  }
}

export type AuthStep = 'login' | 'mfa' | 'forgot-password' | 'reset-password' | 'lockout'
