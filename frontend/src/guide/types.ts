import type { UserProfile } from '@/features/auth/types/auth'

/**
 * The page map: what the AI Guide knows about the app
 * pages, how to reach them and the controls worth pointing at. Never data.
 */
export interface GuideTarget {
  /** Matches a `data-guide="…"` attribute in the page's code. Namespaced by page: "assets.add". */
  id: string
  /** What the person sees on it, e.g. "Add an asset". */
  label: string
  kind: 'button' | 'link' | 'field' | 'tab' | 'filter' | 'section'
  /**
   * True when using it saves, sends or deletes something. The Guide may only
   * point at these — the person presses them.
   */
  changes: boolean
  /** Only on screen after this other target has been opened (e.g. a dialog's Save button). */
  after?: string
  /** Who sees it, when narrower than the page (the same rule the page uses to show it). */
  visible?: (user: UserProfile) => boolean
  /** When it shows depends on the record, in plain words — lets the Guide explain a missing button. */
  note?: string
}

export interface GuidePage {
  id: string
  /** The route pattern, exactly as in App.tsx ("/assets/:id"). */
  route: string
  title: string
  /** One plain line: what this page is for. */
  purpose: string
  /** Other words people use for it. */
  words: string[]
  /**
   * Who may open it. Pages in the sidebar take this from nav.ts; others say it here.
   * A page someone can't open is never sent to the AI or suggested.
   */
  visible?: (user: UserProfile) => boolean
  /** For record pages with an id in the address: how a person gets to one. */
  reach?: string
  targets: GuideTarget[]
}

export interface ResolvedPage extends Omit<GuidePage, 'visible'> {
  visible: (user: UserProfile) => boolean
  /** Sidebar section and tab, when the page is in the sidebar. */
  section?: string
  tab?: string
  /** False for record pages (an id in the address) — reached from a list, not opened directly. */
  navigable: boolean
}
