import React, { useState } from 'react';
import { QRScannerView } from '../components/assets/qr/QRScannerView';
import { ScanResultCard } from '../components/assets/qr/ScanResultCard';
import { assetService } from '../services/assetService';
import type { AssetDetailResponse } from '../types/assets';
import {
  QrCode,
  ShieldCheck,
  History,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export const AssetQRScannerPage: React.FC = () => {
  const [scannedAsset, setScannedAsset] = useState<AssetDetailResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const handleScan = async (tag: string) => {
    try {
      setIsSearching(true);
      setSearchError(null);
      setSuccessToast(null);

      const assetDetail = await assetService.lookupAssetByTag(tag);
      setScannedAsset(assetDetail);
    } catch (err: any) {
      console.error('Scan lookup error:', err);
      setSearchError(
        err?.response?.data?.detail ||
          `No asset found matching tag "${tag}". Please verify the tag code.`
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleCheckOut = async (employeeId: string, notes?: string) => {
    if (!scannedAsset) return;
    await assetService.assignAsset(scannedAsset.asset.id, {
      employee_id: employeeId,
      notes,
    });
    setSuccessToast(
      `Asset ${scannedAsset.asset.asset_tag} has been successfully assigned and checked out.`
    );
    // Refresh asset detail
    const updated = await assetService.getAssetDetail(scannedAsset.asset.id);
    setScannedAsset(updated);
  };

  const handleCheckIn = async (condition: string, notes?: string) => {
    if (!scannedAsset) return;
    await assetService.returnAsset(scannedAsset.asset.id, {
      condition,
      notes,
    });
    setSuccessToast(
      `Asset ${scannedAsset.asset.asset_tag} has been returned to stock (${condition}).`
    );
    // Refresh asset detail
    const updated = await assetService.getAssetDetail(scannedAsset.asset.id);
    setScannedAsset(updated);
  };

  const handleRaiseMaintenance = () => {
    if (!scannedAsset) return;
    window.location.href = `/maintenance?asset_id=${scannedAsset.asset.id}`;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <QrCode className="w-7 h-7 text-primary" />
            Asset Check-In / Check-Out
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time physical asset barcode verification, fast custody handoffs, and condition audit.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-primary bg-primary/10 px-3.5 py-2 rounded-xl border border-primary/20">
          <Sparkles className="w-4 h-4" />
          <span>Real-time Hardware Telemetry</span>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successToast && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-sm flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button
            onClick={() => setSuccessToast(null)}
            className="text-xs underline hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Lookup Error Banner */}
      {searchError && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{searchError}</span>
        </div>
      )}

      {/* Main Workflow View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7">
          {scannedAsset ? (
            <ScanResultCard
              assetData={scannedAsset}
              onCheckOut={handleCheckOut}
              onCheckIn={handleCheckIn}
              onRaiseTicket={handleRaiseMaintenance}
              onResetScan={() => {
                setScannedAsset(null);
                setSearchError(null);
              }}
            />
          ) : (
            <QRScannerView onScan={handleScan} isScanning={isSearching} />
          )}
        </div>

        {/* Informational Guidance Sidebar */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-6 rounded-2xl border border-border bg-card shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Physical Audit Guidelines
            </h3>
            <ul className="text-xs text-muted-foreground space-y-2.5 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <span>
                  <strong>Check-Out:</strong> Verify employee badge or confirm identity against employee database before releasing hardware.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <span>
                  <strong>Check-In:</strong> Inspect for cosmetic/functional damage. If damaged, tag condition and trigger a maintenance inspection ticket.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <span>
                  <strong>Audit Trail:</strong> Handover timestamps and personnel IDs are recorded in the central compliance log.
                </span>
              </li>
            </ul>
          </div>

          <div className="p-6 rounded-2xl border border-border bg-gradient-to-br from-card to-muted/30 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              Need to look up all assets?
            </h3>
            <p className="text-xs text-muted-foreground">
              Search by serial number, category, department holder or maintenance status from the asset catalog.
            </p>
            <a
              href="/assets"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline pt-1"
            >
              <span>Go to Asset Inventory Catalog</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
export default AssetQRScannerPage;
