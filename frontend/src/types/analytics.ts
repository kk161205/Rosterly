export interface AssetUtilizationMetric {
  category: string;
  total: number;
  deployed: number;
  in_stock: number;
  under_maintenance: number;
  utilization_percentage: number;
}

export interface DepartmentCostMetric {
  department: string;
  hardware_cost: number;
  software_cost: number;
  maintenance_cost: number;
  total_cost: number;
}

export interface HeadcountAssetMetric {
  department: string;
  headcount: number;
  total_assets: number;
  ratio: number;
}

export interface LicenseEntitlementMetric {
  software_name: string;
  publisher: string;
  total_seats: number;
  assigned_seats: number;
  utilization_percentage: number;
  renewal_date: string;
  annual_spend: number;
}

export interface AnalyticsSummaryStats {
  total_fleet_value: number;
  annual_saas_spend: number;
  overall_utilization_rate: number;
  active_maintenance_spend: number;
  utilization_by_category: AssetUtilizationMetric[];
  cost_by_department: DepartmentCostMetric[];
  headcount_ratio: HeadcountAssetMetric[];
  license_entitlements: LicenseEntitlementMetric[];
}
