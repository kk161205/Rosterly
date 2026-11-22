import type { UserProfile } from '@/features/auth/types/auth'
import { navPlacement } from '@/shell/nav'
import type { GuidePage, GuideTarget, ResolvedPage } from '@/guide/types'

/**
 * The page map. Every `features/<x>/guide.ts` is picked up
 * automatically at build time, so a new feature only has to describe its pages
 * — and pageMap.test.ts fails until every route is described and every
 * target exists in the code.
 */
const modules = import.meta.glob<{ GUIDE: GuidePage[] }>('../features/*/guide.ts', { eager: true })

function resolve(page: GuidePage): ResolvedPage {
  const placement = navPlacement(page.route)
  const visible = page.visible ?? placement?.visible
  if (!visible) throw new Error(`Page map: "${page.id}" is not in the sidebar, so it must say who may open it (visible).`)
  return { ...page, visible, section: placement?.section, tab: placement?.tab, navigable: !page.route.includes(':') }
}

export const PAGE_MAP: ResolvedPage[] = Object.values(modules)
  .flatMap((m) => m.GUIDE)
  .map(resolve)

const TARGETS = new Map<string, { page: ResolvedPage; target: GuideTarget }>(
  PAGE_MAP.flatMap((page) => page.targets.map((target) => [target.id, { page, target }] as const)),
)

export const findPage = (id: string) => PAGE_MAP.find((p) => p.id === id)
export const findTarget = (id: string) => TARGETS.get(id)

/** The pages — and the targets on them — this person can open. Nothing else is ever suggested or sent. */
export function pagesFor(user: UserProfile | null | undefined): ResolvedPage[] {
  if (!user) return []
  return PAGE_MAP.filter((p) => p.visible(user)).map((p) => ({
    ...p,
    targets: p.targets.filter((t) => !t.visible || t.visible(user)),
  }))
}

/** How to get there, in words: "Assets → Licences", or the record page's `reach`. */
export function routeText(page: ResolvedPage): string {
  if (page.section) return page.tab ? `${page.section} → ${page.tab}` : page.section
  return page.reach ?? page.title
}

/** What the AI service receives: plain data, no functions, no records (`pages`). */
export interface AiPage {
  id: string
  title: string
  purpose: string
  words: string[]
  how_to_reach: string
  navigable: boolean
  targets: { id: string; label: string; kind: GuideTarget['kind']; changes: boolean; after?: string; note?: string }[]
}

export function toAiPages(pages: ResolvedPage[]): AiPage[] {
  return pages.map((p) => ({
    id: p.id,
    title: p.title,
    purpose: p.purpose,
    words: p.words,
    how_to_reach: routeText(p),
    navigable: p.navigable,
    targets: p.targets.map(({ id, label, kind, changes, after, note }) => ({
      id,
      label,
      kind,
      changes,
      ...(after ? { after } : {}),
      ...(note ? { note } : {}),
    })),
  }))
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const STOP = new Set(['a', 'an', 'the', 'to', 'i', 'my', 'me', 'how', 'do', 'can', 'where', 'is', 'go', 'take', 'open', 'show', 'page', 'of', 'for', 'and', 'in', 'on', 'want', 'need', 'please'])

/**
 * Instant page matching for the search box — no AI call.
 * Title and the page's own words count most; the purpose line breaks ties.
 */
export function matchPages(query: string, pages: ResolvedPage[], limit = 5): { page: ResolvedPage; score: number }[] {
  const q = norm(query)
  if (!q) return []
  const tokens = q.split(' ').filter((t) => t.length > 1 && !STOP.has(t))
  const scored = pages.map((page) => {
    const title = norm(page.title)
    const words = page.words.map(norm)
    const purpose = norm(page.purpose)
    let score = 0
    if (title === q) score += 100
    else if (title.startsWith(q)) score += 70
    else if (q.includes(title)) score += 50
    for (const w of words) {
      if (w === q) score += 80
      else if (q.includes(w) || (q.length >= 4 && w.startsWith(q))) score += 40 + Math.min(w.length, 20)
    }
    for (const t of tokens) {
      if (title.split(' ').some((w) => w.startsWith(t))) score += 15
      if (words.some((w) => w.split(' ').some((x) => x.startsWith(t)))) score += 10
      if (purpose.split(' ').includes(t)) score += 3
    }
    if (!page.navigable) score -= 10 // record pages are reached through their list
    return { page, score }
  })
  return scored
    .filter((s) => s.score >= 15)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
