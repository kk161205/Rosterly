/**
 * How the Guide finds and touches things on screen: only
 * elements tagged data-guide / data-guide-section / data-guide-tab /
 * data-guide-menu, never arbitrary DOM.
 */

const isJsdom = typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')

/** On screen (not display:none, not in a hidden drawer). jsdom has no layout, so it counts everything connected. */
export function isVisible(el: Element): boolean {
  if (!el.isConnected || el.closest('[hidden],[inert]')) return false
  if (isJsdom) return true
  return el.getClientRects().length > 0
}

export function findVisible(selector: string): HTMLElement | null {
  return (Array.from(document.querySelectorAll<HTMLElement>(selector)).find(isVisible) ?? null)
}

export const css = (value: string) => value.replace(/["\\]/g, '\\$&')
export const targetSelector = (id: string) => `[data-guide="${css(id)}"]`
export const sectionSelector = (label: string) => `[data-guide-section="${css(label)}"]`
export const tabSelector = (path: string) => `[data-guide-tab="${css(path)}"]`
export const MENU_SELECTOR = '[data-guide-menu]'
export const HOME_SELECTOR = '[data-guide-home]'

export class GuideStopped extends Error {
  constructor() {
    super('stopped')
  }
}

/** Waits until a matching element is on screen; null after `timeout`. Stops at once when the signal aborts. */
export function waitForVisible(selector: string, signal: AbortSignal, timeout = 5000): Promise<HTMLElement | null> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (signal.aborted) return reject(new GuideStopped())
      const el = findVisible(selector)
      if (el) return resolve(el)
      if (Date.now() - started >= timeout) return resolve(null)
      setTimeout(tick, 80)
    }
    tick()
  })
}

export function waitUntil(check: () => boolean, signal: AbortSignal, timeout = 5000): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (signal.aborted) return reject(new GuideStopped())
      if (check()) return resolve(true)
      if (Date.now() - started >= timeout) return resolve(false)
      setTimeout(tick, 80)
    }
    tick()
  })
}

/**
 * The only way the Guide presses anything: never a submit button, a password
 * field, a disabled control, or anything the page map says changes data.
 */
export function canPress(el: HTMLElement, changes: boolean): boolean {
  if (changes) return false
  if (el.matches('[type="submit"], input[type="password"], [disabled], [aria-disabled="true"]')) return false
  return true
}

/** Presses a control the way a person would. Radix tabs switch on mouse-down, not on a bare click(). */
export function press(el: HTMLElement): void {
  if (el.getAttribute('role') === 'tab') el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
  el.click()
}

/** Types into a React-controlled field the way a person would (input events fire). */
export function typeInto(el: HTMLElement, value: string): boolean {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false
  if (el instanceof HTMLInputElement && el.type === 'password') return false
  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.focus()
  return true
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
