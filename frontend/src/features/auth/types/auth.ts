export interface UserProfile {
  id: string
  email: string
  full_name: string
  /** Primary role — the person's title. */
  role: string
  /** Every role held, primary first (multi-role). Permissions are already their union. */
  roles?: string[]
  permissions: string[]
  department_id?: string | null
  mfa_enabled?: boolean
  /** The company requires two-step sign-in for this person's role and it isn't set up yet. */
  mfa_setup_required?: boolean
  /** The company requires two-step sign-in for this person's role (so it can't be turned off). */
  mfa_required_by_company?: boolean
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

export type AuthStep = 'login' | 'mfa' | 'forgot-password' | 'reset-password' | 'lockout'
