/**
 * One reader for the backend's standard error envelope (project doc §7 rule 7):
 *   { error: { code: string, message: string, field_errors: object | null } }
 * Every page uses these instead of parsing axios errors itself.
 */
interface ErrorEnvelope {
  error?: {
    code?: string
    message?: string
    field_errors?: Record<string, string> | null
  }
}

function envelopeOf(err: unknown): ErrorEnvelope['error'] | undefined {
  const data = (err as { response?: { data?: ErrorEnvelope } })?.response?.data
  return data?.error
}

/** The backend's human-readable message, or `fallback` for network/unknown errors. */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return envelopeOf(err)?.message || fallback
}

/** Stable machine-readable code (e.g. `account_locked`, `no_approval_chain`), if any. */
export function getErrorCode(err: unknown): string | undefined {
  return envelopeOf(err)?.code
}

/** Per-field messages for `400 validation_error` responses. */
export function getFieldErrors(err: unknown): Record<string, string> {
  return envelopeOf(err)?.field_errors ?? {}
}

/** HTTP status of a failed request, if it reached the server. */
export function getErrorStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status
}
