import React, { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { HOLIDAYS_KEY, LEAVE_KEY, LEAVE_TYPES_KEY, useHolidays, useLeaveTypes } from '@/features/leave/hooks/useLeave'
import { leaveService } from '@/features/leave/services/leaveService'
import type { LeaveTypeItem } from '@/features/leave/types/leave'
import { employeeService } from '@/features/employees/services/employeeService'
import { getErrorMessage, getFieldErrors } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { Alert, Button, Dialog, ErrorState, SelectField, Skeleton, Status, TextField } from '@/ui'

/**
 * Leave settings for HR and super admins: the company's
 * leave types, its holidays, and adjusting someone's balance.
 */
export const LeaveSettings: React.FC = () => (
  <div className="flex flex-col gap-10">
    <LeaveTypesSection />
    <HolidaysSection />
    <AdjustBalanceSection />
  </div>
)

const daysText = (v: string | null) => (v === null ? 'No limit' : `${Number(v)} a year`)

// ---------------------------------------------------------------- leave types

const LeaveTypesSection: React.FC = () => {
  const types = useLeaveTypes(true)
  const [editing, setEditing] = useState<LeaveTypeItem | 'new' | null>(null)
  return (
    <section aria-labelledby="leave-types-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="leave-types-heading" className="text-section text-ink">
            Leave types
          </h2>
          <p className="text-meta text-muted">What people can ask for, and how many days they get each year.</p>
        </div>
        <Button data-guide="leave.add-type" variant="secondary" size="sm" onClick={() => setEditing('new')}>
          Add leave type
        </Button>
      </div>
      {types.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : types.isError ? (
        <ErrorState message={getErrorMessage(types.error)} onRetry={() => types.refetch()} />
      ) : (
        <ul className="m-0 list-none border-t border-ink p-0">
          {(types.data ?? []).map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft py-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-body font-medium text-ink">{t.name}</span>
                <span className="text-meta text-muted">
                  {daysText(t.annual_days)}
                  {t.annual_days !== null && (Number(t.carry_forward_max) > 0 ? ` · up to ${Number(t.carry_forward_max)} carry over` : ' · unused days lapse')}
                  {!t.is_paid && ' · unpaid'}
                </span>
              </span>
              <span className="flex items-center gap-3">
                {!t.is_active && <Status value="inactive" />}
                <Button variant="ghost" size="sm" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}>
                  Edit
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing && <LeaveTypeDialog item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  )
}

const LeaveTypeDialog: React.FC<{ item: LeaveTypeItem | null; onClose: () => void }> = ({ item, onClose }) => {
  const queryClient = useQueryClient()
  const [name, setName] = useState(item?.name ?? '')
  const [limited, setLimited] = useState(item ? item.annual_days !== null : true)
  const [annual, setAnnual] = useState(item?.annual_days !== null && item?.annual_days !== undefined ? String(Number(item.annual_days)) : '')
  const [carry, setCarry] = useState(item ? String(Number(item.carry_forward_max)) : '0')
  const [paid, setPaid] = useState(item?.is_paid ?? true)
  const [active, setActive] = useState(item?.is_active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const save = async () => {
    setBusy(true)
    setError(null)
    setFieldErrors({})
    const payload = {
      name: name.trim(),
      annual_days: limited ? annual || '0' : null,
      carry_forward_max: limited ? carry || '0' : '0',
      is_paid: paid,
      ...(item ? { is_active: active } : {}),
    }
    try {
      if (item) await leaveService.updateLeaveType(item.id, payload)
      else await leaveService.createLeaveType(payload)
      await queryClient.invalidateQueries({ queryKey: LEAVE_TYPES_KEY })
      await queryClient.invalidateQueries({ queryKey: LEAVE_KEY })
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
      setFieldErrors(getFieldErrors(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      busy={busy}
      title={item ? item.name : 'Add leave type'}
      description={item ? 'Changes apply to balances from now on; existing balances stay as they are.' : 'For example Maternity, Paternity, Bereavement or Comp-off.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" isLoading={busy} disabled={!name.trim()} onClick={save}>
            {item ? 'Save' : 'Add leave type'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={fieldErrors.name} maxLength={60} />
        <label className="flex items-center gap-2 text-body text-ink">
          <input type="checkbox" className="h-4 w-4 accent-navy" checked={!limited} onChange={(e) => setLimited(!e.target.checked)} />
          No limit (no balance is kept)
        </label>
        {limited && (
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField label="Days a year" type="number" min={0} step="0.5" value={annual} onChange={(e) => setAnnual(e.target.value)} error={fieldErrors.annual_days} hint="New joiners get a share for the months left." />
            <TextField label="Days that carry over" type="number" min={0} step="0.5" value={carry} onChange={(e) => setCarry(e.target.value)} error={fieldErrors.carry_forward_max} hint="0 means unused days lapse at year end." />
          </div>
        )}
        <label className="flex items-center gap-2 text-body text-ink">
          <input type="checkbox" className="h-4 w-4 accent-navy" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          Paid leave
        </label>
        {item && (
          <label className="flex items-center gap-2 text-body text-ink">
            <input type="checkbox" className="h-4 w-4 accent-navy" checked={active} onChange={(e) => setActive(e.target.checked)} />
            People can ask for this type
          </label>
        )}
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------- holidays

const HolidaysSection: React.FC = () => {
  const queryClient = useQueryClient()
  const [year, setYear] = useState(new Date().getFullYear())
  const holidays = useHolidays(year)
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await queryClient.invalidateQueries({ queryKey: HOLIDAYS_KEY })
      await queryClient.invalidateQueries({ queryKey: LEAVE_KEY })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="holidays-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="holidays-heading" className="text-section text-ink">
            Company holidays
          </h2>
          <p className="text-meta text-muted">Not counted as working days when people ask for leave.</p>
        </div>
        <SelectField
          label="Year"
          hideLabel
          className="w-28"
          options={[year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) }))}
          value={String(year)}
          onChange={(e) => setYear(Number(e.target.value))}
        />
      </div>
      {error && <Alert>{error}</Alert>}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            await leaveService.addHoliday({ date, name: name.trim() })
            setYear(Number(date.slice(0, 4))) // show the year it was added to, so it doesn't seem to vanish
            setDate('')
            setName('')
          })
        }}
      >
        <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali" className="min-w-0 flex-1" maxLength={100} />
        <Button data-guide="leave.add-holiday" type="submit" variant="secondary" isLoading={busy} disabled={!date || !name.trim()}>
          Add holiday
        </Button>
      </form>
      {holidays.isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : (holidays.data ?? []).length === 0 ? (
        <p className="border-t border-ink pt-3 text-body text-muted">No holidays added for {year} yet.</p>
      ) : (
        <ul className="m-0 list-none border-t border-ink p-0">
          {(holidays.data ?? []).map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 border-b border-line-soft py-2.5">
              <span className="text-body text-ink">
                <span className="tabular-nums text-muted">{formatDate(h.date)}</span> · {h.name}
              </span>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => leaveService.deleteHoliday(h.id))} aria-label={`Remove ${h.name}`}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- balance adjustment

interface PersonOption {
  id: string
  full_name: string
  designation: string
}

const AdjustBalanceSection: React.FC = () => {
  const queryClient = useQueryClient()
  const types = useLeaveTypes()
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [person, setPerson] = useState<PersonOption | null>(null)
  const [typeId, setTypeId] = useState('')
  const [days, setDays] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const people = useQuery({
    queryKey: ['leave-adjust-people', term],
    queryFn: async () => (await employeeService.getEmployees({ search: term, page_size: 6 })).items as PersonOption[],
    enabled: term.length > 1 && !person,
  })
  const balances = useQuery({
    queryKey: [...LEAVE_KEY, 'balances', person?.id],
    queryFn: () => leaveService.getBalances(person!.id),
    enabled: Boolean(person),
  })
  const limitedTypes = (types.data ?? []).filter((t) => t.annual_days !== null)

  const submit = async () => {
    if (!person) return
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      await leaveService.adjustBalance(person.id, { leave_type_id: typeId, days, reason: reason.trim() })
      await queryClient.invalidateQueries({ queryKey: LEAVE_KEY })
      setDone(`Updated. ${person.full_name.split(' ')[0]} has been given ${Number(days) > 0 ? '+' : ''}${days} day(s).`)
      setDays('')
      setReason('')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="adjust-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="adjust-heading" className="text-section text-ink">
          Adjust someone’s balance
        </h2>
        <p className="text-meta text-muted">For example extra days for working a holiday, or a correction. The reason is recorded.</p>
      </div>
      {error && <Alert>{error}</Alert>}
      {done && <Alert tone="success">{done}</Alert>}
      {person ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-body text-ink">
              <span className="font-medium">{person.full_name}</span> · {person.designation}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setPerson(null)}>
              Change
            </Button>
          </div>
          {balances.data && (
            <p className="text-meta text-muted">
              {balances.data.balances
                .filter((b) => b.balance_days !== null)
                .map((b) => `${b.leave_type.name}: ${Number(b.balance_days)}`)
                .join(' · ')}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField label="Leave type" placeholder="Choose…" options={limitedTypes.map((t) => ({ value: t.id, label: t.name }))} value={typeId} onChange={(e) => setTypeId(e.target.value)} />
            <TextField label="Days (+ to add, − to remove)" type="number" step="0.5" value={days} onChange={(e) => setDays(e.target.value)} />
            <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </div>
          <div>
            <Button variant="secondary" isLoading={busy} disabled={!typeId || !days || Number(days) === 0 || !reason.trim()} onClick={submit}>
              Save adjustment
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <TextField
            label="Person"
            placeholder="Search by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            trailing={<Search className="mr-1 h-4 w-4 text-muted" aria-hidden="true" />}
          />
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0" aria-label="Matching people">
            {(people.data ?? []).map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setPerson(p)} className="flex w-full flex-col rounded-card px-3 py-2 text-left hover:bg-row-hover">
                  <span className="text-body font-medium text-ink">{p.full_name}</span>
                  <span className="text-meta text-muted">{p.designation}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
