import React from 'react'
import {
  LayoutList,
  Network,
  RotateCcw,
  Building2,
  Filter,
  Shield,
} from 'lucide-react'
import { Department, EmployeeQueryFilters, FilterOption } from '@/types/employee'
import { SearchInput, SelectDropdown, SelectOption } from '@/components/common/CommonUI'

interface EmployeeFilterBarProps {
  filters: EmployeeQueryFilters
  departments?: Department[]
  availableDepartments?: FilterOption[]
  availableStatuses?: FilterOption[]
  availableRoles?: FilterOption[]
  onFilterChange: (updated: Partial<EmployeeQueryFilters>) => void
  onResetFilters: () => void
  viewMode: 'list' | 'tree'
  onViewModeChange: (mode: 'list' | 'tree') => void
  totalCount?: number
}

export const EmployeeFilterBar: React.FC<EmployeeFilterBarProps> = ({
  filters,
  departments = [],
  availableDepartments = [],
  availableStatuses = [],
  availableRoles = [],
  onFilterChange,
  onResetFilters,
  viewMode,
  onViewModeChange,
  totalCount = 0,
}) => {
  const isFiltered = Boolean(
    filters.search ||
      (filters.department_id && filters.department_id !== 'all') ||
      (filters.status && filters.status !== 'all') ||
      (filters.role && filters.role !== 'all')
  )

  const depts =
    availableDepartments && availableDepartments.length > 0
      ? availableDepartments.map((d) => ({
          value: d.value,
          label: `${d.label} (${d.count})`,
        }))
      : departments.map((d) => ({
          value: d.id,
          label: `${d.name} (${d.head_count})`,
        }))

  const departmentOptions: SelectOption[] = [
    { value: 'all', label: 'All Departments' },
    ...depts,
  ]

  const statusOptions: SelectOption[] = [
    { value: 'all', label: 'All Statuses' },
    ...availableStatuses.map((s) => ({
      value: s.value,
      label: `${s.label} (${s.count})`,
    })),
  ]

  const roleOptions: SelectOption[] = [
    { value: 'all', label: 'All Roles' },
    ...availableRoles.map((r) => ({
      value: r.value,
      label: `${r.label} (${r.count})`,
    })),
  ]

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-5 shadow-sm space-y-4">
      {/* Top Header & View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/60 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-headline-lg font-sans font-semibold text-on-surface tracking-tight">
              Employee Directory
            </h1>
            <span className="text-label-caps font-mono px-2.5 py-0.5 rounded-full bg-accent-container text-on-accent-container font-medium">
              {totalCount} Total
            </span>
          </div>
          <p className="text-body-sm font-body text-on-surface-variant mt-1">
            Search employee records, department assignments, and reporting hierarchy across the organization.
          </p>
        </div>

        {/* View Mode Segmented Toggle */}
        <div className="flex items-center bg-surface-container-low p-1 rounded-md border border-outline-variant self-start sm:self-auto">
          <button
            type="button"
            onClick={() => onViewModeChange('list')}
            className={`flex items-center gap-2 px-3 py-1.5 text-body-sm font-sans font-medium rounded transition-all cursor-pointer ${
              viewMode === 'list'
                ? 'bg-surface-container-lowest text-primary font-semibold shadow-xs border border-outline-variant/40'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <LayoutList className="w-4 h-4 text-primary" />
            <span>List View</span>
          </button>

          <button
            type="button"
            onClick={() => onViewModeChange('tree')}
            className={`flex items-center gap-2 px-3 py-1.5 text-body-sm font-sans font-medium rounded transition-all cursor-pointer ${
              viewMode === 'tree'
                ? 'bg-surface-container-lowest text-primary font-semibold shadow-xs border border-outline-variant/40'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Network className="w-4 h-4 text-accent" />
            <span>Org Chart View</span>
          </button>
        </div>
      </div>

      {/* Filter Inputs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
        {/* Full-Text Search Input */}
        <div className="lg:col-span-4">
          <SearchInput
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ search: e.target.value, page: 1 })}
            placeholder="Search by name, email, designation..."
            shortcut=""
          />
        </div>

        {/* Department Filter Dropdown */}
        <div className="lg:col-span-3">
          <SelectDropdown
            options={departmentOptions}
            value={filters.department_id || 'all'}
            onChange={(val) => onFilterChange({ department_id: val, page: 1 })}
            icon={<Building2 className="w-4 h-4 text-outline" />}
            containerClassName="w-full"
            className="w-full justify-between"
          />
        </div>

        {/* Status Dropdown */}
        <div className="lg:col-span-2">
          <SelectDropdown
            options={statusOptions}
            value={filters.status || 'all'}
            onChange={(val) => onFilterChange({ status: val, page: 1 })}
            icon={<Filter className="w-4 h-4 text-outline" />}
            containerClassName="w-full"
            className="w-full justify-between"
          />
        </div>

        {/* Role Filter Dropdown */}
        <div className="lg:col-span-2">
          <SelectDropdown
            options={roleOptions}
            value={filters.role || 'all'}
            onChange={(val) => onFilterChange({ role: val, page: 1 })}
            icon={<Shield className="w-4 h-4 text-outline" />}
            containerClassName="w-full"
            className="w-full justify-between"
          />
        </div>

        {/* Reset Filter Action */}
        <div className="lg:col-span-1 flex justify-end">
          {isFiltered && (
            <button
              type="button"
              onClick={onResetFilters}
              className="px-2.5 py-2 text-xs font-mono font-medium text-error hover:bg-error-container/40 rounded border border-error/20 transition-colors inline-flex items-center gap-1 cursor-pointer"
              title="Reset Filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
