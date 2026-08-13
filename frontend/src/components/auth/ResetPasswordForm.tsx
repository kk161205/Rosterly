import React, { useState } from 'react'
import { Eye, EyeOff, Loader2, Lock, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react'

interface ResetPasswordFormProps {
  token: string
  onSubmit: (token: string, newPassword: string) => Promise<void>
  onBackToLogin: () => void
  isLoading?: boolean
  errorMessage?: string | null
}

export const ResetPasswordForm: React.FC<ResetPasswordFormProps> = ({
  token,
  onSubmit,
  onBackToLogin,
  isLoading = false,
  errorMessage = null,
}) => {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters long')
      return
    }

    if (password !== confirmPassword) {
      setValidationError('Passwords do not match')
      return
    }

    try {
      await onSubmit(token, password)
      setIsSuccess(true)
    } catch {
      // Handled by parent if needed
    }
  }

  // Password strength checks
  const hasMinLength = password.length >= 8
  const hasNumber = /\d/.test(password)
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password)

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center space-y-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-container text-on-accent-container">
          <Lock className="h-6 w-6 text-accent" />
        </div>
        <h2 className="text-title-md font-semibold text-on-surface font-sans">
          Set New Password
        </h2>
        <p className="text-body-sm text-on-surface-variant max-w-xs">
          Please enter your new secure password below.
        </p>
      </div>

      {isSuccess ? (
        <div className="space-y-5 rounded-lg bg-surface-container-low p-5 border border-outline-variant text-center animate-fadeIn">
          <div className="flex justify-center text-tertiary">
            <CheckCircle2 className="h-8 w-8 text-tertiary" />
          </div>
          <div className="space-y-1">
            <h3 className="text-body-md font-semibold text-on-surface">
              Password Reset Successfully
            </h3>
            <p className="text-body-sm text-on-surface-variant">
              Your password has been updated. All active sessions have been invalidated for security.
            </p>
          </div>
          <button
            type="button"
            onClick={onBackToLogin}
            className="w-full flex items-center justify-center gap-1.5 rounded-md bg-accent px-4 py-2.5 text-body-md font-medium text-on-accent hover:bg-accent/90 transition-colors cursor-pointer"
          >
            <span>Proceed to Login</span>
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {(errorMessage || validationError) && (
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-md bg-error-container p-3 text-body-sm text-on-error-container border border-error/20"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-error" />
              <span>{validationError || errorMessage}</span>
            </div>
          )}

          {/* New Password */}
          <div className="space-y-1.5">
            <label
              htmlFor="new-password"
              className="block text-body-sm font-medium text-on-surface"
            >
              New Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-on-surface-variant/70">
                <Lock className="h-4 w-4" />
              </div>
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                disabled={isLoading}
                className="w-full rounded-md border border-outline-variant hover:border-outline pl-10 pr-10 py-2.5 text-body-md text-on-surface bg-surface placeholder:text-on-surface-variant/40 transition-all duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-on-surface focus:outline-none cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Password Requirements */}
          <div className="space-y-1.5 rounded-md bg-surface-container-low p-3 text-body-sm border border-outline-variant/40">
            <p className="font-medium text-on-surface text-label-caps">Password requirements:</p>
            <ul className="space-y-1 text-on-surface-variant text-body-sm">
              <li className={`flex items-center gap-1.5 ${hasMinLength ? 'text-tertiary font-medium' : ''}`}>
                <span>{hasMinLength ? '✓' : '•'} At least 8 characters</span>
              </li>
              <li className={`flex items-center gap-1.5 ${hasNumber ? 'text-tertiary font-medium' : ''}`}>
                <span>{hasNumber ? '✓' : '•'} Contains a number</span>
              </li>
              <li className={`flex items-center gap-1.5 ${hasSpecial ? 'text-tertiary font-medium' : ''}`}>
                <span>{hasSpecial ? '✓' : '•'} Contains a special character</span>
              </li>
            </ul>
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <label
              htmlFor="confirm-password"
              className="block text-body-sm font-medium text-on-surface"
            >
              Confirm New Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-on-surface-variant/70">
                <Lock className="h-4 w-4" />
              </div>
              <input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                disabled={isLoading}
                className="w-full rounded-md border border-outline-variant hover:border-outline pl-10 pr-3.5 py-2.5 text-body-md text-on-surface bg-surface placeholder:text-on-surface-variant/40 transition-all duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !password || !confirmPassword}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-body-md font-medium text-on-accent shadow-sm transition-all duration-150 hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Resetting password…</span>
              </>
            ) : (
              <span>Reset Password</span>
            )}
          </button>

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

