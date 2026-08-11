import React from 'react'

interface RosterlyLogoProps {
  size?: 'sm' | 'md' | 'lg'
  showSubtitle?: boolean
  className?: string
}

export const RosterlyLogo: React.FC<RosterlyLogoProps> = ({
  size = 'md',
  showSubtitle = false,
  className = '',
}) => {
  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  }

  const titleSizes = {
    sm: 'text-title-md',
    md: 'text-headline-lg-mobile md:text-headline-lg',
    lg: 'text-headline-lg md:text-display-lg',
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-1 ${className}`}>
      <div className="flex items-center gap-3">
        {/* Geometric Rosterly Emblem */}
        <div className={`relative flex items-center justify-center rounded-lg bg-primary ${iconSizes[size]} shadow-sm`}>
          <svg
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-3/4 h-3/4 text-on-primary"
          >
            {/* Grid-based tech icon: interconnected roster/nodes */}
            <rect x="4" y="4" width="10" height="10" rx="2" fill="#29408E" />
            <rect x="18" y="4" width="10" height="10" rx="2" fill="#2563EB" />
            <rect x="4" y="18" width="10" height="10" rx="2" fill="#2563EB" />
            <rect x="18" y="18" width="10" height="10" rx="2" fill="#29408E" />
            <path
              d="M9 14V18M14 9H18M18 23H14M23 14V18"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <span className={`font-sans font-bold tracking-tight text-primary ${titleSizes[size]}`}>
          Rosterly
        </span>
      </div>

      {showSubtitle && (
        <span className="font-mono text-label-caps text-on-surface-variant uppercase tracking-wider">
          Enterprise Workforce & Asset Platform
        </span>
      )}
    </div>
  )
}
