import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import type { UserProfile } from '@/features/auth/types/auth'
import { guideAllowed, usePreferences } from '@/features/preferences/usePreferences'
import { pagesFor } from '@/guide/pageMap'
import { planLocally, validatePlan, type GuidePlan } from '@/guide/plan'
import { aiPlan, type PlannerContext } from '@/guide/aiPlanner'
import { AnswerPanel } from '@/guide/AnswerPanel'
import { AI_BASE_URL } from '@/lib/api-client'
import { voiceSupported } from '@/guide/voice'
import { runPlan } from '@/guide/runner'
import { HOME_SELECTOR, findVisible, prefersReducedMotion } from '@/guide/dom'
import { GuideOverlay } from '@/guide/GuideOverlay'
import { nextGreeting } from '@/guide/greeting'
import type { ResolvedPage } from '@/guide/types'

export type GuidePhase = 'docked' | 'listening' | 'thinking' | 'guiding' | 'asking' | 'answer' | 'message'

export interface TilePosition {
  x: number
  y: number
  /** Size relative to the full tile; below 1 while it sits in the logo. */
  scale?: number
}

/** Turns a question into a plan: the AI service when configured, else the page map. Failures fall back to the page map. */
export type Planner = (question: string, pages: ResolvedPage[], ctx: PlannerContext) => Promise<GuidePlan>
export const localPlanner: Planner = async (question, pages) => planLocally(question, pages)
export const defaultPlanner: Planner = AI_BASE_URL ? (question, pages, ctx) => aiPlan(question, pages, ctx, ctx.signal) : localPlanner

/** The page id for an address ("/assets/a1" → "asset"), so the AI knows where the person is. */
function pageIdFor(pathname: string, pages: ResolvedPage[]): string | undefined {
  return pages.find((p) => new RegExp(`^${p.route.replace(/:[^/]+/g, '[^/]+')}$`).test(pathname))?.id
}

const RECORD_ROUTES: [RegExp, 'asset' | 'employee'][] = [
  [/^\/assets\/([0-9a-fA-F-]{36})$/, 'asset'],
  [/^\/employees\/([0-9a-fA-F-]{36})$/, 'employee'],
]

/** The asset or person open on screen ("/assets/<id>"), so the Guide can answer about "this one". */
export function recordFor(pathname: string): PlannerContext['record'] {
  for (const [pattern, type] of RECORD_ROUTES) {
    const m = pathname.match(pattern)
    if (m) return { type, id: m[1] }
  }
  return undefined
}

interface GuideContextValue {
  /** The company and the person both allow the Guide. */
  allowed: boolean
  phase: GuidePhase
  /** Voice input can be used: the Guide is allowed, the person turned voice on, and the browser can record. */
  voice: boolean
  /** The tile is out of the logo (its slot shows as an outline). */
  out: boolean
  boxOpen: boolean
  setBoxOpen: (open: boolean) => void
  ask: (question: string) => void
  run: (plan: GuidePlan) => void
  stop: () => void
  askAgain: () => void
}

const GuideContext = createContext<GuideContextValue | null>(null)

const OFF: GuideContextValue = {
  allowed: false,
  phase: 'docked',
  voice: false,
  out: false,
  boxOpen: false,
  setBoxOpen: () => {},
  ask: () => {},
  run: () => {},
  stop: () => {},
  askAgain: () => {},
}

/** The Guide's state, or "off" outside the signed-in app (e.g. the sign-in page). */
export const useGuide = () => useContext(GuideContext) ?? OFF

const TILE = 22 // px, the tile's size on screen (keep in step with GuideOverlay)
const GREETING_MS = 4000

function besideElement(el: Element): TilePosition {
  const r = el.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  return {
    x: Math.min(Math.max(r.right + 6, 8), vw - TILE - 8),
    y: Math.min(Math.max(r.top - TILE / 2, 20), vh - TILE - 8),
  }
}

