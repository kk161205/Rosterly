import { matchPages } from '@/guide/pageMap'
import type { GuideTarget, ResolvedPage } from '@/guide/types'

/**
 * What the Guide can do on screen — the only toolset. The
 * AI service replies in exactly this shape; the local planner below
 * produces it without AI. Every plan goes through validatePlan() first.
 */
export type GuideStep =
  | { action: 'go'; page: string; caption?: string }
  | { action: 'point'; target: string; caption: string }
  | { action: 'open'; target: string; caption: string }
  | { action: 'fill'; target: string; value: string; caption: string }
  | { action: 'say'; caption: string }

export interface AnswerLink {
  label: string
  /** An address in the app, e.g. "/assets/…". Only kept when it is a page this person can open. */
  path: string
}

export interface AnswerTable {
  columns: string[]
  rows: string[][]
}

export type GuidePlan =
  | { kind: 'show'; title: string; steps: GuideStep[] }
  | { kind: 'ask'; question: string; choices: { label: string; plan: GuidePlan }[] }
  /** An answer in words (from the person's own data, or how something works), with a page to open after. */
  | { kind: 'answer'; question: string; text: string; table?: AnswerTable; page?: string; links?: AnswerLink[] }
  | { kind: 'none'; message: string }

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

// Words that mean the same thing when matching what someone typed to a button label.
const SAME: Record<string, string> = {
  new: 'add', create: 'add', register: 'add', hire: 'add', joiner: 'add',
  apply: 'ask', request: 'ask', book: 'ask', take: 'ask',
  give: 'assign', allocate: 'assign', hand: 'assign',
  report: 'raise', broken: 'raise', issue: 'raise', fix: 'raise',
  find: 'search', look: 'search', lookup: 'search',
  download: 'download', export: 'download', csv: 'download',
  upload: 'upload', attach: 'upload',
  back: 'return', returned: 'return',
  colour: 'colour', color: 'colour', theme: 'colour',
}
const STOP = new Set(['a', 'an', 'the', 'to', 'i', 'my', 'me', 'how', 'do', 'can', 'where', 'is', 'go', 'open', 'show', 'page', 'of', 'for', 'and', 'in', 'on', 'want', 'need', 'please', 'someone', 'it', 'this', 'that', 'what', 'some'])
const tokens = (s: string) =>
  norm(s)
    .split(' ')
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => SAME[t] ?? t)

/** The button or field on `page` that best fits what was typed, if any word lines up. */
function bestTarget(query: string, page: ResolvedPage): GuideTarget | undefined {
  const q = new Set(tokens(query))
  let best: { t: GuideTarget; score: number } | undefined
  for (const t of page.targets) {
    if (t.after) continue // reach the opener; the person continues from there
    const label = tokens(t.label)
    const score = label.filter((w) => q.has(w)).length * 2 + (t.kind === 'button' || t.kind === 'link' ? 0.5 : 0)
    if (score >= 2 && (!best || score > best.score)) best = { t, score }
  }
  return best?.t
}

/** "/assets/:id" → the list page it's opened from ("/assets"). */
function listPageFor(page: ResolvedPage, pages: ResolvedPage[]): ResolvedPage | undefined {
  const base = page.route.split('/:')[0]
  return pages.find((p) => p.route === base && p.navigable)
}

function planFor(query: string, page: ResolvedPage, pages: ResolvedPage[]): GuidePlan {
  const target = bestTarget(query, page)
  if (!page.navigable) {
    const list = listPageFor(page, pages)
    if (!list) return { kind: 'none', message: `${page.title}: ${page.reach ?? 'open it from its list.'}` }
    const then = target ? ` Then press ${target.label}.` : ''
    return {
      kind: 'show',
      title: page.title,
      steps: [
        { action: 'go', page: list.id, caption: `Open ${list.title}` },
        { action: 'say', caption: `${page.reach ?? `Open one from ${list.title}.`}${then}` },
      ],
    }
  }
  const steps: GuideStep[] = [{ action: 'go', page: page.id, caption: `Open ${page.title}` }]
  if (target) {
    const caption = target.kind === 'field' ? `Type here: ${target.label}` : target.changes ? `Press ${target.label} when you’re ready` : `Press ${target.label}`
    steps.push({ action: 'point', target: target.id, caption })
  }
  return { kind: 'show', title: target ? `${page.title}: ${target.label}` : page.title, steps }
}

/**
 * The Guide without AI (the fallback when the AI service is off or down):
 * the best page by the page map's words, and the best button on it.
 * Two close matches → ask back with both.
 */
export function planLocally(query: string, pages: ResolvedPage[]): GuidePlan {
  const matches = matchPages(query, pages, 3)
  if (matches.length === 0) return { kind: 'none', message: `I couldn’t find a page for “${query.trim()}”. Try other words, like “leave” or “new laptop”.` }
  const [first, second] = matches
  if (second && first.score < 80 && second.score >= first.score * 0.85) {
    return {
      kind: 'ask',
      question: 'Which one did you mean?',
      choices: matches
        .filter((m) => m.score >= first.score * 0.85)
        .map((m) => ({ label: m.page.title, plan: planFor(query, m.page, pages) })),
    }
  }
  return planFor(query, first.page, pages)
}

