import React, { useId } from 'react'
import { cn } from './cn'

/**
 * Form fields (DESIGN.md): underline inputs and selects, a lightly
 * outlined textarea. Every field has a real <label>; hints and errors are tied
 * to the control with aria-describedby.
 */
interface FieldShellProps {
  label: string
  hint?: string
  error?: string | null
  /** Rendered on the label row, right-aligned (e.g. "Forgot password?"). */
  labelAction?: React.ReactNode
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode
  className?: string
  hideLabel?: boolean
}

const FieldShell: React.FC<FieldShellProps> = ({ label, hint, error, labelAction, children, className, hideLabel }) => {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className={cn('flex items-baseline justify-between gap-3', hideLabel && 'sr-only')}>
        <label htmlFor={id} className="text-body font-medium text-ink">
          {label}
        </label>
        {labelAction}
      </div>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="text-meta text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-meta text-status-bad">
          {error}
        </p>
      )}
    </div>
  )
}

const underline =
  'w-full min-h-11 border-0 border-b bg-transparent px-0.5 text-lead text-ink placeholder:text-muted focus:outline-none focus-visible:outline-none focus:border-b-2 disabled:opacity-60'

export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  hint?: string
  error?: string | null
  labelAction?: React.ReactNode
  /** Rendered inside the field on the right (e.g. a show-password toggle). */
  trailing?: React.ReactNode
  hideLabel?: boolean
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, hint, error, labelAction, trailing, hideLabel, className, ...props }, ref) => (
    <FieldShell label={label} hint={hint} error={error} labelAction={labelAction} className={className} hideLabel={hideLabel}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <input
            ref={ref}
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={cn(underline, invalid ? 'border-status-bad' : 'border-ink focus:border-navy', trailing && 'pr-10')}
            {...props}
          />
          {trailing && <div className="absolute inset-y-0 right-0 flex items-center">{trailing}</div>}
        </div>
      )}
    </FieldShell>
  ),
)
TextField.displayName = 'TextField'

export interface TextAreaFieldProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string
  hint?: string
  error?: string | null
}

export const TextAreaField = React.forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  ({ label, hint, error, className, ...props }, ref) => (
    <FieldShell label={label} hint={hint} error={error} className={className}>
      {({ id, describedBy, invalid }) => (
        <textarea
          ref={ref}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(
            'min-h-24 w-full resize-y rounded-card border bg-transparent px-3 py-2.5 text-body text-ink placeholder:text-muted focus:border-navy focus:outline-none focus-visible:outline-none',
            invalid ? 'border-status-bad' : 'border-control',
          )}
          {...props}
        />
      )}
    </FieldShell>
  ),
)
TextAreaField.displayName = 'TextAreaField'

export interface SelectFieldProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string
  hint?: string
  error?: string | null
  options: { value: string; label: string }[]
  placeholder?: string
  hideLabel?: boolean
}

export const SelectField = React.forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, hint, error, options, placeholder, hideLabel, className, ...props }, ref) => (
    <FieldShell label={label} hint={hint} error={error} className={className} hideLabel={hideLabel}>
      {({ id, describedBy, invalid }) => (
        <select
          ref={ref}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(underline, 'select-styled cursor-pointer', invalid ? 'border-status-bad' : 'border-ink focus:border-navy')}
          {...props}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  ),
)
SelectField.displayName = 'SelectField'
