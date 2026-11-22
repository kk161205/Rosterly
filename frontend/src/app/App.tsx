import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { AppShell } from '@/shell/AppShell'
import { Skeleton } from '@/ui'

// Each page loads when first opened, so signing in doesn't download the whole app
const page = <T extends Record<string, React.ComponentType>>(load: () => Promise<T>, name: keyof T) =>
  lazy(() => load().then((m) => ({ default: m[name] })))

const HomePage = page(() => import('@/features/home/pages/HomePage'), 'HomePage')
const AssetInventoryPage = page(() => import('@/features/assets/pages/AssetInventoryPage'), 'AssetInventoryPage')
const AssetDetailPage = page(() => import('@/features/assets/pages/AssetDetailPage'), 'AssetDetailPage')
const AssetQRScannerPage = page(() => import('@/features/assets/pages/AssetQRScannerPage'), 'AssetQRScannerPage')
const MaintenanceTicketsPage = page(() => import('@/features/assets/pages/MaintenanceTicketsPage'), 'MaintenanceTicketsPage')
const UnifiedRequestsPage = page(() => import('@/features/requests/pages/UnifiedRequestsPage'), 'UnifiedRequestsPage')
const EmployeeDirectoryPage = page(() => import('@/features/employees/pages/EmployeeDirectoryPage'), 'EmployeeDirectoryPage')
const EmployeeProfilePage = page(() => import('@/features/employees/pages/EmployeeProfilePage'), 'EmployeeProfilePage')
const OnboardingWorkflowPage = page(() => import('@/features/lifecycle/pages/OnboardingWorkflowPage'), 'OnboardingWorkflowPage')
const OffboardingWorkflowPage = page(() => import('@/features/lifecycle/pages/OffboardingWorkflowPage'), 'OffboardingWorkflowPage')
const AnalyticsPage = page(() => import('@/features/analytics/pages/AnalyticsPage'), 'AnalyticsPage')
const UserManagementPage = page(() => import('@/features/admin/pages/UserManagementPage'), 'UserManagementPage')
const RoleManagementPage = page(() => import('@/features/admin/pages/RoleManagementPage'), 'RoleManagementPage')
const NotificationCenterPage = page(() => import('@/features/notifications/pages/NotificationCenterPage'), 'NotificationCenterPage')
const AuditLogViewerPage = page(() => import('@/features/audit/pages/AuditLogViewerPage'), 'AuditLogViewerPage')
const ApprovalChainConfigPage = page(() => import('@/features/approvalChains/pages/ApprovalChainConfigPage'), 'ApprovalChainConfigPage')
const SoftwareLicensesPage = page(() => import('@/features/licenses/pages/SoftwareLicensesPage'), 'SoftwareLicensesPage')
const LeaveAttendancePage = page(() => import('@/features/leave/pages/LeaveAttendancePage'), 'LeaveAttendancePage')
const DepartmentsPage = page(() => import('@/features/employees/pages/DepartmentsPage'), 'DepartmentsPage')
const CompanySettingsPage = page(() => import('@/features/admin/pages/CompanySettingsPage'), 'CompanySettingsPage')
const AssistantSettingsPage = page(() => import('@/features/preferences/AssistantSettingsPage'), 'AssistantSettingsPage')

const PageLoading = () => (
  <div className="flex flex-col gap-4" aria-label="Loading page">
    <Skeleton className="h-10 w-1/3" />
    <Skeleton className="h-4 w-1/2" />
    <Skeleton className="h-64 w-full" />
  </div>
)

const withSuspense = (element: React.ReactNode) => <Suspense fallback={<PageLoading />}>{element}</Suspense>

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<LoginPage />} />

        {/* Every signed-in page renders inside the shell; it redirects to /login without a session */}
        <Route element={<AppShell />}>
          <Route path="/home" element={withSuspense(<HomePage />)} />
          <Route path="/assets" element={withSuspense(<AssetInventoryPage />)} />
          <Route path="/assets/qr" element={withSuspense(<AssetQRScannerPage />)} />
          <Route path="/assets/:id" element={withSuspense(<AssetDetailPage />)} />
          <Route path="/maintenance" element={withSuspense(<MaintenanceTicketsPage />)} />
          <Route path="/requests" element={withSuspense(<UnifiedRequestsPage />)} />
          <Route path="/employees" element={withSuspense(<EmployeeDirectoryPage />)} />
          <Route path="/employees/:id" element={withSuspense(<EmployeeProfilePage />)} />
          <Route path="/profile" element={withSuspense(<EmployeeProfilePage />)} />
          <Route path="/onboarding" element={withSuspense(<OnboardingWorkflowPage />)} />
          <Route path="/offboarding" element={withSuspense(<OffboardingWorkflowPage />)} />
          <Route path="/analytics" element={withSuspense(<AnalyticsPage />)} />
          <Route path="/users" element={withSuspense(<UserManagementPage />)} />
          <Route path="/roles" element={withSuspense(<RoleManagementPage />)} />
          <Route path="/notifications" element={withSuspense(<NotificationCenterPage />)} />
          <Route path="/audit-logs" element={withSuspense(<AuditLogViewerPage />)} />
          <Route path="/approval-chains" element={withSuspense(<ApprovalChainConfigPage />)} />
          <Route path="/licenses" element={withSuspense(<SoftwareLicensesPage />)} />
          <Route path="/leave" element={withSuspense(<LeaveAttendancePage />)} />
          <Route path="/departments" element={withSuspense(<DepartmentsPage />)} />
          <Route path="/settings" element={withSuspense(<CompanySettingsPage />)} />
          <Route path="/assistant" element={withSuspense(<AssistantSettingsPage />)} />
        </Route>

        {/* Home holds the numbers and the Inbox; older links land there */}
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/inbox" element={<Navigate to="/home" replace />} />
        <Route path="/dashboard" element={<Navigate to="/home" replace />} />
        <Route path="/approvals" element={<Navigate to="/home" replace />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
