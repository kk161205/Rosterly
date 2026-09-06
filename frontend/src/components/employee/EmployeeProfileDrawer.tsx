import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  X,
  Mail,
  Phone,
  Calendar,
  Building,
  UserCheck,
  MapPin,
  Shield,
  Edit3,
  UserMinus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Save,
  RotateCcw,
  ExternalLink,
} from 'lucide-react'
import { Employee, Department, EmployeeUpdatePayload } from '@/types/employee'
import { employeeService } from '@/services/employeeService'
import { Button, StatusBadge, SelectDropdown } from '@/components/common/CommonUI'

const STATUS_LABEL: Record<Employee['status'], string> = {
  active: 'Active Employee',
  onboarding: 'Onboarding In-Progress',
  offboarding: 'Offboarding In-Progress',
  terminated: 'Terminated / Departed',
  inactive: 'Inactive / Departed',
}

const STATUS_VARIANT: Record<Employee['status'], 'success' | 'info' | 'warning' | 'neutral'> = {
  active: 'success',
  onboarding: 'info',
  offboarding: 'warning',
  terminated: 'neutral',
  inactive: 'neutral',
}

interface EmployeeProfileDrawerProps {
  employee: Employee | null
  currentUserRole?: string | null
  departments?: Department[]
  onClose: () => void
  onEmployeeUpdated?: (updated: Employee) => void
  onEmployeeDeleted?: (deletedId: string) => void
}

