import React from 'react'
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Edit3,
  UserX,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import { EmployeeProfile, EmploymentStatus } from '@/types/profile'
import { UserRole } from '@/types/dashboard'

interface ProfileHeaderCardProps {
  profile: EmployeeProfile
  currentUserRole: UserRole
  isSelf: boolean
  onEditClick: () => void
  onOffboardClick: () => void
  isLoading?: boolean
}

export const ProfileHeaderCard: React.FC<ProfileHeaderCardProps> = ({
  profile,
  currentUserRole,
  isSelf,
  onEditClick,
  onOffboardClick,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg p-6 animate-pulse shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-full bg-surface-container-high" />
            <div className="space-y-2">
              <div className="w-48 h-6 bg-surface-container-high rounded" />
              <div className="w-32 h-4 bg-surface-container-low rounded" />
              <div className="flex gap-2 pt-1">
                <div className="w-20 h-5 bg-surface-container-low rounded-full" />
                <div className="w-24 h-5 bg-surface-container-low rounded-full" />
              </div>
            </div>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <div className="w-28 h-9 bg-surface-container-high rounded-md" />
            <div className="w-36 h-9 bg-surface-container-high rounded-md" />
          </div>
        </div>
      </div>
    )
  }

  // Capability calculations based on role
  const canEdit = isSelf || ['hr_admin', 'super_admin'].includes(currentUserRole)
  const canOffboard = ['hr_admin', 'super_admin'].includes(currentUserRole) && profile.status !== 'offboarding' && profile.status !== 'terminated'

  const getStatusBadge = (status: EmploymentStatus) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-tertiary-fixed text-on-tertiary-fixed-variant border border-tertiary-container/30">
            <CheckCircle2 className="w-3.5 h-3.5 text-tertiary" />
            Active
          </span>
        )
      case 'onboarding':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-accent-container text-on-accent-container border border-accent/30">
            <Clock className="w-3.5 h-3.5 text-accent" />
            Onboarding
          </span>
        )
      case 'offboarding':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-amber-100 text-amber-900 border border-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Offboarding In Progress
          </span>
        )
      case 'terminated':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-error-container text-on-error-container border border-error/20">
            <UserX className="w-3.5 h-3.5 text-error" />
            Terminated
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-surface-container-high text-on-surface-variant">
            {status}
          </span>
        )
    }
  }

  return (
    <div className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg p-6 shadow-sm transition-all">
      {/* Offboarding Banner Alert if active offboarding */}
      {profile.status === 'offboarding' && (
        <div className="mb-6 px-4 py-3 bg-amber-50 border border-amber-200 rounded-md flex items-center justify-between text-amber-900 text-xs font-body">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>
              <strong>Offboarding Active:</strong> Asset reclamation and account revocation workflows are currently in progress for this employee.
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        {/* Avatar & Main Information */}
        <div className="flex items-start gap-5">
          <div className="relative">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name}
                className="w-20 h-20 rounded-full object-cover border-2 border-outline-variant shadow-sm"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-primary-container text-on-primary-container font-headline font-bold text-2xl flex items-center justify-center border-2 border-primary/20">
                {profile.full_name.charAt(0)}
              </div>
            )}
            <span className="absolute -bottom-1 -right-1 bg-surface-container-lowest rounded-full p-0.5">
              <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 block border-2 border-surface-container-lowest" />
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl md:text-2xl font-headline font-bold text-on-surface">
                {profile.full_name}
              </h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono text-outline bg-surface-container border border-outline-variant/60">
                {profile.employee_code}
              </span>
              {getStatusBadge(profile.status)}
            </div>

            <p className="text-xs md:text-sm font-body text-on-surface-variant flex items-center gap-2">
              <span className="font-medium text-on-surface">{profile.designation}</span>
              <span className="text-outline">•</span>
              <span className="inline-flex items-center gap-1 text-tertiary font-medium">
                <Building2 className="w-3.5 h-3.5" />
                {profile.department}
              </span>
            </p>

            {/* Quick Contact & Metadata */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-body text-on-surface-variant pt-1">
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-outline" />
                {profile.email}
              </span>
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-outline" />
                {profile.phone}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-outline" />
                {profile.location}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-outline" />
                Joined {profile.joining_date ? new Date(profile.joining_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Header Action Toolbar */}
        <div className="flex items-center gap-3 self-start lg:self-center flex-wrap">
          {canEdit && (
            <button
              onClick={onEditClick}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-sm text-xs font-medium text-accent border border-accent/40 bg-accent-container/30 hover:bg-accent-container hover:text-on-accent-container transition-colors shadow-xs"
            >
              <Edit3 className="w-4 h-4" />
              Edit Profile
            </button>
          )}

          {canOffboard && (
            <button
              onClick={onOffboardClick}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-sm text-xs font-medium text-error bg-error-container/40 border border-error/30 hover:bg-error-container hover:text-on-error-container transition-colors shadow-xs"
            >
              <UserX className="w-4 h-4" />
              Start Offboarding
            </button>
          )}

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-container text-on-surface-variant text-[11px] font-mono border border-outline-variant/60">
            <Shield className="w-3.5 h-3.5 text-outline" />
            <span>Role: {profile.role}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
