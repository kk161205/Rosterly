import React from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { cn } from './cn'

/**
 * Pill buttons (DESIGN.md): one solid navy `primary` per screen,
 * outlined ink `secondary`, underlined-text `ghost` for tertiary actions and
 * `danger` for destructive ones.
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45'

const variants: Record<Variant, string> = {
  primary: 'border-transparent bg-navy text-paper hover:bg-navy-hover',
  secondary: 'border-ink bg-transparent text-ink hover:bg-ink hover:text-paper',
  ghost:
    'border-transparent bg-transparent px-1.5 text-ink underline decoration-control underline-offset-4 hover:decoration-ink',
  danger: 'border-status-bad bg-transparent text-status-bad hover:bg-status-bad hover:text-paper',
}

const sizes: Record<Size, string> = {
  sm: 'min-h-8 px-3.5 text-meta',
  md: 'min-h-10 px-5 text-body',
  lg: 'min-h-12 px-6 text-lead',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  isLoading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', isLoading = false, className, children, disabled, type, ...props }, ref) => (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(base, variants[variant], sizes[size], variant === 'ghost' && 'px-1.5', className)}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

export interface ButtonLinkProps extends LinkProps {
  variant?: Variant
  size?: Size
}

/** A router link styled as a button (navigation, not an action). */
export const ButtonLink: React.FC<ButtonLinkProps> = ({ variant = 'secondary', size = 'md', className, ...props }) => (
  <Link className={cn(base, variants[variant], sizes[size], variant === 'ghost' && 'px-1.5', className as string)} {...props} />
)

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icon-only buttons need an accessible name. */
  label: string
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, className, children, type, ...props }, ref) => (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-pill text-muted transition-colors hover:bg-row-hover hover:text-ink disabled:opacity-45',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
)
IconButton.displayName = 'IconButton'
