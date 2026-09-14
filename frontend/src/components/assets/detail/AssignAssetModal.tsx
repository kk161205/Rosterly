import React, { useState, useEffect } from 'react'
import { X, UserPlus, Search, Check, AlertCircle, Building } from 'lucide-react'
import { Button } from '@/components/common/CommonUI'
import { employeeService } from '@/services/employeeService'
import { Employee } from '@/types/employee'
import { Asset, AssetAssignPayload } from '@/types/assets'

interface AssignAssetModalProps {
  asset: Asset
  isOpen: boolean
  onClose: () => void
  onAssign: (payload: AssetAssignPayload) => Promise<void>
}

export const AssignAssetModal: React.FC<AssignAssetModalProps> = ({
  asset,
  isOpen,
  onClose,
  onAssign,
}) => {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [search, setSearch] = useState('')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')
  const [conditionNotes, setConditionNotes] = useState('New / Excellent Condition')
  const [notes, setNotes] = useState('')

  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const fetchEmployees = async () => {
      setIsLoadingEmployees(true)
      try {
        const res = await employeeService.getEmployees({ page_size: 100, status: 'active' })
        setEmployees(res.items)
      } catch {
        setError('Failed to load active employee directory.')
      } finally {
        setIsLoadingEmployees(false)
      }
    }
    fetchEmployees()
  }, [isOpen])

  if (!isOpen) return null

  const filteredEmployees = employees.filter(
    (emp) =>
      emp.full_name.toLowerCase().includes(search.toLowerCase()) ||
      emp.email.toLowerCase().includes(search.toLowerCase()) ||
      (emp.department_name && emp.department_name.toLowerCase().includes(search.toLowerCase()))
  )

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEmployeeId) {
      setError('Please select an employee to assign this asset to.')
      return
    }
    if (!conditionNotes.trim()) {
      setError('Condition at assignment is required.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await onAssign({
        employee_id: selectedEmployeeId,
        condition_notes: conditionNotes.trim(),
        notes: notes.trim() || null,
      })
      onClose()
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : 'Failed to complete asset assignment.'
      setError(String(msg || 'Assignment failed.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg bg-surface-container-lowest border border-outline-variant rounded-xl shadow-2xl z-10 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant/60 bg-surface-container-low flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-accent-container text-on-accent-container">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-sans font-bold text-primary">Assign Asset to Employee</h2>
              <p className="text-xs text-on-surface-variant font-mono">
                {asset.name} ({asset.asset_tag})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-on-surface-variant hover:text-primary rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs font-body">
          {error && (
            <div className="p-3 bg-error-container/30 border border-error/40 text-on-error-container rounded-md flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Employee Search & Picker */}
          <div className="space-y-2">
            <label className="font-semibold text-on-surface flex items-center justify-between">
              <span>Select Employee Recipient <span className="text-error">*</span></span>
              {selectedEmployee && (
                <span className="text-accent font-mono text-[11px]">
                  Selected: {selectedEmployee.full_name}
                </span>
              )}
            </label>

            {/* Search Filter Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name, email, or department..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-xs text-on-surface focus:outline-none focus:border-accent"
              />
            </div>

            {/* Employee Selection List */}
            <div className="max-h-44 overflow-y-auto border border-outline-variant/60 rounded-lg divide-y divide-outline-variant/20 bg-surface-container-lowest">
              {isLoadingEmployees ? (
                <div className="p-4 text-center text-outline">Loading active employees...</div>
              ) : filteredEmployees.length === 0 ? (
                <div className="p-4 text-center text-outline">No matching employees found</div>
              ) : (
                filteredEmployees.map((emp) => {
                  const isSelected = emp.id === selectedEmployeeId
                  return (
                    <div
                      key={emp.id}
                      onClick={() => setSelectedEmployeeId(emp.id)}
                      className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-accent/10 text-primary font-semibold'
                          : 'hover:bg-surface-container-low text-on-surface'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-accent text-on-accent text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {emp.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate">{emp.full_name}</div>
                          <div className="text-[10px] text-outline truncate flex items-center gap-1.5 font-mono">
                            <span>{emp.email}</span>
                            {emp.department_name && (
                              <>
                                <span>&bull;</span>
                                <span>{emp.department_name}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {isSelected && <Check className="w-4 h-4 text-accent flex-shrink-0" />}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Condition at Assignment */}
          <div className="space-y-1">
            <label className="font-semibold text-on-surface">
              Condition at Assignment <span className="text-error">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Brand New, Pristine Condition, No scratches"
              value={conditionNotes}
              onChange={(e) => setConditionNotes(e.target.value)}
              className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-on-surface focus:outline-none focus:border-accent"
            />
          </div>

          {/* Additional Notes */}
          <div className="space-y-1">
            <label className="font-semibold text-on-surface">Additional Assignment Notes</label>
            <textarea
              rows={3}
              placeholder="Optional notes or peripheral accessories provided (e.g. USB-C hub, power adapter)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-on-surface focus:outline-none focus:border-accent resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-outline-variant/60 flex items-center justify-end gap-2.5">
            <Button variant="secondary" size="md" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              type="submit"
              isLoading={isSubmitting}
              disabled={!selectedEmployeeId}
            >
              Confirm Assignment
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
