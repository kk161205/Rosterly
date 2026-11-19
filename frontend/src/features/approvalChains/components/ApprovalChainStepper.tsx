import React from 'react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import type { ChainStepResponse } from '@/features/approvalChains/types/approvalChains'
import { cn } from '@/ui'

interface ApprovalChainStepperProps {
  steps: ChainStepResponse[]
  className?: string
}

function formatRoleLabel(roleName: string): string {
  switch (roleName.toLowerCase()) {
    case 'manager':
      return 'Department Manager'
    case 'it_admin':
      return 'IT Administrator'
    case 'hr_admin':
      return 'HR Administrator'
    case 'super_admin':
      return 'Super Admin / Finance VP'
    default:
      return roleName.replace(/_/g, ' ')
  }
}

export const ApprovalChainStepper: React.FC<ApprovalChainStepperProps> = ({ steps, className }) => {
  const sortedSteps = [...steps].sort((a, b) => a.step_order - b.step_order)

  if (sortedSteps.length === 0) {
    return (
      <div className="flex items-center gap-2 py-3 text-body text-muted italic">
        <span>No approval steps configured — requests auto-approve.</span>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2 py-2', className)} role="list" aria-label="Approval workflow steps">
      {sortedSteps.map((step, idx) => {
        const isLast = idx === sortedSteps.length - 1
        const isManager = step.approver_role_name.toLowerCase() === 'manager'

        return (
          <React.Fragment key={step.step_order}>
            <div
              role="listitem"
              className="flex items-center gap-2.5 rounded-card border border-line bg-paper px-3.5 py-2 text-body transition-shadow"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-navy-tint text-micro font-semibold text-navy">
                {step.step_order}
              </span>
              <div className="flex flex-col">
                <span className="font-medium text-ink">
                  {formatRoleLabel(step.approver_role_name)}
                </span>
                <span className="text-micro text-muted">
                  {isManager ? "Requester's own manager" : 'Role shared queue'}
                </span>
              </div>
            </div>

            {!isLast && (
              <ArrowRight className="h-4 w-4 shrink-0 text-control" aria-hidden="true" />
            )}
          </React.Fragment>
        )
      })}

      <div className="flex items-center gap-1.5 pl-1 text-meta font-medium text-status-ok">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        <span>Approved</span>
      </div>
    </div>
  )
}
