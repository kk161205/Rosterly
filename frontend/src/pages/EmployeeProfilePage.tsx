import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  User,
  FileText,
  Laptop,
  Layers,
  AlertCircle,
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
  const { id: routeId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const cachedUser = authStorage.getUser()

  // The `/profile` route (viewing your own profile) carries no :id param at all —
  // resolve it to the real authenticated user's id rather than a placeholder.
  const id = routeId || cachedUser?.id

  const currentRole: UserRole = authStorage.getUserRole() || 'employee'

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

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 4000)
  }

  const loadData = async () => {
    if (!id) {
      setError('No employee selected. Please sign in again.')
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      // A caller with partial access (e.g. a manager viewing a direct report,
      // who §5.4 correctly denies the documents endpoint to) must still see
      // the tabs they ARE allowed — one denied tab shouldn't blank the page.
      const [profResult, docsResult, assetsResult, lifeResult] = await Promise.allSettled([
        profileService.getEmployeeProfile(id),
        profileService.getEmployeeDocuments(id),
        profileService.getEmployeeAssets(id),
        profileService.getEmployeeLifecycle(id),
      ])

      if (profResult.status === 'fulfilled') {
        setProfile(profResult.value)
      } else {
        throw profResult.reason
      }

      setDocuments(docsResult.status === 'fulfilled' ? docsResult.value : [])
      setAssets(assetsResult.status === 'fulfilled' ? assetsResult.value : { current: [], history: [] })
      setLifecycle(lifeResult.status === 'fulfilled' ? lifeResult.value : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load employee profile records.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [id])

  const isSelf = !!(profile && cachedUser && profile.id === cachedUser.id)

  const handleSaveProfile = async (updates: ProfileUpdatePayload) => {
    if (!profile) return
    const updated = await profileService.updateEmployeeProfile(profile.id, updates)
    setProfile(updated)
    showToast('Employee profile updated successfully')
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
    <AppLayout currentRole={currentRole} userName={profile?.full_name} userEmail={profile?.email}>
      <div className="space-y-6 pb-12">
        {/* Navigation Breadcrumb / Back Link */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/employees')}
            className="inline-flex items-center gap-2 text-xs font-mono font-medium text-outline hover:text-on-surface transition-colors cursor-pointer py-1"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Employee Directory</span>
          </button>
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
            onOffboardClick={() => navigate(`/offboarding?start=${profile.id}`)}
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

    </AppLayout>
  )
}
