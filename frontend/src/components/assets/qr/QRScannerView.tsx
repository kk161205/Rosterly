import React, { useState, useEffect, useRef } from 'react';
import { Camera, RefreshCw, AlertTriangle, CheckCircle, Keyboard, ScanLine } from 'lucide-react';

interface QRScannerViewProps {
  onScan: (scannedValue: string) => void;
  isScanning: boolean;
}

export const QRScannerView: React.FC<QRScannerViewProps> = ({ onScan, isScanning }) => {
  const [manualCode, setManualCode] = useState('');
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<'camera' | 'manual'>('camera');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (activeTab === 'camera') {
      const startCamera = async () => {
        try {
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'environment' },
            });
            if (!isMounted) {
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            streamRef.current = stream;
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
              await videoRef.current.play();
            }
            setHasCameraPermission(true);
          } else {
            setHasCameraPermission(false);
          }
        } catch (err) {
          console.warn('Camera access unavailable or denied:', err);
          if (isMounted) setHasCameraPermission(false);
        }
      };

      startCamera();
    }

    return () => {
      isMounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [activeTab]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScan(manualCode.trim());
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-card border border-border rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Asset Tag Scanner</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Scan physical QR code or enter barcode identifier
          </p>
        </div>
        <div className="flex bg-muted p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('camera')}
            className={`p-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'camera'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Use Camera Scanner"
          >
            <Camera className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`p-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'manual'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Manual Tag Input"
          >
            <Keyboard className="w-4 h-4" />
          </button>
        </div>
      </div>

      {activeTab === 'camera' ? (
        <div className="space-y-4">
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-black flex items-center justify-center border-2 border-primary/40 shadow-inner">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {/* Target Reticle Overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8">
              <div className="relative w-4/5 h-4/5 border-2 border-dashed border-primary rounded-2xl flex items-center justify-center">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-lg" />
                
                {/* Laser scan animation bar */}
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse" />
              </div>
            </div>

            {hasCameraPermission === false && (
              <div className="absolute inset-0 bg-background/90 backdrop-blur-sm p-6 flex flex-col items-center justify-center text-center space-y-3">
                <AlertTriangle className="w-10 h-10 text-amber-500" />
                <p className="text-xs text-foreground font-semibold">Camera Access Unavailable</p>
                <p className="text-[11px] text-muted-foreground max-w-xs">
                  Please enable camera permissions in your browser or switch to manual asset tag entry.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('manual')}
                  className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:bg-primary/90 transition-colors"
                >
                  Switch to Manual Entry
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ScanLine className="w-4 h-4 text-primary animate-pulse" />
            <span>Center QR code inside the target window</span>
          </div>
        </div>
      ) : (
        <form onSubmit={handleManualSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="manual-tag-input" className="text-xs font-semibold text-foreground">
              Asset Tag / Barcode Number
            </label>
            <div className="relative">
              <input
                id="manual-tag-input"
                type="text"
                placeholder="e.g. AST-2026-0042 or 89012345"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="w-full pl-4 pr-10 py-3 rounded-xl border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono"
                autoFocus
              />
              <ScanLine className="w-5 h-5 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Enter the unique asset tag or hardware serial printed on the label.
            </p>
          </div>

          <button
            type="submit"
            disabled={!manualCode.trim() || isScanning}
            className="w-full py-3 px-4 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-all shadow-md active:scale-98 flex items-center justify-center gap-2"
          >
            {isScanning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Searching asset database...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Fetch Asset Record</span>
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
};
