/**
 * Personal accent. The colour values live in
 * globals.css under [data-accent='…']; this file only knows the ids and names.
 */
export const ACCENTS = [
  { id: 'navy', name: 'Navy' },
  { id: 'sage', name: 'Sage' },
  { id: 'lavender', name: 'Lavender' },
  { id: 'dusk', name: 'Dusk blue' },
  { id: 'peach', name: 'Peach' },
  { id: 'sand', name: 'Sand' },
  { id: 'rose', name: 'Rose' },
] as const

export type AccentId = (typeof ACCENTS)[number]['id']

const STORAGE_KEY = 'rosterly.accent'
const isAccent = (v: unknown): v is AccentId => ACCENTS.some((a) => a.id === v)

/** Recolour the app now, and remember it so the next visit starts in the right colour. */
export function applyAccent(id: AccentId): void {
  document.documentElement.dataset.accent = id
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Storage can be blocked (private windows); the colour still applies for this visit.
  }
}

/** Back to the default (signed out, or the sign-in page). */
export function resetAccent(): void {
  delete document.documentElement.dataset.accent
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing stored, or storage blocked.
  }
}

/** The colour saved on this device, applied before the first paint so there's no flash of navy. */
export function restoreAccent(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isAccent(saved)) document.documentElement.dataset.accent = saved
  } catch {
    // Ignore: the default navy shows until preferences load.
  }
}
