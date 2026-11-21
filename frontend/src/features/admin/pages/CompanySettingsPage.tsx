import React, { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { COMPANY_SETTINGS_KEY, companySettingsService, useCompanySettings } from '@/features/admin/services/companySettingsService'
import { CURRENT_USER_KEY } from '@/features/auth/hooks/useCurrentUser'
import { getErrorMessage } from '@/lib/errors'
import { Alert, ErrorState, PageHeader, Skeleton } from '@/ui'
import { PREFERENCES_KEY } from '@/features/preferences/usePreferences'

/** What each setting means, in plain words (the values come from the API). */
const COPY: Record<string, { title: string; description: string }> = {
  'security.require_mfa_for_admins': {
    title: 'Require two-step sign-in for admins',
    description: 'Super admins, HR admins, IT admins and auditors must use an authenticator app. They’re asked to set it up at their next click.',
  },
  'ai.assistant_enabled': {
    title: 'Turn on the AI assistant',
    description: 'The Guide that answers questions and shows people around, and the usual-items suggestions when adding a new joiner. Off hides both for everyone.',
  },
  'attendance.manual_check_in': {
    title: 'Let people check in and out themselves',
    description: 'Shows the Check in / Check out button on the Leave page.',
  },
}

/**
 * Company settings: single on/off choices the company
 * makes for itself. Each person sees the ones they may change.
 */
export const CompanySettingsPage: React.FC = () => {
  const queryClient = useQueryClient()
  const list = useCompanySettings()
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggle = async (key: string, value: boolean) => {
    setSaving(key)
    setError(null)
    try {
      await companySettingsService.update(key, value)
      await queryClient.invalidateQueries({ queryKey: COMPANY_SETTINGS_KEY })
      await queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY })
      await queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY }) // the AI switch shows or hides the Guide
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(null)
    }
  }

  const editable = (list.data ?? []).filter((s) => s.can_edit && COPY[s.key])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Choices your company makes for itself. Every change is recorded in the audit log." />
      {error && <Alert>{error}</Alert>}
      {list.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : list.isError ? (
        <ErrorState message={getErrorMessage(list.error, 'Settings could not be loaded.')} onRetry={() => list.refetch()} />
      ) : editable.length === 0 ? (
        <p className="text-body text-muted">There’s nothing here you can change.</p>
      ) : (
        <ul data-guide="settings.list" className="m-0 list-none border-t border-ink p-0">
          {editable.map((s) => (
            <li key={s.key} className="flex items-start justify-between gap-6 border-b border-line-soft py-4">
              <label htmlFor={s.key} className="flex flex-col gap-1">
                <span className="text-body font-medium text-ink">{COPY[s.key].title}</span>
                <span className="text-meta text-muted">{COPY[s.key].description}</span>
              </label>
              <input
                id={s.key}
                type="checkbox"
                role="switch"
                className="mt-1 h-5 w-5 shrink-0 accent-navy"
                checked={Boolean(s.value)}
                disabled={saving === s.key}
                onChange={(e) => void toggle(s.key, e.target.checked)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
