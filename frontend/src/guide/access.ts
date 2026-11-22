import type { UserProfile } from '@/features/auth/types/auth'
import { PAGE_MAP, matchPages, routeText } from '@/guide/pageMap'
import type { GuidePlan } from '@/guide/plan'
import type { ResolvedPage } from '@/guide/types'

/**
 * "Why can't I open this?" — answered in the browser, with no AI call: the page
 * map already knows every page and who may open it. Says which roles a page is
 * for and who can change a person's roles. Never reveals anything but page names.
 */

// Who each restricted page is for, in words. Mirrors the role grid the API enforces
// (nav.ts and the page map decide visibility; this only explains it).
const WHO: Record<string, string> = {
  '/assets': 'IT admins, super admins and auditors, and managers for their own team’s devices',
  '/assets/:id': 'IT admins, super admins and auditors, and managers for their own team’s devices',
  '/assets/qr': 'IT admins and super admins',
  '/licenses': 'IT admins, super admins and auditors',
  '/approval-chains': 'super admins',
  '/onboarding': 'HR admins, IT admins, managers and super admins',
  '/offboarding': 'HR admins, IT admins, managers and super admins',
  '/departments': 'HR admins and super admins',
  '/analytics': 'IT admins, HR admins, super admins and auditors (each sees the sections for their work)',
  '/users': 'HR admins, super admins and auditors',
  '/roles': 'super admins and auditors',
  '/audit-logs': 'super admins and auditors',
  '/settings': 'super admins and HR admins',
  '/employees/:id': 'the person themselves, their manager, HR admins, super admins and auditors',
}

// Only questions about opening a page ("why can't I complete this checklist?" is not one: the AI answers that).
const ASKS_ABOUT_ACCESS =
  /\b(why|how come)\b.*\b(can ?not|can'?t|cant|unable to|not able to|not allowed to)\s+(i\s+)?(open|see|access|view|get to|get into|find)\b|\bwho can (open|see|access)\b|\bhow (do|can) i get (access|into)\b|\b(i have |got )?no access\b|\bdon'?t have access\b/i
const MEANS_HERE = /\b(this|here|it|this page)\b/i

const matches = (route: string, pathname: string) => new RegExp(`^${route.replace(/:[^/]+/g, '[^/]+')}$`).test(pathname)

/** The page the question is about: the one on screen ("this page"), or the best match for the words. */
function pageAsked(question: string, pathname: string): ResolvedPage | undefined {
  const here = PAGE_MAP.find((p) => matches(p.route, pathname))
  const named = matchPages(question.replace(ASKS_ABOUT_ACCESS, ' '), PAGE_MAP, 1)[0]?.page
  if (named && (!here || !MEANS_HERE.test(question) || named.id !== here.id)) return named
  return here
}

export function explainAccess(question: string, user: UserProfile | null | undefined, pathname: string): GuidePlan | null {
  const plain = question.replace(/[’‘`]/g, "'") // phones type curly apostrophes: "can’t"
  if (!user || !ASKS_ABOUT_ACCESS.test(plain)) return null
  const page = pageAsked(plain, pathname)
  if (!page) return null
  if (page.visible(user)) {
    return {
      kind: 'answer',
      question,
      text: `You can open ${page.title}. It’s under ${routeText(page)}.`,
      ...(page.navigable ? { page: page.id } : {}),
    }
  }
  const who = WHO[page.route] ?? 'people whose role includes it'
  return {
    kind: 'answer',
    question,
    text: `${page.title} is for ${who}, and your role doesn’t include it. If you need it for your work, ask a super admin to add a role for you in Access → Users. Any change applies straight away.`,
  }
}
