import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '@/services/authService'
import { AuthStep, LoginResponse } from '@/types/auth'
import { authStorage } from '@/utils/authStorage'

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_DURATION_SECONDS = 15 * 60 // 15 minutes

export function useAuth() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState<AuthStep>('login')
  const [mfaSessionId, setMfaSessionId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [failedAttempts, setFailedAttempts] = useState<number>(0)
  const [lockoutEndTime, setLockoutEndTime] = useState<number | null>(null)

  const clearError = useCallback(() => setErrorMessage(null), [])

  const handleFailedAttempt = useCallback(() => {
    setFailedAttempts((prev) => {
      const next = prev + 1
      if (next >= MAX_FAILED_ATTEMPTS) {
        const lockUntil = Date.now() + LOCKOUT_DURATION_SECONDS * 1000
        setLockoutEndTime(lockUntil)
        setCurrentStep('lockout')
      }
      return next
    })
  }, [])

  const handleLoginSubmit = async (email: string, pass: string) => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const response: LoginResponse = await authService.login({ email, password: pass })

      if (response.mfa_required && response.mfa_session_id) {
        setMfaSessionId(response.mfa_session_id)
        setCurrentStep('mfa')
        setFailedAttempts(0)
      } else if (response.access_token) {
        authStorage.setAccessToken(response.access_token)
        if (response.refresh_token) {
          authStorage.setRefreshToken(response.refresh_token)
        }
        setFailedAttempts(0)
        navigate('/dashboard')
      }
    } catch (err: unknown) {
      handleFailedAttempt()
      const axiosError = err as { response?: { data?: { error?: { message?: string } } } }
      const serverMsg = axiosError.response?.data?.error?.message
      setErrorMessage(serverMsg || 'Invalid email or password')
    } finally {
      setIsLoading(false)
    }
  }

  const handleMfaSubmit = async (sessionId: string, code: string) => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const response = await authService.verifyMFA({ mfa_session_id: sessionId, code })
      if (response.access_token) {
        authStorage.setAccessToken(response.access_token)
        if (response.refresh_token) {
          authStorage.setRefreshToken(response.refresh_token)
        }
        navigate('/dashboard')
      }
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { error?: { message?: string } } } }
      const serverMsg = axiosError.response?.data?.error?.message
      setErrorMessage(serverMsg || 'Invalid MFA verification code')
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPasswordSubmit = async (email: string) => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      await authService.forgotPassword({ email })
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { error?: { message?: string } } } }
      const serverMsg = axiosError.response?.data?.error?.message
      setErrorMessage(serverMsg || 'Failed to send password reset link. Please try again.')
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetPasswordSubmit = async (token: string, newPassword: string) => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      await authService.resetPassword({ token, new_password: newPassword })
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { error?: { message?: string } } } }
      const serverMsg = axiosError.response?.data?.error?.message
      setErrorMessage(serverMsg || 'Failed to reset password. Token may be invalid or expired.')
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const handleLockoutExpired = useCallback(() => {
    setFailedAttempts(0)
    setLockoutEndTime(null)
    setCurrentStep('login')
    setErrorMessage(null)
  }, [])

  const getRemainingLockoutSeconds = (): number => {
    if (!lockoutEndTime) return 0
    const diff = Math.ceil((lockoutEndTime - Date.now()) / 1000)
    return diff > 0 ? diff : 0
  }

  return {
    currentStep,
    setCurrentStep,
    mfaSessionId,
    isLoading,
    errorMessage,
    clearError,
    failedAttempts,
    remainingLockoutSeconds: getRemainingLockoutSeconds(),
    handleLoginSubmit,
    handleMfaSubmit,
    handleForgotPasswordSubmit,
    handleResetPasswordSubmit,
    handleLockoutExpired,
  }
}
