import { AI_BASE_URL } from '@/lib/api-client'
import { authStorage } from '@/lib/authStorage'
import { toAiPages } from '@/guide/pageMap'
import type { GuidePlan, GuideStep } from '@/guide/plan'
import type { ResolvedPage } from '@/guide/types'

/** What the AI planner is told besides the question (`/ai/guide`). */
export interface PlannerContext {
  currentPage?: string
  /** The asset or person open on screen, so "this one" means it. Only its id is sent. */
  record?: { type: 'asset' | 'employee'; id: string }
  history: { question: string; answer: string }[]
  /** Aborted when the person presses Stop or asks something else. */
  signal?: AbortSignal
}

interface AiReply {
  kind: 'show' | 'answer' | 'ask' | 'none'
  title?: string
  steps?: GuideStep[]
  text?: string
  table?: { columns: string[]; rows: string[][] }
  page?: string
  links?: { label: string; path: string }[]
  question?: string
  choices?: { label: string; page: string }[]
  message?: string
}

export class AiUnavailable extends Error {}

/**
 * Asks the AI service. Sends only the question, the current page and
 * this person's trimmed page map — never records. Any failure (service off,
 * asleep, rate-limited, Groq down) throws, and the provider falls back to the
 * page map. The reply is validated again by validatePlan.
 */
export async function aiPlan(question: string, pages: ResolvedPage[], ctx: PlannerContext, signal?: AbortSignal): Promise<GuidePlan> {
  const token = authStorage.getAccessToken()
  if (!AI_BASE_URL || !token) throw new AiUnavailable('no AI service')
  let res: Response
  try {
    res = await fetch(`${AI_BASE_URL}/ai/guide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        message: question.slice(0, 400),
        current_page: ctx.currentPage,
        ...(ctx.record ? { record: ctx.record } : {}),
        pages: toAiPages(pages),
        history: ctx.history.slice(-2).map((t) => ({ question: t.question.slice(0, 300), answer: t.answer.slice(0, 600) })),
      }),
      // Stop/new question (signal) or 30 s, whichever comes first.
      signal: signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : (signal ?? AbortSignal.timeout(30_000)),
    })
  } catch {
    throw new AiUnavailable('unreachable')
  }
  if (!res.ok) throw new AiUnavailable(`status ${res.status}`)
  const reply = (await res.json()) as AiReply
  return toPlan(reply, question, pages)
}

export function toPlan(reply: AiReply, question: string, pages: ResolvedPage[]): GuidePlan {
  switch (reply.kind) {
    case 'show':
      return { kind: 'show', title: reply.title ?? 'Here’s how', steps: reply.steps ?? [] }
    case 'answer':
      return { kind: 'answer', question, text: reply.text ?? '', table: reply.table, page: reply.page, links: reply.links }
    case 'ask':
      return {
        kind: 'ask',
        question: reply.question ?? 'Which one did you mean?',
        choices: (reply.choices ?? []).map((c) => {
          const page = pages.find((p) => p.id === c.page)
          return { label: page?.title ?? c.label, plan: { kind: 'show', title: page?.title ?? c.label, steps: [{ action: 'go', page: c.page, caption: `Open ${page?.title ?? c.label}` }] } }
        }),
      }
    default:
      return { kind: 'none', message: reply.message ?? 'I couldn’t find a way to help with that here.' }
  }
}
