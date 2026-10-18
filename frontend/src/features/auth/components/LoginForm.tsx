import React, { useState } from 'react'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { Alert, Button, TextField } from '@/ui'

interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>
  onForgotPasswordClick: () => void
  isLoading?: boolean
  errorMessage?: string | null
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const validateEmail = (val: string): boolean => {
    if (!val.trim()) {
      setEmailError('Email is required')
      return false
    }
    if (!EMAIL_RX.test(val.trim())) {
      setEmailError('Please enter a valid email address')
      return false
    }
    setEmailError(null)
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailTouched(true)
    const emailOk = validateEmail(email)
    setPasswordError(password ? null : 'Password is required')
    if (!emailOk || !password) return
    await onSubmit(email.trim(), password)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

      <TextField
        label="Work email"
        type="email"
        autoComplete="email"
        placeholder="name@company.com"
        value={email}
        disabled={isLoading}
        error={emailTouched ? emailError : null}
        onChange={(e) => {
          setEmail(e.target.value)
          if (emailTouched) validateEmail(e.target.value)
        }}
        onBlur={() => {
          setEmailTouched(true)
          validateEmail(email)
        }}
      />

      <TextField
        label="Password"
        type={showPassword ? 'text' : 'password'}
        autoComplete="current-password"
        value={password}
        disabled={isLoading}
        error={passwordError}
        onChange={(e) => {
          setPassword(e.target.value)
          if (e.target.value) setPasswordError(null)
        }}
        labelAction={
          <button
            type="button"
            onClick={onForgotPasswordClick}
            className="text-meta font-medium text-navy underline decoration-control underline-offset-[3px] hover:decoration-navy"
          >
            Forgot password?
          </button>
        }
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            disabled={isLoading}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-pill text-muted hover:text-ink"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        }
      />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        isLoading={isLoading}
        className="mt-1 w-full"
      >
        {isLoading ? (
          'Signing in…'
        ) : (
          <>
            Sign in
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </Button>
    </form>
  )
}
