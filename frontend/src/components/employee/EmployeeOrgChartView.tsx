import React, { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Users,
  Building,
  UserCheck,
  Sparkles,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react'
import { OrgChartNode, Employee } from '@/types/employee'

const ZOOM_MIN = 0.6
const ZOOM_MAX = 1.4
const ZOOM_STEP = 0.1

interface EmployeeOrgChartViewProps {
  nodes: OrgChartNode[]
  onSelectEmployeeById: (id: string) => void
  rawEmployees: Employee[]
}

export const EmployeeOrgChartView: React.FC<EmployeeOrgChartViewProps> = ({
  nodes,
  onSelectEmployeeById,
  rawEmployees,
}) => {
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({})
  const [zoom, setZoom] = useState(1)

  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100))
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100))
  const zoomReset = () => setZoom(1)

  const toggleCollapse = (id: string) => {
    setCollapsedNodes((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const collapseAll = () => {
    const allIds: Record<string, boolean> = {}
    const traverse = (nodeList: OrgChartNode[]) => {
      nodeList.forEach((n) => {
        if (n.direct_reports && n.direct_reports.length > 0) {
          allIds[n.id] = true
          traverse(n.direct_reports)
        }
      })
    }
    traverse(nodes)
    setCollapsedNodes(allIds)
  }

  const expandAll = () => {
    setCollapsedNodes({})
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase()
  }

  // Recursive team tree renderer with multi-column card grid
  const renderManagerSection = (node: OrgChartNode, level: number = 0) => {
    const hasReports = Boolean(node.direct_reports && node.direct_reports.length > 0)
    const isCollapsed = Boolean(collapsedNodes[node.id])

    // Partition reports into: sub-managers (who have reports) and direct individual contributors
    const subManagers = (node.direct_reports || []).filter(
      (r) => r.direct_reports && r.direct_reports.length > 0
    )
    const individualContributors = (node.direct_reports || []).filter(
      (r) => !r.direct_reports || r.direct_reports.length === 0
    )

    return (
      <div key={node.id} className="w-full flex flex-col items-center">
        {/* Manager / Leader Card (Full readable size) */}
        <div
          onClick={() => onSelectEmployeeById(node.id)}
          className={`w-full max-w-xl bg-surface-container-lowest border rounded-xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer group relative ${
            level === 0
              ? 'border-accent/40 ring-1 ring-accent/20 bg-gradient-to-r from-surface-container-lowest via-surface-container-lowest to-accent-container/10'
              : 'border-outline-variant hover:border-accent'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              {/* Avatar */}
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center font-sans font-bold text-sm shadow-xs flex-shrink-0 transition-colors ${
                  level === 0
                    ? 'bg-accent text-on-accent'
                    : 'bg-primary-container text-on-primary-container group-hover:bg-accent group-hover:text-on-accent'
                }`}
              >
                {node.avatar_url ? (
                  <img
                    src={node.avatar_url}
                    alt={node.full_name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  getInitials(node.full_name)
                )}
              </div>

              {/* Identity & Role */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-body-md font-sans font-semibold text-on-surface truncate group-hover:text-accent transition-colors">
                    {node.full_name}
                  </h3>
                  {level === 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-accent bg-accent-container/50 px-1.5 py-0.5 rounded font-semibold border border-accent/20">
                      <Sparkles className="w-2.5 h-2.5" />
                      Department Lead
                    </span>
                  )}
                </div>
                <p className="text-body-sm font-body text-on-surface-variant truncate mt-0.5">
                  {node.designation}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono text-tertiary bg-tertiary-container/30 px-2 py-0.5 rounded border border-tertiary/20">
                    <Building className="w-3 h-3 text-tertiary flex-shrink-0" />
                    {node.department_name || 'General'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 px-1.5 py-0.5 rounded">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Active
                  </span>
                </div>
              </div>
            </div>

            {/* Direct Reports & Expand Toggle */}
            {hasReports && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleCollapse(node.id)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-accent hover:text-on-accent text-on-surface-variant transition-all font-mono text-xs font-semibold border border-outline-variant/60 shadow-2xs"
                  title={isCollapsed ? 'Expand Team' : 'Collapse Team'}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{node.direct_reports?.length} Reports</span>
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Expanded Direct Reports Container */}
        {hasReports && !isCollapsed && (
          <div className="w-full flex flex-col items-center pt-3 relative">
            {/* Vertical Connector Line from Leader Card */}
            <div className="w-0.5 h-4 bg-outline-variant" />

            <div className="w-full bg-surface-container-low/30 border border-outline-variant/50 rounded-xl p-4 sm:p-5 mt-1 space-y-5">
              {/* Header for Team Section */}
              <div className="flex items-center justify-between pb-2 border-b border-outline-variant/40 text-xs font-mono text-on-surface-variant">
                <div className="flex items-center gap-2 font-semibold text-on-surface">
                  <Layers className="w-4 h-4 text-accent" />
                  <span>Team under {node.full_name} ({node.direct_reports?.length} members)</span>
                </div>
                <span>Level {level + 1} Hierarchy</span>
              </div>

              {/* 1. Sub-Managers / Leads Section (If any) */}
              {subManagers.length > 0 && (
                <div className="space-y-4">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-tertiary font-semibold flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    Team Leads & Sub-Managers ({subManagers.length})
                  </div>
                  <div className="space-y-4 pl-2 sm:pl-4 border-l-2 border-accent/40">
                    {subManagers.map((subMgr) => renderManagerSection(subMgr, level + 1))}
                  </div>
                </div>
              )}

              {/* 2. Direct Individual Contributors Grid (Responsive 1-to-3 columns) */}
              {individualContributors.length > 0 && (
                <div className="space-y-3">
                  {subManagers.length > 0 && (
                    <div className="text-[11px] font-mono uppercase tracking-wider text-on-surface-variant font-semibold flex items-center gap-1.5 pt-2">
                      <UserCheck className="w-3.5 h-3.5 text-on-surface-variant" />
                      Individual Team Contributors ({individualContributors.length})
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {individualContributors.map((member) => (
                      <div
                        key={member.id}
                        onClick={() => onSelectEmployeeById(member.id)}
                        className="bg-surface-container-lowest border border-outline-variant/80 hover:border-accent rounded-lg p-3 shadow-2xs hover:shadow-xs transition-all cursor-pointer group flex items-center gap-3 text-left"
                      >
                        <div className="w-9 h-9 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-sans font-bold text-xs shadow-2xs group-hover:bg-accent group-hover:text-on-accent transition-colors flex-shrink-0">
                          {member.avatar_url ? (
                            <img
                              src={member.avatar_url}
                              alt={member.full_name}
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            getInitials(member.full_name)
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 className="text-body-sm font-sans font-semibold text-on-surface truncate group-hover:text-accent transition-colors leading-tight">
                            {member.full_name}
                          </h4>
                          <p className="text-[11px] font-body text-on-surface-variant truncate mt-0.5">
                            {member.designation}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-mono text-tertiary bg-tertiary-container/30 px-1.5 py-0.2 rounded truncate max-w-[130px]">
                              {member.department_name}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 sm:p-6 shadow-sm space-y-6">
      {/* Top Header & Expand/Collapse Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant/70">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-accent-container/50 text-accent">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-headline-sm font-sans font-semibold text-on-surface tracking-tight">
              Organizational Hierarchy Tree
            </h2>
            <p className="text-body-sm font-body text-on-surface-variant">
              Interactive company hierarchy structured across executive leadership and department teams
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <div className="flex items-center bg-surface-container-low p-1 rounded-lg border border-outline-variant text-xs">
            <button
              type="button"
              onClick={zoomOut}
              disabled={zoom <= ZOOM_MIN}
              title="Zoom out"
              className="p-1.5 rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-mono text-on-surface-variant tabular-nums">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={zoomIn}
              disabled={zoom >= ZOOM_MAX}
              title="Zoom in"
              className="p-1.5 rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={zoomReset}
              title="Reset zoom"
              className="p-1.5 rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer border-l border-outline-variant/60"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Global Expand/Collapse Actions */}
          <div className="flex items-center bg-surface-container-low p-1 rounded-lg border border-outline-variant text-xs">
            <button
              type="button"
              onClick={expandAll}
              className="px-3 py-1.5 rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer font-medium"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="px-3 py-1.5 rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer font-medium border-l border-outline-variant/60"
            >
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {/* Main Hierarchical Tree Body */}
      <div className="space-y-8 min-h-[400px] overflow-auto">
        <div
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 150ms ease' }}
        >
          {nodes.length === 0 ? (
            <div className="py-20 text-center text-on-surface-variant text-body-md font-body bg-surface-container-low/20 rounded-xl border border-dashed border-outline-variant">
              No reporting hierarchy records found matching the current filters.
            </div>
          ) : (
            <div className="space-y-8">{nodes.map((rootNode) => renderManagerSection(rootNode, 0))}</div>
          )}
        </div>
      </div>

      {/* Footer Summary */}
      <div className="pt-4 border-t border-outline-variant/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono text-on-surface-variant">
        <span>
          Showing {rawEmployees.length} employee hierarchy records
        </span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Active Employee
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent" />
            Direct Team Lead
          </span>
        </div>
      </div>
    </div>
  )
}
