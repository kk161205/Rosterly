import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { MFAForm } from '@/features/auth/components/MFAForm'
import { TwoStepSignIn } from '@/features/auth/components/TwoStepSignIn'
import { authService } from '@/features/auth/services/authService'

vi.mock('@/features/auth/services/authService', () => ({
  authService: { startMfaSetup: vi.fn(), enableMfa: vi.fn(), disableMfa: vi.fn() },
}))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,AAAA') } }))

const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )

beforeEach(() => vi.clearAllMocks())

describe('Two-step sign-in setup', () => {
  it('scans, confirms a code and shows the recovery codes once', async () => {
    vi.mocked(authService.startMfaSetup).mockResolvedValue({ secret: 'JBSWY3DPEHPK3PXP', otpauth_uri: 'otpauth://totp/x' })
    vi.mocked(authService.enableMfa).mockResolvedValue({ recovery_codes: ['ab12-cd34', 'ef56-gh78'] })
    wrap(<TwoStepSignIn enabled={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'Set up two-step sign-in' }))
    expect(await screen.findByAltText(/QR code/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('JBSWY3DPEHPK3PXP')).toBeInTheDocument()

    const turnOn = screen.getByRole('button', { name: 'Turn on' })
    expect(turnOn).toBeDisabled()
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '123 456' } })
    fireEvent.click(turnOn)
    await waitFor(() => expect(authService.enableMfa).toHaveBeenCalledWith('123456'))
    expect(await screen.findByText('ab12-cd34')).toBeInTheDocument()
  })

  it('hides Turn off when the company requires it', () => {
    wrap(<TwoStepSignIn enabled required />)
    expect(screen.queryByRole('button', { name: 'Turn off' })).not.toBeInTheDocument()
    expect(screen.getByText(/requires this for your role/)).toBeInTheDocument()
  })
})

describe('Sign-in code step', () => {
  it('accepts a recovery code instead of the app code', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<MFAForm mfaSessionId="s1" onSubmit={onSubmit} onBackToLogin={() => {}} />)
    expect(screen.queryByText(/Resend/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use a recovery code' }))
    fireEvent.change(screen.getByLabelText('Recovery code'), { target: { value: 'ab12-cd34' } })
    fireEvent.click(screen.getByRole('button', { name: /Verify/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('s1', 'ab12-cd34'))
  })
})
