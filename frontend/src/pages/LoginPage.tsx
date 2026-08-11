import React, { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RosterlyLogo } from '@/components/common/RosterlyLogo'
import { LoginForm } from '@/components/auth/LoginForm'
import { MFAForm } from '@/components/auth/MFAForm'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'
import { AccountLockoutNotice } from '@/components/auth/AccountLockoutNotice'
import { useAuth } from '@/hooks/useAuth'

export const LoginPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const resetToken = searchParams.get('token')

  const {
    currentStep,
    setCurrentStep,
    mfaSessionId,
    isLoading,
    errorMessage,
    clearError,
    remainingLockoutSeconds,
    handleLoginSubmit,
    handleMfaSubmit,
    handleForgotPasswordSubmit,
    handleResetPasswordSubmit,
    handleLockoutExpired,
  } = useAuth()

  // Auto-switch to reset-password step if reset token parameter exists in URL
  useEffect(() => {
    if (resetToken) {
      setCurrentStep('reset-password')
    }
  }, [resetToken, setCurrentStep])

  const handleBackToLogin = () => {
    clearError()
    setCurrentStep('login')
  }

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-background p-4 sm:p-6 lg:p-8 font-sans selection:bg-accent-container selection:text-on-accent-container">
      {/* Centered Login Container Card (Max-Width 400px per PRD §5.1) */}
      <div className="w-full max-w-[400px] space-y-6">
        {/* Rosterly Logo Header */}
        <div className="text-center">
          <RosterlyLogo size="md" showSubtitle />
        </div>

        {/* Card Surface Container */}
        <div className="rounded-lg border border-outline-variant bg-surface p-6 sm:p-8 shadow-sm transition-all duration-200">
          {currentStep === 'login' && (
            <LoginForm
              onSubmit={handleLoginSubmit}
              onForgotPasswordClick={() => {
                clearError()
                setCurrentStep('forgot-password')
              }}
              isLoading={isLoading}
              errorMessage={errorMessage}
            />
          )}

          {currentStep === 'mfa' && mfaSessionId && (
            <MFAForm
              mfaSessionId={mfaSessionId}
              onSubmit={handleMfaSubmit}
              onBackToLogin={handleBackToLogin}
              isLoading={isLoading}
              errorMessage={errorMessage}
            />
          )}

          {currentStep === 'forgot-password' && (
            <ForgotPasswordForm
              onSubmit={handleForgotPasswordSubmit}
              onBackToLogin={handleBackToLogin}
              isLoading={isLoading}
              errorMessage={errorMessage}
            />
          )}

          {currentStep === 'reset-password' && (
            <ResetPasswordForm
              token={resetToken || ''}
              onSubmit={handleResetPasswordSubmit}
              onBackToLogin={handleBackToLogin}
              isLoading={isLoading}
              errorMessage={errorMessage}
            />
          )}

          {currentStep === 'lockout' && (
            <AccountLockoutNotice
              remainingSeconds={remainingLockoutSeconds}
              onLockoutExpired={handleLockoutExpired}
              onBackToLogin={handleBackToLogin}
            />
          )}
        </div>

        {/* Security & System Info Footer */}
        <footer className="text-center space-y-1">
          <p className="text-label-caps text-on-surface-variant font-mono">
            Rosterly Platform v0.1.0 • Zero-Trust Security Enabled
          </p>
        </footer>
      </div>
    </main>
  )
}
