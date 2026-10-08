import React from 'react';
import { KeyRound, Calendar, DollarSign, AlertCircle } from 'lucide-react';
import type { LicenseEntitlementMetric } from '../../types/analytics';

interface LicenseEntitlementGaugesProps {
  licenses: LicenseEntitlementMetric[];
}

export const LicenseEntitlementGauges: React.FC<LicenseEntitlementGaugesProps> = ({ licenses }) => {
  if (!licenses || licenses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-muted-foreground text-xs">
        No SaaS license entitlements found.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {licenses.map((lic) => {
        const pct = Math.round(lic.utilization_percentage || ((lic.assigned_seats / (lic.total_seats || 1)) * 100));
        const unused = lic.total_seats - lic.assigned_seats;
        const isWasteRisk = pct < 60;

        return (
          <div
            key={lic.software_name}
            className="p-5 rounded-2xl bg-card border border-border/70 hover:border-primary/40 transition-all shadow-sm space-y-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">{lic.software_name}</h4>
                  <p className="text-[11px] text-muted-foreground">{lic.publisher}</p>
                </div>
              </div>

              {isWasteRisk && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  Underutilized
                </span>
              )}
            </div>

            {/* Gauge bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Seats Assigned</span>
                <span className="font-bold text-foreground">
                  {lic.assigned_seats} / {lic.total_seats} ({pct}%)
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  style={{ width: `${pct}%` }}
                  className={`h-full rounded-full transition-all duration-500 ${
                    pct > 90
                      ? 'bg-emerald-500'
                      : pct >= 60
                      ? 'bg-primary'
                      : 'bg-amber-500'
                  }`}
                />
              </div>
            </div>

            <div className="pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Renews {lic.renewal_date}</span>
              </div>
              <div className="font-semibold text-foreground">
                ${lic.annual_spend.toLocaleString()}/yr
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
