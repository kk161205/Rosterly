import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  User,
  FileText,
  Laptop,
  Layers,
  AlertCircle,
  Shield,
  ArrowLeft,
  RefreshCw,
  CheckCircle,
} from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProfileHeaderCard } from '@/components/profile/ProfileHeaderCard'
import { ProfileOverviewTab } from '@/components/profile/ProfileOverviewTab'
import { DocumentVaultTab } from '@/components/profile/DocumentVaultTab'
import { AssignedAssetsTab } from '@/components/profile/AssignedAssetsTab'
import { LifecycleTab } from '@/components/profile/LifecycleTab'
import { EditProfileModal } from '@/components/profile/EditProfileModal'
import { StartOffboardingModal } from '@/components/profile/StartOffboardingModal'
import { profileService } from '@/services/profileService'
import { authStorage } from '@/utils/authStorage'
import { UserRole } from '@/types/dashboard'
import {
  EmployeeProfile,
  DocumentItem,
  AssignedAssetsResponse,
  LifecycleChecklist,
  ProfileUpdatePayload,
  DocumentCategory,
} from '@/types/profile'

type ActiveTab = 'overview' | 'documents' | 'assets' | 'lifecycle'

export const EmployeeProfilePage: React.FC = () => {
  const { id = 'emp-101' } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // Dynamic user role state (stored in authStorage or default to employee)
  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    return authStorage.getUserRole() || 'employee'
  })

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')
  const [profile, setProfile] = useState<EmployeeProfile | null>(null)
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [assets, setAssets] = useState<AssignedAssetsResponse>({ current: [], history: [] })
  const [lifecycle, setLifecycle] = useState<LifecycleChecklist | null>(null)

  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isOffboardModalOpen, setIsOffboardModalOpen] = useState(false)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 4000)
  }

  const loadData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [profData, docsData, assetsData, lifeData] = await Promise.all([
        profileService.getEmployeeProfile(id),
        profileService.getEmployeeDocuments(id),
        profileService.getEmployeeAssets(id),
        profileService.getEmployeeLifecycle(id),
      ])
      setProfile(profData)
      setDocuments(docsData)
      setAssets(assetsData)
      setLifecycle(lifeData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load employee profile records.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [id])

  const handleRoleChange = (newRole: UserRole) => {
    setCurrentRole(newRole)
    authStorage.setUserRole(newRole)
    showToast(`Role switched to ${newRole.toUpperCase()} mode`)
  }

  const isSelf = profile ? profile.id === 'emp-101' : false

  const handleSaveProfile = async (updates: ProfileUpdatePayload) => {
    if (!profile) return
    const updated = await profileService.updateEmployeeProfile(profile.id, updates)
    setProfile(updated)
    showToast('Employee profile updated successfully')
  }

  const handleStartOffboarding = async (reason: string, exitDate: string) => {
    if (!profile) return
    const updated = await profileService.updateEmployeeProfile(profile.id, {
      status: 'offboarding',
    })
    setProfile(updated)

    // Update lifecycle to offboarding mode
    setLifecycle({
      id: `chk-off-${Date.now()}`,
      type: 'offboarding',
      status: 'active',
      progress_percentage: 15,
      total_items: 5,
      completed_items: 1,
      items: [
        {
          id: 'off-1',
          title: 'Initiate Offboarding Record & Security Alert',
          category: 'hr',
          owner_role: 'hr_admin',
          status: 'completed',
          completed_at: new Date().toISOString(),
        },
        {
          id: 'off-2',
          title: 'Laptop & Hardware Reclamation',
          category: 'it',
          owner_role: 'it_admin',
          status: 'pending',
          due_date: exitDate,
        },
        {
          id: 'off-3',
          title: 'Building Pass & Physical Keycard Revocation',
          category: 'facilities',
          owner_role: 'facilities',
          status: 'pending',
          due_date: exitDate,
        },
        {
          id: 'off-4',
          title: 'System Single Sign-On (SSO) Session Revocation',
          category: 'it',
          owner_role: 'it_admin',
          status: 'pending',
          due_date: exitDate,
        },
        {
          id: 'off-5',
          title: 'Final Payroll & Severance Clearance',
          category: 'hr',
          owner_role: 'hr_admin',
          status: 'pending',
          due_date: exitDate,
        },
      ],
    })

    showToast(`Offboarding process initiated (Exit Date: ${exitDate})`)
  }

  const handleUploadDocument = async (
    file: File,
    docType: DocumentCategory,
    isConfidential: boolean,
    onProgress: (pct: number) => void
  ) => {
    if (!profile) return
    const newDoc = await profileService.uploadEmployeeDocument(
      profile.id,
      file,
      docType,
      isConfidential,
      onProgress
    )
    setDocuments((prev) => [newDoc, ...prev])
    showToast(`Document "${file.name}" uploaded to vault`)
  }

  const handleDeleteDocument = async (docId: string) => {
    if (!profile) return
    await profileService.deleteEmployeeDocument(profile.id, docId)
    setDocuments((prev) => prev.filter((d) => d.id !== docId))
    showToast('Document removed from vault')
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'documents', label: 'Document Vault', icon: FileText, badge: documents.length },
    { id: 'assets', label: 'Assigned Hardware & Licenses', icon: Laptop, badge: assets.current.length },
    { id: 'lifecycle', label: 'Lifecycle & Checklists', icon: Layers },
  ]

  return (
    <AppLayout currentRole={currentRole}>
      <div className="space-y-6 pb-12">
        {/* Role Switcher Toolbar */}
        <div className="bg-surface-container-low border border-outline-variant/60 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-body">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-1 rounded text-outline hover:text-on-surface hover:bg-surface-container transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <Shield className="w-4 h-4 text-accent" />
            <span className="font-semibold text-on-surface">Role-Based Access Preview:</span>
            <span className="text-on-surface-variant font-mono">Current: {currentRole}</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {(['employee', 'manager', 'hr_admin', 'it_admin', 'super_admin', 'auditor'] as UserRole[]).map(
              (r) => (
                <button
                  key={r}
                  onClick={() => handleRoleChange(r)}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono capitalize transition-all ${
                    currentRole === r
                      ? 'bg-accent text-on-accent font-semibold shadow-xs'
                      : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {r.replace('_', ' ')}
                </button>
              )
            )}
          </div>
        </div>

        {/* Toast Alert Banner */}
        {toastMsg && (
          <div className="p-3 bg-tertiary-fixed text-on-tertiary-fixed-variant border border-tertiary-container/40 rounded-md text-xs font-body flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-tertiary" />
              <span>{toastMsg}</span>
            </div>
            <button onClick={() => setToastMsg(null)} className="text-tertiary font-bold text-xs">
              ✕
            </button>
          </div>
        )}

        {/* Error Boundary Banner */}
        {error && (
          <div className="p-4 bg-error-container/40 border border-error/40 rounded-lg text-xs text-on-error-container flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-error flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={loadData}
              className="inline-flex items-center gap-1 px-3 py-1 bg-surface-container-lowest border border-outline-variant rounded text-xs font-medium"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        )}

        {/* Profile Summary Header Card */}
        {profile && (
          <ProfileHeaderCard
            profile={profile}
            currentUserRole={currentRole}
            isSelf={isSelf}
            onEditClick={() => setIsEditModalOpen(true)}
            onOffboardClick={() => setIsOffboardModalOpen(true)}
            isLoading={isLoading}
          />
        )}

        {/* Navigation Tabs Bar */}
        <div className="border-b border-outline-variant">
          <nav className="flex space-x-6 overflow-x-auto" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as ActiveTab)}
                  className={`py-3 px-1 border-b-2 font-headline font-semibold text-xs flex items-center gap-2 whitespace-nowrap transition-colors ${
                    isActive
                      ? 'border-accent text-accent'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-accent' : 'text-outline'}`} />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                        isActive
                          ? 'bg-accent-container text-on-accent-container font-bold'
                          : 'bg-surface-container text-outline'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Tab Content Panels */}
        <div className="pt-2">
          {activeTab === 'overview' && profile && (
            <ProfileOverviewTab
              profile={profile}
              currentUserRole={currentRole}
              isSelf={isSelf}
              onEditClick={() => setIsEditModalOpen(true)}
            />
          )}

          {activeTab === 'documents' && (
            <DocumentVaultTab
              documents={documents}
              currentUserRole={currentRole}
              isSelf={isSelf}
              onUploadDocument={handleUploadDocument}
              onDeleteDocument={handleDeleteDocument}
              isLoading={isLoading}
            />
          )}

          {activeTab === 'assets' && (
            <AssignedAssetsTab assetsData={assets} isLoading={isLoading} />
          )}

          {activeTab === 'lifecycle' && (
            <LifecycleTab lifecycleData={lifecycle} isLoading={isLoading} />
          )}
        </div>
      </div>

      {/* Edit Profile Modal */}
      {profile && (
        <EditProfileModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          profile={profile}
          currentUserRole={currentRole}
          isSelf={isSelf}
          onSave={handleSaveProfile}
        />
      )}

      {/* Offboarding Confirmation Modal */}
      {profile && (
        <StartOffboardingModal
          isOpen={isOffboardModalOpen}
          onClose={() => setIsOffboardModalOpen(false)}
          profile={profile}
          onConfirm={handleStartOffboarding}
        />
      )}
    </AppLayout>
  )
}
