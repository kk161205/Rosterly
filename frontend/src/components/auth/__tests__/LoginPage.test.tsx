import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from '@/pages/LoginPage'
import { authService } from '@/services/authService'

vi.mock('@/services/authService', () => ({
  authService: {
    login: vi.fn(),
    verifyMFA: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
}))

describe('LoginPage Component (PRD §5.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders login form with logo, inputs, and submit button', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    expect(screen.getByText('Rosterly')).toBeInTheDocument()
    expect(screen.getByLabelText('Work Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
  })

  it('validates email format on blur', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    const emailInput = screen.getByLabelText('Work Email')
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } })
    fireEvent.blur(emailInput)

    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument()
    })
  })

  it('toggles password visibility when eye icon is clicked', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    const passwordInput = screen.getByLabelText('Password') as HTMLInputElement
    expect(passwordInput.type).toBe('password')

    const toggleBtn = screen.getByRole('button', { name: /show password/i })
    fireEvent.click(toggleBtn)

    expect(passwordInput.type).toBe('text')
  })

  it('handles successful credentials submission and token storage', async () => {
    const mockLogin = vi.mocked(authService.login).mockResolvedValueOnce({
      access_token: 'fake-access-token',
      refresh_token: 'fake-refresh-token',
      expires_in: 900,
    })

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText('Work Email'), {
      target: { value: 'admin@rosterly.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'SecurePass123!' },
    })

    const submitBtn = screen.getByRole('button', { name: /log in/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'admin@rosterly.com',
        password: 'SecurePass123!',
      })
      expect(localStorage.getItem('rosterly_access_token')).toBe('fake-access-token')
    })
  })

  it('transitions to MFA step when mfa_required is returned from API', async () => {
    vi.mocked(authService.login).mockResolvedValueOnce({
      mfa_required: true,
      mfa_session_id: 'mfa_sess_123',
    })

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText('Work Email'), {
      target: { value: 'mfa@rosterly.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'SecurePass123!' },
    })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /verify & continue/i })).toBeInTheDocument()
    })
  })

  it('switches to Forgot Password view when link is clicked', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    const forgotBtn = screen.getByRole('button', { name: /forgot password\?/i })
    fireEvent.click(forgotBtn)

    await waitFor(() => {
      expect(screen.getByText('Reset Your Password')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /send reset instructions/i })).toBeInTheDocument()
    })
  })
})
