import React from 'react';
import type { DepartmentCostMetric } from '../../types/analytics';

interface CostByDeptChartProps {
  data: DepartmentCostMetric[];
}

export const CostByDeptChart: React.FC<CostByDeptChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-muted-foreground text-xs">
        No expenditure metrics available.
      </div>
    );
  }

  const maxCost = Math.max(...data.map((d) => d.total_cost || 1), 1);

  return (
    <div className="space-y-4">
      {data.map((item) => {
        const hardwarePct = (item.hardware_cost / (item.total_cost || 1)) * 100;
        const softwarePct = (item.software_cost / (item.total_cost || 1)) * 100;
        const maintenancePct = (item.maintenance_cost / (item.total_cost || 1)) * 100;
        const barWidthPct = (item.total_cost / maxCost) * 100;

        return (
          <div key={item.department} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">{item.department}</span>
              <span className="font-bold text-foreground">
                ${item.total_cost.toLocaleString()}
              </span>
            </div>

            {/* Total Budget proportional bar */}
            <div className="w-full bg-muted/50 rounded-full h-3 overflow-hidden">
              <div
                style={{ width: `${barWidthPct}%` }}
                className="h-full flex rounded-full overflow-hidden transition-all duration-500"
              >
                {/* Hardware */}
                <div
                  style={{ width: `${hardwarePct}%` }}
                  className="bg-indigo-500"
                  title={`Hardware: $${item.hardware_cost.toLocaleString()}`}
                />
                {/* Software */}
                <div
                  style={{ width: `${softwarePct}%` }}
                  className="bg-teal-500"
                  title={`Software: $${item.software_cost.toLocaleString()}`}
                />
                {/* Maintenance */}
                <div
                  style={{ width: `${maintenancePct}%` }}
                  className="bg-amber-500"
                  title={`Maintenance: $${item.maintenance_cost.toLocaleString()}`}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
              <span>HW: ${item.hardware_cost.toLocaleString()}</span>
              <span>SaaS: ${item.software_cost.toLocaleString()}</span>
              <span>Maint: ${item.maintenance_cost.toLocaleString()}</span>
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="pt-3 border-t border-border/50 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
          <span>Hardware Fleet</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
          <span>Software / SaaS</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          <span>Repairs & Service</span>
        </div>
      </div>
    </div>
  );
};
