import React from 'react'
import {
  X,
  Mail,
  Phone,
  Calendar,
  Building,
  UserCheck,
  MapPin,
  ExternalLink,
  Shield,
} from 'lucide-react'
import { Employee } from '@/types/employee'

interface EmployeeProfileDrawerProps {
  employee: Employee | null
  onClose: () => void
}

export const EmployeeProfileDrawer: React.FC<EmployeeProfileDrawerProps> = ({
  employee,
  onClose,
}) => {
  if (!employee) return null

  const getStatusBadge = (status: Employee['status']) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-label-caps font-mono font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active Employee
          </span>
        )
      case 'onboarding':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-label-caps font-mono font-medium bg-accent-container/40 text-on-accent-container border border-accent/20">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Onboarding In-Progress
          </span>
        )
      case 'inactive':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-label-caps font-mono font-medium bg-surface-container text-on-surface-variant border border-outline-variant">
            <span className="w-1.5 h-1.5 rounded-full bg-outline" />
            Inactive / Departed
          </span>
        )
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end animate-fade-in">
      {/* Click Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Slide-over Drawer Panel */}
      <div className="relative w-full max-w-md bg-surface-container-lowest h-full shadow-2xl border-l border-outline-variant flex flex-col justify-between z-10 transform transition-transform duration-300 ease-in-out">
        {/* Drawer Header */}
        <div className="p-6 border-b border-outline-variant bg-surface-container-low/40">
          <div className="flex items-center justify-between mb-4">
            <span className="text-label-caps font-mono text-on-surface-variant uppercase tracking-wider">
              Employee Profile Drawer
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Employee Avatar & Core Info */}
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-sans font-bold text-xl shadow-sm flex-shrink-0">
              {employee.avatar_url ? (
                <img
                  src={employee.avatar_url}
                  alt={employee.full_name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                employee.full_name.substring(0, 2).toUpperCase()
              )}
            </div>

            <div>
              <h2 className="text-headline-lg-mobile font-sans font-semibold text-on-surface">
                {employee.full_name}
              </h2>
              <p className="text-body-md font-body text-on-surface-variant mt-0.5">
                {employee.designation}
              </p>
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                {getStatusBadge(employee.status)}
              </div>
            </div>
          </div>
        </div>

        {/* Drawer Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Department & Role Section */}
          <div className="bg-surface-container-low p-4 rounded-md border border-outline-variant space-y-3">
            <div className="flex items-center justify-between text-body-sm">
              <span className="font-mono text-outline flex items-center gap-1.5">
                <Building className="w-4 h-4 text-tertiary" />
                Department
              </span>
              <span className="font-sans font-semibold text-on-surface">
                {employee.department_name}
              </span>
            </div>

            <div className="flex items-center justify-between text-body-sm">
              <span className="font-mono text-outline flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-accent" />
                System Role
              </span>
              <span className="font-mono text-xs font-semibold uppercase px-2 py-0.5 rounded bg-surface-container text-primary">
                {employee.role.replace('_', ' ')}
              </span>
            </div>
          </div>

          {/* Contact Details */}
          <div>
            <h3 className="text-title-md font-sans font-semibold text-on-surface mb-3">
              Contact Details
            </h3>
            <div className="space-y-3 bg-surface-container-lowest border border-outline-variant/80 rounded-md p-4">
              <div className="flex items-center gap-3 text-body-sm">
                <Mail className="w-4 h-4 text-accent flex-shrink-0" />
                <a
                  href={`mailto:${employee.email}`}
                  className="text-on-surface hover:text-accent hover:underline font-body truncate"
                >
                  {employee.email}
                </a>
              </div>

              <div className="flex items-center gap-3 text-body-sm">
                <Phone className="w-4 h-4 text-outline flex-shrink-0" />
                <span className="text-on-surface font-body">
                  {employee.phone || '+1 (555) 019-2834'}
                </span>
              </div>

              <div className="flex items-center gap-3 text-body-sm">
                <MapPin className="w-4 h-4 text-outline flex-shrink-0" />
                <span className="text-on-surface font-body">
                  {employee.location || 'Headquarters (San Francisco, CA)'}
                </span>
              </div>
            </div>
          </div>

          {/* Reporting Structure & History */}
          <div>
            <h3 className="text-title-md font-sans font-semibold text-on-surface mb-3">
              Reporting Structure
            </h3>
            <div className="space-y-3 bg-surface-container-lowest border border-outline-variant/80 rounded-md p-4">
              <div className="flex items-center justify-between text-body-sm">
                <span className="font-mono text-outline flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-primary" />
                  Direct Manager
                </span>
                <span className="font-sans font-semibold text-on-surface">
                  {employee.manager_name || 'N/A — Executive'}
                </span>
              </div>

              <div className="flex items-center justify-between text-body-sm">
                <span className="font-mono text-outline flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-outline" />
                  Date Joined
                </span>
                <span className="font-mono text-xs text-on-surface font-medium">
                  {employee.joining_date || 'Jan 15, 2024'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Drawer Footer Actions */}
        <div className="p-4 border-t border-outline-variant bg-surface-container-low/60 flex items-center gap-3">
          <a
            href={`mailto:${employee.email}`}
            className="flex-1 py-2 px-4 rounded bg-accent text-on-accent text-body-sm font-sans font-semibold text-center hover:bg-accent/90 transition-colors shadow-xs"
          >
            Send Email
          </a>
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-4 rounded border border-outline-variant bg-surface-container-lowest text-on-surface-variant text-body-sm font-sans font-semibold hover:bg-surface-container transition-colors inline-flex items-center gap-1"
          >
            <span>Close</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
