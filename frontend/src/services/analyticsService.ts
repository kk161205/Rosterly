import { apiClient } from '@/lib/api-client';
import type {
  AnalyticsSummaryStats,
  AssetUtilizationMetric,
  DepartmentCostMetric,
  HeadcountAssetMetric,
  LicenseEntitlementMetric,
} from '../types/analytics';

export const analyticsService = {
  /**
   * Fetches comprehensive aggregated telemetry and expenditure analytics.
   */
  async getDashboardMetrics(): Promise<AnalyticsSummaryStats> {
    const response = await apiClient.get<AnalyticsSummaryStats>('/analytics/dashboard');
    return response.data;
  },

  /**
   * Fetches hardware category utilization rates.
   */
  async getAssetUtilization(): Promise<AssetUtilizationMetric[]> {
    const response = await apiClient.get<AssetUtilizationMetric[]>('/analytics/utilization');
    return response.data;
  },

  /**
   * Fetches departmental IT expenditure breakdowns.
   */
  async getCostsByDepartment(): Promise<DepartmentCostMetric[]> {
    const response = await apiClient.get<DepartmentCostMetric[]>('/analytics/cost-by-dept');
    return response.data;
  },

  /**
   * Fetches SaaS software seat utilization and license renewal tracking.
   */
  async getLicenseEntitlements(): Promise<LicenseEntitlementMetric[]> {
    const response = await apiClient.get<LicenseEntitlementMetric[]>('/analytics/licenses');
    return response.data;
  },
};