export const EmployeeProfileDrawer: React.FC<EmployeeProfileDrawerProps> = ({
  employee,
  currentUserRole = 'employee',
  departments = [],
  onClose,
  onEmployeeUpdated,
  onEmployeeDeleted,
}) => {
  const navigate = useNavigate()

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<EmployeeUpdatePayload>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)

  // Confirmation modal states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Reset form data when employee changes
  useEffect(() => {
    if (employee) {
      setFormData({
        full_name: employee.full_name,
        designation: employee.designation,
        department_id: employee.department_id || '',
        role_name: (employee.role as string) || 'employee',
        phone: employee.phone || '',
        location: employee.location || 'Headquarters',
        status: employee.status,
      })
      setIsEditing(false)
      setSaveError(null)
      setSaveSuccess(null)
      setShowDeleteConfirm(false)
    }
  }, [employee])

  useEffect(() => {
    if (!employee) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDeleteConfirm) {
          setShowDeleteConfirm(false)
        } else if (isEditing) {
          setIsEditing(false)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [employee, showDeleteConfirm, isEditing, onClose])

  if (!employee) return null

  // Role permissions
  const role = (currentUserRole || 'employee').toLowerCase()
  const isSuperAdmin = role === 'super_admin'
  const isHrAdmin = role === 'hr_admin'

  // Manager access to §5.4 is read-only + approval actions only — not edit.
  const canEdit = isSuperAdmin || isHrAdmin
  const canOffboard = (isSuperAdmin || isHrAdmin) && employee.status !== 'offboarding' && employee.status !== 'terminated'
  const canDelete = isSuperAdmin

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setSaveError(null)
    try {
      const updated = await employeeService.updateEmployee(employee.id, formData)
      setSaveSuccess('Employee profile updated successfully.')
      setIsEditing(false)
      if (onEmployeeUpdated) {
        onEmployeeUpdated(updated)
      }
      setTimeout(() => setSaveSuccess(null), 3500)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to update employee'
      setSaveError(errorMsg)
    } finally {
      setIsSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    setIsDeleting(true)
    setSaveError(null)
    try {
      await employeeService.deleteEmployee(employee.id)
      setShowDeleteConfirm(false)
      if (onEmployeeDeleted) {
        onEmployeeDeleted(employee.id)
      }
      onClose()
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete employee'
      setSaveError(errorMsg)
      setIsDeleting(false)
    }
  }

  const drawerElement = (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-fade-in">
      {/* Click Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={() => {
          if (!showDeleteConfirm) {
            onClose()
          }
        }}
      />

      {/* Slide-over Drawer Panel */}
      <div className="relative w-full max-w-lg bg-surface-container-lowest h-screen shadow-2xl border-l border-outline-variant flex flex-col justify-between z-10 transform transition-transform duration-300 ease-in-out">
        {/* Drawer Header */}
        <div className="p-5 sm:p-6 border-b border-outline-variant bg-surface-container-low/40">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-label-caps font-mono text-on-surface-variant uppercase tracking-wider">
                Employee Profile Drawer
              </span>
              {employee.employee_code && (
                <span className="font-mono text-xs text-outline px-1.5 py-0.5 rounded bg-surface-container border border-outline-variant/60">
                  {employee.employee_code}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {canEdit && !isEditing && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  icon={<Edit3 className="w-3.5 h-3.5 text-accent" />}
                  title="Edit details"
                >
                  Edit Details
                </Button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                title="Close drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Feedback Banners */}
          {saveSuccess && (
            <div className="mb-3 p-3 rounded-lg bg-success-container text-on-success-container border border-success/20 text-xs font-sans font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
              <span>{saveSuccess}</span>
            </div>
          )}
          {saveError && (
            <div className="mb-3 p-3 rounded-lg bg-error-container text-on-error-container border border-error/20 text-xs font-sans font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-error flex-shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Employee Avatar & Core Info with Side Action Button */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <div className="w-14 h-14 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-sans font-bold text-xl shadow-sm flex-shrink-0">
                {employee.avatar_url ? (
                  <img
                    src={employee.avatar_url}
                    alt={employee.full_name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  employee.full_name.substring(0, 2).toUpperCase()
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="text-headline-lg-mobile font-sans font-semibold text-on-surface truncate">
                  {employee.full_name}
                </h2>
                <p className="text-body-md font-body text-on-surface-variant mt-0.5 truncate">
                  {employee.designation}
                </p>
                <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                  <StatusBadge status={STATUS_LABEL[employee.status]} variant={STATUS_VARIANT[employee.status] || 'neutral'} />
                </div>
              </div>
            </div>

            {/* Side Action Button */}
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                onClose()
                navigate(`/employees/${employee.id}`)
              }}
              className="bg-primary hover:bg-primary-container flex-shrink-0"
              title="Open full employee profile page"
            >
              Full Profile
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Drawer Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {isEditing ? (
            /* Edit Mode Form */
            <form id="edit-employee-form" onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-on-surface-variant uppercase mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.full_name || ''}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-3 py-2 text-body-sm bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:border-accent text-on-surface"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-on-surface-variant uppercase mb-1">
                  Designation / Role Title
                </label>
                <input
                  type="text"
                  required
                  value={formData.designation || ''}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  className="w-full px-3 py-2 text-body-sm bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:border-accent text-on-surface"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-on-surface-variant uppercase mb-1">
                    Department
                  </label>
                  <SelectDropdown
                    value={formData.department_id || ''}
                    onChange={(val) => setFormData({ ...formData, department_id: val || null })}
                    placeholder="Unassigned"
                    options={departments.map((d) => ({ value: d.id, label: d.name }))}
                    containerClassName="w-full"
                    className="w-full justify-between"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-on-surface-variant uppercase mb-1">
                    Status
                  </label>
                  <SelectDropdown
                    value={formData.status || 'active'}
                    onChange={(val) => setFormData({ ...formData, status: val })}
                    options={[
                      { value: 'active', label: 'Active' },
                      { value: 'onboarding', label: 'Onboarding' },
                      { value: 'offboarding', label: 'Offboarding' },
                      { value: 'inactive', label: 'Inactive' },
                      { value: 'terminated', label: 'Terminated' },
                    ]}
                    containerClassName="w-full"
                    className="w-full justify-between"
                  />
                </div>
              </div>

              {(isSuperAdmin || isHrAdmin) && (
                <div>
                  <label className="block text-xs font-mono text-on-surface-variant uppercase mb-1">
                    System Access Role
                  </label>
                  <SelectDropdown
                    value={formData.role_name || 'employee'}
                    onChange={(val) => setFormData({ ...formData, role_name: val })}
                    options={[
                      { value: 'employee', label: 'Employee' },
                      { value: 'manager', label: 'Manager' },
                      { value: 'hr_admin', label: 'HR Admin' },
                      { value: 'it_admin', label: 'IT Admin' },
                      { value: 'auditor', label: 'Auditor' },
                      ...(isSuperAdmin ? [{ value: 'super_admin', label: 'Super Admin' }] : []),
                    ]}
                    containerClassName="w-full"
                    className="w-full justify-between"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-on-surface-variant uppercase mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+1 (555) 000-0000"
                    className="w-full px-3 py-2 text-body-sm bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:border-accent text-on-surface"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-on-surface-variant uppercase mb-1">
                    Office Location
                  </label>
                  <input
                    type="text"
                    value={formData.location || ''}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="Headquarters / Remote"
                    className="w-full px-3 py-2 text-body-sm bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:border-accent text-on-surface"
                  />
                </div>
              </div>
            </form>
          ) : (
            /* View Mode */
            <>
              {/* Department & Role Section */}
              <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant space-y-3">
                <div className="flex items-center justify-between text-body-sm">
                  <span className="font-mono text-outline flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-tertiary" />
                    Department
                  </span>
                  <span className="font-sans font-semibold text-on-surface">
                    {employee.department_name || 'Unassigned'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-body-sm">
                  <span className="font-mono text-outline flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-accent" />
                    System Role
                  </span>
                  <span className="font-mono text-xs font-semibold uppercase px-2 py-0.5 rounded bg-surface-container text-primary border border-outline-variant/60">
                    {employee.role ? String(employee.role).replace('_', ' ') : 'Employee'}
                  </span>
                </div>
              </div>

              {/* Contact Details */}
              <div>
                <h3 className="text-title-md font-sans font-semibold text-on-surface mb-3">
                  Contact Details
                </h3>
                <div className="space-y-3 bg-surface-container-lowest border border-outline-variant/80 rounded-xl p-4 shadow-2xs">
                  <div className="flex items-center gap-3 text-body-sm">
                    <Mail className="w-4 h-4 text-accent flex-shrink-0" />
                    <a
                      href={`mailto:${employee.email}`}
                      className="text-on-surface hover:text-accent hover:underline font-body truncate"
                    >
                      {employee.email}
                    </a>
                  </div>

                  <div className="flex items-center gap-3 text-body-sm">
                    <Phone className="w-4 h-4 text-outline flex-shrink-0" />
                    <span className="text-on-surface font-body">
                      {employee.phone || 'N/A'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-body-sm">
                    <MapPin className="w-4 h-4 text-outline flex-shrink-0" />
                    <span className="text-on-surface font-body">
                      {employee.location || 'Headquarters'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Reporting Structure & History */}
              <div>
                <h3 className="text-title-md font-sans font-semibold text-on-surface mb-3">
                  Reporting Structure
                </h3>
                <div className="space-y-3 bg-surface-container-lowest border border-outline-variant/80 rounded-xl p-4 shadow-2xs">
                  <div className="flex items-center justify-between text-body-sm">
                    <span className="font-mono text-outline flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-primary" />
                      Direct Manager
                    </span>
                    <span className="font-sans font-semibold text-on-surface">
                      {employee.manager_name || 'N/A — Executive Lead'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-body-sm">
                    <span className="font-mono text-outline flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-outline" />
                      Date Joined
                    </span>
                    <span className="font-mono text-xs text-on-surface font-medium">
                      {employee.date_of_joining || employee.joining_date || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Drawer Footer Actions Toolbar */}
        <div className="p-4 border-t border-outline-variant bg-surface-container-low/60 flex items-center justify-between gap-2.5 flex-wrap">
          {isEditing ? (
            <div className="flex items-center gap-2.5 w-full">
              <Button
                type="submit"
                form="edit-employee-form"
                variant="primary"
                isLoading={isSaving}
                disabled={isSaving}
                icon={!isSaving ? <Save className="w-3.5 h-3.5" /> : undefined}
                className="flex-1 bg-primary hover:bg-primary-container"
              >
                {isSaving ? 'Saving Changes...' : 'Save Changes'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditing(false)
                  setSaveError(null)
                }}
                disabled={isSaving}
                icon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <>
              {/* Send Email Action */}
              <a
                href={`mailto:${employee.email}`}
                className="py-2 px-3.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-sans font-semibold transition-colors shadow-xs inline-flex items-center gap-1.5"
                title={`Send email to ${employee.email}`}
              >
                <Mail className="w-3.5 h-3.5 text-on-primary" />
                <span>Send Email</span>
              </a>

              {/* Administrative Actions */}
              <div className="flex items-center gap-2">
                {canOffboard && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      onClose()
                      navigate(`/offboarding?start=${employee.id}`)
                    }}
                    icon={<UserMinus className="w-3.5 h-3.5 text-secondary" />}
                    title="Initiate Offboarding Process"
                  >
                    Initiate Offboarding
                  </Button>
                )}

                {canDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowDeleteConfirm(true)}
                    icon={<Trash2 className="w-3.5 h-3.5 text-error" />}
                    className="bg-error-container/40 hover:bg-error-container text-on-error-container border border-error/20"
                    title="Permanently Delete Employee Record"
                  >
                    Delete Record
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Confirmation Modal: Deletion (Super Admin Destructive Action) */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-surface-container-lowest rounded-2xl border border-error/40 p-6 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-error-container text-on-error-container flex items-center justify-center flex-shrink-0 border border-error/30">
                <AlertTriangle className="w-5 h-5 text-error" />
              </div>
              <div>
                <h3 className="text-title-md font-sans font-semibold text-error">
                  Delete Employee Record
                </h3>
                <p className="text-body-xs font-body text-on-surface-variant">
                  Irreversible permanent action
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-error-container/20 border border-error/20 text-xs font-body text-on-surface leading-relaxed space-y-1">
              <p>
                Are you sure you want to permanently delete <strong>{employee.full_name}</strong> ({employee.employee_code || 'ID: ' + employee.id.slice(0, 8)})?
              </p>
              <p className="text-error font-medium">
                This will delete the user account and clear direct report hierarchy links. This cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button type="button" variant="danger" isLoading={isDeleting} onClick={handleConfirmDelete} disabled={isDeleting}>
                Yes, Delete Employee
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return createPortal(drawerElement, document.body)
}
