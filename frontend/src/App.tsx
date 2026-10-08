import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { EmployeeDirectoryPage } from '@/pages/EmployeeDirectoryPage'
import { EmployeeProfilePage } from '@/pages/EmployeeProfilePage'
import { OnboardingWorkflowPage } from '@/pages/OnboardingWorkflowPage'
import { OffboardingWorkflowPage } from '@/pages/OffboardingWorkflowPage'
import { AssetInventoryPage } from '@/pages/AssetInventoryPage'
import { AssetDetailPage } from '@/pages/AssetDetailPage'
import { AssetQRScannerPage } from '@/pages/AssetQRScannerPage'
import { MaintenanceTicketsPage } from '@/pages/MaintenanceTicketsPage'
import { UnifiedRequestsPage } from '@/pages/UnifiedRequestsPage'
import { ApprovalsQueuePage } from '@/pages/ApprovalsQueuePage'
import { RoleManagementPage } from '@/pages/RoleManagementPage'
import { UserManagementPage } from '@/pages/UserManagementPage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { AppLayout } from '@/components/layout/AppLayout'
import { authStorage } from '@/utils/authStorage'
import { authService } from '@/services/authService'
import { UserProfile } from '@/types/auth'

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const hasToken = Boolean(authStorage.getAccessToken() || authStorage.getRefreshToken())
  if (!hasToken) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

const PageLayoutWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    authService.getCurrentUser().then(setProfile).catch(() => {})
  }, [])

  return (
    <AppLayout
      currentRole={(profile?.role?.toLowerCase() as any) || 'super_admin'}
      userName={profile?.full_name || 'Admin User'}
      userEmail={profile?.email || 'admin@rosterly.internal'}
    >
      <div className="p-6 max-w-7xl mx-auto w-full">{children}</div>
    </AppLayout>
  )

}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<LoginPage />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <OnboardingWorkflowPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/offboarding"
          element={
            <ProtectedRoute>
              <OffboardingWorkflowPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/assets"
          element={
            <ProtectedRoute>
              <AssetInventoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/assets/:id"
          element={
            <ProtectedRoute>
              <AssetDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/assets/qr"
          element={
            <ProtectedRoute>
              <PageLayoutWrapper>
                <AssetQRScannerPage />
              </PageLayoutWrapper>
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance"
          element={
            <ProtectedRoute>
              <PageLayoutWrapper>
                <MaintenanceTicketsPage />
              </PageLayoutWrapper>
            </ProtectedRoute>
          }
        />
        <Route
          path="/requests"
          element={
            <ProtectedRoute>
              <PageLayoutWrapper>
                <UnifiedRequestsPage />
              </PageLayoutWrapper>
            </ProtectedRoute>
          }
        />
        <Route
          path="/approvals"
          element={
            <ProtectedRoute>
              <PageLayoutWrapper>
                <ApprovalsQueuePage />
              </PageLayoutWrapper>
            </ProtectedRoute>
          }
        />
        <Route
          path="/roles"
          element={
            <ProtectedRoute>
              <PageLayoutWrapper>
                <RoleManagementPage />
              </PageLayoutWrapper>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute>
              <PageLayoutWrapper>
                <UserManagementPage />
              </PageLayoutWrapper>
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <PageLayoutWrapper>
                <AnalyticsPage />
              </PageLayoutWrapper>
            </ProtectedRoute>
          }
        />
        <Route
          path="/employees"
          element={
            <ProtectedRoute>
              <EmployeeDirectoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employees/:id"
          element={
            <ProtectedRoute>
              <EmployeeProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <EmployeeProfilePage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
