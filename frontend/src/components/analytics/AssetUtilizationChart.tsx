import React from 'react';
import { Laptop, Server, Smartphone, HardDrive, Cpu, AlertCircle } from 'lucide-react';
import type { AssetUtilizationMetric } from '../../types/analytics';

interface AssetUtilizationChartProps {
  data: AssetUtilizationMetric[];
}

export const AssetUtilizationChart: React.FC<AssetUtilizationChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-muted-foreground text-xs">
        No utilization metrics available.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.map((item) => {
        const pct = Math.round(item.utilization_percentage || 0);

        return (
          <div key={item.category} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground capitalize">{item.category}</span>
                <span className="text-[11px] text-muted-foreground">
                  ({item.deployed} / {item.total} deployed)
                </span>
              </div>
              <span className="font-bold text-foreground">{pct}%</span>
            </div>

            {/* Multi-segment Progress Bar */}
            <div className="h-3 w-full rounded-full bg-muted overflow-hidden flex shadow-inner">
              {/* Deployed (Primary) */}
              <div
                style={{ width: `${(item.deployed / (item.total || 1)) * 100}%` }}
                className="bg-primary transition-all duration-500 rounded-l-full"
                title={`Deployed: ${item.deployed}`}
              />
              {/* In Stock (Emerald) */}
              <div
                style={{ width: `${(item.in_stock / (item.total || 1)) * 100}%` }}
                className="bg-emerald-500/70 transition-all duration-500"
                title={`In Stock: ${item.in_stock}`}
              />
              {/* Under Maintenance (Amber) */}
              <div
                style={{ width: `${(item.under_maintenance / (item.total || 1)) * 100}%` }}
                className="bg-amber-500 transition-all duration-500 rounded-r-full"
                title={`Maintenance: ${item.under_maintenance}`}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                {item.in_stock} In Stock
              </span>
              {item.under_maintenance > 0 && (
                <span className="text-amber-500 font-medium">
                  {item.under_maintenance} in repair
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="pt-3 border-t border-border/50 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-primary" />
          <span>Deployed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
          <span>Available Stock</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          <span>Maintenance</span>
        </div>
      </div>
    </div>
  );
};
