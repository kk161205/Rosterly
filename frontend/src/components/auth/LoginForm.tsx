import React, { useState } from 'react'
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'

interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>
  onForgotPasswordClick: () => void
  isLoading?: boolean
  errorMessage?: string | null
}

export const LoginForm: React.FC<LoginFormProps> = ({
  onSubmit,
  onForgotPasswordClick,
  isLoading = false,
  errorMessage = null,
}) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailTouched, setEmailTouched] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  const validateEmail = (val: string): boolean => {
    if (!val.trim()) {
      setEmailError('Email is required')
      return false
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(val.trim())) {
      setEmailError('Please enter a valid email address')
      return false
    }
    setEmailError(null)
    return true
  }

  const handleEmailBlur = () => {
    setEmailTouched(true)
    validateEmail(email)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailTouched(true)
    const isEmailValid = validateEmail(email)

    if (!isEmailValid || !password) {
      return
    }

    await onSubmit(email.trim(), password)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* Auth Error Banner */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-sm bg-error-container p-3 text-body-sm text-on-error-container border border-error/20 animate-fadeIn"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-error" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Email Input Field */}
      <div className="space-y-1.5">
        <label
          htmlFor="login-email"
          className="block text-body-sm font-medium text-on-surface"
        >
          Work Email
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (emailTouched) validateEmail(e.target.value)
          }}
          onBlur={handleEmailBlur}
          placeholder="name@company.com"
          disabled={isLoading}
          className={`w-full rounded-sm border px-3.5 py-2.5 text-body-md text-on-surface bg-surface placeholder:text-outline/70 transition-all duration-150 focus:outline-none ${
            emailTouched && emailError
              ? 'border-error ring-1 ring-error/20'
              : 'border-outline-variant focus:border-accent focus:ring-2 focus:ring-accent/15'
          } disabled:opacity-60 disabled:cursor-not-allowed`}
        />
        {emailTouched && emailError && (
          <p className="text-body-sm text-error mt-1">{emailError}</p>
        )}
      </div>

      {/* Password Input Field */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor="login-password"
            className="block text-body-sm font-medium text-on-surface"
          >
            Password
          </label>
          <button
            type="button"
            onClick={onForgotPasswordClick}
            className="text-body-sm font-medium text-accent hover:text-on-accent-container transition-colors focus:outline-none"
          >
            Forgot password?
          </button>
        </div>

        <div className="relative">
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            disabled={isLoading}
            className="w-full rounded-sm border border-outline-variant px-3.5 py-2.5 pr-10 text-body-md text-on-surface bg-surface placeholder:text-outline/70 transition-all duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            disabled={isLoading}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface-variant focus:outline-none transition-colors"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Submit Action Button */}
      <button
        type="submit"
        disabled={isLoading || !email || !password}
        className="w-full flex items-center justify-center gap-2 rounded-sm bg-accent px-4 py-2.5 text-body-md font-medium text-on-accent shadow-sm transition-all duration-150 hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Logging in…</span>
          </>
        ) : (
          <span>Log in</span>
        )}
      </button>
    </form>
  )
}
