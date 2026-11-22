import { useCallback, useEffect, useRef, useState } from 'react'
import { AI_BASE_URL } from '@/lib/api-client'
import { authStorage } from '@/lib/authStorage'

/**
 * Voice input for the Search-or-ask box. Records up to
 * 15 s, skips sending when nothing was heard, and turns speech into text with
 * the AI service. The text goes into the box for the person to check and send
 * — never straight to the Guide.
 */
export type VoiceState = 'idle' | 'starting' | 'listening' | 'working'

const MAX_MS = 15_000
const SILENCE_LEVEL = 0.02 // peak loudness (0–1) below which we treat the clip as silence

export const voiceSupported = () =>
  typeof window !== 'undefined' && Boolean(AI_BASE_URL) && typeof window.MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

export async function transcribe(audio: Blob): Promise<string> {
  const token = authStorage.getAccessToken()
  if (!AI_BASE_URL || !token) throw new Error('Voice input isn’t set up.')
  const res = await fetch(`${AI_BASE_URL}/ai/transcribe`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': audio.type || 'audio/webm' },
    body: audio,
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message ?? 'Voice input isn’t available right now.')
  }
  return String((await res.json()).text ?? '')
}

export function useVoiceInput(onText: (text: string) => void) {
  const [state, setState] = useState<VoiceState>('idle')
  const [error, setError] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const peak = useRef(0)
  const timers = useRef<{ stop?: ReturnType<typeof setTimeout>; meter?: number; ctx?: AudioContext }>({})
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const cleanUp = () => {
    clearTimeout(timers.current.stop)
    if (timers.current.meter) cancelAnimationFrame(timers.current.meter)
    void timers.current.ctx?.close().catch(() => undefined)
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    recorder.current = null
    timers.current = {}
  }

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }, [])

  const busy = useRef(false)
  const start = useCallback(async () => {
    if (busy.current) return // a second tap while the first is starting or recording
    busy.current = true
    setError(null)
    setState('starting')
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      busy.current = false
      setState('idle')
      setError('The microphone is blocked. Allow it in your browser to speak.')
      return
    }
    const chunks: Blob[] = []
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported?.(m)) ?? ''
    let rec: MediaRecorder
    try {
      rec = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined)
    } catch {
      cleanUp()
      busy.current = false
      setState('idle')
      setError('Your browser can’t record here. Type your question instead.')
      return
    }
    recorder.current = rec
    peak.current = 0

    // Measure loudness while recording, so silence is never sent (Whisper invents words on silence).
    try {
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      ctx.createMediaStreamSource(stream.current).connect(analyser)
      const data = new Uint8Array(analyser.fftSize)
      const tick = () => {
        analyser.getByteTimeDomainData(data)
        for (const v of data) peak.current = Math.max(peak.current, Math.abs(v - 128) / 128)
        timers.current.meter = requestAnimationFrame(tick)
      }
      timers.current.ctx = ctx
      tick()
    } catch {
      peak.current = 1 // can't measure: let the server decide
    }

    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = async () => {
      const heard = peak.current >= SILENCE_LEVEL
      const type = rec.mimeType || 'audio/webm'
      cleanUp()
      busy.current = false
      if (!heard) {
        setState('idle')
        setError('I didn’t hear anything. Try again a little closer to the microphone.')
        return
      }
      setState('working')
      try {
        const text = await transcribe(new Blob(chunks, { type }))
        if (text) onTextRef.current(text)
        else setError('I couldn’t make that out. Try again, or type it.')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Voice input isn’t available right now.')
      } finally {
        setState('idle')
      }
    }
    rec.start()
    setState('listening')
    timers.current.stop = setTimeout(stop, MAX_MS)
  }, [stop])

  useEffect(() => () => {
    if (recorder.current?.state === 'recording') {
      recorder.current.onstop = null
      recorder.current.stop()
    }
    cleanUp()
  }, [])

  /** Stop without sending (the box was closed). */
  const cancel = useCallback(() => {
    if (recorder.current) {
      recorder.current.onstop = null
      if (recorder.current.state === 'recording') recorder.current.stop()
    }
    cleanUp()
    busy.current = false
    setState('idle')
  }, [])

  return { state, error, start, stop, cancel, clearError: () => setError(null) }
}
