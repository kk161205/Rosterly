import React from 'react'
import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { IconButton } from './Button'
import { cn } from './cn'

/**
 * Dialog (centred) and SidePanel (right sheet) on Radix: focus trap, Esc to
 * close, labelled by their titles. Destructive confirmations use Dialog;
 * record details use SidePanel so the list behind keeps its filters.
 */
interface OverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  /** Keep the title as the accessible name only, when the content brings its own heading */
  hideTitle?: boolean
  /**
   * While an irreversible action is running: the dialog can't be closed (Esc,
   * outside click and ✕ are ignored) and its content is inert, so nothing can
   * be changed or submitted twice. The footer's buttons show their own spinner.
   */
  busy?: boolean
}

/* Side panels: scrim z-40, sheet z-50. Dialogs put both at z-50 so a dialog
   opened from a panel (e.g. Edit details) also dims — and softly blurs — the
   panel behind it; the dialog's hairline border keeps its edge visible. */
const Scrim: React.FC<{ className?: string }> = ({ className }) => (
  <RadixDialog.Overlay className={cn('fixed inset-0 z-40 bg-ink/30', className)} />
)

export const Dialog: React.FC<OverlayProps> = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  busy,
}) => (
  <RadixDialog.Root open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
    <RadixDialog.Portal>
      <Scrim className="z-50 backdrop-blur-sm" />
      <RadixDialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-card border border-line bg-paper text-ink focus:outline-none',
          className,
        )}
        aria-busy={busy || undefined}
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onPointerDownOutside={(e) => busy && e.preventDefault()}
        onInteractOutside={(e) => busy && e.preventDefault()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
          <div className="flex flex-col gap-1">
            <RadixDialog.Title className="font-display text-panel">{title}</RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="text-body text-muted">{description}</RadixDialog.Description>
            ) : (
              <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close asChild>
            <IconButton label="Close" className="-mr-2 -mt-1" disabled={busy}>
              <X className="h-5 w-5" />
            </IconButton>
          </RadixDialog.Close>
        </div>
        {/* Only the body scrolls, so the actions are always in view on short screens */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6" inert={busy || undefined}>
          {children}
        </div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  </RadixDialog.Root>
)

export const SidePanel: React.FC<OverlayProps> = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  hideTitle,
}) => (
  <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
    <RadixDialog.Portal>
      <Scrim />
      <RadixDialog.Content
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-paper text-ink focus:outline-none',
          className,
        )}
      >
        <div
          className={cn(
            'flex items-start justify-between gap-4 px-6',
            hideTitle ? 'pb-0 pt-3' : 'border-b border-line py-5',
          )}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <RadixDialog.Title className={hideTitle ? 'sr-only' : 'font-display text-panel'}>{title}</RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="text-meta text-muted">{description}</RadixDialog.Description>
            ) : (
              <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close asChild>
            <IconButton label="Close panel" className="-mr-2">
              <X className="h-5 w-5" />
            </IconButton>
          </RadixDialog.Close>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  </RadixDialog.Root>
)