function homePosition(): TilePosition | null {
  const home = findVisible(HOME_SELECTOR)
  if (!home) return null
  const r = home.getBoundingClientRect()
  // The logo's tile is 10.5 of the mark's 28 units; start (and end) at that size so it reads as leaving the logo.
  const svg = (home as unknown as SVGGraphicsElement).ownerSVGElement
  const mark = svg?.getBoundingClientRect().width ?? 0
  const scale = mark > 0 ? (mark * 10.5) / 28 / TILE : 1
  return { x: r.left + r.width / 2 - TILE / 2, y: r.top + r.height / 2 - TILE / 2, scale }
}

/** Two frames: the tile is painted where it starts before it is told to move, so the move animates. */
const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

/** Beside the Search-or-ask box (top centre), as if listening. */
function listeningPosition(): TilePosition {
  const vw = window.innerWidth
  const boxWidth = Math.min(576, vw - 32)
  return { x: Math.min(vw / 2 + boxWidth / 2 + 10, vw - TILE - 8), y: window.innerHeight * 0.12 + 18 }
}

export interface GuideTiming {
  move: number
  /** The least time a caption stays up; longer captions get more (see readingTime). */
  dwell: number
  /** Extra time per character of caption, so it can be read (0 = a flat dwell). */
  perChar?: number
  maxDwell?: number
  /** A breath after a new page opens, before the tile moves on. */
  afterPage?: number
}
// About 0.6 s to glide (the eye can follow it) and a caption up for 1.4–2.6 s depending on its length:
// long enough to read, short enough not to drag.
const REAL_TIMING: GuideTiming = { move: 600, dwell: 1400, perChar: 45, maxDwell: 2600, afterPage: 500 }

export function readingTime(caption: string, t: GuideTiming): number {
  if (!t.perChar) return t.dwell
  return Math.min(Math.max(1200 + caption.length * t.perChar, t.dwell), t.maxDwell ?? t.dwell)
}

