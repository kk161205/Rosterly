import React, { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Laptop, Shield } from 'lucide-react'
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
    <main className="min-h-screen w-full flex flex-col lg:flex-row bg-background font-sans selection:bg-accent-container selection:text-on-accent-container">
      {/* ========================================================================= */}
      {/* LEFT COLUMN: Deep Navy Brand Hero Panel (Clean & Minimal)                 */}
      {/* ========================================================================= */}
      <div className="hidden lg:flex flex-1 flex-col justify-between bg-primary p-12 xl:p-16 relative overflow-hidden text-on-primary select-none">
        {/* Subtle Ambient Radial Glow Accents */}
        <div className="absolute -top-32 -right-32 h-[450px] w-[450px] rounded-full bg-accent/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 h-[450px] w-[450px] rounded-full bg-tertiary-container/25 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff0d_1px,transparent_1px)] [background-size:28px_28px] pointer-events-none opacity-40" />

        {/* Top Minimal Brand Tag */}
        <div className="relative z-10">
          <span className="text-body-sm font-medium tracking-wide text-white/75 font-mono">
            ROSTERLY ENTERPRISE
          </span>
        </div>

        {/* Central Hero Showcase */}
        <div className="relative z-10 my-auto max-w-lg space-y-6">
          <h2 className="text-display-lg font-bold tracking-tight text-white leading-[1.15]">
            Unified Workforce & Asset Orchestration
          </h2>
          <p className="text-body-md text-white/80 leading-relaxed">
            Manage employee lifecycles, hardware inventory, and departmental approvals with zero-trust security.
          </p>

          <div className="pt-2 flex flex-col gap-3">
            <div className="flex items-center gap-3 p-3.5 rounded-lg bg-white/[0.06] border border-white/10 backdrop-blur-sm">
              <Laptop className="h-5 w-5 text-accent-container shrink-0" />
              <span className="text-body-sm text-white/90 font-medium">
                Hardware tracking, software licenses & depreciation
              </span>
            </div>
            <div className="flex items-center gap-3 p-3.5 rounded-lg bg-white/[0.06] border border-white/10 backdrop-blur-sm">
              <Shield className="h-5 w-5 text-tertiary-container shrink-0" />
              <span className="text-body-sm text-white/90 font-medium">
                Zero-trust session control & immediate role scoping
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Minimal Info */}
        <div className="relative z-10 pt-6 border-t border-white/10 flex items-center justify-between text-body-sm text-white/60">
          <span>Enterprise Platform</span>
          <span className="font-mono text-label-caps">v0.1.0</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIGHT COLUMN: Clean, Focused Authentication Container (Centered)          */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col justify-between items-center p-6 sm:p-10 lg:p-12 xl:p-16 w-full lg:w-[48%] xl:w-[45%] bg-background">
        {/* Top spacer to balance vertical alignment */}
        <div className="w-full" />

        {/* Center Main Form Box */}
        <div className="w-full max-w-[420px] my-auto py-6">
          {currentStep === 'login' && (
            <div className="space-y-6">
              <div className="flex flex-col items-center text-center space-y-3 mb-2">
                <RosterlyLogo size="lg" align="center" className="mb-2" />
                <h1 className="text-headline-lg font-bold text-on-surface tracking-tight">
                  Welcome back
                </h1>
                <p className="text-body-md text-on-surface-variant">
                  Enter your credentials to access your workspace.
                </p>
              </div>

              <LoginForm
                onSubmit={handleLoginSubmit}
                onForgotPasswordClick={() => {
                  clearError()
                  setCurrentStep('forgot-password')
                }}
                isLoading={isLoading}
                errorMessage={errorMessage}
              />
            </div>
          )}

          {currentStep === 'mfa' && mfaSessionId && (
            <div className="space-y-6">
              <div className="flex justify-center mb-2">
                <RosterlyLogo size="md" align="center" />
              </div>
              <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-6 sm:p-8 shadow-sm">
                <MFAForm
                  mfaSessionId={mfaSessionId}
                  onSubmit={handleMfaSubmit}
                  onBackToLogin={handleBackToLogin}
                  isLoading={isLoading}
                  errorMessage={errorMessage}
                />
              </div>
            </div>
          )}

          {currentStep === 'forgot-password' && (
            <div className="space-y-6">
              <div className="flex justify-center mb-2">
                <RosterlyLogo size="md" align="center" />
              </div>
              <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-6 sm:p-8 shadow-sm">
                <ForgotPasswordForm
                  onSubmit={handleForgotPasswordSubmit}
                  onBackToLogin={handleBackToLogin}
                  isLoading={isLoading}
                  errorMessage={errorMessage}
                />
              </div>
            </div>
          )}

          {currentStep === 'reset-password' && (
            <div className="space-y-6">
              <div className="flex justify-center mb-2">
                <RosterlyLogo size="md" align="center" />
              </div>
              <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-6 sm:p-8 shadow-sm">
                <ResetPasswordForm
                  token={resetToken || ''}
                  onSubmit={handleResetPasswordSubmit}
                  onBackToLogin={handleBackToLogin}
                  isLoading={isLoading}
                  errorMessage={errorMessage}
                />
              </div>
            </div>
          )}

          {currentStep === 'lockout' && (
            <div className="space-y-6">
              <div className="flex justify-center mb-2">
                <RosterlyLogo size="md" align="center" />
              </div>
              <div className="rounded-xl border border-error/20 bg-surface-container-lowest p-6 sm:p-8 shadow-sm">
                <AccountLockoutNotice
                  remainingSeconds={remainingLockoutSeconds}
                  onLockoutExpired={handleLockoutExpired}
                  onBackToLogin={handleBackToLogin}
                />
              </div>
            </div>
          )}
        </div>

        {/* Minimal Footer */}
        <footer className="w-full max-w-[420px] pt-6 border-t border-outline-variant/20 flex items-center justify-between text-on-surface-variant/70 text-body-sm">
          <span className="text-label-caps">Secure Zero-Trust Session</span>
          <span className="text-label-caps">© 2026 Rosterly</span>
        </footer>
      </div>
    </main>
  )
}






