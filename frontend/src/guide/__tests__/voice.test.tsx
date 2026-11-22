import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-client', () => ({ AI_BASE_URL: 'http://ai.test', apiClient: { get: vi.fn().mockResolvedValue({ data: { items: [] } }) } }))
vi.mock('@/lib/authStorage', () => ({ authStorage: { getAccessToken: () => 'tok', getRefreshToken: () => 'r', clearTokens: vi.fn() } }))

import { transcribe, useVoiceInput } from '@/guide/voice'
import { CommandPalette } from '@/shell/CommandPalette'

/** A fake microphone: the recorder, the loudness meter, and a level we control. */
let level = 128 + 60 // byte waveform: 128 = silence
class FakeRecorder {
  static isTypeSupported = () => true
  state = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['sound'], { type: 'audio/webm' }) })
    this.onstop?.()
  }
}
class FakeAudioContext {
  createAnalyser = () => ({ fftSize: 4, getByteTimeDomainData: (d: Uint8Array) => d.fill(level) })
  createMediaStreamSource = () => ({ connect: () => {} })
  close = async () => {}
}

beforeEach(() => {
  level = 128 + 60
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: () => {} }] }) },
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Voice input', () => {
  it('sends the recording with the person’s token and returns the text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'how do I ask for leave' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await transcribe(new Blob(['x'], { type: 'audio/webm' }))).toBe('how do I ask for leave')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://ai.test/ai/transcribe')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok', 'Content-Type': 'audio/webm' })
  })

  it('puts what was said into the box — it never asks the Guide by itself', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'new laptop' }), { status: 200 })))
    const onText = vi.fn()
    const { result } = renderHook(() => useVoiceInput(onText))
    await act(() => result.current.start())
    expect(result.current.state).toBe('listening')
    act(() => result.current.stop())
    await waitFor(() => expect(onText).toHaveBeenCalledWith('new laptop'))
    expect(result.current.state).toBe('idle')
  })

  it('never sends silence (Whisper invents words on silence)', async () => {
    level = 128 // flat line
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useVoiceInput(vi.fn()))
    await act(() => result.current.start())
    act(() => result.current.stop())
    await waitFor(() => expect(result.current.error).toMatch(/didn’t hear anything/))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explains a blocked microphone', async () => {
    ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('denied'))
    const { result } = renderHook(() => useVoiceInput(vi.fn()))
    await act(() => result.current.start())
    expect(result.current.error).toMatch(/microphone is blocked/)
  })

  it('shows the microphone in the box only when voice is on for this person', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'show my leave' }), { status: 200 })))
    const user = { id: 'u', email: 'u@x.com', full_name: 'U', role: 'employee', permissions: [] }
    const client = new QueryClient()
    const ui = (canSpeak: boolean) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CommandPalette open onOpenChange={() => {}} sections={[]} user={user} canAsk onAsk={() => {}} canSpeak={canSpeak} />
        </MemoryRouter>
      </QueryClientProvider>
    )
    const { rerender } = render(ui(false))
    expect(screen.queryByRole('button', { name: 'Speak instead of typing' })).not.toBeInTheDocument()
    rerender(ui(true))
    fireEvent.click(screen.getByRole('button', { name: 'Speak instead of typing' }))
    expect(await screen.findByText(/Listening…/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Stop listening' }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Search or ask' })).toHaveValue('show my leave'))
  })
})
