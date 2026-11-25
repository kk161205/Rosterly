import { PAGE_MAP } from '@/guide/pageMap'
import type { ResolvedPage } from '@/guide/types'

/**
 * Facts for "why can't I open this?": the pages this person can't open and who
 * each one is for. They go to the AI with the question, and the AI answers —
 * nothing here decides the answer. Only page titles and role names, never data.
 */

// Who each restricted page is for, in words. Mirrors the role grid the API enforces
// (nav.ts and the page map decide visibility; this only explains it).
const WHO: Record<string, string> = {
  '/assets': 'IT admins, super admins and auditors, and managers for their own team’s devices',
  '/assets/:id': 'the person holding the device, IT admins, super admins and auditors, and managers for their own team’s devices',
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

/** The pages missing from this person's map, each with who it is for. */
export function lockedPages(open: ResolvedPage[]): { title: string; who: string }[] {
  const ids = new Set(open.map((p) => p.id))
  return PAGE_MAP.filter((p) => !ids.has(p.id)).map((p) => ({ title: p.title, who: WHO[p.route] ?? 'people whose role includes it' }))
}
