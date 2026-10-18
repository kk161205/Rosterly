/**
 * Generates a simple, lightweight device fingerprint string
 * based on user agent, screen resolution, timezone, and language.
 */
export function getDeviceFingerprint(): string {
  try {
    const userAgent = navigator.userAgent || ''
    const screenRes = `${window.screen.width}x${window.screen.height}`
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    const language = navigator.language || ''
    const raw = `${userAgent}|${screenRes}|${timeZone}|${language}`

    let hash = 0
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash |= 0 // Convert to 32bit integer
    }
    return `fp_${Math.abs(hash).toString(16)}`
  } catch {
    return 'fp_unknown'
  }
}
