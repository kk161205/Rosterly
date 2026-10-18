import React, { useEffect, useMemo, useState } from 'react'
import { Plus, ScanLine } from 'lucide-react'
import { useAssetCounts, useAssetList, useAssetMeta, useAssetPermissions } from '@/features/assets/hooks/useAssets'
import { AssetPanel } from '@/features/assets/components/inventory/AssetPanel'
import { AssetFormDialog } from '@/features/assets/components/actions/AssetFormDialog'
import { ChangeStatusDialog } from '@/features/assets/components/actions/AssetActionDialogs'
import { warrantyInfo, toneClass } from '@/features/assets/lib/warranty'
import type { Asset, AssetStatus } from '@/features/assets/types/assets'
import { useCurrentUser } from '@/features/auth/hooks/useCurrentUser'
import { useSearchParamText, useUrlFilters } from '@/lib/useUrlFilters'
import { getErrorMessage } from '@/lib/errors'
import { humanize } from '@/lib/format'
import {
  Button,
  ButtonLink,
  Checkbox,
  EmptyState,
  ErrorState,
  FilterTabs,
  PageHeader,
  Pagination,
  RowButton,
  SearchInput,
  SelectField,
  Skeleton,
  Status,
  Table,
  Td,
  Th,
  THead,
  Tr,
  cn,
} from '@/ui'

const PAGE_SIZE = 20
type Tab = 'all' | AssetStatus

/**
 * Assets (§5.7): status tabs with counts, search and category, a calm table,
 * and a side panel with the next action. Below 768px rows stack.
 */
