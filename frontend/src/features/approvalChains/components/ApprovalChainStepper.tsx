import React from 'react'
import { ArrowRight } from 'lucide-react'
import { roleLabel } from '@/features/auth/hooks/useCurrentUser'
import type { ChainStepResponse } from '@/features/approvalChains/types/approvalChains'
import { cn } from '@/ui'

/** "Manager → IT admin → Super admin": the order a request travels in. */
export const ApprovalChainStepper: React.FC<{ steps: ChainStepResponse[]; className?: string }> = ({ steps, className }) => {
  const sorted = [...steps].sort((a, b) => a.step_order - b.step_order)
  if (sorted.length === 0) return <p className="text-body text-muted">No approvers — requests are approved straight away.</p>

  return (
    <ol className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-body', className)} aria-label="Approvers, in order">
      {sorted.map((step, idx) => (
        <li key={step.step_order} className="flex items-center gap-2">
          <span className="text-ink">
            {step.approver_role_name === 'manager' ? 'Their manager' : roleLabel(step.approver_role_name)}
          </span>
          {idx < sorted.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-control" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  )
}
