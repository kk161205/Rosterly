import React, { useState, useEffect, useRef } from 'react'
import { ShieldCheck, AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react'
import { Button } from '@/components/common/CommonUI'

interface MFAFormProps {
  mfaSessionId: string
  onSubmit: (mfaSessionId: string, code: string) => Promise<void>
  onBackToLogin: () => void
  isLoading?: boolean
  errorMessage?: string | null
}

export const MFAForm: React.FC<MFAFormProps> = ({
  mfaSessionId,
  onSubmit,
  onBackToLogin,
  isLoading = false,
  errorMessage = null,
}) => {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [resendCooldown, setResendCooldown] = useState<number>(30)
  const [resendMessage, setResendMessage] = useState<string | null>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Resend cooldown timer — one interval for the form's lifetime, not recreated every tick
  useEffect(() => {
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Focus first input box on mount
  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  const handleDigitChange = (index: number, value: string) => {
    // Only accept numeric characters
    const cleanValue = value.replace(/\D/g, '')
    if (!cleanValue) {
      const newDigits = [...digits]
      newDigits[index] = ''
      setDigits(newDigits)
      return
    }

    // Handle paste of full 6 digits
    if (cleanValue.length === 6) {
      const pasted = cleanValue.split('').slice(0, 6)
      setDigits(pasted)
      inputRefs.current[5]?.focus()
      return
    }

    // Single digit input
    const singleDigit = cleanValue.slice(-1)
    const newDigits = [...digits]
    newDigits[index] = singleDigit
    setDigits(newDigits)

    // Move to next input box if available
    if (index < 5 && singleDigit) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const fullCode = digits.join('')
    if (fullCode.length !== 6) return
    await onSubmit(mfaSessionId, fullCode)
  }

  const handleResendCode = () => {
    if (resendCooldown > 0) return
    setResendCooldown(30)
    setResendMessage('A new verification code has been sent.')
    setTimeout(() => setResendMessage(null), 4000)
  }

  const fullCode = digits.join('')
  const isComplete = fullCode.length === 6

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* MFA Header Icon & Instructions */}
      <div className="flex flex-col items-center text-center space-y-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-container text-on-accent-container">
          <ShieldCheck className="h-6 w-6 text-accent" />
        </div>
        <h2 className="text-title-md font-semibold text-on-surface font-sans">
          Two-Factor Authentication
        </h2>
        <p className="text-body-sm text-on-surface-variant max-w-xs">
          Enter the 6-digit verification code sent to your registered authenticator app or email.
        </p>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-md bg-error-container p-3 text-body-sm text-on-error-container border border-error/20"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-error" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Success Notification for Resend */}
      {resendMessage && (
        <div className="flex items-center gap-2 rounded-md bg-tertiary-container p-3 text-body-sm text-on-tertiary-container">
          <RefreshCw className="h-4 w-4 shrink-0 text-tertiary animate-spin" />
          <span>{resendMessage}</span>
        </div>
      )}

      {/* 6-Digit Segmented Code Entry */}
      <div className="flex justify-center gap-2 sm:gap-2.5">
        {digits.map((digit, idx) => (
          <input
            key={idx}
            ref={(el) => {
              inputRefs.current[idx] = el
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={digit}
            onChange={(e) => handleDigitChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            disabled={isLoading}
            className="h-12 w-11 sm:w-12 rounded-lg border border-outline-variant hover:border-outline text-center font-mono text-title-md font-bold text-on-surface bg-surface focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60 transition-all duration-150"
            aria-label={`Digit ${idx + 1}`}
          />
        ))}
      </div>

      {/* Verify Primary Action */}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        isLoading={isLoading}
        disabled={isLoading || !isComplete}
        className="w-full"
      >
        {isLoading ? 'Verifying code…' : 'Verify & Continue'}
      </Button>

      {/* Footer Navigation & Resend Controls */}
      <div className="flex items-center justify-between text-body-sm pt-2">
        <button
          type="button"
          onClick={onBackToLogin}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-on-surface-variant hover:text-on-surface transition-colors focus:outline-none cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to login</span>
        </button>

        <button
          type="button"
          onClick={handleResendCode}
          disabled={resendCooldown > 0 || isLoading}
          className="text-accent hover:text-on-accent-container font-medium disabled:text-outline disabled:cursor-not-allowed transition-colors focus:outline-none cursor-pointer"
        >
          {resendCooldown > 0 ? (
            `Resend code in ${resendCooldown}s`
          ) : (
            'Resend code'
          )}
        </button>
      </div>
    </form>
  )
}

