import React from 'react'

interface RosterlyLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showSubtitle?: boolean
  className?: string
  align?: 'left' | 'center'
}

export const RosterlyLogo: React.FC<RosterlyLogoProps> = ({
  size = 'lg',
  showSubtitle = false,
  className = '',
  align = 'center',
}) => {
  const logoHeights = {
    sm: 'h-6',
    md: 'h-8',
    lg: 'h-9 sm:h-10',
    xl: 'h-12 sm:h-14',
  }

  const alignmentClasses = align === 'left' ? 'items-start text-left' : 'items-center text-center'

  return (
    <div className={`flex flex-col ${alignmentClasses} gap-1.5 ${className}`}>
      <div className="flex items-center justify-center">
        <img
          src="/brand/rosterly-logo.png"
          alt="Rosterly"
          className={`${logoHeights[size]} w-auto object-contain select-none`}
        />
        <span className="sr-only">Rosterly</span>
      </div>

      {showSubtitle && (
        <span className="font-mono text-label-caps text-on-surface-variant uppercase tracking-wider">
          Enterprise Workforce & Asset Platform
        </span>
      )}
    </div>
  )
}