export const AssetInventoryPage: React.FC = () => {
  const { can } = useCurrentUser()
  const perms = useAssetPermissions()
  const { params, update, reset } = useUrlFilters({ clearValues: ['', 'all'] })
  const [searchText, setSearchText] = useSearchParamText(params, update)
  const tab = (params.get('status') as Tab) || 'all'
  const category = params.get('category') ?? 'all'
  const page = Number(params.get('page') ?? '1')
  const search = params.get('search') ?? ''


  // Search as you type, debounced into the URL so the list is shareable

  const filters = useMemo(
    () => ({ search: search || undefined, status: tab, category, page, page_size: PAGE_SIZE }),
    [search, tab, category, page],
  )
  const list = useAssetList(filters)
  const counts = useAssetCounts()
  const meta = useAssetMeta()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)

  const items = list.data?.items ?? []
  const selected = items.find((a) => a.id === selectedId) ?? null
  const checkedAssets = items.filter((a) => checked.has(a.id))
  const allChecked = items.length > 0 && items.every((a) => checked.has(a.id))

  useEffect(() => setChecked(new Set()), [filters])

  const c = counts.data
  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: 'all', label: 'All', count: c?.all },
    { value: 'in_stock', label: 'In stock', count: c?.in_stock },
    { value: 'assigned', label: 'Assigned', count: c?.assigned },
    { value: 'under_maintenance', label: 'In repair', count: c?.under_maintenance },
    { value: 'retired', label: 'Retired', count: c?.retired },
    ...(c && c.lost > 0 ? [{ value: 'lost' as Tab, label: 'Lost', count: c.lost }] : []),
  ]

  const toggle = (id: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const filtered = Boolean(search) || category !== 'all' || tab !== 'all'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Assets"
        description="Every device and licence, who has it, and when its cover ends."
        actions={
          <>
            {can('assets:lookup') && (
              <ButtonLink to="/assets/qr" variant="secondary">
                <ScanLine className="h-4 w-4" aria-hidden="true" />
                Scan QR
              </ButtonLink>
            )}
            {perms.canCreate && (
              <Button variant="primary" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add asset
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <FilterTabs label="Filter by status" value={tab} onChange={(v) => update({ status: v })} tabs={tabs} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <SearchInput
            label="Search assets"
            placeholder="Search name, tag or serial number"
            value={searchText}
            onChange={setSearchText}
            className="sm:max-w-sm sm:flex-1"
          />
          <SelectField
            label="Category"
            hideLabel
            className="sm:w-52"
            options={[
              { value: 'all', label: 'All categories' },
              ...(meta.data?.categories ?? []).map((cat) => ({ value: cat, label: humanize(cat) })),
            ]}
            value={category}
            onChange={(e) => update({ category: e.target.value })}
          />
        </div>
      </div>

      {perms.canBulk && checked.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-y border-line py-2.5" role="region" aria-label="Bulk actions">
          <span className="text-body font-medium text-ink">{checked.size} selected</span>
          <Button size="sm" variant="primary" onClick={() => setBulkOpen(true)}>
            Change status
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setChecked(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {list.isLoading ? (
        <div className="flex flex-col gap-4" aria-label="Loading assets">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState message={getErrorMessage(list.error, 'Assets could not be loaded.')} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={filtered ? 'No assets match' : 'No assets yet'}
          description={filtered ? 'Try a different word, status or category.' : 'Assets you add appear here with their tag.'}
          action={
            filtered ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearchText('')
                  reset()
                }}
              >
                Clear filters
              </Button>
            ) : perms.canCreate ? (
              <Button variant="primary" onClick={() => setAdding(true)}>
                Add asset
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={cn(list.isFetching && 'opacity-70 transition-opacity')}>
          {/* Wide screens: table */}
          <Table label="Assets" className="hidden md:block">
            <THead>
              {perms.canBulk && (
                <Th className="w-10">
                  <Checkbox
                    label="Select all on this page"
                    checked={allChecked}
                    indeterminate={checked.size > 0 && !allChecked}
                    onChange={(on) => setChecked(on ? new Set(items.map((a) => a.id)) : new Set())}
                  />
                </Th>
              )}
              <Th>Asset</Th>
              <Th>Status</Th>
              <Th>Assigned to</Th>
              <Th>Warranty ends</Th>
            </THead>
            <tbody>
              {items.map((a) => (
                <AssetRow
                  key={a.id}
                  asset={a}
                  bulk={perms.canBulk}
                  checked={checked.has(a.id)}
                  onCheck={(on) => toggle(a.id, on)}
                  selected={a.id === selectedId}
                  onOpen={() => setSelectedId(a.id)}
                />
              ))}
            </tbody>
          </Table>

          {/* Phones: stacked rows */}
          <ul className="m-0 list-none border-t border-ink p-0 md:hidden" aria-label="Assets">
            {items.map((a) => (
              <li key={a.id} className="border-b border-line-soft">
                <button type="button" onClick={() => setSelectedId(a.id)} className="flex w-full flex-col gap-1 py-3 text-left">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-body font-medium text-ink">{a.name}</span>
                    <Status value={a.status} className="shrink-0" />
                  </span>
                  <span className="truncate text-meta text-muted">
                    <span className="font-mono">{a.asset_tag}</span>
                    {a.current_holder && ` · ${a.current_holder.full_name}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={list.data?.total ?? 0}
            onPage={(p) => update({ page: String(p) })}
          />
        </div>
      )}

      <AssetPanel asset={selected} onOpenChange={(open) => !open && setSelectedId(null)} />
      <AssetFormDialog open={adding} onOpenChange={setAdding} />
      <ChangeStatusDialog
        assets={checkedAssets}
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onDone={() => setChecked(new Set())}
      />
    </div>
  )
}

const AssetRow: React.FC<{
  asset: Asset
  bulk: boolean
  checked: boolean
  onCheck: (on: boolean) => void
  selected: boolean
  onOpen: () => void
}> = ({ asset, bulk, checked, onCheck, selected, onOpen }) => {
  const warranty = warrantyInfo(asset.warranty_expiry)
  return (
    <Tr onClick={onOpen} selected={selected}>
      {bulk && (
        <Td>
          <Checkbox label={`Select ${asset.name}`} checked={checked} onChange={onCheck} />
        </Td>
      )}
      <Td>
        <RowButton onClick={onOpen} label={`Open ${asset.name}`}>
          <span className="font-medium text-ink">{asset.name}</span>
          <span className="font-mono text-meta text-muted">{asset.asset_tag}</span>
        </RowButton>
      </Td>
      <Td>
        <Status value={asset.status} />
      </Td>
      <Td>
        {asset.current_holder ? (
          <span className="flex flex-col gap-0.5">
            <span className="text-ink">{asset.current_holder.full_name}</span>
            {asset.current_holder.department_name && (
              <span className="text-meta text-muted">{asset.current_holder.department_name}</span>
            )}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </Td>
      <Td className={cn('whitespace-nowrap', toneClass[warranty.tone])}>
        <span className="flex flex-col gap-0.5">
          <span>{warranty.text}</span>
          {warranty.tone === 'warn' && <span className="text-meta">{warranty.detail}</span>}
        </span>
      </Td>
    </Tr>
  )
}
