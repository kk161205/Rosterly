import React, { useEffect, useRef, useState } from 'react'
import { authService } from '@/features/auth/services/authService'
import { Alert, Button } from '@/ui'

interface MFAFormProps {
  mfaSessionId: string
  onSubmit: (mfaSessionId: string, code: string) => Promise<void>
  onBackToLogin: () => void
  isLoading?: boolean
  errorMessage?: string | null
}

const LENGTH = 6

export const MFAForm: React.FC<MFAFormProps> = ({
  mfaSessionId,
  onSubmit,
  onBackToLogin,
  isLoading = false,
  errorMessage = null,
}) => {
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''))
  const [resendCooldown, setResendCooldown] = useState(30)
  const [resendMessage, setResendMessage] = useState<string | null>(null)
  const [isResending, setIsResending] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // One interval for the form's lifetime, not recreated every tick
  useEffect(() => {
    const timer = setInterval(() => setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0)), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  const handleDigitChange = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '')
    if (!clean) {
      const next = [...digits]
      next[index] = ''
      setDigits(next)
      return
    }
    if (clean.length === LENGTH) {
      setDigits(clean.split('').slice(0, LENGTH))
      inputRefs.current[LENGTH - 1]?.focus()
      return
    }
    const next = [...digits]
    next[index] = clean.slice(-1)
    setDigits(next)
    if (index < LENGTH - 1) inputRefs.current[index + 1]?.focus()
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus()
  }

  const code = digits.join('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length === LENGTH) await onSubmit(mfaSessionId, code)
  }

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return
    setIsResending(true)
    try {
      const res = await authService.resendMFA(mfaSessionId)
      setResendCooldown(30)
      setResendMessage(res.message)
    } catch {
      setResendMessage('Could not resend the code — please try again shortly.')
    } finally {
      setIsResending(false)
      setTimeout(() => setResendMessage(null), 4000)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-page text-ink">Two-factor authentication</h2>
        <p className="mt-1.5 text-lead text-muted">Enter the 6-digit code from your authenticator app or email.</p>
      </div>

      {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-body font-medium text-ink">Verification code</legend>
        <div className="flex gap-2.5">
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                inputRefs.current[i] = el
              }}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={LENGTH}
              value={digit}
              disabled={isLoading}
              aria-label={`Digit ${i + 1} of ${LENGTH}`}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="h-12 w-11 border-0 border-b border-ink bg-transparent text-center font-mono text-code text-ink focus:border-b-2 focus:border-navy focus:outline-none focus-visible:outline-none"
            />
          ))}
        </div>
      </fieldset>

      <Button type="submit" variant="primary" size="lg" isLoading={isLoading} disabled={code.length !== LENGTH} className="w-full">
        Verify &amp; continue
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3 text-meta">
        <Button variant="ghost" size="sm" onClick={onBackToLogin}>
          Back to sign in
        </Button>
        <button
          type="button"
          onClick={handleResend}
          disabled={resendCooldown > 0 || isResending}
          className="font-medium text-navy disabled:text-muted"
        >
          {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : isResending ? 'Sending…' : 'Resend code'}
        </button>
      </div>
      {resendMessage && (
        <p role="status" className="text-meta text-muted">
          {resendMessage}
        </p>
      )}
    </form>
  )
}
