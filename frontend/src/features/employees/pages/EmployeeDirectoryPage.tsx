import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronRight, UserPlus } from 'lucide-react'
import { employeeService } from '@/features/employees/services/employeeService'
import type { Employee } from '@/features/employees/types/employee'
import { useCurrentUser } from '@/features/auth/hooks/useCurrentUser'
import { PersonPanel } from '@/features/employees/components/PersonPanel'
import { useSearchParamText, useUrlFilters } from '@/lib/useUrlFilters'
import { getErrorMessage } from '@/lib/errors'
import {
  Button,
  ButtonLink,
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

const PAGE_SIZE = 25
type View = 'list' | 'chart'

/**
 * Directory (§5.3): everyone the caller may see (the API scopes managers to
 * their department), searchable, with two filters and a profile side panel.
 * The org chart is a separate view built from manager links.
 */
export const EmployeeDirectoryPage: React.FC = () => {
  const { can } = useCurrentUser()
  const { params, update, reset } = useUrlFilters()
  const [searchText, setSearchText] = useSearchParamText(params, update)
  const view = (params.get('view') as View) || 'list'
  const search = params.get('search') ?? ''
  const department = params.get('department') ?? ''
  const status = params.get('status') ?? ''
  const page = Number(params.get('page') ?? '1')
  const [selectedId, setSelectedId] = useState<string | null>(null)



  const filters = {
    search: search || undefined,
    department_id: department || undefined,
    status: status || undefined,
    view: view === 'chart' ? ('tree' as const) : ('list' as const),
    page: view === 'chart' ? 1 : page,
    page_size: view === 'chart' ? 100 : PAGE_SIZE,
  }
  const list = useQuery({
    queryKey: ['employees', 'directory', filters],
    queryFn: () => employeeService.getEmployees(filters),
    placeholderData: keepPreviousData,
  })
  const meta = useQuery({ queryKey: ['employees', 'filters'], queryFn: employeeService.getFilterOptions, staleTime: 5 * 60_000 })
  const items = list.data?.items ?? []
  const selected = items.find((e) => e.id === selectedId) ?? null
  const filtered = Boolean(search || department || status)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Directory"
        description="Everyone at the company, their team, and who they report to."
        actions={
          can('employee:create') && (
            <ButtonLink to="/onboarding" variant="primary">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Onboard someone
            </ButtonLink>
          )
        }
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
            <SearchInput
              label="Search people"
              placeholder="Search name, email, code or title"
              value={searchText}
              onChange={setSearchText}
              className="min-w-0 sm:flex-[2] xl:w-72 xl:flex-none"
            />
            <SelectField
              label="Department"
              hideLabel
              className="min-w-0 sm:flex-1 xl:w-52 xl:flex-none"
              options={[{ value: '', label: 'All departments' }, ...(meta.data?.departments ?? []).map((d) => ({ value: d.value, label: d.label }))]}
              value={department}
              onChange={(e) => update({ department: e.target.value })}
            />
            <SelectField
              label="Status"
              hideLabel
              className="min-w-0 sm:flex-1 xl:w-40 xl:flex-none"
              options={[{ value: '', label: 'Any status' }, ...(meta.data?.statuses ?? []).map((s) => ({ value: s.value, label: s.label }))]}
              value={status}
              onChange={(e) => update({ status: e.target.value })}
            />
          </div>
          <FilterTabs
            label="View"
            className="shrink-0 self-start xl:self-auto"
            value={view}
            onChange={(v) => update({ view: v === 'list' ? null : v })}
            tabs={[
              { value: 'list', label: 'List' },
              { value: 'chart', label: 'Org chart' },
            ]}
          />
        </div>
      </div>

      {list.isLoading ? (
        <div className="flex flex-col gap-4" aria-label="Loading people">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState message={getErrorMessage(list.error, 'The directory could not be loaded.')} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No one matches"
          description="Try a different name, department or status."
          action={
            filtered && (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearchText('')
                  reset()
                }}
              >
                Clear filters
              </Button>
            )
          }
        />
      ) : view === 'chart' ? (
        <OrgChart people={items} onOpen={setSelectedId} truncated={(list.data?.total ?? 0) > items.length} />
      ) : (
        <div className={cn(list.isFetching && 'opacity-70 transition-opacity')}>
          <Table label="People" className="hidden md:block">
            <THead>
              <Th>Person</Th>
              <Th>Title</Th>
              <Th>Department</Th>
              <Th>Status</Th>
            </THead>
            <tbody>
              {items.map((p) => (
                <Tr key={p.id} onClick={() => setSelectedId(p.id)} selected={p.id === selectedId}>
                  <Td>
                    <RowButton onClick={() => setSelectedId(p.id)} label={`Open ${p.full_name}`}>
                      <span className="font-medium text-ink">{p.full_name}</span>
                      <span className="text-meta text-muted">{p.email}</span>
                    </RowButton>
                  </Td>
                  <Td className="text-ink">{p.designation}</Td>
                  <Td className={p.department_name ? 'text-ink' : 'text-muted'}>{p.department_name ?? '—'}</Td>
                  <Td>
                    <Status value={p.status} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <ul className="m-0 list-none border-t border-ink p-0 md:hidden" aria-label="People">
            {items.map((p) => (
              <li key={p.id} className="border-b border-line-soft">
                <button type="button" onClick={() => setSelectedId(p.id)} className="flex w-full items-start justify-between gap-3 py-3 text-left">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-body font-medium text-ink">{p.full_name}</span>
                    <span className="truncate text-meta text-muted">
                      {[p.designation, p.department_name].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <Status value={p.status} className="shrink-0" />
                </button>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPage={(p) => update({ page: String(p) })} />
        </div>
      )}

      <PersonPanel person={selected} onClose={() => setSelectedId(null)} />
    </div>
  )
}

// ---------------------------------------------------------------- org chart

interface Node {
  person: Employee
  reports: Node[]
}

/** An indented tree from manager links — calmer than a canvas, works on phones, keyboard-friendly. */
const OrgChart: React.FC<{ people: Employee[]; onOpen: (id: string) => void; truncated: boolean }> = ({ people, onOpen, truncated }) => {
  const roots = useMemo(() => {
    const byId = new Map<string, Node>(people.map((p) => [p.id, { person: p, reports: [] }]))
    const top: Node[] = []
    for (const node of byId.values()) {
      const parent = node.person.manager_id ? byId.get(node.person.manager_id) : undefined
      if (parent) parent.reports.push(node)
      else top.push(node)
    }
    const sort = (list: Node[]) => {
      list.sort((a, b) => b.reports.length - a.reports.length || a.person.full_name.localeCompare(b.person.full_name))
      list.forEach((n) => sort(n.reports))
    }
    sort(top)
    return top
  }, [people])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const render = (nodes: Node[], depth: number): React.ReactNode => (
    <ul className={cn('m-0 list-none p-0', depth > 0 && 'ml-3 border-l border-line pl-4 sm:ml-4 sm:pl-6')} role={depth === 0 ? 'tree' : 'group'} aria-label={depth === 0 ? 'Org chart' : undefined}>
      {nodes.map((n) => {
        const open = !collapsed.has(n.person.id)
        return (
          <li key={n.person.id} role="treeitem" aria-expanded={n.reports.length ? open : undefined}>
            <div className="flex items-center gap-1 py-1">
              {n.reports.length > 0 ? (
                <button
                  type="button"
                  onClick={() => toggle(n.person.id)}
                  aria-label={`${open ? 'Collapse' : 'Expand'} ${n.person.full_name}'s team`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-muted hover:bg-row-hover hover:text-ink"
                >
                  <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} aria-hidden="true" />
                </button>
              ) : (
                <span className="w-8 shrink-0" aria-hidden="true" />
              )}
              <button type="button" onClick={() => onOpen(n.person.id)} className="flex min-w-0 flex-col rounded-soft px-2 py-1.5 text-left hover:bg-row-hover">
                <span className="truncate text-body font-medium text-ink">{n.person.full_name}</span>
                <span className="truncate text-meta text-muted">
                  {[
                    n.reports.length > 0 ? `${n.reports.length} ${n.reports.length === 1 ? 'report' : 'reports'}` : null,
                    n.person.designation,
                    n.person.department_name,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </div>
            {open && n.reports.length > 0 && render(n.reports, depth + 1)}
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className="flex flex-col gap-3 border-t border-ink pt-4">
      {render(roots.filter((r) => r.reports.length > 0), 0)}
      {roots.some((r) => r.reports.length === 0) && (
        <>
          <h2 className="mt-4 border-t border-line pt-4 text-section text-ink">No manager set</h2>
          <p className="-mt-2 text-meta text-muted">People who don’t report to anyone in this view.</p>
          {render(roots.filter((r) => r.reports.length === 0), 0)}
        </>
      )}
      {truncated && (
        <p className="text-meta text-muted">
          Showing the first {people.length} people. Filter by department to see a full team, or use the{' '}
          <Link to="/employees" className="underline underline-offset-4">list</Link>.
        </p>
      )}
    </div>
  )
}
