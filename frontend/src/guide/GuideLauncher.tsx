import React from 'react'
import { useGuide } from '@/guide/GuideProvider'

/**
 * An invisible button over the logo's turned tile (a 24px mark): click the
 * tile and the Guide lifts out and listens. Ctrl K or "/" do the same, so the
 * small target is never the only way in.
 */
export const GuideLauncher: React.FC = () => {
  const guide = useGuide()
  if (!guide.allowed) return null
  return (
    <button
      type="button"
      onClick={() => guide.setBoxOpen(true)}
      aria-label="Ask Rosterly (Ctrl K)"
      title="Ask Rosterly (Ctrl K)"
      className="absolute left-[8px] top-[-4px] h-5 w-5 rounded-soft focus-visible:outline-navy"
    />
  )
}
