import React, { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from './Button'

/**
 * A value someone needs to copy and pass on (e.g. a one-time set-password
 * link). Read-only, selectable, with a Copy button that confirms in words.
 */
export const CopyField: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => {
  const [copied, setCopied] = useState(false)
  const id = React.useId()

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (e.g. no permission): the text stays selectable.
      ;(document.getElementById(id) as HTMLInputElement | null)?.select()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-meta font-medium text-ink">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="min-h-11 w-full min-w-0 border-0 border-b border-control bg-transparent px-0.5 font-mono text-meta text-ink focus:border-b-2 focus:border-navy focus:outline-none"
        />
        <Button variant="secondary" size="sm" onClick={copy} aria-live="polite">
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-meta text-muted">
          {hint}
        </p>
      )}
    </div>
  )
}
