import React from 'react'
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  PhoneCall,
  GitBranch,
  Edit2,
  ShieldAlert,
} from 'lucide-react'
import { EmployeeProfile } from '@/types/profile'
import { UserRole } from '@/types/dashboard'
import { Button } from '@/components/common/CommonUI'

interface ProfileOverviewTabProps {
  profile: EmployeeProfile
  currentUserRole: UserRole
  isSelf: boolean
  onEditClick: () => void
}

export const ProfileOverviewTab: React.FC<ProfileOverviewTabProps> = ({
  profile,
  currentUserRole,
  isSelf,
  onEditClick,
}) => {
  const canEdit = isSelf || ['hr_admin', 'super_admin'].includes(currentUserRole)

  return (
    <div className="space-y-6">
      {/* 2-Column Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols wide on desktop): Contact Details & Bio */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal & Contact Details Card */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-6 shadow-sm relative">
            <div className="flex items-center justify-between border-b border-outline-variant pb-4 mb-4">
              <h2 className="text-sm font-headline font-semibold text-on-surface flex items-center gap-2">
                <User className="w-4 h-4 text-accent" />
                Personal & Contact Details
              </h2>
              {canEdit && (
                <Button
                  onClick={onEditClick}
                  variant="ghost"
                  size="sm"
                  icon={<Edit2 className="w-3.5 h-3.5" />}
                  className="text-accent hover:text-accent/80"
                >
                  Edit
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-body">
              <div className="space-y-1">
                <span className="text-outline font-medium block">Full Legal Name</span>
                <span className="text-on-surface font-semibold">{profile.full_name}</span>
              </div>

              <div className="space-y-1">
                <span className="text-outline font-medium block">Employee Code</span>
                <span className="font-mono text-on-surface">{profile.employee_code}</span>
              </div>

              <div className="space-y-1">
                <span className="text-outline font-medium block">Work Email</span>
                <span className="text-on-surface flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-outline" />
                  {profile.email}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-outline font-medium block">Mobile Phone</span>
                <span className="text-on-surface flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-outline" />
                  {profile.phone}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-outline font-medium block">Work Location</span>
                <span className="text-on-surface flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-outline" />
                  {profile.location}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-outline font-medium block">Joining Date</span>
                <span className="text-on-surface flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-outline" />
                  {profile.joining_date
                    ? new Date(profile.joining_date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : 'N/A'}
                </span>
              </div>
            </div>

            {profile.address && (
              <div className="mt-4 pt-4 border-t border-outline-variant/60">
                <span className="text-outline font-medium text-xs block mb-1">Residential Address</span>
                <p className="text-xs font-body text-on-surface-variant leading-relaxed">
                  {profile.address}
                </p>
              </div>
            )}

            {profile.bio && (
              <div className="mt-4 pt-4 border-t border-outline-variant/60">
                <span className="text-outline font-medium text-xs block mb-1">Professional Bio</span>
                <p className="text-xs font-body text-on-surface-variant leading-relaxed">
                  {profile.bio}
                </p>
              </div>
            )}
          </div>

          {/* Reporting Hierarchy Tree */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-outline-variant pb-4 mb-4">
              <h2 className="text-sm font-headline font-semibold text-on-surface flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-tertiary" />
                Reporting Hierarchy Tree
              </h2>
              <span className="text-[11px] font-mono text-outline">Org Structure</span>
            </div>

            <div className="space-y-4">
              {/* Reports To Section */}
              <div>
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-outline block mb-2">
                  Reports To (Manager)
                </span>
                {profile.manager ? (
                  <div className="p-3 bg-surface-container-low border border-outline-variant rounded-md flex items-center justify-between hover:border-accent/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary-container text-on-primary-container font-headline font-bold text-xs flex items-center justify-center">
                        {profile.manager.full_name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-on-surface">
                          {profile.manager.full_name}
                        </h4>
                        <p className="text-[11px] text-on-surface-variant">
                          {profile.manager.designation} • {profile.manager.department}
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-tertiary-fixed text-on-tertiary-fixed-variant">
                      Direct Manager
                    </span>
                  </div>
                ) : (
                  <p className="text-xs font-body text-outline italic">No manager assigned</p>
                )}
              </div>

              {/* Direct Reports Section */}
              <div>
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-outline block mb-2">
                  Direct Reports ({profile.direct_reports?.length || 0})
                </span>
                {profile.direct_reports && profile.direct_reports.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {profile.direct_reports.map((report) => (
                      <div
                        key={report.id}
                        className="p-3 bg-surface-container-low border border-outline-variant rounded-md flex items-center gap-3 hover:border-accent/40 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container font-headline font-bold text-xs flex items-center justify-center">
                          {report.full_name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold text-on-surface truncate">
                            {report.full_name}
                          </h4>
                          <p className="text-[11px] text-on-surface-variant truncate">
                            {report.designation}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 bg-surface-container-low/40 rounded border border-dashed border-outline-variant/60 text-xs text-outline italic">
                    No direct reports assigned to this employee.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (1 Col wide on desktop): Emergency Contact Card & Department Scope */}
        <div className="space-y-6">
          {/* Emergency Contact Card */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-outline-variant pb-3 mb-4">
              <h3 className="text-sm font-headline font-semibold text-on-surface flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-error" />
                Emergency Contact
              </h3>
              {canEdit && (
                <button
                  onClick={onEditClick}
                  className="text-xs text-accent font-medium hover:underline"
                >
                  Edit
                </button>
              )}
            </div>

            {profile.emergency_contact ? (
              <div className="space-y-3 text-xs font-body">
                <div>
                  <span className="text-outline block text-[11px]">Primary Contact</span>
                  <span className="font-semibold text-on-surface">
                    {profile.emergency_contact.name}
                  </span>
                </div>
                <div>
                  <span className="text-outline block text-[11px]">Relationship</span>
                  <span className="text-on-surface bg-surface-container px-2 py-0.5 rounded text-[11px]">
                    {profile.emergency_contact.relationship}
                  </span>
                </div>
                <div>
                  <span className="text-outline block text-[11px]">Emergency Phone</span>
                  <span className="font-mono text-on-surface">
                    {profile.emergency_contact.phone}
                  </span>
                </div>
                {profile.emergency_contact.email && (
                  <div>
                    <span className="text-outline block text-[11px]">Contact Email</span>
                    <span className="text-on-surface truncate block">
                      {profile.emergency_contact.email}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-error-container/20 border border-dashed border-error/30 rounded text-xs text-on-surface-variant flex flex-col items-center justify-center text-center gap-2">
                <ShieldAlert className="w-6 h-6 text-error" />
                <span>No emergency contact details on file.</span>
              </div>
            )}
          </div>

          {/* Quick Department & Team Info */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-6 shadow-sm space-y-3">
            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-outline">
              Department & Organization
            </h3>
            <div className="space-y-2 text-xs font-body">
              <div className="flex justify-between py-1 border-b border-outline-variant/40">
                <span className="text-outline">Department</span>
                <span className="font-medium text-on-surface">{profile.department}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-outline-variant/40">
                <span className="text-outline">Role Designation</span>
                <span className="font-medium text-on-surface">{profile.role}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-outline">Status</span>
                <span className="font-mono text-tertiary capitalize">{profile.status}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