export const GuideProvider: React.FC<{
  user: UserProfile | null
  desktop: boolean
  children: React.ReactNode
  planner?: Planner
  timing?: GuideTiming
}> = ({ user, desktop, children, planner = defaultPlanner, timing = REAL_TIMING }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const prefs = usePreferences(Boolean(user))
  const allowed = guideAllowed(prefs.data)
  const style = prefs.data?.guide_style ?? 'show'

  const [phase, setPhase] = useState<GuidePhase>('docked')
  const [boxOpen, setBoxOpenState] = useState(false)
  const [tile, setTile] = useState<TilePosition | null>(null)
  const [fading, setFading] = useState(false)
  const [caption, setCaption] = useState('')
  const [greeting, setGreeting] = useState('')
  const openCount = useRef(0)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [choices, setChoices] = useState<{ label: string; plan: GuidePlan }[]>([])
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<Extract<GuidePlan, { kind: 'answer' }> | null>(null)
  const historyRef = useRef<{ question: string; answer: string }[]>([])
  const captionRef = useRef('')

  const pathRef = useRef(location.pathname)
  pathRef.current = location.pathname
  const abortRef = useRef<AbortController | null>(null)
  const anchorRef = useRef<HTMLElement | null>(null)
  const lastQuestion = useRef('')

  const pages = useMemo(() => pagesFor(user), [user])
  const reduced = prefersReducedMotion()
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

  // Listen for the person's press from the moment an element is highlighted,
  // so a press during the caption isn't missed.
  const pressedRef = useRef<HTMLElement | null>(null)
  const onPress = useCallback((e: Event) => {
    pressedRef.current = e.currentTarget as HTMLElement
  }, [])
  const highlight = useCallback(
    (el: HTMLElement | null) => {
      anchorRef.current?.removeAttribute('data-guide-active')
      anchorRef.current?.removeEventListener('click', onPress, true)
      anchorRef.current = el
      pressedRef.current = null
      el?.setAttribute('data-guide-active', '')
      el?.addEventListener('click', onPress, true)
    },
    [onPress],
  )

  const place = useCallback(
    async (pos: TilePosition | null) => {
      if (!pos) return
      if (reduced && timing.move > 0) {
        // Reduced motion: fade out, jump, fade in — no flying.
        setFading(true)
        await sleep(120)
        setTile(pos)
        setFading(false)
        await sleep(120)
      } else {
        setTile(pos)
        if (timing.move > 0) await sleep(timing.move)
      }
    },
    [reduced, timing.move],
  )

  /** Bring the tile out of the logo (if it is home) and on to `target`. */
  const tileRef = useRef<TilePosition | null>(null)
  tileRef.current = tile
  const launch = useCallback(
    async (target: TilePosition | null) => {
      if (!tileRef.current) {
        const start = homePosition()
        if (start && timing.move > 0 && !reduced) {
          setTile(start)
          await nextPaint()
        } else if (!target) {
          setTile(start ?? listeningPosition())
        }
      }
      await place(target)
    },
    [place, reduced, timing.move],
  )

  const goHome = useCallback(async () => {
    highlight(null)
    setCaption('')
    const home = homePosition()
    if (home && tile) await place(home)
    setTile(null)
    setPhase('docked')
  }, [place, tile, highlight])

  // Keep the tile beside its element while the page scrolls or resizes.
  useEffect(() => {
    if (!tile || !anchorRef.current) return
    const follow = () => {
      if (anchorRef.current?.isConnected) setTile(besideElement(anchorRef.current))
    }
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    return () => {
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', follow)
    }
  }, [tile])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setChoices([])
    setMessage('')
    setAnswer(null)
    void goHome()
  }, [goHome])

  const run = useCallback(
    (raw: GuidePlan) => {
      abortRef.current?.abort()
      const plan = validatePlan(raw, pages)
      setChoices([])
      if (plan.kind === 'none') {
        setMessage(plan.message)
        setPhase('message')
        return
      }
      if (plan.kind === 'ask') {
        setQuestion(plan.question)
        setChoices(plan.choices)
        setPhase('asking')
        return
      }
      if (plan.kind === 'answer') {
        // Answers open in the side panel; the tile rests beside it (Replies).
        historyRef.current = [...historyRef.current, { question: plan.question, answer: plan.text }].slice(-2)
        highlight(null)
        setCaption('')
        setAnswer(plan)
        setPhase('answer')
        return
      }
      const controller = new AbortController()
      abortRef.current = controller
      setTitle(plan.title)
      setMessage('')
      setPhase('guiding')
      if (!tile) void launch(null)
      void runPlan(plan, {
        signal: controller.signal,
        style,
        desktop,
        navigate,
        pathname: () => pathRef.current,
        moveTo: async (el) => {
          highlight(el)
          await launch(el ? besideElement(el) : homePosition())
        },
        say: (text) => {
          captionRef.current = text
          setCaption(text)
        },
        pause: (ms) => sleep(timing.afterPage ? ms : 0),
        dwell: () =>
          new Promise<void>((resolve) => {
            const t = setTimeout(resolve, readingTime(captionRef.current, timing))
            controller.signal.addEventListener('abort', () => {
              clearTimeout(t)
              resolve()
            })
          }),
        waitForPerson: (el) =>
          new Promise<void>((resolve) => {
            const startedOn = pathRef.current
            const done = () => {
              clearInterval(watch)
              resolve()
            }
            const watch = setInterval(() => {
              if (pressedRef.current === el || controller.signal.aborted || pathRef.current !== startedOn || !el.isConnected) done()
            }, 100)
          }),
      }).then((outcome) => {
        if (controller.signal.aborted) return
        abortRef.current = null
        if (outcome.status === 'stuck') {
          highlight(null)
          setCaption('')
          setMessage(outcome.message)
          setPhase('message')
        } else {
          void goHome()
        }
      })
    },
    [pages, style, desktop, navigate, launch, timing, tile, goHome, highlight],
  )

  const ask = useCallback(
    (q: string) => {
      const text = q.trim()
      if (!text || !allowed) return
      lastQuestion.current = text
      setBoxOpenState(false)
      setPhase('thinking')
      setCaption('')
      setAnswer(null)
      abortRef.current?.abort()
      const thinking = new AbortController()
      abortRef.current = thinking
      void planner(text, pages, { currentPage: pageIdFor(pathRef.current, pages), record: recordFor(pathRef.current), history: historyRef.current, signal: thinking.signal })
        .catch(() => planLocally(text, pages)) // the AI is down: fall back to the page map
        .then((plan) => {
          // Stopped, or a newer question was asked meanwhile: drop this reply.
          if (thinking.signal.aborted || abortRef.current !== thinking) return
          abortRef.current = null
          run(plan)
        })
    },
    [allowed, planner, pages, run],
  )

  const setBoxOpen = useCallback(
    (open: boolean) => {
      setBoxOpenState(open)
      if (!allowed) return
      if (open) {
        abortRef.current?.abort()
        highlight(null)
        setChoices([])
        setMessage('')
        setPhase('listening')
        // Greet once the tile has arrived beside the box, unless the box was closed or reopened meanwhile.
        const thisOpen = ++openCount.current
        setGreeting('')
        void launch(listeningPosition()).then(() => {
          if (openCount.current === thisOpen) setGreeting(nextGreeting(user))
        })
      } else if (phase === 'listening') {
        openCount.current++
        void goHome()
      }
    },
    [allowed, launch, phase, goHome, highlight, user],
  )

  // The greeting is only for the moment the box opens: gone once the person asks, closes, or after a few seconds.
  useEffect(() => {
    if (phase !== 'listening') {
      setGreeting('')
      return
    }
    if (!greeting) return
    const t = setTimeout(() => setGreeting(''), GREETING_MS)
    return () => clearTimeout(t)
  }, [phase, greeting])

  const askAgain = useCallback(() => setBoxOpen(true), [setBoxOpen])

  // Esc stops the Guide wherever it is (Control).
  useEffect(() => {
    if (phase === 'docked' || phase === 'listening') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, stop])

  // Turning the Guide off mid-tour sends the tile home.
  useEffect(() => {
    if (!allowed && phase !== 'docked') stop()
  }, [allowed, phase, stop])

  useEffect(() => () => abortRef.current?.abort(), [])

  const value = useMemo<GuideContextValue>(
    () => ({ allowed, phase, voice: allowed && Boolean(prefs.data?.voice_enabled) && voiceSupported(), out: tile !== null, boxOpen, setBoxOpen, ask, run, stop, askAgain }),
    [allowed, phase, tile, boxOpen, setBoxOpen, ask, run, stop, askAgain, prefs.data?.voice_enabled],
  )

  return (
    <GuideContext.Provider value={value}>
      {children}
      {allowed &&
        createPortal(
          <GuideOverlay
            phase={phase}
            tile={tile}
            fading={fading}
            moveMs={reduced ? 0 : timing.move}
            caption={caption}
            design={prefs.data?.accent}
            greeting={greeting}
            title={title}
            message={message}
            question={question}
            choices={choices}
            onChoose={(plan) => run(plan)}
            onStop={stop}
            onAskAgain={askAgain}
            lastQuestion={lastQuestion.current}
          />,
          document.body,
        )}
      {allowed && answer && (
        <AnswerPanel
          answer={answer}
          pages={pages}
          onClose={stop}
          onOpenLink={(path) => {
            setAnswer(null)
            void goHome()
            navigate(path)
          }}
          onOpenPage={(pageId) => {
            const page = pages.find((p) => p.id === pageId)
            setAnswer(null)
            run({ kind: 'show', title: page?.title ?? 'Page', steps: [{ action: 'go', page: pageId, caption: `Open ${page?.title ?? 'the page'}` }] })
          }}
          onFollowUp={ask}
          onShown={(el) => {
            if (el) void place(besideElement(el))
          }}
        />
      )}
    </GuideContext.Provider>
  )
}
