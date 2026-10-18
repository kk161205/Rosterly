import React, { useState } from 'react'
import { Alert, Button, TextField } from '@/ui'

interface ForgotPasswordFormProps {
  onSubmit: (email: string) => Promise<void>
  onBackToLogin: () => void
  isLoading?: boolean
  errorMessage?: string | null
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
    if (!EMAIL_RX.test(val.trim())) {
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
      // errorMessage is set by the parent hook
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-page text-ink">Reset your password</h2>
        <p className="mt-1.5 text-lead text-muted">We&apos;ll email a link to set a new one.</p>
      </div>

      {isSuccess ? (
        <div className="flex flex-col gap-5">
          <Alert tone="success">
            If an active account exists for <span className="font-medium">{email}</span>, a reset link is on its way.
            It expires in 15 minutes.
          </Alert>
          <Button variant="primary" size="lg" onClick={onBackToLogin} className="w-full">
            Back to sign in
          </Button>
        </div>
      ) : (
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
          <Button type="submit" variant="primary" size="lg" isLoading={isLoading} disabled={!email} className="w-full">
            Send reset instructions
          </Button>
          <Button variant="ghost" size="sm" onClick={onBackToLogin} className="self-start">
            Back to sign in
          </Button>
        </form>
      )}
    </div>
  )
}
