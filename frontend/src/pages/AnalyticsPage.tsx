import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  PieChart,
  Layers,
  KeyRound,
  RefreshCw,
  AlertTriangle,
  Download,
} from 'lucide-react';
import { AssetUtilizationChart } from '../components/analytics/AssetUtilizationChart';
import { CostByDeptChart } from '../components/analytics/CostByDeptChart';
import { HeadcountAssetRatioChart } from '../components/analytics/HeadcountAssetRatioChart';
import { LicenseEntitlementGauges } from '../components/analytics/LicenseEntitlementGauges';
import { analyticsService } from '../services/analyticsService';
import type { AnalyticsSummaryStats } from '../types/analytics';

export const AnalyticsPage: React.FC = () => {
  const [stats, setStats] = useState<AnalyticsSummaryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await analyticsService.getDashboardMetrics();
      setStats(data);
    } catch (err: any) {
      console.error('Failed to load analytics metrics', err);
      setError(err?.response?.data?.detail || err?.message || 'Failed to load analytics metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <BarChart3 className="w-7 h-7 text-primary" />
            Executive IT & Asset Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time capital expenditure, SaaS license optimization, and hardware lifecycle telemetry.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchMetrics()}
            className="p-2.5 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh telemetry"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Highlight Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl border border-border bg-card shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>Total Fleet Value</span>
            <DollarSign className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {stats ? `$${(stats.total_fleet_value || 0).toLocaleString()}` : '—'}
          </div>
          <p className="text-[11px] text-muted-foreground">Original capital procurement</p>
        </div>

        <div className="p-5 rounded-2xl border border-border bg-card shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>Annual SaaS Run-Rate</span>
            <KeyRound className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {stats ? `$${(stats.annual_saas_spend || 0).toLocaleString()}` : '—'}
          </div>
          <p className="text-[11px] text-muted-foreground">Software subscription commitments</p>
        </div>

        <div className="p-5 rounded-2xl border border-border bg-card shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>Overall Fleet Utilization</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {stats ? `${Math.round(stats.overall_utilization_rate || 0)}%` : '—'}
          </div>
          <p className="text-[11px] text-muted-foreground">Assets deployed vs in storage</p>
        </div>

        <div className="p-5 rounded-2xl border border-border bg-card shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>Active Maintenance Spend</span>
            <Layers className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {stats ? `$${(stats.active_maintenance_spend || 0).toLocaleString()}` : '—'}
          </div>
          <p className="text-[11px] text-muted-foreground">Repairs and vendor parts in Q4</p>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hardware Utilization by Category */}
        <div className="p-6 rounded-2xl border border-border bg-card shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Hardware Utilization by Category</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Breakdown of deployed, in-stock, and servicing inventory per hardware type.
            </p>
          </div>
          <AssetUtilizationChart data={stats?.utilization_by_category || []} />
        </div>

        {/* Expenditure Breakdown by Department */}
        <div className="p-6 rounded-2xl border border-border bg-card shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Departmental IT Expenditure</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Proportional spend across hardware allocation, software licenses, and repair maintenance.
            </p>
          </div>
          <CostByDeptChart data={stats?.cost_by_department || []} />
        </div>
      </div>

      {/* Headcount Ratio & SaaS License Gauges */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 p-6 rounded-2xl border border-border bg-card shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Hardware Density per User</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Asset allocation density by business department.
            </p>
          </div>
          <HeadcountAssetRatioChart data={stats?.headcount_ratio || []} />
        </div>

        <div className="lg:col-span-8 space-y-4">
          <div className="p-4 rounded-2xl bg-card border border-border">
            <h3 className="text-sm font-bold text-foreground">
              Software & SaaS Entitlement Utilization
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Track license seat consumption and identify renewal savings opportunities.
            </p>
          </div>
          <LicenseEntitlementGauges licenses={stats?.license_entitlements || []} />
        </div>
      </div>
    </div>
  );
};
export default AnalyticsPage;
