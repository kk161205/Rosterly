import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserProfile } from '@/features/auth/types/auth'
import { preferencesService, type Preferences } from '@/features/preferences/usePreferences'
import { GuideProvider, useGuide, type Planner } from '@/guide/GuideProvider'
import { CommandPalette } from '@/shell/CommandPalette'
import { Logo } from '@/ui'

vi.mock('@/lib/api-client', () => ({ AI_BASE_URL: '', apiClient: { get: vi.fn().mockResolvedValue({ data: { items: [] } }) } }))

const USER: UserProfile = { id: 'u', email: 'u@example.com', full_name: 'Asha', role: 'employee', permissions: ['request:create', 'request:read'] }
const prefs = (over: Partial<Preferences> = {}): Preferences => ({
  accent: 'sage', assistant_enabled: true, guide_style: 'take', voice_enabled: false, company_assistant_enabled: true, ...over,
})

const Where = () => <p data-testid="where">{useLocation().pathname}</p>

function Harness() {
  const guide = useGuide()
  return (
    <>
      <Logo tileOut={guide.out} />
      <p data-testid="phase">{guide.phase}</p>
      <button onClick={() => guide.setBoxOpen(true)}>Open box</button>
      <CommandPalette open={guide.boxOpen} onOpenChange={guide.setBoxOpen} sections={[]} user={USER} canAsk={guide.allowed} onAsk={guide.ask} />
      <Routes>
        <Route path="/leave" element={<button data-guide="leave.apply">Ask for leave</button>} />
        <Route path="*" element={<h1>Home</h1>} />
      </Routes>
      <Where />
    </>
  )
}

function renderGuide(planner?: Planner) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/home']}>
        <GuideProvider user={USER} desktop timing={{ move: 0, dwell: 0 }} planner={planner}>
          <Harness />
        </GuideProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const askInBox = async (question: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'Open box' }))
  const box = await screen.findByRole('combobox', { name: 'Search or ask' })
  fireEvent.change(box, { target: { value: question } })
  fireEvent.click(await screen.findByRole('option', { name: `Ask Rosterly: “${question}”` }))
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('The Guide on screen', () => {
  it('lifts out of the logo to listen, then takes you to the page and points at the button', async () => {
    vi.spyOn(preferencesService, 'get').mockResolvedValue(prefs())
    const { container } = renderGuide()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open box' })).toBeInTheDocument())
    await askInBox('how do I ask for leave')

    const apply = await screen.findByRole('button', { name: 'Ask for leave' })
    expect(screen.getByTestId('where')).toHaveTextContent('/leave')
    await waitFor(() => expect(apply).toHaveAttribute('data-guide-active'))
    expect(screen.getByTestId('guide-tile')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Guide' })).getByText(/Guiding you to/)).toBeInTheDocument()
    expect(container.querySelector('[data-guide-home]')).toHaveAttribute('fill', 'none') // its slot in the logo is hollow

    fireEvent.click(apply) // the person presses it
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('docked'))
    expect(screen.queryByTestId('guide-tile')).not.toBeInTheDocument()
    expect(apply).not.toHaveAttribute('data-guide-active')
    expect(container.querySelector('[data-guide-home]')).toHaveAttribute('fill', 'currentColor')
  })

  it('stops and goes home when the person presses Stop, or Esc', async () => {
    vi.spyOn(preferencesService, 'get').mockResolvedValue(prefs())
    renderGuide()
    await askInBox('how do I ask for leave')
    const pill = await screen.findByRole('region', { name: 'Guide' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ask for leave' })).toHaveAttribute('data-guide-active'))
    fireEvent.click(within(pill).getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('docked'))

    await askInBox('how do I ask for leave')
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('guiding'))
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('docked'))
  })

  it('says so plainly when it can’t find a page', async () => {
    vi.spyOn(preferencesService, 'get').mockResolvedValue(prefs())
    renderGuide()
    await askInBox('zzqx')
    const pill = await screen.findByRole('region', { name: 'Guide' })
    expect(within(pill).getByText(/I couldn’t find a page for “zzqx”/)).toBeInTheDocument()
    fireEvent.click(within(pill).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Guide' })).not.toBeInTheDocument())
  })

  it('finds pages instantly by their words, with no AI', async () => {
    vi.spyOn(preferencesService, 'get').mockResolvedValue(prefs())
    renderGuide()
    fireEvent.click(screen.getByRole('button', { name: 'Open box' }))
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'time off' } })
    expect(await screen.findByRole('option', { name: /People · Leave & Attendance/ })).toBeInTheDocument()
  })
})

