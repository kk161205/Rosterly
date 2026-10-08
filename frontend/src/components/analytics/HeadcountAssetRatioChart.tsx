import React from 'react';
import type { HeadcountAssetMetric } from '../../types/analytics';

interface HeadcountAssetRatioChartProps {
  data: HeadcountAssetMetric[];
}

export const HeadcountAssetRatioChart: React.FC<HeadcountAssetRatioChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-muted-foreground text-xs">
        No headcount ratio data available.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const ratio = item.ratio || (item.total_assets / (item.headcount || 1));

        return (
          <div
            key={item.department}
            className="p-3.5 rounded-xl bg-background border border-border/70 flex items-center justify-between"
          >
            <div>
              <div className="text-xs font-bold text-foreground">{item.department}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {item.headcount} Team Members • {item.total_assets} Assigned Assets
              </div>
            </div>

            <div className="text-right">
              <span className="text-sm font-bold text-primary">{ratio.toFixed(2)}</span>
              <span className="text-[10px] text-muted-foreground block">assets / user</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
