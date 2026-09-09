import React, { useState, useEffect, useRef } from 'react'
import {
  Laptop,
  Monitor,
  Smartphone,
  Key,
  Armchair,
  Box,
  Layers,
  CheckCircle2,
  Clock,
  Wrench,
  Archive,
  AlertTriangle,
  Building2,
  RotateCcw,
} from 'lucide-react'
import { SearchInput, SelectDropdown, SelectOption, Button } from '@/components/common/CommonUI'
import { AssetCategory, AssetStatus, AssetQueryFilters } from '@/types/assets'
import { Department } from '@/types/employee'

// Icon lookup for known/seed category values — a custom, admin-created
// category (rules.md §1.1 — not hardcoded data, just a display icon) falls
// back to a generic box icon.
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  laptop: <Laptop className="w-3.5 h-3.5" />,
  monitor: <Monitor className="w-3.5 h-3.5" />,
  mobile: <Smartphone className="w-3.5 h-3.5" />,
  software_license: <Key className="w-3.5 h-3.5" />,
  furniture: <Armchair className="w-3.5 h-3.5" />,
  other: <Box className="w-3.5 h-3.5" />,
}

const categoryLabel = (value: string) =>
  value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

const STATUS_ICONS: Record<string, React.ReactNode> = {
  in_stock: <CheckCircle2 className="w-3.5 h-3.5 text-success" />,
  assigned: <Clock className="w-3.5 h-3.5 text-accent" />,
  under_maintenance: <Wrench className="w-3.5 h-3.5 text-warning" />,
  retired: <Archive className="w-3.5 h-3.5 text-error" />,
  lost: <AlertTriangle className="w-3.5 h-3.5 text-error" />,
}

const STATUS_LABELS: Record<string, string> = {
  in_stock: 'In Stock',
  assigned: 'Assigned',
  under_maintenance: 'Under Maintenance',
  retired: 'Retired',
  lost: 'Lost / Missing',
}

interface AssetFilterBarProps {
  filters: AssetQueryFilters
  onFilterChange: (newFilters: Partial<AssetQueryFilters>) => void
  onResetFilters: () => void
  departments: Department[]
  categories: string[]
  statuses: AssetStatus[]
  totalResults: number
}

export const AssetFilterBar: React.FC<AssetFilterBarProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
  departments,
  categories,
  statuses,
  totalResults,
}) => {
  const [searchTerm, setSearchTerm] = useState(filters.search || '')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Keyboard shortcut Ctrl+K / Cmd+K focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Debounced search trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm !== (filters.search || '')) {
        onFilterChange({ search: searchTerm, page: 1 })
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm, filters.search, onFilterChange])

  // Sync internal search state if filters are reset externally
  useEffect(() => {
    setSearchTerm(filters.search || '')
  }, [filters.search])

  // Category and status options are real, backend-sourced data — never
  // hardcoded (rules.md §1.1). Categories are the distinct values currently
  // in use (GET /assets/meta); statuses are the fixed workflow enum.
  const categoryOptions: SelectOption[] = [
    { value: 'all', label: 'All Categories', icon: <Layers className="w-3.5 h-3.5" /> },
    ...categories.map((c) => ({
      value: c,
      label: categoryLabel(c),
      icon: CATEGORY_ICONS[c] || <Box className="w-3.5 h-3.5" />,
    })),
  ]

  const statusOptions: SelectOption[] = [
    { value: 'all', label: 'All Statuses', icon: <Layers className="w-3.5 h-3.5" /> },
    ...statuses.map((s) => ({
      value: s,
      label: STATUS_LABELS[s] || categoryLabel(s),
      icon: STATUS_ICONS[s] || <Layers className="w-3.5 h-3.5" />,
    })),
  ]

  const departmentOptions: SelectOption[] = [
    { value: 'all', label: 'All Departments', icon: <Building2 className="w-3.5 h-3.5" /> },
    ...departments.map((dept) => ({
      value: dept.id,
      label: dept.name,
      icon: <Building2 className="w-3.5 h-3.5 text-on-surface-variant" />,
    })),
  ]

  const isFiltered = Boolean(
    (filters.search && filters.search.length > 0) ||
      (filters.category && filters.category !== 'all') ||
      (filters.status && filters.status !== 'all') ||
      (filters.department_id && filters.department_id !== 'all')
  )

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-lg p-4 space-y-3 shadow-xs">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="flex-1 min-w-[240px] max-w-lg">
          <SearchInput
            ref={searchInputRef}
            placeholder="Search assets by tag, name, or serial number..."
            shortcut="Ctrl + K"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-2.5">
          <SelectDropdown
            label="Category"
            options={categoryOptions}
            value={filters.category || 'all'}
            onChange={(val) => onFilterChange({ category: val as AssetCategory | 'all', page: 1 })}
          />

          <SelectDropdown
            label="Status"
            options={statusOptions}
            value={filters.status || 'all'}
            onChange={(val) => onFilterChange({ status: val as AssetStatus | 'all', page: 1 })}
          />

          <SelectDropdown
            label="Dept"
            options={departmentOptions}
            value={filters.department_id || 'all'}
            onChange={(val) => onFilterChange({ department_id: val, page: 1 })}
          />

          {isFiltered && (
            <Button
              variant="outline"
              size="md"
              icon={<RotateCcw className="w-3.5 h-3.5" />}
              onClick={onResetFilters}
              className="text-on-surface-variant hover:text-primary"
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-outline-variant/30 text-xs font-mono text-outline">
        <span>
          Showing <strong className="text-on-surface">{totalResults}</strong> matching assets
        </span>
        {isFiltered && (
          <span className="text-accent font-sans text-[11px] font-medium">Filtered results active</span>
        )}
      </div>
    </div>
  )
}
