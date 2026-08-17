import React, { useState } from 'react'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronDown,
  ChevronRight,
  Users,
  Building,
  UserCheck,
} from 'lucide-react'
import { OrgChartNode, Employee } from '@/types/employee'

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
  const [zoomLevel, setZoomLevel] = useState<number>(100)
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({})

  const toggleCollapse = (id: string) => {
    setCollapsedNodes((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 15, 150))
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 15, 60))
  const handleZoomReset = () => setZoomLevel(100)

  const renderNodeTree = (node: OrgChartNode, depth: number = 0) => {
    const hasReports = Boolean(node.direct_reports && node.direct_reports.length > 0)
    const isCollapsed = Boolean(collapsedNodes[node.id])

    return (
      <div key={node.id} className="flex flex-col items-center relative">
        {/* Node Card */}
        <div
          onClick={() => onSelectEmployeeById(node.id)}
          className="w-72 bg-surface-container-lowest border border-outline-variant rounded-lg p-4 shadow-sm hover:shadow-md hover:border-accent transition-all cursor-pointer group relative z-10"
        >
          {/* Top Row: Department Badge & Direct Report Count */}
          <div className="flex items-center justify-between mb-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-tertiary bg-tertiary-container/30 px-2 py-0.5 rounded border border-tertiary/20">
              <Building className="w-3 h-3 text-tertiary" />
              {node.department_name}
            </span>

            {hasReports && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-on-accent-container bg-accent-container px-2 py-0.5 rounded font-semibold">
                <Users className="w-3 h-3" />
                {node.direct_reports?.length} Reports
              </span>
            )}
          </div>

          {/* Body: Avatar & Name */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-sans font-bold text-sm shadow-xs group-hover:bg-accent group-hover:text-on-accent transition-colors flex-shrink-0">
              {node.avatar_url ? (
                <img
                  src={node.avatar_url}
                  alt={node.full_name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                node.full_name.substring(0, 2).toUpperCase()
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-body-md font-sans font-semibold text-on-surface truncate group-hover:text-accent transition-colors">
                {node.full_name}
              </h3>
              <p className="text-body-sm font-body text-on-surface-variant truncate">
                {node.designation}
              </p>
            </div>
          </div>

          {/* Expand / Collapse Control */}
          {hasReports && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggleCollapse(node.id)
              }}
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-surface-container border border-outline-variant text-on-surface-variant flex items-center justify-center hover:bg-accent hover:text-on-accent hover:border-accent transition-all cursor-pointer z-20 shadow-xs"
              title={isCollapsed ? 'Expand Reports' : 'Collapse Reports'}
            >
              {isCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>

        {/* Children Branch Lines */}
        {hasReports && !isCollapsed && (
          <div className="flex flex-col items-center pt-6 relative w-full">
            {/* Vertical Stem down from parent */}
            <div className="w-px h-6 bg-outline-variant absolute top-0 left-1/2 -translate-x-1/2" />

            {/* Horizontal Branch Bar & Children Container */}
            <div className="flex justify-center gap-8 relative pt-4">
              {node.direct_reports!.length > 1 && (
                <div className="absolute top-4 left-[144px] right-[144px] h-px bg-outline-variant" />
              )}

              {node.direct_reports!.map((child) => (
                <div key={child.id} className="relative pt-4">
                  {/* Stem up to branch bar */}
                  <div className="w-px h-4 bg-outline-variant absolute top-0 left-1/2 -translate-x-1/2" />
                  {renderNodeTree(child, depth + 1)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-6 shadow-sm min-h-[550px] flex flex-col justify-between relative overflow-hidden">
      {/* Zoom Controls Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-outline-variant/80 mb-6">
        <div className="flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-accent" />
          <div>
            <h2 className="text-title-md font-sans font-semibold text-on-surface">
              Organizational Hierarchy Tree
            </h2>
            <p className="text-body-sm font-body text-on-surface-variant">
              Interactive report structure mapped from manager reporting connections
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-md border border-outline-variant">
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-1.5 rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono px-2 text-on-surface font-semibold select-none">
            {zoomLevel}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            className="p-1.5 rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomReset}
            className="p-1.5 rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer border-l border-outline-variant/60 ml-1"
            title="Reset Zoom"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Org Tree Canvas */}
      <div className="flex-1 overflow-auto py-8 flex justify-center items-start">
        <div
          style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
          className="transition-transform duration-200 flex justify-center gap-12"
        >
          {nodes.length === 0 ? (
            <div className="py-12 text-center text-on-surface-variant text-body-sm">
              No reporting hierarchy nodes available for current filter set.
            </div>
          ) : (
            nodes.map((rootNode) => renderNodeTree(rootNode))
          )}
        </div>
      </div>

      {/* Footer Legend */}
      <div className="pt-3 border-t border-outline-variant/60 flex items-center justify-between text-body-sm text-on-surface-variant">
        <span className="font-mono text-xs">
          Showing {rawEmployees.length} employee hierarchy nodes
        </span>
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Active Node
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent" />
            Onboarding
          </span>
        </div>
      </div>
    </div>
  )
}
