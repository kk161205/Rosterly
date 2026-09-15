import React, { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import {
  Download,
  Copy,
  Check,
  UserPlus,
  RotateCcw,
  Edit,
  Laptop,
  Monitor,
  Smartphone,
  Key,
  Armchair,
  Box,
} from 'lucide-react'
import { Button, StatusBadge } from '@/components/common/CommonUI'
import { Asset } from '@/types/assets'
import { UserRole } from '@/types/dashboard'
import { getStatusVariant } from '@/components/assets/AssetTable'

interface AssetHeroBannerProps {
  asset: Asset
  currentRole: UserRole
  onAssignClick: () => void
  onReturnClick: () => void
  onEditClick: () => void
}

export const getCategoryIcon = (category: string) => {
  const cat = category.toLowerCase()
  if (cat.includes('laptop')) return <Laptop className="w-4 h-4" />
  if (cat.includes('monitor')) return <Monitor className="w-4 h-4" />
  if (cat.includes('mobile') || cat.includes('phone')) return <Smartphone className="w-4 h-4" />
  if (cat.includes('software') || cat.includes('license')) return <Key className="w-4 h-4" />
  if (cat.includes('furniture') || cat.includes('chair')) return <Armchair className="w-4 h-4" />
  return <Box className="w-4 h-4" />
}

export const AssetHeroBanner: React.FC<AssetHeroBannerProps> = ({
  asset,
  currentRole,
  onAssignClick,
  onReturnClick,
  onEditClick,
}) => {
  const [copied, setCopied] = useState(false)
  const [isDownloaded, setIsDownloaded] = useState(false)
  const [downloadError, setDownloadError] = useState(false)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, asset.asset_tag, {
        width: 72,
        margin: 1,
        color: { dark: '#1f2b67', light: '#ffffff' },
      }).catch(() => {
        // Canvas render failure leaves the label box empty rather than a fake icon
      })
    }
  }, [asset.asset_tag])

  const handleCopyTag = () => {
    navigator.clipboard.writeText(asset.asset_tag)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownloadQr = async () => {
    try {
      const qrSize = 320
      const padding = 32
      const textBlockHeight = 72
      const labelCanvas = document.createElement('canvas')
      labelCanvas.width = qrSize + padding * 2
      labelCanvas.height = qrSize + padding * 2 + textBlockHeight
      const ctx = labelCanvas.getContext('2d')
      if (!ctx) throw new Error('Canvas 2D context unavailable')

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, labelCanvas.width, labelCanvas.height)

      const qrDataUrl = await QRCode.toDataURL(asset.asset_tag, {
        width: qrSize,
        margin: 1,
        color: { dark: '#1f2b67', light: '#ffffff' },
      })
      const qrImage = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Failed to render QR image'))
        img.src = qrDataUrl
      })
      ctx.drawImage(qrImage, padding, padding, qrSize, qrSize)

      ctx.textAlign = 'center'
      ctx.fillStyle = '#1f2b67'
      ctx.font = 'bold 22px sans-serif'
      ctx.fillText(asset.asset_tag, labelCanvas.width / 2, qrSize + padding * 1.6)
      ctx.fillStyle = '#555b6e'
      ctx.font = '15px sans-serif'
      ctx.fillText(asset.name, labelCanvas.width / 2, qrSize + padding * 1.6 + 26)

      const blob: Blob | null = await new Promise((resolve) => labelCanvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Failed to encode PNG')

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${asset.asset_tag}-label.png`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      setIsDownloaded(true)
      setTimeout(() => setIsDownloaded(false), 2000)
    } catch {
      setDownloadError(true)
      setTimeout(() => setDownloadError(false), 3000)
    }
  }

  const canWrite = currentRole === 'super_admin' || currentRole === 'it_admin'
  const holder = asset.current_holder

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-6 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
      {/* Left: Identity, Category & Status */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 flex-1 min-w-0">
        {/* Printable QR Code Label Box */}
        <div className="flex flex-col items-center p-3 bg-surface-container-low border border-outline-variant/60 rounded-lg shadow-2xs flex-shrink-0">
          <div className="w-20 h-20 bg-surface-container-lowest border border-outline-variant/40 rounded flex items-center justify-center text-primary mb-2 shadow-xs">
            <canvas ref={qrCanvasRef} className="w-[72px] h-[72px]" aria-label={`QR code for ${asset.asset_tag}`} />
          </div>
          <span className="font-mono text-[10px] font-semibold text-primary">{asset.asset_tag}</span>
          <button
            type="button"
            onClick={handleDownloadQr}
            className="mt-1.5 text-[11px] font-sans font-medium text-accent hover:underline flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Download className="w-3 h-3" />
            <span>{downloadError ? 'Download failed' : isDownloaded ? 'Saved PNG' : 'Download Label'}</span>
          </button>
        </div>

        {/* Details & Metadata */}
        <div className="space-y-2.5 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container text-on-surface-variant font-medium text-xs">
              {getCategoryIcon(asset.category)}
              <span className="capitalize">{asset.category.replace('_', ' ')}</span>
            </div>
            <StatusBadge status={asset.status} variant={getStatusVariant(asset.status)} />
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container-low border border-outline-variant/40 text-[11px] font-mono text-outline">
              <span>{asset.asset_tag}</span>
              <button
                type="button"
                onClick={handleCopyTag}
                className="p-0.5 hover:text-primary transition-colors cursor-pointer"
                title="Copy tag"
              >
                {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-sans font-bold text-primary tracking-tight truncate">
              {asset.name}
            </h1>
            <div className="text-xs font-mono text-on-surface-variant flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              <span>
                Vendor: <strong className="text-on-surface font-semibold">{asset.vendor}</strong>
              </span>
              {asset.serial_number && (
                <>
                  <span>&bull;</span>
                  <span>
                    S/N: <strong className="text-on-surface font-semibold">{asset.serial_number}</strong>
                  </span>
                </>
              )}
              {holder && (
                <>
                  <span>&bull;</span>
                  <span className="text-accent">
                    Holder: <strong>{holder.full_name}</strong> ({holder.department_name || 'Department'})
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right: Primary Action Triggers */}
      {canWrite && (
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 self-stretch lg:self-auto pt-4 lg:pt-0 border-t lg:border-t-0 border-outline-variant/30">
          {asset.status === 'in_stock' && (
            <Button
              variant="primary"
              size="md"
              icon={<UserPlus className="w-4 h-4" />}
              onClick={onAssignClick}
            >
              Assign to Employee
            </Button>
          )}

          {asset.status === 'assigned' && (
            <Button
              variant="secondary"
              size="md"
              icon={<RotateCcw className="w-4 h-4" />}
              onClick={onReturnClick}
            >
              Return to Stock
            </Button>
          )}

          <Button
            variant="outline"
            size="md"
            icon={<Edit className="w-4 h-4" />}
            onClick={onEditClick}
          >
            Edit Asset
          </Button>
        </div>
      )}
    </div>
  )
}
