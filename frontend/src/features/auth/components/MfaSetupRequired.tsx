import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { TwoStepSignIn } from '@/features/auth/components/TwoStepSignIn'
import { authService } from '@/features/auth/services/authService'
import { authStorage } from '@/lib/authStorage'
import { Button, Logo } from '@/ui'

/**
 * Shown instead of the app when the company requires two-step sign-in for the
 * person's role and they haven't set it up yet. The API refuses everything
 * else until they do, so this isn't just a screen — it's the only way on.
 */
export const MfaSetupRequired: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const signOut = async () => {
    try {
      await authService.logout()
    } catch {
      // Clearing locally is still correct.
    } finally {
      authStorage.clearTokens()
      queryClient.clear()
      navigate('/login', { replace: true })
    }
  }

  return (
    <main className="flex min-h-screen justify-center bg-ground px-4 py-12">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <Logo />
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-page text-ink">Set up two-step sign-in</h1>
          <p className="text-lead text-muted">
            Your company requires it for your role. It takes a minute: scan a code with an authenticator app on your phone.
          </p>
        </div>
        <TwoStepSignIn enabled={false} required />
        <div>
          <Button variant="ghost" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    </main>
  )
}
