import React from 'react'
import { Check } from 'lucide-react'
import { Alert, ErrorState, PageHeader, Skeleton, cn } from '@/ui'
import { getErrorMessage } from '@/lib/errors'
import { ACCENTS, type AccentId } from '@/lib/accent'
import { usePreferences, useUpdatePreferences, type Preferences } from '@/features/preferences/usePreferences'

const STYLES: { value: Preferences['guide_style']; title: string; description: string }[] = [
  { value: 'show', title: 'Show me the way', description: 'The tile walks you through each click, so you learn where things are.' },
  { value: 'take', title: 'Take me there', description: 'Goes straight to the page. For when you already know your way around.' },
]

/**
 * "Your assistant": the colour of the app and the Guide
 * tile, and how the Guide helps. Each change saves at once.
 */
export const AssistantSettingsPage: React.FC = () => {
  const prefs = usePreferences()
  const update = useUpdatePreferences()
  const p = prefs.data
  const companyOff = p ? !p.company_assistant_enabled : false

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <PageHeader title="Your assistant" description="Pick a colour you like and choose how the Guide helps you. Only you see these." />

      {update.isError && <Alert>{getErrorMessage(update.error, 'That change didn’t save. Try again.')}</Alert>}
      <p className="sr-only" role="status" aria-live="polite">
        {update.isSuccess ? 'Saved' : ''}
      </p>

      {prefs.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : prefs.isError || !p ? (
        <ErrorState message={getErrorMessage(prefs.error, 'Your settings couldn’t be loaded.')} onRetry={() => prefs.refetch()} />
      ) : (
        <>
          <section aria-labelledby="colour-heading" className="flex flex-col gap-4">
            <div className="border-b border-ink pb-2">
              <h2 id="colour-heading" className="text-section text-ink">
                Colour
              </h2>
              <p className="text-meta text-muted">Used for buttons, links and the Guide tile.</p>
            </div>
            <div data-guide="assistant.colour" role="radiogroup" aria-labelledby="colour-heading" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ACCENTS.map((a) => {
                const selected = p.accent === a.id
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-accent={a.id}
                    onClick={() => !selected && update.mutate({ accent: a.id as AccentId })}
                    className={cn(
                      'flex min-h-12 items-center gap-3 rounded-card border px-3 text-left text-body text-ink transition-colors',
                      selected ? 'border-navy bg-navy-tint' : 'border-line hover:bg-row-hover',
                    )}
                  >
                    <span className="h-5 w-5 shrink-0 rotate-[-14deg] rounded-soft border-[1.5px] border-navy bg-accent-soft" aria-hidden="true" />
                    <span className="flex-1">{a.name}</span>
                    {selected && <Check className="h-4 w-4 text-navy" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          </section>

          <section aria-labelledby="guide-heading" className="flex flex-col gap-4">
            <div className="border-b border-ink pb-2">
              <h2 id="guide-heading" className="text-section text-ink">
                The Guide
              </h2>
              <p className="text-meta text-muted">The tile from the logo that answers questions and shows you around. Open it with Ctrl K or by clicking the tile.</p>
            </div>

            {companyOff && <p className="text-body text-status-warn">Your company has turned the assistant off, so these choices are paused.</p>}

            <label className="flex items-start justify-between gap-6">
              <span className="flex flex-col gap-1">
                <span className="text-body font-medium text-ink">Show the Guide</span>
                <span className="text-meta text-muted">When it’s off, Ctrl K is a plain search box and the tile stays in the logo.</span>
              </span>
              <input data-guide="assistant.guide"
                type="checkbox"
                role="switch"
                className="mt-1 h-5 w-5 shrink-0 accent-navy"
                checked={p.assistant_enabled}
                disabled={companyOff}
                onChange={(e) => update.mutate({ assistant_enabled: e.target.checked })}
              />
            </label>

            <fieldset data-guide="assistant.style" disabled={companyOff || !p.assistant_enabled} className="flex flex-col gap-2 disabled:opacity-60">
              <legend className="mb-2 text-body font-medium text-ink">How it helps</legend>
              {STYLES.map((s) => (
                <label
                  key={s.value}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-card border px-3 py-3',
                    p.guide_style === s.value ? 'border-navy bg-navy-tint' : 'border-line hover:bg-row-hover',
                  )}
                >
                  <input
                    type="radio"
                    name="guide-style"
                    value={s.value}
                    checked={p.guide_style === s.value}
                    onChange={() => update.mutate({ guide_style: s.value })}
                    className="mt-0.5 h-4 w-4 accent-navy"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-body text-ink">{s.title}</span>
                    <span className="text-meta text-muted">{s.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="flex items-start justify-between gap-6">
              <span className="flex flex-col gap-1">
                <span className="text-body font-medium text-ink">Voice input</span>
                <span className="text-meta text-muted">
                  A microphone button in the Ctrl K box. What you say is turned into text (by Groq, our AI provider) and put in the box for you to
                  check and send. Your browser asks for the microphone the first time.
                </span>
              </span>
              <input
                data-guide="assistant.voice"
                type="checkbox"
                role="switch"
                className="mt-1 h-5 w-5 shrink-0 accent-navy"
                checked={p.voice_enabled}
                disabled={companyOff || !p.assistant_enabled}
                onChange={(e) => update.mutate({ voice_enabled: e.target.checked })}
              />
            </label>
          </section>
        </>
      )}
    </div>
  )
}
