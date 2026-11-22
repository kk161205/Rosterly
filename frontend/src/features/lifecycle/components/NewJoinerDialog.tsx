import React, { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { lifecycleService } from '@/features/lifecycle/services/lifecycleService'
import type { Checklist, NewJoinerResult } from '@/features/lifecycle/types/checklist'
import { employeeService } from '@/features/employees/services/employeeService'
import { roleLabel } from '@/features/auth/hooks/useCurrentUser'
import { INBOX_KEY } from '@/features/inbox/hooks/useInbox'
import { getErrorMessage, getFieldErrors } from '@/lib/errors'
import { Alert, Button, CopyField, Dialog, SelectField, TextField, cn } from '@/ui'
import { useAssignableRoles } from '@/features/admin/hooks/useAssignableRoles'
import { useRecommendations, type UsualItem } from '@/features/lifecycle/services/recommendations'

interface PersonOption {
  id: string
  full_name: string
  designation: string
}

/**
 * "Add new joiner": one form creates the person's account and their
 * onboarding checklist. Afterwards HR sees the set-password link once, to
 * pass on (it's emailed too when email is set up).
 */
export const NewJoinerDialog: React.FC<{
  open: boolean
  onOpenChange: (o: boolean) => void
  onAdded: (c: Checklist) => void
  onExistingPerson: () => void
}> = ({ open, onOpenChange, onAdded, onExistingPerson }) => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ full_name: '', email: '', designation: '', date_of_joining: '', department_id: '', role_id: '' })
  const [managerSearch, setManagerSearch] = useState('')
  const [managerTerm, setManagerTerm] = useState('')
  const [manager, setManager] = useState<PersonOption | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<NewJoinerResult | null>(null)
  const [settledTitle, setSettledTitle] = useState('')
  const [ticked, setTicked] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    setForm({ full_name: '', email: '', designation: '', date_of_joining: '', department_id: '', role_id: '' })
    setManagerSearch('')
    setManager(null)
    setError(null)
    setFieldErrors({})
    setResult(null)
  }, [open])
  useEffect(() => {
    const t = setTimeout(() => setManagerTerm(managerSearch.trim()), 250)
    return () => clearTimeout(t)
  }, [managerSearch])
  // Ask for the usual items once the job title stops changing.
  useEffect(() => {
    const t = setTimeout(() => setSettledTitle(form.designation.trim()), 600)
    return () => clearTimeout(t)
  }, [form.designation])
  const recs = useRecommendations(settledTitle, form.department_id, open && !result)
  const usual = recs.data?.usual ?? []
  const sometimes = recs.data?.sometimes ?? []
  // Pre-tick the usual items whenever the suggestion changes; HR can untick or add the others.
  useEffect(() => {
    setTicked(new Set((recs.data?.usual ?? []).map((i) => i.key)))
  }, [recs.data])
  const toggle = (key: string) =>
    setTicked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const departments = useQuery({ queryKey: ['departments'], queryFn: employeeService.getDepartments, enabled: open })
  const roles = useAssignableRoles(open)
  const people = useQuery({
    queryKey: ['new-joiner-manager', managerTerm],
    queryFn: async () => (await employeeService.getEmployees({ search: managerTerm, page_size: 6, status: 'active' })).items as PersonOption[],
    enabled: open && managerTerm.length > 1 && !manager,
  })

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))
  const ready = form.full_name.trim() && form.email.trim() && form.designation.trim() && form.date_of_joining

  const add = async () => {
    setBusy(true)
    setError(null)
    setFieldErrors({})
    try {
      const res = await lifecycleService.addNewJoiner({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        designation: form.designation.trim(),
        date_of_joining: form.date_of_joining,
        department_id: form.department_id || undefined,
        role_id: form.role_id || undefined,
        manager_id: manager?.id,
        extra_items: [...usual, ...sometimes].filter((i) => ticked.has(i.key)).map((i) => ({ task_name: i.task, owner: i.owner })),
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lifecycle', 'onboarding'] }),
        queryClient.invalidateQueries({ queryKey: INBOX_KEY }),
        queryClient.invalidateQueries({ queryKey: ['employees'] }),
      ])
      setResult(res)
    } catch (err) {
      setError(getErrorMessage(err))
      setFieldErrors(getFieldErrors(err))
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    const first = result.checklist.employee_name?.split(' ')[0] ?? 'They'
    return (
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={`${first} is added`}
        description="Their onboarding checklist is ready and HR, IT and their manager have their tasks."
        footer={
          <Button variant="primary" onClick={() => onAdded(result.checklist)}>
            Open their checklist
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <CopyField
            label="Set-password link"
            value={result.set_password_link}
            hint={`Send this to ${first} yourself (e.g. on WhatsApp or Teams). It works once and expires in ${Math.round(result.link_expires_in_minutes / 60)} hours. You won't see it again — make a new one from Access → Users if needed.`}
          />
          {result.email_sent && <p className="text-meta text-muted">We've also emailed it to them.</p>}
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title="Add new joiner"
      description="Creates their account and onboarding checklist. You'll get a link for them to set their password."
      footer={
        <>
          <Button variant="ghost" onClick={onExistingPerson} disabled={busy}>
            They already have an account
          </Button>
          <Button data-guide="onboarding.add-save" variant="primary" isLoading={busy} disabled={!ready} onClick={add}>
            Add joiner
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        <TextField label="Full name" value={form.full_name} onChange={set('full_name')} error={fieldErrors.full_name} autoComplete="off" />
        <TextField label="Work email" type="email" value={form.email} onChange={set('email')} error={fieldErrors.email} autoComplete="off" />
        <TextField label="Job title" value={form.designation} onChange={set('designation')} error={fieldErrors.designation} />
        <TextField label="Joining date" type="date" value={form.date_of_joining} onChange={set('date_of_joining')} error={fieldErrors.date_of_joining} />
        <SelectField
          label="Department (optional)"
          placeholder="No department"
          options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
          value={form.department_id}
          onChange={set('department_id')}
          error={fieldErrors.department_id}
        />
        {(usual.length > 0 || sometimes.length > 0) && (
          <ReadyList label={recs.data?.basis.label ?? null} usual={usual} sometimes={sometimes} ticked={ticked} onToggle={toggle} />
        )}
        <div className="flex flex-col gap-2">
          {manager ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-body text-ink">
                Reports to <span className="font-medium">{manager.full_name}</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => setManager(null)}>
                Change
              </Button>
            </div>
          ) : (
            <>
              <TextField
                label="Reports to (optional)"
                placeholder="Search by name"
                value={managerSearch}
                onChange={(e) => setManagerSearch(e.target.value)}
                trailing={<Search className="mr-1 h-4 w-4 text-muted" aria-hidden="true" />}
                error={fieldErrors.manager_id}
              />
              {(people.data ?? []).length > 0 && (
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0" aria-label="Matching people">
                  {(people.data ?? []).map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setManager(p)}
                        className={cn('flex w-full flex-col rounded-card px-3 py-2 text-left hover:bg-row-hover')}
                      >
                        <span className="text-body font-medium text-ink">{p.full_name}</span>
                        <span className="text-meta text-muted">{p.designation}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <SelectField
          label="Role"
          placeholder="Employee"
          hint="Most people are employees. Extra roles can be added later from Access → Users."
          options={(roles.data ?? []).filter((r) => r.name !== 'employee').map((r) => ({ value: r.id, label: roleLabel(r.name) }))}
          value={form.role_id}
          onChange={set('role_id')}
          error={fieldErrors.role_id}
        />
      </div>
    </Dialog>
  )
}

/**
 * The usual equipment and licences for people like this joiner, already ticked
 * a sensible default, not an AI step. Each item says how many similar joiners got it.
 */
const ReadyList: React.FC<{
  label: string | null
  usual: UsualItem[]
  sometimes: UsualItem[]
  ticked: Set<string>
  onToggle: (key: string) => void
}> = ({ label, usual, sometimes, ticked, onToggle }) => {
  const row = (item: UsualItem) => (
    <li key={item.key}>
      <label className="flex min-h-10 cursor-pointer items-center gap-3 py-1 text-body text-ink">
        <input type="checkbox" checked={ticked.has(item.key)} onChange={() => onToggle(item.key)} className="h-4 w-4 shrink-0 accent-navy" />
        <span className="flex flex-col">
          <span>{item.task}</span>
          <span className="text-meta text-muted">{item.reason}</span>
        </span>
      </label>
    </li>
  )
  return (
    <section aria-labelledby="ready-heading" className="flex flex-col gap-1">
      <div className="border-b border-ink pb-1.5">
        <h3 id="ready-heading" className="text-section text-ink">
          Ready for their first day
        </h3>
        {label && <p className="text-meta text-muted">{label}. Untick anything they won’t need.</p>}
      </div>
      {usual.length > 0 && <ul className="m-0 list-none p-0">{usual.map(row)}</ul>}
      {sometimes.length > 0 && (
        <>
          <p className="pt-2 text-meta text-muted">Sometimes added</p>
          <ul className="m-0 list-none p-0">{sometimes.map(row)}</ul>
        </>
      )}
    </section>
  )
}
