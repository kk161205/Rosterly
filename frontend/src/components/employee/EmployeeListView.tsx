import React from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Building,
  UserCheck,
} from 'lucide-react'
import { Employee, EmployeePaginatedResponse } from '@/types/employee'
import { StatusBadge, SelectDropdown } from '@/components/common/CommonUI'

const STATUS_VARIANT: Record<Employee['status'], 'success' | 'info' | 'warning' | 'neutral'> = {
  active: 'success',
  onboarding: 'info',
  offboarding: 'warning',
  terminated: 'neutral',
  inactive: 'neutral',
}

interface EmployeeListViewProps {
  data: EmployeePaginatedResponse
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  onSelectEmployee: (employee: Employee) => void
}

export const EmployeeListView: React.FC<EmployeeListViewProps> = ({
  data,
  onPageChange,
  onPageSizeChange,
  onSelectEmployee,
}) => {
  const { items, total, page, page_size } = data
  const totalPages = Math.ceil(total / page_size) || 1
  const startItem = total === 0 ? 0 : (page - 1) * page_size + 1
  const endItem = Math.min(page * page_size, total)

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase()
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-lg shadow-sm overflow-hidden flex flex-col justify-between">
      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant text-[11px] font-mono text-on-surface-variant uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold">Employee</th>
              <th className="py-3 px-4 font-semibold">Designation</th>
              <th className="py-3 px-4 font-semibold">Department</th>
              <th className="py-3 px-4 font-semibold">Reporting To</th>
              <th className="py-3 px-4 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/60">
            {items.map((emp) => (
              <tr
                key={emp.id}
                onClick={() => onSelectEmployee(emp)}
                className="hover:bg-surface-container-low/70 transition-colors cursor-pointer group"
              >
                {/* Employee Column */}
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-sans font-bold text-xs shadow-xs group-hover:bg-accent group-hover:text-on-accent transition-colors flex-shrink-0">
                      {emp.avatar_url ? (
                        <img
                          src={emp.avatar_url}
                          alt={emp.full_name}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        getInitials(emp.full_name)
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="text-body-md font-sans font-semibold text-on-surface block truncate group-hover:text-accent transition-colors">
                        {emp.full_name}
                      </span>
                      <span className="text-body-sm font-body text-on-surface-variant block truncate">
                        {emp.email}
                      </span>
                    </div>
                  </div>
                </td>

                {/* Designation Column */}
                <td className="py-3.5 px-4">
                  <span className="text-body-sm font-body font-medium text-on-surface">
                    {emp.designation}
                  </span>
                </td>

                {/* Department Badge Column */}
                <td className="py-3.5 px-4">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-label-caps font-mono bg-tertiary-container/25 text-tertiary border border-tertiary/20">
                    <Building className="w-3 h-3 text-tertiary/80" />
                    {emp.department_name}
                  </span>
                </td>

                {/* Reporting To Column */}
                <td className="py-3.5 px-4">
                  {emp.manager_name ? (
                    <span className="text-body-sm font-body text-on-surface-variant flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-outline flex-shrink-0" />
                      <span className="font-medium text-on-surface">{emp.manager_name}</span>
                    </span>
                  ) : (
                    <span className="text-xs font-mono text-outline italic">
                      N/A — Executive
                    </span>
                  )}
                </td>

                {/* Status Column */}
                <td className="py-3.5 px-4">
                  <StatusBadge status={emp.status} variant={STATUS_VARIANT[emp.status] || 'neutral'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer Controls */}
      <div className="p-4 border-t border-outline-variant bg-surface-container-low/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Count Info & Page Size */}
        <div className="flex items-center gap-4">
          <span className="text-body-sm font-mono text-on-surface-variant">
            Showing <strong className="text-on-surface">{startItem}</strong>-
            <strong className="text-on-surface">{endItem}</strong> of{' '}
            <strong className="text-on-surface">{total}</strong> employees
          </span>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-outline">Per page:</span>
            <SelectDropdown
              value={String(page_size)}
              onChange={(val) => onPageSizeChange(Number(val))}
              options={[
                { value: '10', label: '10' },
                { value: '20', label: '20' },
                { value: '50', label: '50' },
              ]}
            />
          </div>
        </div>

        {/* Page Nav Buttons */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="p-1.5 rounded border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="px-3 py-1 text-xs font-mono text-on-surface font-medium">
            Page {page} of {totalPages}
          </span>

          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="p-1.5 rounded border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
