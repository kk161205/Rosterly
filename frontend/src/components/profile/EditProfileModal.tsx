import React, { useState, useEffect } from 'react'
import { X, Save, Loader2, AlertCircle } from 'lucide-react'
import { EmployeeProfile, ProfileUpdatePayload } from '@/types/profile'
import { UserRole } from '@/types/dashboard'

interface EditProfileModalProps {
  isOpen: boolean
  onClose: () => void
  profile: EmployeeProfile
  currentUserRole: UserRole
  isSelf?: boolean
  onSave: (updates: ProfileUpdatePayload) => Promise<void>
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  currentUserRole,
  onSave,
}) => {
  const isHRAdmin = ['hr_admin', 'super_admin'].includes(currentUserRole)

  const [phone, setPhone] = useState(profile.phone || '')
  const [address, setAddress] = useState(profile.address || '')
  const [emergencyName, setEmergencyName] = useState(profile.emergency_contact?.name || '')
  const [emergencyRel, setEmergencyRel] = useState(profile.emergency_contact?.relationship || '')
  const [emergencyPhone, setEmergencyPhone] = useState(profile.emergency_contact?.phone || '')

  // HR Admin editable fields
  const [designation, setDesignation] = useState(profile.designation || '')
  const [department, setDepartment] = useState(profile.department || '')
  const [status, setStatus] = useState(profile.status || 'active')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setPhone(profile.phone || '')
      setAddress(profile.address || '')
      setEmergencyName(profile.emergency_contact?.name || '')
      setEmergencyRel(profile.emergency_contact?.relationship || '')
      setEmergencyPhone(profile.emergency_contact?.phone || '')
      setDesignation(profile.designation || '')
      setDepartment(profile.department || '')
      setStatus(profile.status || 'active')
      setErrorMsg(null)
    }
  }, [isOpen, profile])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMsg(null)

    try {
      const payload: ProfileUpdatePayload = {
        phone,
        address,
        emergency_contact: {
          name: emergencyName,
          relationship: emergencyRel,
          phone: emergencyPhone,
        },
      }

      if (isHRAdmin) {
        payload.designation = designation
        payload.department = department
        payload.status = status
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
              Contact & Location Information
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

            <div>
              <label className="block text-xs font-medium text-on-surface mb-1">
                Residential Address
              </label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-xs font-body bg-surface-container-low border border-outline-variant rounded-sm text-on-surface focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20"
                placeholder="Street address, city, state, zip code"
              />
            </div>
          </div>

          <hr className="border-outline-variant/60" />

          {/* Emergency Contact */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-outline">
              Emergency Contact Information
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-on-surface mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-body bg-surface-container-low border border-outline-variant rounded-sm text-on-surface focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20"
                  placeholder="Full name"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-on-surface mb-1">
                  Relationship
                </label>
                <input
                  type="text"
                  value={emergencyRel}
                  onChange={(e) => setEmergencyRel(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-body bg-surface-container-low border border-outline-variant rounded-sm text-on-surface focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20"
                  placeholder="e.g. Spouse, Parent, Sibling"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-on-surface mb-1">
                Emergency Phone Number
              </label>
              <input
                type="text"
                value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(e.target.value)}
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
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-body bg-surface-container-lowest border border-outline-variant rounded-sm text-on-surface focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-on-surface mb-1">
                    Employment Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as EmployeeProfile['status'])}
                    className="w-full px-3 py-2 text-xs font-body bg-surface-container-lowest border border-outline-variant rounded-sm text-on-surface focus:outline-none focus:border-accent"
                  >
                    <option value="active">Active</option>
                    <option value="onboarding">Onboarding</option>
                    <option value="offboarding">Offboarding</option>
                    <option value="terminated">Terminated</option>
                    <option value="on_leave">On Leave</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {/* Footer Actions */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-outline-variant">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-on-surface-variant hover:text-on-surface bg-surface-container rounded-sm border border-outline-variant/60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-on-accent bg-accent hover:bg-accent/90 rounded-sm shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
