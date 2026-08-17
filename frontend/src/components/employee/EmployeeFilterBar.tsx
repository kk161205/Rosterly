import React from 'react'
import {
  Search,
  X,
  LayoutList,
  Network,
  RotateCcw,
  Building2,
  Filter,
} from 'lucide-react'
import { Department, EmployeeQueryFilters } from '@/types/employee'

interface EmployeeFilterBarProps {
  filters: EmployeeQueryFilters
  departments: Department[]
  onFilterChange: (updated: Partial<EmployeeQueryFilters>) => void
  onResetFilters: () => void
  viewMode: 'list' | 'tree'
  onViewModeChange: (mode: 'list' | 'tree') => void
  totalCount?: number
}

export const EmployeeFilterBar: React.FC<EmployeeFilterBarProps> = ({
  filters,
  departments,
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
        <div className="lg:col-span-4 relative">
          <Search className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ search: e.target.value, page: 1 })}
            placeholder="Search by name, email, designation..."
            className="w-full pl-9 pr-8 py-2 rounded border border-outline-variant bg-surface-container-lowest text-body-sm font-body text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onFilterChange({ search: '', page: 1 })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Department Filter Dropdown */}
        <div className="lg:col-span-3 relative">
          <Building2 className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            value={filters.department_id || 'all'}
            onChange={(e) => onFilterChange({ department_id: e.target.value, page: 1 })}
            className="w-full pl-9 pr-8 py-2 rounded border border-outline-variant bg-surface-container-lowest text-body-sm font-body text-on-surface focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all cursor-pointer appearance-none"
          >
            <option value="all">All Departments</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name} ({dept.head_count})
              </option>
            ))}
          </select>
        </div>

        {/* Status Dropdown */}
        <div className="lg:col-span-2 relative">
          <Filter className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            value={filters.status || 'all'}
            onChange={(e) => onFilterChange({ status: e.target.value, page: 1 })}
            className="w-full pl-9 pr-8 py-2 rounded border border-outline-variant bg-surface-container-lowest text-body-sm font-body text-on-surface focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all cursor-pointer appearance-none"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="onboarding">Onboarding</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* Role Filter Dropdown */}
        <div className="lg:col-span-2 relative">
          <select
            value={filters.role || 'all'}
            onChange={(e) => onFilterChange({ role: e.target.value, page: 1 })}
            className="w-full px-3 py-2 rounded border border-outline-variant bg-surface-container-lowest text-body-sm font-body text-on-surface focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all cursor-pointer appearance-none"
          >
            <option value="all">All Roles</option>
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="hr_admin">HR Admin</option>
            <option value="it_admin">IT Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
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
