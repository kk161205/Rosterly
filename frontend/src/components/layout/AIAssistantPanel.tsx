import React, { useEffect } from 'react'
import { Sparkles, X, Clock } from 'lucide-react'
import { Button } from '@/components/common/CommonUI'

interface AIAssistantPanelProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Slide-over trigger for the AI Assistant (PRD §4, §8). The AI service
 * (§8.2.2 Natural-Language Query Assistant, POST /ai/query) isn't built yet,
 * so this renders a clearly-labeled "coming soon" placeholder rather than
 * fabricating AI responses (rules.md §1.1).
 */
export const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop (PRD §4 Contextual Slide-over Drawers spec) */}
      <div
        className="absolute inset-0 backdrop-blur-sm bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Panel */}
      <div className="relative w-[480px] sm:w-[560px] max-w-full h-full bg-surface-container-lowest border-l border-outline-variant shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="h-16 px-6 flex items-center justify-between border-b border-outline-variant flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-md bg-accent-container flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-on-accent-container" />
            </span>
            <span className="text-title-md font-sans text-on-surface">Ask Rosterly AI</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI assistant panel"
            className="p-1.5 rounded-md text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <span className="w-14 h-14 rounded-full bg-accent-container flex items-center justify-center">
            <Clock className="w-6 h-6 text-on-accent-container" />
          </span>
          <div className="space-y-1.5">
            <h3 className="text-title-md font-sans text-on-surface">Coming soon</h3>
            <p className="text-body-sm text-on-surface-variant max-w-sm">
              The Rosterly AI Assistant will let you ask operational questions in plain language —
              like "who has admin access but hasn't logged in for 60 days" — and get answers grounded
              in your real, role-scoped platform data (PRD §8.2.2). The AI service isn't deployed yet,
              so this panel doesn't answer questions today.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  )
}
