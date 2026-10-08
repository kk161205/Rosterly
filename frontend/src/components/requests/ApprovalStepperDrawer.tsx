import React from 'react';
import {
  X,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Layers,
  FileText,
} from 'lucide-react';
import type { RequestItem, ApprovalStep } from '../../types/requests';

interface ApprovalStepperDrawerProps {
  request: RequestItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ApprovalStepperDrawer: React.FC<ApprovalStepperDrawerProps> = ({
  request,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !request) return null;

  const getStepIcon = (step: ApprovalStep) => {
    switch (step.status) {
      case 'approved':
        return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case 'rejected':
        return <XCircle className="w-5 h-5 text-destructive" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-amber-500 animate-pulse" />;
      default:
        return <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />;
    }
  };

  const getStepBadge = (status: ApprovalStep['status']) => {
    switch (status) {
      case 'approved':
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'rejected':
        return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'pending':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="relative w-full max-w-lg bg-card border-l border-border shadow-2xl flex flex-col h-full z-10 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-start justify-between bg-muted/20">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-primary px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                {request.ticket_number || `REQ-${request.id}`}
              </span>
              <span className="text-xs capitalize px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium">
                {request.request_type}
              </span>
            </div>
            <h2 className="text-lg font-bold text-foreground mt-2">{request.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Initiated by {request.requester_name || 'Requester'} on{' '}
              {new Date(request.created_at).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Request Overview */}
          <div className="p-4 rounded-xl bg-muted/40 border border-border/60 space-y-3">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Request Justification
            </h3>
            <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
              {request.justification || 'No justification provided.'}
            </p>
            {request.estimated_cost && (
              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Estimated Cost:</span>
                <span className="font-bold text-foreground">${request.estimated_cost.toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Stepper Pipeline */}
          <div>
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2 mb-4">
              <Layers className="w-4 h-4 text-primary" />
              Approval Workflow Steps
            </h3>

            {request.steps && request.steps.length > 0 ? (
              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-border">
                {request.steps.map((step, index) => (
                  <div key={step.id || index} className="relative flex items-start gap-4 group">
                    {/* Marker */}
                    <div className="absolute -left-6 top-0.5 flex items-center justify-center w-6 h-6 rounded-full bg-card ring-4 ring-card">
                      {getStepIcon(step)}
                    </div>

                    {/* Step Box */}
                    <div className="flex-1 p-4 rounded-xl border border-border/70 bg-card hover:border-primary/40 transition-colors shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">
                          Step {step.step_order}: {step.approver_role}
                        </span>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${getStepBadge(
                            step.status
                          )}`}
                        >
                          {step.status}
                        </span>
                      </div>

                      {step.approver_name && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Approver: <span className="text-foreground font-medium">{step.approver_name}</span>
                        </p>
                      )}

                      {step.action_date && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Date: {new Date(step.action_date).toLocaleString()}
                        </p>
                      )}

                      {step.comments && (
                        <div className="mt-2.5 p-2 rounded-lg bg-muted/50 border border-border/50 text-xs text-foreground/80 italic">
                          "{step.comments}"
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 border border-dashed border-border rounded-xl">
                <AlertCircle className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Standard single-stage approval route assigned</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-muted/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted text-foreground transition-colors"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
};
