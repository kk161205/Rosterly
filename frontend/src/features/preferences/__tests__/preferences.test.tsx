import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantSettingsPage } from '@/features/preferences/AssistantSettingsPage'
import { preferencesService, type Preferences } from '@/features/preferences/usePreferences'
import { tileDesign } from '@/guide/designs'
import { GuideTileArt } from '@/guide/GuideTileArt'
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
})

describe('Your assistant', () => {
  it('offers the seven Guide designs by name, with the current one selected', async () => {
    vi.spyOn(preferencesService, 'get').mockResolvedValue(prefs({ accent: 'sage' }))
    renderPage(<AssistantSettingsPage />)
    const designs = await screen.findAllByRole('radio', { name: /^(Bolt|Sprout|Mystic|Skipper|Ember|Ranger|Blossom)$/ })
    expect(designs).toHaveLength(7)
    expect(screen.getByRole('radio', { name: 'Sprout' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Ready to explore')).toBeInTheDocument()
  })

  it('saves a new design at once', async () => {
    vi.spyOn(preferencesService, 'get').mockResolvedValue(prefs())
    const update = vi.spyOn(preferencesService, 'update').mockResolvedValue(prefs({ accent: 'lavender' }))
    renderPage(<AssistantSettingsPage />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Mystic' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith({ accent: 'lavender' }, expect.anything()))
    expect(screen.getByRole('radio', { name: 'Mystic' })).toHaveAttribute('aria-checked', 'true')
  })

  it('keeps the last design when two are picked quickly (saves go in order)', async () => {
    vi.spyOn(preferencesService, 'get').mockResolvedValue(prefs())
    const calls: string[] = []
    let releaseFirst: (p: Preferences) => void = () => {}
    const update = vi.spyOn(preferencesService, 'update').mockImplementation((d) => {
      calls.push(String(d.accent))
      return calls.length === 1 ? new Promise<Preferences>((r) => (releaseFirst = r)) : Promise.resolve(prefs(d))
    })
    renderPage(<AssistantSettingsPage />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Sprout' }))
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Sprout' })).toHaveAttribute('aria-checked', 'true'))
    fireEvent.click(screen.getByRole('radio', { name: 'Bolt' }))
    await new Promise((r) => setTimeout(r, 100))
    expect(update).toHaveBeenCalledTimes(1) // the second save waits for the first
    releaseFirst(prefs({ accent: 'sage' }))
    await waitFor(() => expect(calls).toEqual(['sage', 'navy']))
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Bolt' })).toHaveAttribute('aria-checked', 'true'))
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

  it('pauses the Guide choices when the company has turned the assistant off, but the design still works', async () => {
    vi.spyOn(preferencesService, 'get').mockResolvedValue(prefs({ company_assistant_enabled: false }))
    renderPage(<AssistantSettingsPage />)
    expect(await screen.findByText(/Your company has turned the assistant off/)).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /Show the Guide/ })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Ember' })).toBeEnabled()
  })
})

describe('The tile designs', () => {
  it('only change the tile: the app keeps its own navy', () => {
    const { container } = render(<Logo />)
    expect(container.querySelector('svg')).toHaveClass('text-brand')
    expect(document.documentElement.dataset.accent).toBeUndefined()
  })

  it('reshape from the logo’s square into the character, and only move while out', () => {
    const { container, rerender } = render(<GuideTileArt design="peach" form="square" idle />)
    const part = (name: string) => container.querySelector(`[data-part="${name}"]`) as HTMLElement
    expect(part('square')).toHaveStyle({ opacity: '1' })
    expect(part('character')).toHaveStyle({ opacity: '0' })
    expect(container.querySelector('.gt-idle')).toBeNull() // no idle motion while it is the square
    rerender(<GuideTileArt design="peach" form="character" idle />)
    expect(part('square')).toHaveStyle({ opacity: '0' })
    expect(part('character')).toHaveStyle({ opacity: '1' })
    expect(container.querySelector('.gt-idle .gt-flicker')).not.toBeNull() // Ember's flame flickers
  })

  it('falls back to Bolt for anything unknown', () => {
    expect(tileDesign('red; background: url(x)').name).toBe('Bolt')
  })
})
