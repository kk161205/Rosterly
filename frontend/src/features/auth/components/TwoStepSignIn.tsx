import React, { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { authService } from '@/features/auth/services/authService'
import { CURRENT_USER_KEY } from '@/features/auth/hooks/useCurrentUser'
import { getErrorMessage } from '@/lib/errors'
import { Alert, Button, CopyField, Dialog, StatusText, TextField } from '@/ui'

type Stage = 'idle' | 'scan' | 'codes'

/**
 * Two-step sign-in, self-service: turn it on with an authenticator app
 * (scan, confirm a code, save recovery codes) or off (password + code).
 * `required` hides "Turn off" while the company requires it for this role.
 */
export const TwoStepSignIn: React.FC<{ enabled: boolean; required?: boolean }> = ({ enabled, required = false }) => {
  const queryClient = useQueryClient()
  const [stage, setStage] = useState<Stage>('idle')
  const [secret, setSecret] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [turningOff, setTurningOff] = useState(false)

  const refreshMe = () => queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY })

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await authService.startMfaSetup()
      setSecret(res.secret)
      setQr(await QRCode.toDataURL(res.otpauth_uri, { margin: 1, width: 220, color: { dark: '#17181C', light: '#FFFFFF' } }))
      setCode('')
      setStage('scan')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await authService.enableMfa(code.trim())
      setRecoveryCodes(res.recovery_codes)
      setStage('codes')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (stage === 'scan')
    return (
      <div className="flex flex-col gap-4">
        <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-body text-ink">
          <li>Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or Authy).</li>
          <li>Add an account by scanning this code.</li>
          <li>Type the 6-digit code it shows.</li>
        </ol>
        {qr && <img src={qr} alt="QR code to add Rosterly to your authenticator app" width={220} height={220} className="rounded-soft border border-line" />}
        <CopyField label="Can’t scan? Enter this key instead" value={secret} />
        {error && <Alert>{error}</Alert>}
        <TextField
          label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" isLoading={busy} disabled={code.length !== 6} onClick={confirm}>
            Turn on
          </Button>
          <Button variant="ghost" onClick={() => setStage('idle')} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    )

  if (stage === 'codes')
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">Two-step sign-in is on.</Alert>
        <p className="text-body text-ink">
          Save these recovery codes somewhere safe. Each one signs you in once if your phone isn’t with you. You won’t see them again.
        </p>
        <CopyField label="Recovery codes" value={recoveryCodes.join('  ')} />
        <ul className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-1 p-0 font-mono text-body text-ink sm:grid-cols-5" aria-label="Recovery codes">
          {recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div>
          <Button
            variant="primary"
            onClick={() => {
              setStage('idle')
              void refreshMe()
            }}
          >
            I’ve saved them
          </Button>
        </div>
      </div>
    )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <StatusText tone={enabled ? 'ok' : 'mute'}>{enabled ? 'On' : 'Off'}</StatusText>
        <span className="text-body text-muted">
          {enabled ? 'You’ll be asked for a code from your authenticator app when you sign in.' : 'Add a code from your phone when you sign in.'}
        </span>
      </div>
      {error && <Alert>{error}</Alert>}
      <div>
        {enabled ? (
          !required && (
            <Button variant="secondary" onClick={() => setTurningOff(true)}>
              Turn off
            </Button>
          )
        ) : (
          <Button variant="primary" isLoading={busy} onClick={start}>
            Set up two-step sign-in
          </Button>
        )}
      </div>
      {required && enabled && <p className="text-meta text-muted">Your company requires this for your role.</p>}
      <TurnOffDialog open={turningOff} onOpenChange={setTurningOff} onDone={() => void refreshMe()} />
    </div>
  )
}

const TurnOffDialog: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }> = ({ open, onOpenChange, onDone }) => {
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setPassword('')
      setCode('')
      setError(null)
    }
  }, [open])

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title="Turn off two-step sign-in?"
      description="Your account will be protected by your password only."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Keep it on
          </Button>
          <Button
            variant="danger"
            isLoading={busy}
            disabled={!password || code.trim().length < 6}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await authService.disableMfa(password, code.trim())
                onOpenChange(false)
                onDone()
              } catch (err) {
                setError(getErrorMessage(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            Turn off
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <TextField label="Code from your app (or a recovery code)" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
    </Dialog>
  )
}
