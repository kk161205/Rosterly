import React, { useState } from 'react'
import { Check, Circle, Eye, EyeOff } from 'lucide-react'
import { Alert, Button, TextField } from '@/ui'

interface ResetPasswordFormProps {
  token: string
  onSubmit: (token: string, newPassword: string) => Promise<void>
  onBackToLogin: () => void
  isLoading?: boolean
  errorMessage?: string | null
}

// Mirrors the server-side policy exactly (doc §7 rule 9): 10+ characters, at
// least one letter, at least one number. No special-character requirement —
// the backend doesn't enforce one, so the frontend shouldn't imply it does.
const RULES = [
  { label: 'At least 10 characters', test: (p: string) => p.length >= 10 },
  { label: 'At least one letter', test: (p: string) => /[a-zA-Z]/.test(p) },
  { label: 'At least one number', test: (p: string) => /\d/.test(p) },
]

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
    const failed = RULES.find((r) => !r.test(password))
    if (failed) {
      setValidationError(`Password needs: ${failed.label.toLowerCase()}`)
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
      // errorMessage is set by the parent hook
    }
  }

  const toggle = (
    <button
      type="button"
      onClick={() => setShowPassword((v) => !v)}
      aria-label={showPassword ? 'Hide password' : 'Show password'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-pill text-muted hover:text-ink"
    >
      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-page text-ink">Set a new password</h2>
        <p className="mt-1.5 text-lead text-muted">You&apos;ll be signed out of every device once it&apos;s saved.</p>
      </div>

      {isSuccess ? (
        <div className="flex flex-col gap-5">
          <Alert tone="success">Your password is set. Sign in with it to continue.</Alert>
          <Button variant="primary" size="lg" onClick={onBackToLogin} className="w-full">
            Go to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          {(validationError || errorMessage) && <Alert tone="error">{validationError || errorMessage}</Alert>}
          <TextField
            label="New password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            disabled={isLoading}
            onChange={(e) => setPassword(e.target.value)}
            trailing={toggle}
          />
          <ul className="flex flex-col gap-1.5" aria-label="Password requirements">
            {RULES.map((rule) => {
              const ok = rule.test(password)
              return (
                <li key={rule.label} className={`flex items-center gap-2 text-meta ${ok ? 'text-status-ok' : 'text-muted'}`}>
                  {ok ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5" aria-hidden="true" />}
                  {rule.label}
                  <span className="sr-only">{ok ? '(met)' : '(not met)'}</span>
                </li>
              )
            })}
          </ul>
          <TextField
            label="Confirm password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            disabled={isLoading}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isLoading}
            disabled={!password || !confirmPassword}
            className="w-full"
          >
            Save password
          </Button>
          <Button variant="ghost" size="sm" onClick={onBackToLogin} className="self-start">
            Back to sign in
          </Button>
        </form>
      )}
    </div>
  )
}
