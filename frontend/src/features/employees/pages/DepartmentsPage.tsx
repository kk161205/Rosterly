import React, { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { employeeService } from '@/features/employees/services/employeeService'
import type { Department } from '@/features/employees/types/employee'
import { getErrorMessage, getFieldErrors } from '@/lib/errors'
import { Alert, Button, Dialog, EmptyState, ErrorState, PageHeader, RowButton, SelectField, Skeleton, Table, Td, TextField, Th, THead, Tr } from '@/ui'

const DEPARTMENTS_KEY = ['departments'] as const

/**
 * Departments: the company's own list. HR and super admins
 * add, rename and set a head; a department with people can't be deleted.
 */
export const DepartmentsPage: React.FC = () => {
  const list = useQuery({ queryKey: DEPARTMENTS_KEY, queryFn: employeeService.getDepartments })
  const [editing, setEditing] = useState<Department | 'new' | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Departments"
        description="Your company’s departments and who heads each one."
        actions={
          <Button data-guide="departments.add" variant="primary" onClick={() => setEditing('new')}>
            Add department
          </Button>
        }
      />
      {list.isLoading ? (
        <div className="flex flex-col gap-3" aria-label="Loading departments">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState message={getErrorMessage(list.error, 'Departments could not be loaded.')} onRetry={() => list.refetch()} />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState title="No departments yet" description="Add your first department, e.g. Engineering or Finance." />
      ) : (
        <Table label="Departments">
          <THead>
            <Th>Department</Th>
            <Th>Head</Th>
            <Th>People</Th>
          </THead>
          <tbody>
            {(list.data ?? []).map((d) => (
              <Tr key={d.id}>
                <Td>
                  <RowButton onClick={() => setEditing(d)} label={`Edit ${d.name}`}>
                    <span className="font-medium text-ink">{d.name}</span>
                  </RowButton>
                </Td>
                <Td className="text-muted">{d.manager_name ?? 'No head set'}</Td>
                <Td className="tabular-nums">{d.head_count}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && <DepartmentDialog department={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

const DepartmentDialog: React.FC<{ department: Department | null; onClose: () => void }> = ({ department, onClose }) => {
  const queryClient = useQueryClient()
  const [name, setName] = useState(department?.name ?? '')
  const [managerId, setManagerId] = useState(department?.manager_id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => setConfirmDelete(false), [department])

  // Possible heads: active people (first 100 by name is plenty for a picker).
  const people = useQuery({
    queryKey: ['employees', 'department-heads'],
    queryFn: async () => (await employeeService.getEmployees({ status: 'active', page_size: 100 })).items,
  })

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    setFieldErrors({})
    try {
      await action()
      await queryClient.invalidateQueries({ queryKey: DEPARTMENTS_KEY })
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
      setFieldErrors(getFieldErrors(err))
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(() =>
      department
        ? employeeService.updateDepartment(department.id, { name: name.trim(), manager_id: managerId || null })
        : employeeService.createDepartment({ name: name.trim(), manager_id: managerId || null }),
    )

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      busy={busy}
      title={department ? department.name : 'Add department'}
      description={department ? `${department.head_count} ${department.head_count === 1 ? 'person' : 'people'}` : undefined}
      footer={
        confirmDelete ? (
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Keep it
            </Button>
            <Button variant="danger" isLoading={busy} onClick={() => run(() => employeeService.deleteDepartment(department!.id))}>
              Delete department
            </Button>
          </>
        ) : (
          <>
            {department && (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)} disabled={busy || department.head_count > 0}>
                Delete
              </Button>
            )}
            <Button data-guide="departments.save" variant="primary" isLoading={busy} disabled={!name.trim()} onClick={save}>
              {department ? 'Save' : 'Add department'}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        {confirmDelete ? (
          <p className="text-body text-muted">Delete {department?.name}? This can’t be undone.</p>
        ) : (
          <>
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={fieldErrors.name} maxLength={100} />
            <SelectField
              label="Head (optional)"
              placeholder="No head"
              options={(people.data ?? []).map((p) => ({ value: p.id, label: p.full_name }))}
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              error={fieldErrors.manager_id}
            />
            {department && department.head_count > 0 && (
              <p className="text-meta text-muted">A department with people in it can’t be deleted — move them first.</p>
            )}
          </>
        )}
      </div>
    </Dialog>
  )
}
