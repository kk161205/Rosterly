import React, { useState, useEffect } from 'react'
import { onboardingService } from '@/services/onboardingService'
import { AISuggestionResponse } from '@/types/onboarding'
import { X, Sparkles, Calendar, User, Briefcase } from 'lucide-react'

interface StartOnboardingModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export const StartOnboardingModal: React.FC<StartOnboardingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [employees, setEmployees] = useState<
    Array<{ id: string; name: string; designation: string; department: string; date_of_joining?: string | null }>
  >([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')

  // AI Suggestion State (advisory only — see onboardingService.suggestChecklistWithAI)
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestionResponse | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (isOpen) {
      onboardingService.getEligibleEmployees().then((data) => {
        setEmployees(data)
        if (data.length > 0) setSelectedEmployeeId(data[0].id)
      })
    }
  }, [isOpen])

  if (!isOpen) return null

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId)

  const handleGenerateAISuggestion = async () => {
    if (!selectedEmployee) return
    setIsGeneratingAI(true)
    setErrorMsg('')
    try {
      const res = await onboardingService.suggestChecklistWithAI(
        selectedEmployee.department,
        selectedEmployee.designation
      )
      setAiSuggestion(res)
    } catch {
      setErrorMsg('Failed to generate AI recommendations')
    } finally {
      setIsGeneratingAI(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEmployeeId) {
      setErrorMsg('Please select an employee')
      return
    }

    setIsSubmitting(true)
    setErrorMsg('')
    try {
      await onboardingService.createOnboarding({ employee_id: selectedEmployeeId })
      onSuccess()
      onClose()
    } catch {
      setErrorMsg('Failed to initiate onboarding checklist')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200 select-none">
      <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-outline-variant/40 flex items-center justify-between bg-surface-container-low/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center font-bold">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-sans font-bold text-base text-on-surface leading-tight">
                Start New Employee Onboarding
              </h3>
              <p className="text-xs text-on-surface-variant font-body">
                Kickoff cross-functional onboarding checklist across HR, IT & Facilities
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-error-container/60 border border-error/30 text-on-error-container text-xs">
              {errorMsg}
            </div>
          )}

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono font-semibold text-on-surface mb-1.5 uppercase">
                Select Employee
              </label>
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-outline-variant bg-surface text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} — {emp.designation} ({emp.department})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono font-semibold text-on-surface mb-1.5 uppercase">
                Date of Joining
              </label>
              <div className="relative">
                <div className="w-full h-10 px-3 pr-9 rounded-md border border-outline-variant bg-surface-container-low text-sm font-mono flex items-center text-on-surface-variant">
                  {selectedEmployee?.date_of_joining
                    ? new Date(selectedEmployee.date_of_joining).toLocaleDateString()
                    : '—'}
                </div>
                <Calendar className="w-4 h-4 text-on-surface-variant absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Department Pre-fill Summary Card */}
          {selectedEmployee && (
            <div className="p-3.5 rounded-lg bg-surface-container-low border border-outline-variant/40 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-on-surface">
                <Briefcase className="w-4 h-4 text-accent" />
                <span>
                  <strong>Department:</strong> {selectedEmployee.department}
                </span>
                <span className="text-outline-variant">•</span>
                <span>
                  <strong>Role:</strong> {selectedEmployee.designation}
                </span>
              </div>
              <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Pre-filled from HR Record
              </span>
            </div>
          )}

          {/* AI Suggestion Generator Ribbon */}
          <div className="p-4 rounded-lg bg-gradient-to-r from-indigo-900/10 via-primary-container/10 to-accent/10 border border-accent/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent animate-pulse" />
                <span className="font-sans font-bold text-xs text-primary">
                  AI Checklist Recommender
                </span>
              </div>
              <button
                type="button"
                onClick={handleGenerateAISuggestion}
                disabled={isGeneratingAI || !selectedEmployee}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-on-accent text-xs font-mono font-semibold hover:bg-accent/90 transition-all shadow-xs cursor-pointer disabled:opacity-60"
              >
                {isGeneratingAI ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" /> ✨ Suggest checklist with AI
                  </>
                )}
              </button>
            </div>

            {aiSuggestion && (
              <div className="space-y-2 border-t border-accent/20 pt-2.5">
                <p className="text-xs text-on-surface font-body italic">
                  {aiSuggestion.summary}
                </p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {aiSuggestion.recommended_tasks.map((task, idx) => (
                    <div
                      key={idx}
                      className="text-[11px] font-body bg-white/80 p-2 rounded border border-accent/20 flex items-center justify-between"
                    >
                      <span className="font-medium text-on-surface">
                        • {task.task_name}
                      </span>
                      <span className="font-mono text-[10px] uppercase text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                        {task.owner_role_name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Fixed Checklist Template Notice */}
          <div>
            <label className="block text-xs font-mono font-semibold text-on-surface mb-1.5 uppercase">
              Checklist Tasks (5 total)
            </label>
            <p className="text-[11px] text-on-surface-variant">
              Phase 1 onboarding always uses the standard fixed template: Contract & ID, Email/SSO
              provisioning, Hardware issuance, Workspace access, and Team orientation. The AI panel
              above is advisory guidance only — custom tasks aren't yet supported by the backend.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-outline-variant/40 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md border border-outline-variant text-on-surface text-xs font-medium hover:bg-surface-container-low transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-md bg-accent text-on-accent text-xs font-mono font-semibold hover:bg-accent/90 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Initiating Workflow…' : 'Initiate Onboarding Workflow'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
