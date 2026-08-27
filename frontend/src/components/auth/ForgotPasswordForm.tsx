import React, { useState } from 'react'
import { ArrowLeft, KeyRound, CheckCircle2, AlertCircle, Mail } from 'lucide-react'
import { Button } from '@/components/common/CommonUI'

interface ForgotPasswordFormProps {
  onSubmit: (email: string) => Promise<void>
  onBackToLogin: () => void
  isLoading?: boolean
  errorMessage?: string | null
}

export const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({
  onSubmit,
  onBackToLogin,
  isLoading = false,
  errorMessage = null,
}) => {
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  const validateEmail = (val: string): boolean => {
    if (!val.trim()) {
      setEmailError('Email is required')
      return false
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(val.trim())) {
      setEmailError('Please enter a valid work email')
      return false
    }
    setEmailError(null)
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailTouched(true)
    if (!validateEmail(email)) return

    try {
      await onSubmit(email.trim())
      setIsSuccess(true)
    } catch {
      // Error handled by parent component if needed
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col items-center text-center space-y-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
          <KeyRound className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-title-md font-semibold text-on-surface font-sans">
          Reset Your Password
        </h2>
        <p className="text-body-sm text-on-surface-variant max-w-xs">
          Enter your work email address and we&apos;ll send you instructions to reset your password.
        </p>
      </div>

      {/* Success Notification */}
      {isSuccess ? (
        <div className="space-y-5 rounded-lg bg-surface-container-low p-5 border border-outline-variant text-center animate-fadeIn">
          <div className="flex justify-center text-tertiary">
            <CheckCircle2 className="h-8 w-8 text-tertiary" />
          </div>
          <div className="space-y-1">
            <h3 className="text-body-md font-semibold text-on-surface">
              Check your inbox
            </h3>
            <p className="text-body-sm text-on-surface-variant">
              If an active account exists for <span className="font-medium text-on-surface">{email}</span>, password reset instructions have been sent.
            </p>
          </div>
          <Button type="button" variant="primary" onClick={onBackToLogin} className="w-full" icon={<ArrowLeft className="h-4 w-4" />}>
            Return to Login
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {errorMessage && (
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-md bg-error-container p-3 text-body-sm text-on-error-container border border-error/20"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-error" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="forgot-email"
              className="block text-body-sm font-medium text-on-surface"
            >
              Work Email
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-on-surface-variant/70">
                <Mail className="h-4 w-4" />
              </div>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (emailTouched) validateEmail(e.target.value)
                }}
                onBlur={() => {
                  setEmailTouched(true)
                  validateEmail(email)
                }}
                placeholder="alex.chen@rosterly.example"
                disabled={isLoading}
                className={`w-full rounded-md border pl-10 pr-3.5 py-2.5 text-body-md text-on-surface bg-surface placeholder:text-on-surface-variant/40 transition-all duration-150 focus:outline-none ${
                  emailTouched && emailError
                    ? 'border-error ring-1 ring-error/20'
                    : 'border-outline-variant hover:border-outline focus:border-accent focus:ring-2 focus:ring-accent/15'
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              />
            </div>
            {emailTouched && emailError && (
              <p className="text-body-sm text-error mt-1">{emailError}</p>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isLoading}
            disabled={isLoading || !email}
            className="w-full mt-2"
          >
            {isLoading ? 'Sending reset link…' : 'Send Reset Instructions'}
          </Button>

          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={onBackToLogin}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 text-body-sm text-on-surface-variant hover:text-on-surface transition-colors focus:outline-none cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to login</span>
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

