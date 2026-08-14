import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Loader2, ChevronDown, Check } from 'lucide-react'

// --- Search Input Primitive ---
export interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  shortcut?: string
  containerClassName?: string
}

export const SearchInput: React.FC<SearchInputProps> = ({
  shortcut = 'Ctrl + K',
  containerClassName = '',
  className = '',
  ...props
}) => {
  return (
    <div className={`relative w-full ${containerClassName}`}>
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none" />
      <input
        type="text"
        className={`w-full pl-9 pr-14 py-2 text-xs font-body bg-surface-container-low border border-outline-variant rounded-md text-on-surface placeholder:text-outline focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all ${className}`}
        {...props}
      />
      {shortcut && (
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-outline bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/60 pointer-events-none hidden sm:inline-block">
          {shortcut}
        </span>
      )}
    </div>
  )
}

// --- Rich Custom Select Dropdown Primitive ---
export interface SelectOption {
  value: string
  label: string
  icon?: React.ReactNode
}

export interface SelectDropdownProps {
  options: SelectOption[]
  value?: string
  onChange?: (value: string) => void
  icon?: React.ReactNode
  label?: string
  placeholder?: string
  containerClassName?: string
  className?: string
  disabled?: boolean
}

export const SelectDropdown: React.FC<SelectDropdownProps> = ({
  options,
  value,
  onChange,
  icon,
  label,
  placeholder = 'Select an option',
  containerClassName = '',
  className = '',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)

  // Smart dynamic positioning: flip to top if bottom viewport space is not enough
  const updatePlacement = useCallback(() => {
    if (!dropdownRef.current) return
    const rect = dropdownRef.current.getBoundingClientRect()
    const estimatedHeight = 220
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top

    if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
      setPlacement('top')
    } else {
      setPlacement('bottom')
    }
  }, [])

  const handleToggle = () => {
    if (disabled) return
    if (!isOpen) {
      updatePlacement()
    }
    setIsOpen((prev) => !prev)
  }

  const handleSelect = (val: string) => {
    onChange?.(val)
    setIsOpen(false)
  }

  // Close on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
      window.addEventListener('resize', updatePlacement)
      window.addEventListener('scroll', updatePlacement, true)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', updatePlacement)
      window.removeEventListener('scroll', updatePlacement, true)
    }
  }, [isOpen, updatePlacement])

  return (
    <div ref={dropdownRef} className={`relative inline-block w-fit text-left ${containerClassName}`}>
      {/* Trigger Button - Content Adaptive */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`w-fit h-auto px-3 py-2 flex items-center gap-2 bg-surface-container-low hover:bg-surface-container border border-outline-variant hover:border-accent/40 rounded-md transition-all text-xs font-sans font-semibold text-primary cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${className}`}
      >
        {icon && <span className="text-primary flex-shrink-0">{icon}</span>}
        {label && (
          <span className="text-[11px] font-mono text-on-surface-variant uppercase tracking-wider hidden sm:inline">
            {label}:
          </span>
        )}
        <span className="truncate max-w-[140px] sm:max-w-[180px]">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-on-surface-variant flex-shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-accent' : ''
          }`}
        />
      </button>

      {/* Styled Dropdown Menu with Smart Top/Bottom Direction */}
      {isOpen && (
        <div
          ref={menuRef}
          className={`absolute z-50 min-w-[200px] w-max max-h-60 overflow-y-auto bg-surface-container-lowest border border-outline-variant rounded-md shadow-xl p-1.5 animate-in fade-in zoom-in-95 duration-100 ${
            placement === 'top'
              ? 'bottom-full mb-1.5 right-0 sm:right-auto sm:left-0'
              : 'top-full mt-1.5 right-0 sm:right-auto sm:left-0'
          }`}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value
            return (
              <div
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className={`px-3 py-2 rounded text-xs font-medium cursor-pointer flex items-center justify-between gap-3 transition-colors ${
                  isSelected
                    ? 'bg-accent/10 text-accent font-semibold'
                    : 'text-on-surface hover:bg-surface-container-low hover:text-primary'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                  <span className="truncate">{opt.label}</span>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// --- Content-Adaptive Button Primitive ---
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  icon?: React.ReactNode
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles =
    'w-fit h-auto inline-flex items-center justify-center font-sans font-medium leading-none whitespace-nowrap transition-all cursor-pointer rounded-md disabled:opacity-50 disabled:cursor-not-allowed select-none focus:outline-none'

  const sizeStyles = {
    sm: 'px-2.5 py-1.5 text-xs gap-1.5',
    md: 'px-3.5 py-2 text-xs font-semibold gap-2',
    lg: 'px-4.5 py-2.5 text-sm font-semibold gap-2.5',
  }

  const variantStyles = {
    primary:
      'bg-accent text-on-accent shadow-xs hover:bg-accent/90 focus:ring-2 focus:ring-accent/30 active:scale-[0.98]',
    secondary:
      'bg-surface-container text-on-surface hover:bg-surface-container-high border border-outline-variant focus:ring-1 focus:ring-outline active:scale-[0.98]',
    danger:
      'bg-error text-on-error hover:bg-error/90 focus:ring-2 focus:ring-error/30 active:scale-[0.98]',
    outline:
      'border border-outline-variant bg-transparent text-on-surface hover:bg-surface-container-low active:scale-[0.98]',
    ghost:
      'bg-transparent text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
  }

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" /> : icon}
      {children}
    </button>
  )
}

// --- Status Badge Primitive ---
export interface StatusBadgeProps {
  status: string
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral'
  className?: string
  dot?: boolean
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  variant = 'neutral',
  className = '',
  dot = true,
}) => {
  const variantStyles = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    error: 'bg-rose-50 text-rose-700 border-rose-200',
    info: 'bg-sky-50 text-sky-700 border-sky-200',
    neutral: 'bg-surface-container text-on-surface-variant border-outline-variant',
  }

  const dotColors = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-rose-500',
    info: 'bg-sky-500',
    neutral: 'bg-outline',
  }

  return (
    <span
      className={`w-fit h-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border font-medium uppercase tracking-wider ${variantStyles[variant]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]} flex-shrink-0`} />}
      <span>{status.replace('_', ' ')}</span>
    </span>
  )
}

// --- Card Container Primitive ---
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean
}

export const Card: React.FC<CardProps> = ({
  children,
  elevated = false,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`bg-surface-container-lowest border border-outline-variant rounded-lg p-6 ${
        elevated ? 'shadow-sm' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
