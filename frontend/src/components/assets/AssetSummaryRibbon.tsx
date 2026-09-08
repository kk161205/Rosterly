import React from 'react'
import { Box, UserCheck, PackageCheck, Wrench } from 'lucide-react'
import { Card } from '@/components/common/CommonUI'

interface AssetSummaryRibbonProps {
  totalCount: number
  deployedCount: number
  inStockCount: number
  underMaintenanceCount: number
  isLoading?: boolean
}

export const AssetSummaryRibbon: React.FC<AssetSummaryRibbonProps> = ({
  totalCount,
  deployedCount,
  inStockCount,
  underMaintenanceCount,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-28 bg-surface-container-lowest border border-outline-variant/40 rounded-lg p-5 animate-pulse flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <div className="w-24 h-3.5 bg-surface-container-high rounded" />
              <div className="w-8 h-8 bg-surface-container-high rounded-md" />
            </div>
            <div className="w-16 h-7 bg-surface-container-high rounded" />
          </div>
        ))}
      </div>
    )
  }

  const statCards = [
    {
      title: 'Total Assets',
      value: totalCount,
      icon: Box,
      iconBg: 'bg-primary-container/10 text-primary',
      badgeText: 'Catalog Volume',
      badgeColor: 'text-on-surface-variant bg-surface-container',
    },
    {
      title: 'Deployed Assets',
      value: deployedCount,
      icon: UserCheck,
      iconBg: 'bg-accent-container text-on-accent-container',
      badgeText: totalCount > 0 ? `${Math.round((deployedCount / totalCount) * 100)}% Assigned` : '0% Assigned',
      badgeColor: 'text-accent bg-accent/10',
    },
    {
      title: 'In-Stock Spares',
      value: inStockCount,
      icon: PackageCheck,
      iconBg: 'bg-success-container text-on-success-container',
      badgeText: 'Available',
      badgeColor: 'text-success bg-success/10',
    },
    {
      title: 'Under Maintenance',
      value: underMaintenanceCount,
      icon: Wrench,
      iconBg: 'bg-warning-container text-on-warning-container',
      badgeText: underMaintenanceCount > 0 ? 'Requires Action' : 'All Healthy',
      badgeColor: underMaintenanceCount > 0 ? 'text-warning bg-warning/10' : 'text-on-surface-variant bg-surface-container',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {statCards.map((stat, idx) => {
        const Icon = stat.icon
        return (
          <Card
            key={idx}
            className="p-5 border-outline-variant/50 hover:border-accent/30 transition-all shadow-xs flex flex-col justify-between"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <span className="text-xs font-mono font-medium text-on-surface-variant uppercase tracking-wider">
                  {stat.title}
                </span>
                <div className="text-2xl font-display font-bold text-primary tracking-tight">
                  {stat.value.toLocaleString()}
                </div>
              </div>
              <div className={`p-2.5 rounded-md ${stat.iconBg} flex items-center justify-center`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-outline-variant/30 flex items-center justify-between">
              <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full font-medium ${stat.badgeColor}`}>
                {stat.badgeText}
              </span>
              <span className="text-[11px] font-body text-outline">Live Synced</span>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
