import React, { useEffect, useRef, useState } from 'react'
import { Alert, Button, TextField } from '@/ui'

interface MFAFormProps {
  mfaSessionId: string
  onSubmit: (mfaSessionId: string, code: string) => Promise<void>
  onBackToLogin: () => void
  isLoading?: boolean
  errorMessage?: string | null
}

const LENGTH = 6

export const MFAForm: React.FC<MFAFormProps> = ({ mfaSessionId, onSubmit, onBackToLogin, isLoading = false, errorMessage = null }) => {
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''))
  const [useRecovery, setUseRecovery] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState('')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

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

  const cleanRecovery = recoveryCode.trim()
  const ready = useRecovery ? cleanRecovery.replace(/[^a-z0-9]/gi, '').length === 8 : code.length === LENGTH

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (ready) await onSubmit(mfaSessionId, useRecovery ? cleanRecovery : code)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-page text-ink">Two-step sign-in</h2>
        <p className="mt-1.5 text-lead text-muted">
          {useRecovery ? 'Enter one of the recovery codes you saved when you set this up.' : 'Enter the 6-digit code from your authenticator app.'}
        </p>
      </div>

      {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

      {useRecovery ? (
        <TextField
          label="Recovery code"
          placeholder="xxxx-xxxx"
          autoComplete="off"
          value={recoveryCode}
          disabled={isLoading}
          onChange={(e) => setRecoveryCode(e.target.value)}
          hint="Each recovery code works once."
        />
      ) : (
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
      )}

      <Button type="submit" variant="primary" size="lg" isLoading={isLoading} disabled={!ready} className="w-full">
        Verify &amp; continue
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3 text-meta">
        <Button variant="ghost" size="sm" onClick={onBackToLogin}>
          Back to sign in
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setUseRecovery((v) => !v)}>
          {useRecovery ? 'Use my authenticator app' : 'Use a recovery code'}
        </Button>
      </div>
    </form>
  )
}
