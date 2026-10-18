import React, { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { employeeService } from '@/features/employees/services/employeeService'
import { profileService } from '@/features/employees/services/profileService'
import type { EmployeeProfile, ProfileUpdatePayload } from '@/features/employees/types/profile'
import { roleLabel } from '@/features/auth/hooks/useCurrentUser'
import { getErrorMessage, getFieldErrors } from '@/lib/errors'
import { Alert, Button, Dialog, SelectField, TextField } from '@/ui'

/**
 * Edit a profile (PATCH /employees/{id}, §5.4). Fields follow the API's rules:
 * people editing themselves change contact details only; HR and super admins
 * (employee:update) change job details too. Role options come from
 * /users/assignable-roles, so only roles the caller may grant are offered.
 */
export const EditProfileDialog: React.FC<{
  profile: EmployeeProfile
  full: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}> = ({ profile, full, open, onOpenChange, onSaved }) => {
  const [form, setForm] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const departments = useQuery({ queryKey: ['departments'], queryFn: employeeService.getDepartments, enabled: open && full })
  const roles = useQuery({ queryKey: ['assignable-roles'], queryFn: employeeService.getRoles, enabled: open && full })
  const managers = useQuery({
    queryKey: ['manager-options'],
    queryFn: async () => (await employeeService.getEmployees({ page_size: 100, status: 'active' })).items,
    enabled: open && full,
  })

  useEffect(() => {
    if (!open) return
    setForm({
      full_name: profile.full_name,
      designation: profile.designation,
      department_id: profile.department_id ?? '',
      role_id: profile.role_id,
      manager_id: profile.manager_id ?? '',
      status: profile.status,
      phone: profile.phone ?? '',
      emergency_contact_name: profile.emergency_contact_name ?? '',
      emergency_contact_phone: profile.emergency_contact_phone ?? '',
    })
    setErrors({})
    setError(null)
  }, [open, profile])

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const save = async () => {
    // Send only what changed, so self-edits never touch HR-only fields
    const original: Record<string, string> = {
      full_name: profile.full_name,
      designation: profile.designation,
      department_id: profile.department_id ?? '',
      role_id: profile.role_id,
      manager_id: profile.manager_id ?? '',
      status: profile.status,
      phone: profile.phone ?? '',
      emergency_contact_name: profile.emergency_contact_name ?? '',
      emergency_contact_phone: profile.emergency_contact_phone ?? '',
    }
    const changes: Record<string, string | null> = {}
    for (const key of Object.keys(form)) {
      if (!full && !['phone', 'emergency_contact_name', 'emergency_contact_phone'].includes(key)) continue
      if (form[key] !== original[key]) changes[key] = form[key].trim() === '' ? null : form[key].trim()
    }
    if (full && !form.full_name.trim()) return setErrors({ full_name: 'Enter a name.' })
    if (Object.keys(changes).length === 0) return onOpenChange(false)
    setBusy(true)
    setError(null)
    try {
      await profileService.updateEmployeeProfile(profile.id, changes as ProfileUpdatePayload)
      onSaved()
      onOpenChange(false)
    } catch (err) {
      setError(getErrorMessage(err))
      setErrors(getFieldErrors(err))
    } finally {
      setBusy(false)
    }
  }

  const roleChanging = full && form.role_id !== profile.role_id
  const statusChanging = full && form.status !== profile.status

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={full ? 'Edit profile' : 'Edit contact details'}
      description={profile.full_name}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" isLoading={busy} onClick={save}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        {full && (
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField label="Full name" value={form.full_name ?? ''} onChange={set('full_name')} error={errors.full_name} />
            <TextField label="Job title" value={form.designation ?? ''} onChange={set('designation')} error={errors.designation} />
            <SelectField
              label="Department"
              options={[{ value: '', label: 'No department' }, ...(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))]}
              value={form.department_id ?? ''}
              onChange={set('department_id')}
              error={errors.department_id}
            />
            <SelectField
              label="Reports to"
              options={[
                { value: '', label: 'No one' },
                ...(managers.data ?? []).filter((m) => m.id !== profile.id).map((m) => ({ value: m.id, label: m.full_name })),
              ]}
              value={form.manager_id ?? ''}
              onChange={set('manager_id')}
              error={errors.manager_id}
            />
            <SelectField
              label="Primary role"
              options={[
                ...(roles.data ?? []).map((r) => ({ value: r.id, label: roleLabel(r.name) })),
                ...(roles.data && !roles.data.some((r) => r.id === profile.role_id)
                  ? [{ value: profile.role_id, label: roleLabel(profile.role_name) }]
                  : []),
              ]}
              value={form.role_id ?? ''}
              onChange={set('role_id')}
              error={errors.role_id}
              hint={
                profile.additional_roles?.length
                  ? `Also holds ${profile.additional_roles.map((r) => roleLabel(r.name)).join(', ')} — change extra roles in Access → Users.`
                  : 'Decides what they can see and do. Extra roles are added in Access → Users.'
              }
            />
            <SelectField
              label="Status"
              options={['active', 'onboarding', 'offboarding', 'inactive'].map((s) => ({ value: s, label: roleLabel(s) }))}
              value={form.status ?? ''}
              onChange={set('status')}
              error={errors.status}
            />
          </div>
        )}
        {(roleChanging || statusChanging) && (
          <Alert tone="info">Changing the role or status signs {profile.full_name.split(' ')[0]} out everywhere.</Alert>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Phone" type="tel" value={form.phone ?? ''} onChange={set('phone')} error={errors.phone} />
          <span className="hidden sm:block" />
          <TextField
            label="Emergency contact"
            value={form.emergency_contact_name ?? ''}
            onChange={set('emergency_contact_name')}
            error={errors.emergency_contact_name}
          />
          <TextField
            label="Emergency contact phone"
            type="tel"
            value={form.emergency_contact_phone ?? ''}
            onChange={set('emergency_contact_phone')}
            error={errors.emergency_contact_phone}
          />
        </div>
      </div>
    </Dialog>
  )
}
