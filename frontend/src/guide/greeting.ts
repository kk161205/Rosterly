/**
 * What the tile says when it comes out of the logo for the search box:
 * "Hello" the first time on this device, "Welcome back" on the first open
 * of a later visit, and nothing on the opens after that.
 */

const SEEN_KEY = 'rosterly.guide.greeted' // per device: has the Guide ever greeted this person
const VISIT_KEY = 'rosterly.guide.greeted-visit' // per tab: has it greeted on this visit

function firstName(fullName: string | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? ''
}

export function greetingText(kind: 'first' | 'visit', name: string): string {
  const opener = kind === 'first' ? 'Hello' : 'Welcome back'
  return name ? `${opener}, ${name}` : opener
}

function read(storage: () => Storage, key: string): boolean {
  try {
    return Boolean(storage().getItem(key))
  } catch {
    return false
  }
}

function mark(storage: () => Storage, key: string) {
  try {
    storage().setItem(key, '1')
  } catch {
    /* private mode: just greet again next time */
  }
}

/** The greeting for this open (empty once it has been said this visit), remembering that it was said. */
export function nextGreeting(user: { id: string; full_name: string } | null): string {
  const seenKey = `${SEEN_KEY}.${user?.id ?? ''}`
  const visitKey = `${VISIT_KEY}.${user?.id ?? ''}`
  const local = () => localStorage
  const session = () => sessionStorage
  if (read(session, visitKey)) return ''
  const kind = read(local, seenKey) ? 'visit' : 'first'
  mark(local, seenKey)
  mark(session, visitKey)
  return greetingText(kind, firstName(user?.full_name))
}
