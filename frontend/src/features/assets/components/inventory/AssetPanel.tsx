import React, { useState } from 'react'
import type { Asset } from '@/features/assets/types/assets'
import { assetService } from '@/features/assets/services/assetService'
import { useAssetPermissions, useRefreshAssets } from '@/features/assets/hooks/useAssets'
import { warrantyInfo, toneClass } from '@/features/assets/lib/warranty'
import {
  AssignAssetDialog,
  ChangeStatusDialog,
  RaiseTicketDialog,
  ReturnAssetDialog,
} from '@/features/assets/components/actions/AssetActionDialogs'
import { AssetFormDialog } from '@/features/assets/components/actions/AssetFormDialog'
import { formatMoney, humanize } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'
import { Alert, Button, ButtonLink, DetailRow, SidePanel, Status, cn } from '@/ui'

/** Side panel for one asset in the list: the facts and its next action (UI plan §5.7). */
export const AssetPanel: React.FC<{ asset: Asset | null; onOpenChange: (open: boolean) => void }> = ({
  asset,
  onOpenChange,
}) => {
  const perms = useAssetPermissions()
  const refresh = useRefreshAssets()
  const [dialog, setDialog] = useState<'assign' | 'return' | 'ticket' | 'edit' | 'status' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!asset) return null
  const warranty = warrantyInfo(asset.warranty_expiry)
  const holder = asset.current_holder
  const canEdit = perms.canUpdate && asset.status !== 'retired'
  const canRaise = perms.canRaiseAny || (perms.userId !== null && asset.current_holder_id === perms.userId)

  const markRepaired = async () => {
    setBusy(true)
    setError(null)
    try {
      await assetService.updateAsset(asset.id, { status: 'in_stock' })
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const primary =
    perms.canUpdate && asset.status === 'in_stock' ? (
      <Button variant="primary" onClick={() => setDialog('assign')}>
        Assign
      </Button>
    ) : perms.canUpdate && asset.status === 'assigned' ? (
      <Button variant="primary" onClick={() => setDialog('return')}>
        Return to stock
      </Button>
    ) : perms.canUpdate && asset.status === 'under_maintenance' ? (
      <Button variant="primary" isLoading={busy} onClick={markRepaired}>
        Mark repaired
      </Button>
    ) : null

  return (
    <>
      <SidePanel
        open={Boolean(asset)}
        onOpenChange={onOpenChange}
        title={asset.name}
        description={<span className="font-mono">{asset.asset_tag}</span>}
        footer={
          <div className="grid w-full grid-cols-2 gap-2">
            {primary}
            {canRaise && asset.status !== 'retired' && (
              <Button variant="secondary" onClick={() => setDialog('ticket')}>
                Raise ticket
              </Button>
            )}
            {canEdit && (
              <>
                <Button variant="secondary" onClick={() => setDialog('edit')}>
                  Edit details
                </Button>
                <Button variant="secondary" onClick={() => setDialog('status')}>
                  Change status
                </Button>
              </>
            )}
            <ButtonLink variant="secondary" to={`/assets/${asset.id}`} className="col-span-2">
              Open full record and history
            </ButtonLink>
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          <Status value={asset.status} />
          {error && <Alert>{error}</Alert>}
          <dl className="m-0">
            <DetailRow label="Assigned to">
              {holder ? (
                <span className="flex flex-col items-end">
                  <span>{holder.full_name}</span>
                  {holder.department_name && <span className="text-meta text-muted">{holder.department_name}</span>}
                </span>
              ) : (
                <span className="text-muted">No one</span>
              )}
            </DetailRow>
            <DetailRow label="Category">{humanize(asset.category)}</DetailRow>
            <DetailRow label="Serial number">
              <span className="font-mono text-meta">{asset.serial_number || '—'}</span>
            </DetailRow>
            <DetailRow label="Book value">
              <span className="tabular-nums">{formatMoney(asset.current_value)}</span>
            </DetailRow>
            <DetailRow label="Warranty ends">
              <span className={cn('flex flex-col items-end', toneClass[warranty.tone])}>
                <span>{warranty.text}</span>
                {warranty.detail && <span className="text-meta">{warranty.detail}</span>}
              </span>
            </DetailRow>
          </dl>
        </div>
      </SidePanel>

      <AssignAssetDialog
        asset={asset}
        open={dialog === 'assign'}
        onOpenChange={(o) => setDialog(o ? 'assign' : null)}
      />
      <ReturnAssetDialog
        asset={asset}
        holderName={holder?.full_name}
        open={dialog === 'return'}
        onOpenChange={(o) => setDialog(o ? 'return' : null)}
      />
      <RaiseTicketDialog
        asset={asset}
        open={dialog === 'ticket'}
        onOpenChange={(o) => setDialog(o ? 'ticket' : null)}
      />
      <AssetFormDialog asset={asset} open={dialog === 'edit'} onOpenChange={(o) => setDialog(o ? 'edit' : null)} />
      <ChangeStatusDialog
        assets={[asset]}
        open={dialog === 'status'}
        onOpenChange={(o) => setDialog(o ? 'status' : null)}
      />
    </>
  )
}
