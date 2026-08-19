import React, { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { EmployeeFilterBar } from '@/components/employee/EmployeeFilterBar'
import { EmployeeListView } from '@/components/employee/EmployeeListView'
import { EmployeeOrgChartView } from '@/components/employee/EmployeeOrgChartView'
import { EmployeeProfileDrawer } from '@/components/employee/EmployeeProfileDrawer'
import {
  EmployeeTableSkeleton,
  EmployeeOrgChartSkeleton,
  EmployeeEmptyState,
} from '@/components/employee/EmployeeSkeletons'
import { employeeService } from '@/services/employeeService'
import { authService } from '@/services/authService'
import {
  Employee,
  Department,
  EmployeeQueryFilters,
  EmployeePaginatedResponse,
  EmployeeFiltersMeta,
  OrgChartNode,
} from '@/types/employee'
import { UserRole } from '@/types/dashboard'
import { UserProfile } from '@/types/auth'
import { authStorage } from '@/utils/authStorage'
import { AlertCircle, RefreshCw } from 'lucide-react'

const DEFAULT_FILTERS: EmployeeQueryFilters = {
  search: '',
  department_id: 'all',
  status: 'all',
  role: 'all',
  view: 'list',
  page: 1,
  page_size: 10,
}

export const EmployeeDirectoryPage: React.FC = () => {
  const cachedUser = authStorage.getUser()
  const [currentRole, setCurrentRole] = useState<UserRole>((cachedUser?.role as UserRole) || 'employee')
  const [userProfile, setUserProfile] = useState<UserProfile | null>(cachedUser)
  const [filters, setFilters] = useState<EmployeeQueryFilters>(DEFAULT_FILTERS)
  const [departments, setDepartments] = useState<Department[]>([])
  const [filterMeta, setFilterMeta] = useState<EmployeeFiltersMeta>({ departments: [], statuses: [], roles: [] })
  const [employeeData, setEmployeeData] = useState<EmployeePaginatedResponse>({
    items: [],
    total: 0,
    page: 1,
    page_size: 10,
  })
  const [orgTree, setOrgTree] = useState<OrgChartNode[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)

  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const queryParams: EmployeeQueryFilters = {
        ...filters,
        page_size: filters.view === 'tree' ? 1000 : filters.page_size,
      }

      const [profileResult, deptResult, filterMetaResult, empResult] = await Promise.allSettled([
        authService.getCurrentUser(),
        employeeService.getDepartments(),
        employeeService.getFilterOptions(),
        employeeService.getEmployees(queryParams),
      ])

      if (profileResult.status === 'fulfilled') {
        setUserProfile(profileResult.value)
        authStorage.setUser(profileResult.value)
        if (profileResult.value.role) {
          setCurrentRole(profileResult.value.role as UserRole)
        }
      }

      if (deptResult.status === 'fulfilled') {
        setDepartments(deptResult.value)
      }

      if (filterMetaResult.status === 'fulfilled') {
        setFilterMeta(filterMetaResult.value)
      }

      if (empResult.status === 'fulfilled') {
        setEmployeeData(empResult.value)
        const tree = employeeService.buildOrgTree(empResult.value.items)
        setOrgTree(tree)
      } else {
        throw empResult.reason
      }
    } catch {
      setError('Unable to load employee directory records from server. Please verify session or network.')
    } finally {
      setIsLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleFilterChange = (updated: Partial<EmployeeQueryFilters>) => {
    setFilters((prev) => ({ ...prev, ...updated, page: 1 }))
  }

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS)
  }

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }))
  }

  const handlePageSizeChange = (newPageSize: number) => {
    setFilters((prev) => ({ ...prev, page_size: newPageSize, page: 1 }))
  }

  const handleViewModeChange = (mode: 'list' | 'tree') => {
    setFilters((prev) => ({ ...prev, view: mode }))
  }

  const handleSelectEmployeeById = (id: string) => {
    const found = employeeData.items.find((e) => e.id === id)
    if (found) {
      setSelectedEmployee(found)
    }
  }

  const handleEmployeeUpdated = (updated: Employee) => {
    setSelectedEmployee(updated)
    loadData()
  }

  const handleEmployeeDeleted = () => {
    setSelectedEmployee(null)
    loadData()
  }

  return (
    <AppLayout
      currentRole={currentRole}
      baseRole={userProfile?.role as UserRole | undefined}
      onRoleChange={(r) => setCurrentRole(r)}
      userName={userProfile?.full_name}
      userEmail={userProfile?.email || ''}
      isLoading={isLoading && employeeData.items.length === 0}
    >
      <div className="space-y-6">
        {/* Filter Bar Controls */}
        <EmployeeFilterBar
          filters={filters}
          departments={departments}
          availableDepartments={filterMeta.departments}
          availableStatuses={filterMeta.statuses}
          availableRoles={filterMeta.roles}
          onFilterChange={handleFilterChange}
          onResetFilters={handleResetFilters}
          viewMode={filters.view || 'list'}
          onViewModeChange={handleViewModeChange}
          totalCount={employeeData.total}
        />

        {/* Error Banner with Retry per standards */}
        {error && (
          <div className="p-4 rounded-md bg-error-container text-on-error-container border border-error/20 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-error flex-shrink-0" />
              <span className="text-body-sm font-sans font-medium">{error}</span>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="px-3 py-1.5 text-xs font-mono font-semibold rounded bg-error text-on-error hover:bg-error/90 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Load</span>
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {isLoading ? (
          filters.view === 'tree' ? (
            <EmployeeOrgChartSkeleton />
          ) : (
            <EmployeeTableSkeleton />
          )
        ) : employeeData.items.length === 0 ? (
          /* Empty State */
          <EmployeeEmptyState onResetFilters={handleResetFilters} />
        ) : filters.view === 'tree' ? (
          /* Org Chart Tree View */
          <EmployeeOrgChartView
            nodes={orgTree}
            onSelectEmployeeById={handleSelectEmployeeById}
            rawEmployees={employeeData.items}
          />
        ) : (
          /* List View Table */
          <EmployeeListView
            data={employeeData}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            onSelectEmployee={(emp) => setSelectedEmployee(emp)}
          />
        )}

        {/* Slide-over Profile Drawer */}
        <EmployeeProfileDrawer
          employee={selectedEmployee}
          currentUserRole={currentRole || userProfile?.role || 'employee'}
          departments={departments}
          onClose={() => setSelectedEmployee(null)}
          onEmployeeUpdated={handleEmployeeUpdated}
          onEmployeeDeleted={handleEmployeeDeleted}
        />
      </div>
    </AppLayout>
  )
}
