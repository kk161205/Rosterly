import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import jsQR from 'jsqr'
import { Camera, CameraOff } from 'lucide-react'
import { assetService } from '@/features/assets/services/assetService'
import { useAssetPermissions } from '@/features/assets/hooks/useAssets'
import { AssignAssetDialog, ReturnAssetDialog } from '@/features/assets/components/actions/AssetActionDialogs'
import type { AssetDetailResponse } from '@/features/assets/types/assets'
import { getErrorMessage, getErrorStatus } from '@/lib/errors'
import { humanize } from '@/lib/format'
import { Alert, Button, ButtonLink, PageHeader, Status, TextField } from '@/ui'

type CameraState = 'off' | 'starting' | 'on' | 'denied' | 'unavailable'

/**
 * Check-in / check-out by QR (§5.9): point the camera at a label (it encodes
 * the asset tag) or type the tag; the matched asset shows its one next action,
 * then the scanner is ready for the next desk.
 */
export const AssetQRScannerPage: React.FC = () => {
  const perms = useAssetPermissions()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number>(0)
  const [camera, setCamera] = useState<CameraState>('off')
  const [tag, setTag] = useState('')
  const [result, setResult] = useState<AssetDetailResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [looking, setLooking] = useState(false)
  const [dialog, setDialog] = useState<'assign' | 'return' | null>(null)
  const lastCode = useRef<string | null>(null)

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCamera((c) => (c === 'on' || c === 'starting' ? 'off' : c))
  }, [])

  useEffect(() => stopCamera, [stopCamera])

  const lookup = useCallback(async (raw: string) => {
    const value = raw.trim().toUpperCase()
    if (!value) return
    setLooking(true)
    setError(null)
    try {
      setResult(await assetService.lookupAssetByTag(value))
    } catch (err) {
      setResult(null)
      setError(getErrorStatus(err) === 404 ? `No asset has the tag ${value}.` : getErrorMessage(err))
    } finally {
      setLooking(false)
    }
  }, [])

  const scanFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      const w = Math.min(video.videoWidth, 640)
      const h = Math.round((video.videoHeight / video.videoWidth) * w)
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(video, 0, 0, w, h)
      const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })
      if (code?.data && code.data !== lastCode.current) {
        lastCode.current = code.data
        setTag(code.data)
        void lookup(code.data)
      }
    }
    frameRef.current = requestAnimationFrame(scanFrame)
  }, [lookup])

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera('unavailable')
      return
    }
    setCamera('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCamera('on')
      frameRef.current = requestAnimationFrame(scanFrame)
    } catch (err) {
      setCamera((err as DOMException)?.name === 'NotAllowedError' ? 'denied' : 'unavailable')
    }
  }

  const scanNext = () => {
    setResult(null)
    setError(null)
    setTag('')
    lastCode.current = null
  }

  const asset = result?.asset
  const holder = asset?.current_holder

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Scan a QR code"
        description="Point the camera at an asset label, or type its tag, to check it in or out."
      />

      <div className="grid gap-10 lg:grid-cols-2">
        <section aria-label="Scanner" className="flex flex-col gap-5">
          <div className="relative aspect-[4/3] w-full max-w-xl overflow-hidden rounded-card bg-ink">
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline aria-hidden="true" />
            <canvas ref={canvasRef} className="hidden" />
            {camera !== 'on' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center text-paper">
                <p className="max-w-xs text-body">
                  {camera === 'denied'
                    ? 'Camera access was blocked. Allow it in the browser’s site settings, or type the tag below.'
                    : camera === 'unavailable'
                      ? 'No camera is available on this device. Type the tag below instead.'
                      : 'The camera is off.'}
                </p>
                {(camera === 'off' || camera === 'starting') && (
                  <Button variant="secondary" className="border-paper text-paper hover:bg-paper hover:text-ink" isLoading={camera === 'starting'} onClick={startCamera}>
                    <Camera className="h-4 w-4" aria-hidden="true" />
                    Start camera
                  </Button>
                )}
              </div>
            )}
            {camera === 'on' && (
              <>
                <div className="pointer-events-none absolute inset-[18%] rounded-card border-2 border-paper/80" aria-hidden="true" />
                <button
                  type="button"
                  onClick={stopCamera}
                  className="absolute right-3 top-3 inline-flex min-h-9 items-center gap-2 rounded-pill bg-ink/70 px-3 text-meta text-paper"
                >
                  <CameraOff className="h-4 w-4" aria-hidden="true" />
                  Stop camera
                </button>
              </>
            )}
          </div>

          <form
            className="flex max-w-xl items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              void lookup(tag)
            }}
          >
            <TextField
              label="Asset tag"
              placeholder="e.g. AST-0013"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="flex-1"
              autoCapitalize="characters"
              spellCheck={false}
            />
            <Button type="submit" variant="secondary" isLoading={looking} disabled={!tag.trim()}>
              Find
            </Button>
          </form>
        </section>

        <section aria-label="Scan result" aria-live="polite" className="flex flex-col gap-5">
          {error && <Alert>{error}</Alert>}
          {asset ? (
            <div className="flex flex-col gap-5 border-t border-ink pt-5">
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-meta text-muted">{asset.asset_tag}</span>
                <h2 className="font-display text-panel text-ink">{asset.name}</h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body">
                  <Status value={asset.status} />
                  <span className="text-muted">{humanize(asset.category)}</span>
                  {holder && <span className="text-muted">· with {holder.full_name}</span>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {perms.canUpdate && asset.status === 'in_stock' && (
                  <Button variant="primary" onClick={() => setDialog('assign')}>
                    Assign to someone
                  </Button>
                )}
                {perms.canUpdate && asset.status === 'assigned' && (
                  <Button variant="primary" onClick={() => setDialog('return')}>
                    Check in
                  </Button>
                )}
                <ButtonLink variant="secondary" to={`/assets/${asset.id}`}>
                  Open record
                </ButtonLink>
                <Button variant="ghost" onClick={scanNext}>
                  Scan next
                </Button>
              </div>
              {asset.status !== 'in_stock' && asset.status !== 'assigned' && (
                <p className="text-body text-muted">
                  {asset.status === 'under_maintenance'
                    ? 'This asset is in repair. Mark it repaired on its record before handing it out.'
                    : `This asset is ${humanize(asset.status).toLowerCase()} and can’t be checked out.`}
                </p>
              )}
            </div>
          ) : (
            !error && (
              <div className="border-t border-ink pt-5">
                <p className="max-w-sm text-body text-muted">
                  The matched asset appears here with what you can do next. Labels can be printed from any asset’s
                  record (<Link to="/assets" className="underline underline-offset-4">Assets</Link> → More → Download QR
                  label).
                </p>
              </div>
            )
          )}
        </section>
      </div>

      {asset && (
        <>
          <AssignAssetDialog
            asset={asset}
            open={dialog === 'assign'}
            onOpenChange={(o) => setDialog(o ? 'assign' : null)}
            onDone={() => void lookup(asset.asset_tag)}
          />
          <ReturnAssetDialog
            asset={asset}
            holderName={holder?.full_name}
            open={dialog === 'return'}
            onOpenChange={(o) => setDialog(o ? 'return' : null)}
            onDone={() => void lookup(asset.asset_tag)}
          />
        </>
      )}
    </div>
  )
}
