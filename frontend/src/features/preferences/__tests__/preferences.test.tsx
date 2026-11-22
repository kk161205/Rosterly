import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantSettingsPage } from '@/features/preferences/AssistantSettingsPage'
import { preferencesService, type Preferences } from '@/features/preferences/usePreferences'
import { applyAccent, restoreAccent } from '@/lib/accent'
import { authStorage } from '@/lib/authStorage'
import { Logo } from '@/ui'
import { mockUser, renderPage } from '@/test/render'

vi.mock('@/features/auth/services/authService', () => ({ authService: { getCurrentUser: vi.fn() } }))

const prefs = (over: Partial<Preferences> = {}): Preferences => ({
  accent: 'navy',
  assistant_enabled: true,
  guide_style: 'show',
  voice_enabled: false,
  company_assistant_enabled: true,
  ...over,
})

beforeEach(() => {
  vi.restoreAllMocks()
  mockUser('employee', ['request:read'])
  delete document.documentElement.dataset.accent
  localStorage.clear()
})

describe('Your assistant', () => {
  it('offers the seven soft colours with the current one selected', async () => {
    vi.spyOn(preferencesService, 'get').mockResolvedValue(prefs({ accent: 'sage' }))
    renderPage(<AssistantSettingsPage />)
    const colours = await screen.findAllByRole('radio', { name: /Navy|Sage|Lavender|Dusk blue|Peach|Sand|Rose/ })
    expect(colours).toHaveLength(7)
    expect(screen.getByRole('radio', { name: 'Sage' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Rose' })).toHaveAttribute('data-accent', 'rose') // swatch previews its own palette
  })

  it('saves a new colour at once', async () => {
    vi.spyOn(preferencesService, 'get').mockResolvedValue(prefs())
    const update = vi.spyOn(preferencesService, 'update').mockResolvedValue(prefs({ accent: 'lavender' }))
    renderPage(<AssistantSettingsPage />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Lavender' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith({ accent: 'lavender' }, expect.anything()))
    expect(screen.getByRole('radio', { name: 'Lavender' })).toHaveAttribute('aria-checked', 'true')
  })

  it('keeps the last colour when two are picked quickly (saves go in order)', async () => {
    vi.spyOn(preferencesService, 'get').mockResolvedValue(prefs())
    const calls: string[] = []
    let releaseFirst: (p: Preferences) => void = () => {}
    const update = vi.spyOn(preferencesService, 'update').mockImplementation((d) => {
      calls.push(String(d.accent))
      return calls.length === 1 ? new Promise<Preferences>((r) => (releaseFirst = r)) : Promise.resolve(prefs(d))
    })
    renderPage(<AssistantSettingsPage />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Sage' }))
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Sage' })).toHaveAttribute('aria-checked', 'true'))
    fireEvent.click(screen.getByRole('radio', { name: 'Navy' }))
    await new Promise((r) => setTimeout(r, 100))
    expect(update).toHaveBeenCalledTimes(1) // the second save waits for the first
    releaseFirst(prefs({ accent: 'sage' }))
    await waitFor(() => expect(calls).toEqual(['sage', 'navy']))
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Navy' })).toHaveAttribute('aria-checked', 'true'))
  })

  it('turns the Guide off and changes how it helps', async () => {
    vi.spyOn(preferencesService, 'get').mockResolvedValue(prefs())
    const update = vi.spyOn(preferencesService, 'update').mockImplementation(async (d) => prefs(d))
    renderPage(<AssistantSettingsPage />)
    fireEvent.click(await screen.findByRole('radio', { name: /Take me there/ }))
    await waitFor(() => expect(update).toHaveBeenLastCalledWith({ guide_style: 'take' }, expect.anything()))
    fireEvent.click(screen.getByRole('switch', { name: /Show the Guide/ }))
    await waitFor(() => expect(update).toHaveBeenLastCalledWith({ assistant_enabled: false }, expect.anything()))
    await waitFor(() => expect(screen.getByRole('radio', { name: /Show me the way/ })).toBeDisabled())
  })

  it('pauses the Guide choices when the company has turned the assistant off, but colour still works', async () => {
    vi.spyOn(preferencesService, 'get').mockResolvedValue(prefs({ company_assistant_enabled: false }))
    renderPage(<AssistantSettingsPage />)
    expect(await screen.findByText(/Your company has turned the assistant off/)).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /Show the Guide/ })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Peach' })).toBeEnabled()
  })
})

describe('Accent on the page', () => {
  it('is applied to <html>, remembered on this device, and cleared on sign-out', () => {
    applyAccent('dusk')
    expect(document.documentElement.dataset.accent).toBe('dusk')
    delete document.documentElement.dataset.accent
    restoreAccent()
    expect(document.documentElement.dataset.accent).toBe('dusk')
    authStorage.clearTokens()
    expect(document.documentElement.dataset.accent).toBeUndefined()
    restoreAccent()
    expect(document.documentElement.dataset.accent).toBeUndefined()
  })

  it('ignores anything that is not a palette colour', () => {
    localStorage.setItem('rosterly.accent', 'red; background: url(x)')
    restoreAccent()
    expect(document.documentElement.dataset.accent).toBeUndefined()
  })

  it('never recolours the logo', () => {
    const { container } = render(<Logo />)
    expect(container.querySelector('svg')).toHaveClass('text-brand')
    expect(container.querySelector('svg')).not.toHaveClass('text-navy')
  })
})
