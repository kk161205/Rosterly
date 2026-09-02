import React from 'react'
import {
  Laptop,
  Monitor,
  Smartphone,
  HardDrive,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  History,
  Tag,
} from 'lucide-react'
import { AssignedAssetsResponse, AssetCategory, WarrantyStatus } from '@/types/profile'

interface AssignedAssetsTabProps {
  assetsData: AssignedAssetsResponse
  isLoading?: boolean
}

export const AssignedAssetsTab: React.FC<AssignedAssetsTabProps> = ({
  assetsData,
  isLoading = false,
}) => {
  const { current = [], history = [] } = assetsData

  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-surface-container-lowest border border-outline-variant rounded-lg p-5 h-40 space-y-3">
              <div className="w-10 h-10 rounded-md bg-surface-container-high" />
              <div className="w-3/4 h-4 bg-surface-container-high rounded" />
              <div className="w-1/2 h-3 bg-surface-container-low rounded" />
            </div>
          ))}
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-6 h-32" />
      </div>
    )
  }

  const getAssetIcon = (category: AssetCategory) => {
    switch (category) {
      case 'laptop':
        return <Laptop className="w-5 h-5 text-accent" />
      case 'monitor':
        return <Monitor className="w-5 h-5 text-tertiary" />
      case 'mobile':
        return <Smartphone className="w-5 h-5 text-accent" />
      default:
        return <HardDrive className="w-5 h-5 text-outline" />
    }
  }

  const getWarrantyBadge = (status: WarrantyStatus, expiryDate: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono bg-tertiary-fixed text-on-tertiary-fixed-variant">
            <ShieldCheck className="w-3.5 h-3.5 text-tertiary" />
            Warranty Active (Exp. {new Date(expiryDate).toLocaleDateString()})
          </span>
        )
      case 'expiring_soon':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono bg-warning-container text-on-warning-container border border-warning/30">
            <AlertTriangle className="w-3.5 h-3.5 text-warning" />
            Expiring Soon ({new Date(expiryDate).toLocaleDateString()})
          </span>
        )
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono bg-error-container text-on-error-container">
            <ShieldAlert className="w-3.5 h-3.5 text-error" />
            Warranty Expired ({new Date(expiryDate).toLocaleDateString()})
          </span>
        )
    }
  }

  return (
    <div className="space-y-8">
      {/* Active Hardware Cards Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-headline font-semibold text-on-surface flex items-center gap-2">
            <Laptop className="w-4 h-4 text-accent" />
            Active Assigned Hardware & Licenses ({current.length})
          </h2>
          <span className="text-[11px] font-mono text-outline">IT Asset Registry</span>
        </div>

        {current.length === 0 ? (
          /* Empty State */
          <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-12 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-surface-container-high/60 flex items-center justify-center text-outline">
              <Laptop className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-headline font-semibold text-on-surface">
              No hardware assets currently assigned
            </h3>
            <p className="text-xs font-body text-on-surface-variant max-w-sm">
              This employee currently has no active laptops, monitors, or mobile hardware registered to their profile.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {current.map((asset) => (
              <div
                key={asset.id}
                className="bg-surface-container-lowest border border-outline-variant rounded-lg p-5 shadow-sm hover:border-accent/40 transition-colors space-y-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-surface-container-low rounded-md border border-outline-variant/60">
                        {getAssetIcon(asset.category)}
                      </div>
                      <div>
                        <h3 className="text-xs font-headline font-bold text-on-surface">
                          {asset.asset_name}
                        </h3>
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-outline mt-0.5">
                          <Tag className="w-3 h-3 text-outline" />
                          {asset.asset_tag}
                        </span>
                      </div>
                    </div>
                  </div>

                  {asset.specs && (
                    <p className="text-xs font-body text-on-surface-variant bg-surface-container-low p-2 rounded mt-3 text-[11px]">
                      {asset.specs}
                    </p>
                  )}
                </div>

                <div className="space-y-2 pt-2 border-t border-outline-variant/60 text-xs font-body">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-outline">Serial Number:</span>
                    <span className="font-mono font-medium text-on-surface">{asset.serial_number}</span>
                  </div>

                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-outline">Assigned On:</span>
                    <span className="text-on-surface font-medium">
                      {new Date(asset.assigned_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="pt-1">
                    {asset.warranty_status && asset.warranty_expires_at
                      ? getWarrantyBadge(asset.warranty_status, asset.warranty_expires_at)
                      : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historical Assignment Timeline */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-outline-variant pb-3">
          <h3 className="text-sm font-headline font-semibold text-on-surface flex items-center gap-2">
            <History className="w-4 h-4 text-tertiary" />
            Historical Asset Timeline ({history.length})
          </h3>
          <span className="text-[11px] font-mono text-outline">Reclamation Audit Log</span>
        </div>

        {history.length === 0 ? (
          <p className="text-xs font-body text-outline italic py-2">
            No historical asset reclaims recorded for this employee.
          </p>
        ) : (
          <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-outline-variant">
            {history.map((item) => (
              <div key={item.id} className="relative flex items-start justify-between gap-4 text-xs font-body">
                <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-outline border-2 border-surface-container-lowest" />
                <div>
                  <h4 className="font-semibold text-on-surface">{item.asset_name}</h4>
                  <p className="text-[11px] text-on-surface-variant">
                    Asset Tag: <span className="font-mono">{item.asset_tag}</span> • Returned:{' '}
                    {item.returned_at ? new Date(item.returned_at).toLocaleDateString() : 'N/A'}
                  </p>
                  {item.reason && (
                    <p className="text-[11px] text-outline italic mt-0.5">"{item.reason}"</p>
                  )}
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-container text-outline">
                  Returned
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
