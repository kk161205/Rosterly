import React from 'react'
import {
  Laptop,
  FileText,
  CheckCircle2,
  Bell,
  Users,
  UserPlus,
  UserMinus,
  Wrench,
  ShieldAlert,
  Package,
  Activity,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react'
import { DashboardMetricCard } from '@/types/dashboard'
import { Card } from '@/components/common/CommonUI'

interface MetricRibbonProps {
  cards: DashboardMetricCard[]
  isLoading?: boolean
}

export const MetricRibbon: React.FC<MetricRibbonProps> = ({ cards }) => {
  const getIcon = (iconName: DashboardMetricCard['iconName']) => {
    switch (iconName) {
      case 'asset':
        return <Laptop className="w-5 h-5 text-primary" />
      case 'request':
        return <FileText className="w-5 h-5 text-accent" />
      case 'task':
        return <CheckCircle2 className="w-5 h-5 text-tertiary" />
      case 'alert':
        return <Bell className="w-5 h-5 text-error" />
      case 'approval':
        return <CheckCircle2 className="w-5 h-5 text-warning" />
      case 'team':
        return <Users className="w-5 h-5 text-primary" />
      case 'onboarding':
        return <UserPlus className="w-5 h-5 text-accent" />
      case 'offboarding':
        return <UserMinus className="w-5 h-5 text-error" />
      case 'ticket':
        return <Wrench className="w-5 h-5 text-error" />
      case 'warranty':
        return <ShieldAlert className="w-5 h-5 text-warning" />
      case 'stock':
        return <Package className="w-5 h-5 text-tertiary" />
      case 'health':
        return <Activity className="w-5 h-5 text-success" />
      case 'audit':
        return <ShieldCheck className="w-5 h-5 text-primary" />
      case 'users':
      default:
        return <Users className="w-5 h-5 text-primary" />
    }
  }

  const getBadgeStyle = (variant?: DashboardMetricCard['badgeVariant']) => {
    switch (variant) {
      case 'accent':
        return 'bg-accent-container text-on-accent-container border-accent/20'
      case 'tertiary':
        return 'bg-tertiary-container/30 text-tertiary border-tertiary/20'
      case 'warning':
        return 'bg-warning-container text-on-warning-container border-warning/20'
      case 'error':
        return 'bg-error-container text-on-error-container border-error/20'
      case 'neutral':
      default:
        return 'bg-surface-container text-on-surface-variant border-outline-variant'
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card
          key={card.id}
          elevated
          className="flex flex-col justify-between hover:bg-surface-container-low transition-all duration-200 group"
        >
          {/* Card Header: Icon & Badge */}
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-md bg-surface-container-low border border-outline-variant flex items-center justify-center group-hover:bg-surface-container transition-colors">
              {getIcon(card.iconName)}
            </div>

            {card.badgeText && (
              <span
                className={`text-label-caps font-mono px-2 py-0.5 rounded-full border ${getBadgeStyle(
                  card.badgeVariant
                )}`}
              >
                {card.badgeText}
              </span>
            )}
          </div>

          {/* Card Body: Metric & Label */}
          <div>
            <span className="text-body-sm font-sans font-medium text-on-surface-variant block mb-1">
              {card.label}
            </span>
            <div className="text-headline-lg font-sans font-semibold text-on-surface tracking-tight leading-none">
              {card.value}
            </div>
          </div>

          {/* Card Footer: Trend / Subtext */}
          {card.change && (
            <div className="mt-3 pt-3 border-t border-outline-variant/60 flex items-center gap-1.5 text-body-sm font-body text-on-surface-variant">
              {card.changeType === 'positive' && (
                <TrendingUp className="w-3.5 h-3.5 text-success flex-shrink-0" />
              )}
              {card.changeType === 'negative' && (
                <TrendingDown className="w-3.5 h-3.5 text-error flex-shrink-0" />
              )}
              {card.changeType === 'neutral' && (
                <Minus className="w-3.5 h-3.5 text-outline flex-shrink-0" />
              )}
              <span className="truncate">{card.change}</span>
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
