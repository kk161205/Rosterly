import React, { useState, useEffect } from 'react'
import { offboardingService } from '@/services/offboardingService'
import { employeeService } from '@/services/employeeService'
import { Employee } from '@/types/employee'
import { X, UserMinus, Calendar, FileText, AlertTriangle, Loader2 } from 'lucide-react'

interface StartOffboardingModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  initialEmployeeId?: string
}

export const StartOffboardingModal: React.FC<StartOffboardingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialEmployeeId,
}) => {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(initialEmployeeId || '')
  const [exitDate, setExitDate] = useState<string>(
    new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  )
  const [reason, setReason] = useState<string>('')
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (isOpen) {
      setIsLoadingEmployees(true)
      setErrorMsg('')
      employeeService
        .getEmployees({ page_size: 100 })
        .then((res) => {
          const eligible = (res.items || []).filter(
            (e) => e.status === 'active' || e.status === 'onboarding'
          )
          setEmployees(eligible)
          if (initialEmployeeId && eligible.some((e) => e.id === initialEmployeeId)) {
            setSelectedEmployeeId(initialEmployeeId)
          } else if (eligible.length > 0 && !selectedEmployeeId) {
            setSelectedEmployeeId(eligible[0].id)
          }
        })
        .catch(() => {
          setErrorMsg('Failed to load eligible employees')
        })
        .finally(() => {
          setIsLoadingEmployees(false)
        })
    }
  }, [isOpen, initialEmployeeId, selectedEmployeeId])

  if (!isOpen) return null

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEmployeeId) {
      setErrorMsg('Please select an employee to offboard')
      return
    }

    setIsSubmitting(true)
    setErrorMsg('')
    try {
      await offboardingService.createOffboarding({
        employee_id: selectedEmployeeId,
        exit_date: exitDate || null,
        reason: reason.trim() || null,
      })
      onSuccess()
      onClose()
    } catch {
      setErrorMsg('Failed to initiate offboarding workflow. Please check if an active checklist already exists.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200 select-none">
      <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl shadow-xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-outline-variant/40 flex items-center justify-between bg-surface-container-low/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-700 flex items-center justify-center font-bold">
              <UserMinus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-sans font-bold text-base text-on-surface leading-tight">
                Initiate Employee Offboarding
              </h3>
              <p className="text-xs text-on-surface-variant font-body">
                Automates hardware reclamation, system access revocation, and HR clearances
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-error-container text-on-error-container border border-error/20 text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-error" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Employee Selection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-mono font-semibold text-on-surface uppercase">
              Departing Employee *
            </label>
            {isLoadingEmployees ? (
              <div className="h-10 rounded-lg bg-surface-container animate-pulse" />
            ) : employees.length === 0 ? (
              <div className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/50 text-xs text-on-surface-variant">
                No active employees found to offboard.
              </div>
            ) : (
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-outline-variant bg-surface text-xs font-medium text-on-surface focus:border-accent outline-none"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} — {emp.designation} ({emp.department_name || 'General'}) [{emp.employee_code}]
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Selected Employee Summary Card */}
          {selectedEmployee && (
            <div className="p-3 rounded-lg bg-surface-container-low/60 border border-outline-variant/40 space-y-1 text-xs">
              <div className="font-semibold text-on-surface">
                {selectedEmployee.full_name} ({selectedEmployee.employee_code})
              </div>
              <div className="text-on-surface-variant font-body">
                {selectedEmployee.email} • {selectedEmployee.designation} • {selectedEmployee.department_name}
              </div>
            </div>
          )}

          {/* Exit Date */}
          <div className="space-y-1.5">
            <label className="block text-xs font-mono font-semibold text-on-surface uppercase">
              Last Working Day (Exit Date)
            </label>
            <div className="relative">
              <input
                type="date"
                value={exitDate}
                onChange={(e) => setExitDate(e.target.value)}
                className="w-full h-10 px-3 pl-9 rounded-lg border border-outline-variant bg-surface text-xs font-medium text-on-surface focus:border-accent outline-none"
              />
              <Calendar className="w-4 h-4 text-on-surface-variant absolute left-3 top-3" />
            </div>
          </div>

          {/* Departure Reason */}
          <div className="space-y-1.5">
            <label className="block text-xs font-mono font-semibold text-on-surface uppercase">
              Departure Reason / Exit Notes
            </label>
            <div className="relative">
              <textarea
                rows={3}
                placeholder="e.g. Resignation, end of contract, relocation..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full p-3 pl-9 rounded-lg border border-outline-variant bg-surface text-xs font-medium text-on-surface focus:border-accent outline-none resize-none"
              />
              <FileText className="w-4 h-4 text-on-surface-variant absolute left-3 top-3" />
            </div>
          </div>

          {/* Security & Asset Notice */}
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 text-xs space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
              <span>Automated Checklist Provisions</span>
            </div>
            <p className="text-[11px] font-body text-amber-900 leading-relaxed">
              Upon kickoff, all active hardware assigned to this employee will be dynamically populated into IT reclamation tasks. Setting target user status to offboarding will flag their account across administrative directories.
            </p>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-outline-variant/30 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-outline-variant text-xs font-mono font-semibold text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedEmployeeId}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-mono font-semibold transition-all inline-flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Initiating...</span>
                </>
              ) : (
                <>
                  <UserMinus className="w-4 h-4" />
                  <span>Kickoff Offboarding</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
