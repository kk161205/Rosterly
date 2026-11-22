import { findPage, findTarget, routeText } from '@/guide/pageMap'
import type { GuidePlan } from '@/guide/plan'
import {
  GuideStopped,
  MENU_SELECTOR,
  canPress,
  findVisible,
  press,
  sectionSelector,
  tabSelector,
  targetSelector,
  typeInto,
  waitForVisible,
  waitUntil,
} from '@/guide/dom'

/** What the runner needs from the app. The provider supplies it; tests supply fakes. */
export interface RunDeps {
  signal: AbortSignal
  style: 'show' | 'take'
  desktop: boolean
  navigate: (path: string) => void
  pathname: () => string
  /** Glide the tile to an element (null = back to the logo) and highlight it. */
  moveTo: (el: HTMLElement | null) => Promise<void>
  say: (caption: string) => void
  /** A pause long enough to read the caption. */
  dwell: () => Promise<void>
  /** A short breath after a new page opens, so it settles before the tile moves on. */
  pause?: (ms: number) => Promise<void>
  /** Resolves when the person presses the element, or moves on. */
  waitForPerson: (el: HTMLElement) => Promise<void>
}

export type RunOutcome = { status: 'done' } | { status: 'stopped' } | { status: 'stuck'; message: string }

const onRoute = (pathname: string, route: string) => pathname === route

/** Walks a plan step by step. Assumes validatePlan() has run. */
export async function runPlan(plan: GuidePlan, deps: RunDeps): Promise<RunOutcome> {
  if (plan.kind !== 'show') return { status: 'done' }
  const { signal } = deps
  /** Throws if the person pressed Stop — called right before anything is pressed or typed. */
  const live = () => {
    if (signal.aborted) throw new GuideStopped()
  }
  try {
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i]
      const last = i === plan.steps.length - 1
      if (signal.aborted) throw new GuideStopped()

      if (step.action === 'say') {
        deps.say(step.caption)
        if (last) await deps.dwell()
        continue
      }

      if (step.action === 'go') {
        const page = findPage(step.page)
        if (!page) continue
        if (!onRoute(deps.pathname(), page.route)) {
          if (deps.style === 'take' || !page.section) {
            deps.say(step.caption ?? `Opening ${page.title}`)
            deps.navigate(page.route)
          } else {
            // Show the route: (menu on phones) → sidebar section → tab.
            if (!deps.desktop) {
              const menu = findVisible(MENU_SELECTOR)
              if (menu) {
                deps.say('Open the menu')
                await deps.moveTo(menu)
                await deps.dwell()
                live()
                menu.click()
              }
            }
            const section = await waitForVisible(sectionSelector(page.section), signal, 3000)
            if (section) {
              deps.say(`Open ${page.section}`)
              await deps.moveTo(section)
              await deps.dwell()
              const before = deps.pathname()
              live()
              section.click()
              // Wait for the section to open (or already be open) before looking for its tab.
              await waitUntil(() => deps.pathname() !== before || onRoute(deps.pathname(), page.route), signal, 1500)
            } else {
              deps.navigate(page.route)
            }
            if (page.tab && !onRoute(deps.pathname(), page.route)) {
              const tab = await waitForVisible(tabSelector(page.route), signal, 3000)
              if (tab) {
                deps.say(`Then ${page.tab}`)
                await deps.moveTo(tab)
                await deps.dwell()
                live()
                tab.click()
              } else {
                deps.navigate(page.route)
              }
            }
          }
          if (!(await waitUntil(() => onRoute(deps.pathname(), page.route), signal, 4000))) {
            return { status: 'stuck', message: `I couldn’t open ${page.title}. You can reach it from ${routeText(page)}.` }
          }
          await deps.pause?.(500)
        }
        if (last) {
          deps.say(`This is ${page.title}. ${page.purpose}`)
          await deps.moveTo(document.querySelector<HTMLElement>('main h1') ?? null)
          await deps.dwell()
          await deps.dwell()
        }
        continue
      }

      // point / open / fill
      const found = findTarget(step.target)
      if (!found) continue
      const { target } = found
      const el = await waitForVisible(targetSelector(target.id), signal, 3000)
      if (!el) {
        const why = target.note ? ` ${target.note}` : ''
        return { status: 'stuck', message: `${target.label} isn’t on screen right now.${why}` }
      }
      el.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      deps.say(step.caption)
      await deps.moveTo(el)
      await deps.dwell()

      if (step.action === 'open' && !last && canPress(el, target.changes)) {
        live()
        press(el)
        continue
      }
      if (step.action === 'fill' && canPress(el, target.changes)) {
        live()
        typeInto(el, step.value)
        if (!last) continue
      }
      if (last) {
        // The person takes the last step themselves.
        await deps.waitForPerson(el)
      }
    }
    return { status: 'done' }
  } catch (err) {
    if (err instanceof GuideStopped || signal.aborted) return { status: 'stopped' }
    throw err
  }
}
