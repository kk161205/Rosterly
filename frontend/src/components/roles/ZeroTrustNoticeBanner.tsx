import React from 'react';
import { ShieldCheck, Lock } from 'lucide-react';

export const ZeroTrustNoticeBanner: React.FC = () => {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">Zero-Trust RBAC Governance Active</h3>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                Enforced
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl leading-relaxed">
              Permissions are evaluated dynamically on every API dispatch. Granting or revoking privileges updates user session scopes upon next token refresh or immediately on administrative force-sync.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-primary">
          <ShieldCheck className="w-4 h-4" />
          <span>Audit Logged</span>
        </div>
      </div>
    </div>
  );
};
