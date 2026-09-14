import React from 'react'
import { DollarSign, TrendingDown, Clock, ShieldAlert, Sparkles, BarChart3 } from 'lucide-react'
import { Card } from '@/components/common/CommonUI'
import { Asset } from '@/types/assets'

interface LiveDepreciationCardProps {
  asset: Asset
}

export const LiveDepreciationCard: React.FC<LiveDepreciationCardProps> = ({ asset }) => {
  const purchaseCost = Number(asset.purchase_cost) || 0
  const currentValue = Number(asset.current_value) || 0
  const usefulLifeMonths = Number(asset.useful_life_months) || 36

  // Calculate elapsed months from purchase date to now
  const purchaseDate = new Date(asset.purchase_date)
  const now = new Date()
  const elapsedMonths = Math.max(
    0,
    (now.getFullYear() - purchaseDate.getFullYear()) * 12 + (now.getMonth() - purchaseDate.getMonth())
  )

  const depreciatedAmount = Math.max(0, purchaseCost - currentValue)
  const depreciationPercent =
    purchaseCost > 0 ? Math.min(100, Math.round((depreciatedAmount / purchaseCost) * 100)) : 0
  const remainingPercent = 100 - depreciationPercent

  const monthlyRate =
    usefulLifeMonths > 0 && asset.depreciation_method !== 'none'
      ? (purchaseCost / usefulLifeMonths).toFixed(2)
      : '0.00'

  return (
    <Card className="p-6 border-outline-variant/60 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant/30 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold text-outline uppercase tracking-wider">
              Asset Financials
            </span>
            <span className="text-outline">&bull;</span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
              <Sparkles className="w-3 h-3" />
              Live Nightly Valuation
            </span>
          </div>
          <h2 className="text-lg font-sans font-bold text-primary mt-0.5">
            Depreciation & Book Value Analysis
          </h2>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-container text-xs font-mono text-on-surface-variant self-start sm:self-auto">
          <span>Method:</span>
          <strong className="text-primary capitalize">{asset.depreciation_method.replace('_', ' ')}</strong>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Purchase Cost */}
        <div className="bg-surface-container-low border border-outline-variant/40 rounded-lg p-4 space-y-1">
          <div className="flex items-center justify-between text-outline text-xs font-mono">
            <span>Purchase Cost</span>
            <DollarSign className="w-3.5 h-3.5 text-on-surface-variant" />
          </div>
          <div className="text-2xl font-display font-bold text-primary">
            ${purchaseCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] font-mono text-outline">
            Procured {asset.purchase_date}
          </p>
        </div>

        {/* Current Book Value */}
        <div className="bg-surface-container-low border border-accent/30 rounded-lg p-4 space-y-1">
          <div className="flex items-center justify-between text-accent text-xs font-mono font-medium">
            <span>Current Book Value</span>
            <TrendingDown className="w-3.5 h-3.5" />
          </div>
          <div className="text-2xl font-display font-bold text-accent">
            ${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] font-mono text-on-surface-variant">
            {remainingPercent}% remaining capital value
          </p>
        </div>

        {/* Monthly Depreciation Rate */}
        <div className="bg-surface-container-low border border-outline-variant/40 rounded-lg p-4 space-y-1">
          <div className="flex items-center justify-between text-outline text-xs font-mono">
            <span>Monthly Run Rate</span>
            <Clock className="w-3.5 h-3.5 text-on-surface-variant" />
          </div>
          <div className="text-2xl font-display font-bold text-on-surface">
            ${Number(monthlyRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-xs font-body font-normal text-outline">/mo</span>
          </div>
          <p className="text-[11px] font-mono text-outline">
            {elapsedMonths} of {usefulLifeMonths} months elapsed
          </p>
        </div>
      </div>

      {/* Visual Depreciation Progress Gauge */}
      <div className="space-y-2 pt-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-on-surface-variant">
            Depreciation Progress: <strong className="text-primary font-bold">{depreciationPercent}%</strong>
          </span>
          <span className="text-outline">
            Useful Life: {Math.min(elapsedMonths, usefulLifeMonths)} / {usefulLifeMonths} mos
          </span>
        </div>

        <div className="w-full h-3 bg-surface-container rounded-full overflow-hidden flex shadow-inner">
          <div
            className="bg-accent transition-all duration-500 rounded-l-full"
            style={{ width: `${depreciationPercent}%` }}
            title={`Depreciated: ${depreciationPercent}%`}
          />
          <div
            className="bg-success-container transition-all duration-500 rounded-r-full"
            style={{ width: `${remainingPercent}%` }}
            title={`Remaining Value: ${remainingPercent}%`}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono text-outline pt-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent inline-block" />
            Depreciated (${depreciatedAmount.toFixed(2)})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-success-container inline-block" />
            Remaining Book Value (${currentValue.toFixed(2)})
          </span>
        </div>
      </div>
    </Card>
  )
}
