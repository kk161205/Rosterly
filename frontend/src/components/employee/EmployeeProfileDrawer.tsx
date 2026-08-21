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
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { Employee, Department, EmployeeUpdatePayload } from '@/types/employee'
import { employeeService } from '@/services/employeeService'

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
  const [showOffboardConfirm, setShowOffboardConfirm] = useState(false)
  const [isOffboarding, setIsOffboarding] = useState(false)
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
      setShowOffboardConfirm(false)
      setShowDeleteConfirm(false)
    }
  }, [employee])

  useEffect(() => {
    if (!employee) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDeleteConfirm) {
          setShowDeleteConfirm(false)
        } else if (showOffboardConfirm) {
          setShowOffboardConfirm(false)
        } else if (isEditing) {
          setIsEditing(false)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [employee, showDeleteConfirm, showOffboardConfirm, isEditing, onClose])

  if (!employee) return null

  // Role permissions
  const role = (currentUserRole || 'employee').toLowerCase()
  const isSuperAdmin = role === 'super_admin'
  const isHrAdmin = role === 'hr_admin'
  const isManager = role === 'manager'

  const canEdit = isSuperAdmin || isHrAdmin || isManager
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

  const handleConfirmOffboard = async () => {
    setIsOffboarding(true)
    setSaveError(null)
    try {
      const updated = await employeeService.offboardEmployee(employee.id)
      setSaveSuccess(`${employee.full_name} is now transitioned to offboarding.`)
      setShowOffboardConfirm(false)
      if (onEmployeeUpdated) {
        onEmployeeUpdated(updated)
      }
      setTimeout(() => setSaveSuccess(null), 3500)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to offboard employee'
      setSaveError(errorMsg)
    } finally {
      setIsOffboarding(false)
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

  const getStatusBadge = (status: Employee['status']) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-label-caps font-mono font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active Employee
          </span>
        )
      case 'onboarding':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-label-caps font-mono font-medium bg-accent-container/40 text-on-accent-container border border-accent/20">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Onboarding In-Progress
          </span>
        )
      case 'offboarding':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-label-caps font-mono font-medium bg-amber-50 text-amber-800 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Offboarding In-Progress
          </span>
        )
      case 'terminated':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-label-caps font-mono font-medium bg-surface-container text-on-surface-variant border border-outline-variant">
            <span className="w-1.5 h-1.5 rounded-full bg-outline" />
            Terminated / Departed
          </span>
        )
      case 'inactive':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-label-caps font-mono font-medium bg-surface-container text-on-surface-variant border border-outline-variant">
            <span className="w-1.5 h-1.5 rounded-full bg-outline" />
            Inactive / Departed
          </span>
        )
    }
  }

  const drawerElement = (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-fade-in">
      {/* Click Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={() => {
          if (!showDeleteConfirm && !showOffboardConfirm) {
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
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1.5 text-xs font-sans font-semibold rounded-lg border border-outline-variant hover:border-accent bg-surface-container-lowest hover:bg-surface-container text-on-surface transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Edit details"
                >
                  <Edit3 className="w-3.5 h-3.5 text-accent" />
                  <span>Edit Details</span>
                </button>
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
            <div className="mb-3 p-3 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-sans font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
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
                  {getStatusBadge(employee.status)}
                </div>
              </div>
            </div>

            {/* Side Action Button */}
            <button
              type="button"
              onClick={() => {
                onClose()
                navigate(`/employees/${employee.id}`)
              }}
              className="px-3.5 py-2 text-xs font-sans font-semibold rounded-lg bg-primary hover:bg-primary-container text-on-primary transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-xs flex-shrink-0"
              title="Open full employee profile page"
            >
              <span>Full Profile</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
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
                  <select
                    value={formData.department_id || ''}
                    onChange={(e) => setFormData({ ...formData, department_id: e.target.value || null })}
                    className="w-full px-3 py-2 text-body-sm bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:border-accent text-on-surface"
                  >
                    <option value="">Unassigned</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-on-surface-variant uppercase mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status || 'active'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 text-body-sm bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:border-accent text-on-surface capitalize"
                  >
                    <option value="active">Active</option>
                    <option value="onboarding">Onboarding</option>
                    <option value="offboarding">Offboarding</option>
                    <option value="inactive">Inactive</option>
                    <option value="terminated">Terminated</option>
                  </select>
                </div>
              </div>

              {(isSuperAdmin || isHrAdmin) && (
                <div>
                  <label className="block text-xs font-mono text-on-surface-variant uppercase mb-1">
                    System Access Role
                  </label>
                  <select
                    value={formData.role_name || 'employee'}
                    onChange={(e) => setFormData({ ...formData, role_name: e.target.value })}
                    className="w-full px-3 py-2 text-body-sm bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:border-accent text-on-surface capitalize"
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="hr_admin">HR Admin</option>
                    <option value="it_admin">IT Admin</option>
                    <option value="auditor">Auditor</option>
                    {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                  </select>
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
              <button
                type="submit"
                form="edit-employee-form"
                disabled={isSaving}
                className="flex-1 py-2 px-4 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-sans font-semibold text-center transition-colors shadow-xs inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{isSaving ? 'Saving Changes...' : 'Save Changes'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false)
                  setSaveError(null)
                }}
                disabled={isSaving}
                className="py-2 px-3.5 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface-variant text-xs font-sans font-semibold hover:bg-surface-container transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
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
                  <button
                    type="button"
                    onClick={() => setShowOffboardConfirm(true)}
                    className="py-2 px-3.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant hover:border-outline text-xs font-sans font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    title="Initiate Offboarding Process"
                  >
                    <UserMinus className="w-3.5 h-3.5 text-secondary" />
                    <span>Initiate Offboarding</span>
                  </button>
                )}

                {canDelete && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="py-2 px-3.5 rounded-lg bg-error-container/40 hover:bg-error-container text-on-error-container border border-error/20 hover:border-error/40 text-xs font-sans font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    title="Permanently Delete Employee Record"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-error" />
                    <span>Delete Record</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Confirmation Modal: Offboarding */}
      {showOffboardConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-surface-container text-on-surface flex items-center justify-center flex-shrink-0 border border-outline-variant/60">
                <UserMinus className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-title-md font-sans font-semibold text-on-surface">
                  Initiate Offboarding
                </h3>
                <p className="text-body-xs font-body text-on-surface-variant">
                  Change employee status to offboarding
                </p>
              </div>
            </div>

            <p className="text-body-sm font-body text-on-surface-variant leading-relaxed">
              Are you sure you want to transition <strong>{employee.full_name}</strong> to offboarding? This will update their active status in the directory and initiate departure workflows.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowOffboardConfirm(false)}
                disabled={isOffboarding}
                className="px-4 py-2 text-xs font-sans font-semibold rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmOffboard}
                disabled={isOffboarding}
                className="px-4 py-2 text-xs font-sans font-semibold rounded-lg bg-primary hover:bg-primary-container text-on-primary transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isOffboarding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Offboarding</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-sans font-semibold rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-sans font-semibold rounded-lg bg-error text-on-error hover:bg-error/90 transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Yes, Delete Employee</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return createPortal(drawerElement, document.body)
}
