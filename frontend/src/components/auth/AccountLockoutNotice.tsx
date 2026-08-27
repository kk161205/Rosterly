import React, { useState, useEffect } from 'react'
import { ShieldAlert, Clock, ArrowLeft } from 'lucide-react'

interface AccountLockoutNoticeProps {
  remainingSeconds: number
  onLockoutExpired: () => void
  onBackToLogin?: () => void
}

export const AccountLockoutNotice: React.FC<AccountLockoutNoticeProps> = ({
  remainingSeconds,
  onLockoutExpired,
  onBackToLogin,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(remainingSeconds)

  useEffect(() => {
    setSecondsLeft(remainingSeconds)
  }, [remainingSeconds])

  // One interval for the notice's lifetime, not recreated every tick.
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Fires exactly once, the moment the countdown reaches zero.
  useEffect(() => {
    if (secondsLeft === 0) {
      onLockoutExpired()
    }
  }, [secondsLeft, onLockoutExpired])

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`

  return (
    <div className="space-y-6 text-center animate-fadeIn">
      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-error-container text-error">
          <ShieldAlert className="h-8 w-8" />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-title-md font-semibold text-on-surface font-sans">
          Account Temporarily Locked
        </h2>
        <p className="text-body-sm text-on-surface-variant max-w-xs mx-auto">
          Too many failed login attempts. For security reasons, authentication is temporarily restricted.
        </p>
      </div>

      <div className="rounded-sm bg-surface-container-low p-4 border border-outline-variant space-y-2">
        <div className="flex items-center justify-center gap-2 text-error font-mono text-headline-lg font-bold">
          <Clock className="h-6 w-6 animate-pulse text-error" />
          <span>{formattedTime}</span>
        </div>
        <p className="text-body-sm text-on-surface-variant">
          Please wait until the countdown finishes to attempt logging in again.
        </p>
      </div>

      {onBackToLogin && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onBackToLogin}
            className="inline-flex items-center gap-1.5 text-body-sm text-on-surface-variant hover:text-on-surface transition-colors focus:outline-none"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Login Screen</span>
          </button>
        </div>
      )}
    </div>
  )
}
