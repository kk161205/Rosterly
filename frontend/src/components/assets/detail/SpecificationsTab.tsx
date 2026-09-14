import React from 'react'
import {
  Building2,
  Calendar,
  DollarSign,
  ShieldCheck,
  Clock,
  Key,
  FileText,
  AlertTriangle,
  ExternalLink,
  Layers,
  Cpu,
} from 'lucide-react'
import { Card } from '@/components/common/CommonUI'
import { Asset } from '@/types/assets'

interface SpecificationsTabProps {
  asset: Asset
}

export const SpecificationsTab: React.FC<SpecificationsTabProps> = ({ asset }) => {
  return (
    <div className="space-y-6">
      {/* Specifications Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Hardware & Procurement Details */}
        <Card className="p-6 border-outline-variant/60 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-outline-variant/30 pb-3">
            <Cpu className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-sans font-bold text-primary">
              Hardware & Procurement Specs
            </h3>
          </div>

          <div className="divide-y divide-outline-variant/20 text-xs font-body">
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-on-surface-variant font-medium">Asset Name</span>
              <span className="font-semibold text-primary">{asset.name}</span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-on-surface-variant font-medium">Category</span>
              <span className="capitalize font-mono px-2 py-0.5 rounded bg-surface-container text-on-surface">
                {asset.category.replace('_', ' ')}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-on-surface-variant font-medium">Vendor / Supplier</span>
              <span className="font-semibold text-on-surface">{asset.vendor}</span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-on-surface-variant font-medium">Serial Number</span>
              <span className="font-mono text-on-surface font-medium">
                {asset.serial_number || 'N/A'}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-on-surface-variant font-medium">Purchase Date</span>
              <span className="font-mono text-on-surface">{asset.purchase_date}</span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-on-surface-variant font-medium">Purchase Cost</span>
              <span className="font-mono font-bold text-primary">
                ${Number(asset.purchase_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-on-surface-variant font-medium">Invoice Record</span>
              <span className="inline-flex items-center gap-1 text-accent text-[11px] font-medium hover:underline cursor-pointer">
                <FileText className="w-3.5 h-3.5" />
                <span>PO-INV-{asset.asset_tag.replace('AST-', '')}.pdf</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </span>
            </div>
          </div>
        </Card>

        {/* Warranty, AMC & Compliance Details */}
        <Card className="p-6 border-outline-variant/60 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-outline-variant/30 pb-3">
            <ShieldCheck className="w-4 h-4 text-tertiary" />
            <h3 className="text-sm font-sans font-bold text-primary">
              Warranty, AMC & Compliance
            </h3>
          </div>

          <div className="divide-y divide-outline-variant/20 text-xs font-body">
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-on-surface-variant font-medium">Warranty Expiration</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-primary">
                  {asset.warranty_expiry || 'No active warranty'}
                </span>
                {asset.is_expiring_soon && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-warning-container text-on-warning-container border border-warning/30">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    Expiring &lt;30d
                  </span>
                )}
              </div>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-on-surface-variant font-medium">AMC Coverage Expiration</span>
              <span className="font-mono text-on-surface">
                {asset.amc_expiry || 'Not configured'}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-on-surface-variant font-medium">Useful Life Duration</span>
              <span className="font-mono text-on-surface">{asset.useful_life_months} Months</span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-on-surface-variant font-medium">Depreciation Model</span>
              <span className="capitalize text-on-surface font-semibold">
                {asset.depreciation_method.replace('_', ' ')}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-on-surface-variant font-medium">Software License Link</span>
              {asset.license_id ? (
                <span className="inline-flex items-center gap-1 text-accent font-mono text-[11px]">
                  <Key className="w-3 h-3" />
                  LIC-{asset.license_id.slice(0, 8)}
                </span>
              ) : (
                <span className="text-outline font-mono text-[11px]">None attached</span>
              )}
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-on-surface-variant font-medium">System Creation Date</span>
              <span className="font-mono text-outline">
                {new Date(asset.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
