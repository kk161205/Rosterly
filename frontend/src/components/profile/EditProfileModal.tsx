import React, { useState, useEffect } from 'react'
import { X, Save, AlertCircle } from 'lucide-react'
import { EmployeeProfile, ProfileUpdatePayload } from '@/types/profile'
import { UserRole } from '@/types/dashboard'
import { Department } from '@/types/employee'
import { employeeService } from '@/services/employeeService'
import { Button, SelectDropdown } from '@/components/common/CommonUI'

interface EditProfileModalProps {
  isOpen: boolean
  onClose: () => void
  profile: EmployeeProfile
  currentUserRole: UserRole
  isSelf?: boolean
  onSave: (updates: ProfileUpdatePayload) => Promise<void>
}

// Matches the backend's UserStatus enum exactly (doc §1.1) — 'on_leave' is a
// Leave & Attendance (P3) concept on a different table, not a user status.
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'offboarding', label: 'Offboarding' },
  { value: 'terminated', label: 'Terminated' },
]

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  currentUserRole,
  isSelf = false,
  onSave,
}) => {
  // Self-editing is always phone-only server-side, regardless of role (§5.4) —
  // HR/Admin privileged fields only apply when editing SOMEONE ELSE's profile.
  const isHRAdmin = ['hr_admin', 'super_admin'].includes(currentUserRole) && !isSelf

  const [phone, setPhone] = useState(profile.phone || '')
  const [designation, setDesignation] = useState(profile.designation || '')
  const [departmentId, setDepartmentId] = useState(profile.department_id || '')
  const [status, setStatus] = useState<string>(profile.status || 'active')
  const [departments, setDepartments] = useState<Department[]>([])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setPhone(profile.phone || '')
      setDesignation(profile.designation || '')
      setDepartmentId(profile.department_id || '')
      setStatus(profile.status || 'active')
      setErrorMsg(null)
      if (isHRAdmin) {
        employeeService.getDepartments().then(setDepartments).catch(() => setDepartments([]))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, profile])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMsg(null)

    try {
      // Only send fields the backend's EmployeeProfileUpdateRequest schema
      // actually accepts (extra="forbid" rejects anything else outright).
      const payload: ProfileUpdatePayload = { phone }

      if (isHRAdmin) {
        payload.designation = designation
        payload.department_id = departmentId || null
        payload.status = status as ProfileUpdatePayload['status']
      }

      await onSave(payload)
      onClose()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update profile. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-surface/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between bg-surface-container-low">
          <div>
            <h2 className="text-base font-headline font-semibold text-on-surface">
              Edit Employee Profile
            </h2>
            <p className="text-xs font-body text-on-surface-variant">
              {isHRAdmin ? 'HR Administrator Edit Mode' : 'Self Service Contact Updates'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-sm text-outline hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {errorMsg && (
            <div className="p-3 bg-error-container/40 border border-error/30 rounded text-xs text-on-error-container flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-error" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Self Editable Contact Details */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-outline">
              Contact Information
            </h3>

            <div>
              <label className="block text-xs font-medium text-on-surface mb-1">
                Phone Number
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 text-xs font-body bg-surface-container-low border border-outline-variant rounded-sm text-on-surface focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20"
                placeholder="+1 (555) 000-0000"
              />
            </div>
          </div>

          {/* HR Admin Restricted Fields */}
          {isHRAdmin && (
            <>
              <hr className="border-outline-variant/60" />
              <div className="space-y-3 bg-surface-container-low/60 p-3 rounded border border-outline-variant/50">
                <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-accent flex items-center gap-1.5">
                  HR Admin Privileged Fields
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-on-surface mb-1">
                      Designation / Title
                    </label>
                    <input
                      type="text"
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-body bg-surface-container-lowest border border-outline-variant rounded-sm text-on-surface focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-on-surface mb-1">
                      Department
                    </label>
                    <SelectDropdown
                      value={departmentId}
                      onChange={setDepartmentId}
                      placeholder="Select department"
                      options={departments.map((d) => ({ value: d.id, label: d.name }))}
                      containerClassName="w-full"
                      className="w-full justify-between"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-on-surface mb-1">
                    Employment Status
                  </label>
                  <SelectDropdown
                    value={status}
                    onChange={setStatus}
                    options={STATUS_OPTIONS}
                    containerClassName="w-full"
                    className="w-full justify-between"
                  />
                </div>
              </div>
            </>
          )}

          {/* Footer Actions */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-outline-variant">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting} icon={<Save className="w-3.5 h-3.5" />}>
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
