import React, { useEffect, useState } from 'react'
import { Button } from '@/ui'

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
    const timer = setInterval(() => setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0)), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fires exactly once, the moment the countdown reaches zero.
  useEffect(() => {
    if (secondsLeft === 0) onLockoutExpired()
  }, [secondsLeft, onLockoutExpired])

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-page text-ink">Account temporarily locked</h2>
        <p className="mt-1.5 text-lead text-muted">
          Too many sign-in attempts. For your security, try again when the timer ends — or reset your password.
        </p>
      </div>
      <div className="border-t border-ink pt-4">
        <div className="text-meta text-muted">You can try again in</div>
        <div className="mt-1 font-mono text-metric text-ink" role="timer" aria-label={`${mm} minutes ${ss} seconds remaining`}>
          {mm}:{ss}
        </div>
      </div>
      {onBackToLogin && (
        <Button variant="ghost" size="sm" onClick={onBackToLogin} className="self-start">
          Back to sign in
        </Button>
      )}
    </div>
  )
}