/**
 * The safety net for every plan, local or from the AI ("responses are
 * checked"): only pages and targets this person was given; never open or fill
 * something that changes data (it becomes a point); never go to a record page;
 * once a button has opened its form or menu, only that form's own targets follow
 * (the rest of the page is behind it), so the plan ends there.
 * Anything unusable is dropped — an empty plan becomes "none", never a stray click.
 */
export function validatePlan(plan: GuidePlan, pages: ResolvedPage[]): GuidePlan {
  if (plan.kind === 'none') return { kind: 'none', message: String(plan.message ?? '').slice(0, 300) }
  if (plan.kind === 'answer') {
    const text = String(plan.text ?? '').slice(0, 600)
    if (!text) return { kind: 'none', message: 'I couldn’t work that out. Try other words.' }
    const page = pages.find((p) => p.id === plan.page && p.navigable)?.id
    const t = plan.table
    const columns = Array.isArray(t?.columns) ? t.columns.slice(0, 4).map((c) => String(c).slice(0, 40)) : []
    const rows = Array.isArray(t?.rows) ? t.rows.slice(0, 8).filter(Array.isArray).map((r) => r.slice(0, columns.length).map((c) => String(c ?? '').slice(0, 80))) : []
    const routes = pages.map((p) => new RegExp(`^${p.route.replace(/:[^/]+/g, '[A-Za-z0-9-]+')}$`))
    const links = (Array.isArray(plan.links) ? plan.links : [])
      .filter((l) => typeof l?.path === 'string' && typeof l?.label === 'string' && routes.some((r) => r.test(l.path)))
      .slice(0, 5)
      .map((l) => ({ label: l.label.slice(0, 80), path: l.path }))
    return {
      kind: 'answer',
      question: String(plan.question ?? '').slice(0, 300),
      text,
      ...(columns.length && rows.length ? { table: { columns, rows } } : {}),
      ...(page ? { page } : {}),
      ...(links.length ? { links } : {}),
    }
  }
  if (plan.kind === 'ask') {
    const choices = plan.choices.map((c) => ({ ...c, plan: validatePlan(c.plan, pages) })).filter((c) => c.plan.kind !== 'none')
    return choices.length ? { ...plan, choices: choices.slice(0, 3) } : { kind: 'none', message: 'I couldn’t work that out. Try other words.' }
  }
  const pageById = new Map(pages.map((p) => [p.id, p]))
  const targetById = new Map(pages.flatMap((p) => p.targets.map((t) => [t.id, t] as const)))
  const steps: GuideStep[] = []
  let opened: string | null = null // a button pressed open: its form or menu now covers the page
  for (const step of plan.steps.slice(0, 8)) {
    if (opened && step.action !== 'say') {
      const target = 'target' in step ? targetById.get(step.target) : undefined
      if (target?.after !== opened) break
    }
    if (step.action === 'say') {
      steps.push({ action: 'say', caption: String(step.caption).slice(0, 200) })
    } else if (step.action === 'go') {
      const page = pageById.get(step.page)
      if (page?.navigable) steps.push({ action: 'go', page: page.id, caption: step.caption?.slice(0, 120) })
    } else if (step.action === 'point' || step.action === 'open' || step.action === 'fill') {
      const target = targetById.get(step.target)
      if (!target) continue
      // Something that only appears behind another control (a tab, a form): open that first if the plan forgot
      const opener = target.after ? targetById.get(target.after) : undefined
      if (opener && !opener.changes) {
        const earlier = steps.findIndex((s) => 'target' in s && s.target === opener.id)
        const prev = steps[earlier]
        if (earlier === -1) {
          steps.push({ action: 'open', target: opener.id, caption: `Open ${opener.label.replace(/\s*\(.*\)$/, '')}` })
          if (opener.kind === 'button') opened = opener.id
        } else if (prev?.action === 'point') {
          // Only pointed at, so it would never open; this step needs it open
          steps[earlier] = { action: 'open', target: prev.target, caption: prev.caption }
          if (opener.kind === 'button') opened = opener.id
        }
      }
      const caption = String(step.caption ?? target.label).slice(0, 120)
      if (step.action === 'open' && (target.changes || target.kind === 'field')) steps.push({ action: 'point', target: target.id, caption })
      else if (step.action === 'fill' && (target.changes || target.kind !== 'field' || typeof step.value !== 'string')) steps.push({ action: 'point', target: target.id, caption })
      else if (step.action === 'fill') steps.push({ action: 'fill', target: target.id, value: step.value.slice(0, 200), caption })
      else steps.push({ action: step.action, target: target.id, caption })
      if (steps[steps.length - 1].action === 'open' && target.kind === 'button') opened = target.id
    }
  }
  if (steps.length === 0) return { kind: 'none', message: 'I couldn’t find a way to show that. Try other words.' }
  // The tour ends on something the person presses, never on the Guide opening a form by itself
  const last = steps[steps.length - 1]
  if (last.action === 'open') steps[steps.length - 1] = { action: 'point', target: last.target, caption: last.caption }
  return { kind: 'show', title: String(plan.title).slice(0, 80), steps }
}
