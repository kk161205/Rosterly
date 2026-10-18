import React, { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AccountLockoutNotice } from '@/features/auth/components/AccountLockoutNotice'
import { ForgotPasswordForm } from '@/features/auth/components/ForgotPasswordForm'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { MFAForm } from '@/features/auth/components/MFAForm'
import { ResetPasswordForm } from '@/features/auth/components/ResetPasswordForm'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { Logo } from '@/ui'

/** What the product covers — stated plainly, no sample data. */
const CAPABILITIES: { title: string; text: string }[] = [
  { title: 'Joiners and leavers', text: 'Onboarding and offboarding checklists with an owner and a date on every step.' },
  { title: 'Assets', text: 'Who holds each device, plus its warranty, value and full history.' },
  { title: 'Approvals', text: 'Requests routed to the right approvers in order, with an audit trail.' },
]

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

  // A set-password / invite link (?token=…) opens straight on the reset step
  useEffect(() => {
    if (resetToken) setCurrentStep('reset-password')
  }, [resetToken, setCurrentStep])

  const backToLogin = () => {
    clearError()
    setCurrentStep('login')
  }

  return (
    <div className="flex min-h-screen flex-col bg-ground">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-5 sm:px-12">
        <Logo />
        <p className="hidden text-body text-muted sm:block">
          New here?{' '}
          <span className="font-medium text-ink">Ask your HR or IT admin for an invite.</span>
        </p>
      </header>

      <main className="grid flex-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="flex items-center justify-center px-6 py-12 sm:px-12 sm:py-16" aria-label="Sign in">
          {/* First in the DOM so the h1 leads the reading order; the pitch is moved left visually */}
          <div className="w-full max-w-[400px]">
          {currentStep === 'login' && (
            <div className="flex flex-col gap-7">
              <div>
                <h1 className="font-display text-page text-ink">Sign in</h1>
                <p className="mt-1.5 text-lead text-muted">Use your work email and password.</p>
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
              <p className="text-meta text-muted">
                If two-step verification is on, we&apos;ll ask for a 6-digit code next.
                <span className="sm:hidden"> Sessions are verified on every request.</span>
              </p>
              <p className="border-t border-line pt-5 text-meta text-muted sm:hidden">
                New here? <span className="font-medium text-ink">Ask your HR or IT admin for an invite.</span>
              </p>
            </div>
          )}

          {currentStep === 'mfa' && mfaSessionId && (
            <MFAForm
              mfaSessionId={mfaSessionId}
              onSubmit={handleMfaSubmit}
              onBackToLogin={backToLogin}
              isLoading={isLoading}
              errorMessage={errorMessage}
            />
          )}

          {currentStep === 'forgot-password' && (
            <ForgotPasswordForm
              onSubmit={handleForgotPasswordSubmit}
              onBackToLogin={backToLogin}
              isLoading={isLoading}
              errorMessage={errorMessage}
            />
          )}

          {currentStep === 'reset-password' && (
            <ResetPasswordForm
              token={resetToken || ''}
              onSubmit={handleResetPasswordSubmit}
              onBackToLogin={backToLogin}
              isLoading={isLoading}
              errorMessage={errorMessage}
            />
          )}

          {currentStep === 'lockout' && (
            <AccountLockoutNotice
              remainingSeconds={remainingLockoutSeconds}
              onLockoutExpired={handleLockoutExpired}
              onBackToLogin={backToLogin}
            />
          )}
          </div>
        </section>

        <section
          className="hidden flex-col justify-center bg-tint px-12 py-16 lg:order-first lg:flex xl:pr-20"
          aria-label="About Rosterly"
        >
          <div className="flex w-full max-w-[620px] flex-col gap-10">
            <div className="flex flex-col gap-6">
              <h2 className="text-balance font-display text-hero text-ink">People, devices and access. Kept in one place.</h2>
              <p className="max-w-[540px] text-pretty text-intro text-muted">
                One record of who works here, what they were given and what they can open — from their first day to
                their last.
              </p>
            </div>
            {/* Three columns from 1440px; stacked rows below so the copy never squeezes */}
            <ul className="m-0 grid list-none border-t border-ink p-0 wide:grid-cols-3">
              {CAPABILITIES.map((c, i) => (
                <li
                  key={c.title}
                  className={
                    i === 0
                      ? 'py-4 wide:pb-0 wide:pr-6 wide:pt-5'
                      : 'border-t border-line py-4 wide:border-l wide:border-t-0 wide:px-6 wide:pb-0 wide:pt-5'
                  }
                >
                  <p className="text-body font-semibold text-ink">{c.title}</p>
                  <p className="mt-2 text-pretty text-meta text-muted">{c.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="flex flex-wrap justify-between gap-x-6 gap-y-2 border-t border-line px-6 py-5 text-meta text-muted sm:px-12">
        <span>© 2026 Rosterly</span>
        <span className="hidden sm:inline">Sessions verified on every request · Two-step verification</span>
      </footer>
    </div>
  )
}