describe('Off switches', () => {
  it.each([
    ['the person turned the Guide off', prefs({ assistant_enabled: false })],
    ['the company turned the assistant off', prefs({ company_assistant_enabled: false })],
  ])('when %s: plain search, no Ask row, no tile', async (_why, p) => {
    vi.spyOn(preferencesService, 'get').mockResolvedValue(p)
    renderGuide()
    await new Promise((r) => setTimeout(r, 50))
    fireEvent.click(screen.getByRole('button', { name: 'Open box' }))
    fireEvent.change(await screen.findByRole('combobox', { name: 'Search' }), { target: { value: 'time off' } })
    expect(await screen.findByRole('option', { name: /Leave/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Ask Rosterly/ })).not.toBeInTheDocument()
    expect(screen.queryByTestId('guide-tile')).not.toBeInTheDocument()
  })
})

describe('Answers from the AI', () => {
  it('shows the answer in the side panel, with a table, a page to open and a follow-up box', async () => {
    vi.spyOn(preferencesService, 'get').mockResolvedValue(prefs())
    const planner = vi.fn<Planner>().mockResolvedValue({
      kind: 'answer', question: 'how many requests do I have', text: 'You have 2 open requests.',
      table: { columns: ['Request', 'Status'], rows: [['New laptop', 'pending']] }, page: 'requests',
    })
    renderGuide(planner)
    await askInBox('how many requests do I have')
    const panel = await screen.findByRole('dialog', { name: 'Rosterly' })
    expect(within(panel).getByText('You have 2 open requests.')).toBeInTheDocument()
    expect(within(panel).getByRole('table', { name: 'Answer details' })).toHaveTextContent('New laptop')
    expect(planner).toHaveBeenCalledWith('how many requests do I have', expect.any(Array), expect.objectContaining({ currentPage: 'home', history: [] }))

    // A follow-up carries the last answer as context
    fireEvent.change(within(panel).getByLabelText('Ask a follow-up'), { target: { value: 'which is oldest?' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Ask' }))
    await waitFor(() => expect(planner).toHaveBeenLastCalledWith('which is oldest?', expect.any(Array), expect.objectContaining({
      currentPage: 'home', history: [{ question: 'how many requests do I have', answer: 'You have 2 open requests.' }],
    })))
  })

  it('opens the page from the answer', async () => {
    vi.spyOn(preferencesService, 'get').mockResolvedValue(prefs())
    renderGuide(async () => ({ kind: 'answer', question: 'q', text: 'Look at your leave.', page: 'leave' }))
    await askInBox('how much leave')
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Rosterly' })).getByRole('button', { name: 'Open Leave & Attendance' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/leave'))
  })

  it('falls back to the page map when the AI service is down', async () => {
    vi.spyOn(preferencesService, 'get').mockResolvedValue(prefs())
    renderGuide(async () => { throw new Error('503') })
    await askInBox('how do I ask for leave')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ask for leave' })).toHaveAttribute('data-guide-active'))
  })

  it('never runs a stray step from a bad AI reply', async () => {
    vi.spyOn(preferencesService, 'get').mockResolvedValue(prefs())
    renderGuide(async () => ({ kind: 'show', title: 'Users', steps: [{ action: 'go', page: 'users' }, { action: 'open', target: 'users.search', caption: 'x' }] }))
    await askInBox('take me to users')
    expect(await within(await screen.findByRole('region', { name: 'Guide' })).findByText(/couldn’t find a way/)).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/home')
  })
})

describe('Stopping a question that is still being worked out', () => {
  it('ignores the reply when the person pressed Stop meanwhile', async () => {
    vi.spyOn(preferencesService, 'get').mockResolvedValue(prefs())
    let reply: (p: unknown) => void = () => {}
    let seen: AbortSignal | undefined
    renderGuide((_q, _p, ctx) => {
      seen = ctx.signal
      return new Promise((r) => { reply = r as (p: unknown) => void })
    })
    await askInBox('how do I ask for leave')
    const pill = await screen.findByRole('region', { name: 'Guide' })
    fireEvent.click(within(pill).getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('docked'))
    expect(seen?.aborted).toBe(true)
    reply({ kind: 'show', title: 'Leave', steps: [{ action: 'go', page: 'leave' }] })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByTestId('where')).toHaveTextContent('/home') // the late reply did nothing
  })
})
