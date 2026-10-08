import React from 'react';
import { Laptop, KeyRound, Wrench, ArrowLeftRight, HelpCircle } from 'lucide-react';
import type { RequestType } from '../../types/requests';

interface CategoryCardProps {
  type: RequestType;
  title: string;
  description: string;
  icon: React.ReactNode;
  sla: string;
  badge?: string;
  onSelect: (type: RequestType) => void;
}

const CategoryCard: React.FC<CategoryCardProps> = ({
  type,
  title,
  description,
  icon,
  sla,
  badge,
  onSelect,
}) => (
  <div
    onClick={() => onSelect(type)}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(type);
      }
    }}
    className="group relative flex flex-col justify-between p-6 rounded-2xl bg-card border border-border/70 hover:border-primary/50 dark:hover:border-primary/50 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer"
  >
    {badge && (
      <span className="absolute top-4 right-4 text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
        {badge}
      </span>
    )}

    <div>
      <div className="w-12 h-12 rounded-xl bg-muted/60 dark:bg-muted/30 text-primary flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-200">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
        {title}
      </h3>
      <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
        {description}
      </p>
    </div>

    <div className="mt-5 pt-4 border-t border-border/50 flex items-center justify-between text-xs">
      <span className="text-muted-foreground font-medium">Standard SLA</span>
      <span className="font-semibold text-foreground">{sla}</span>
    </div>
  </div>
);

interface RequestCategoryCardsProps {
  onSelectCategory: (type: RequestType) => void;
}

export const RequestCategoryCards: React.FC<RequestCategoryCardsProps> = ({ onSelectCategory }) => {
  const categories: Array<{
    type: RequestType;
    title: string;
    description: string;
    icon: React.ReactNode;
    sla: string;
    badge?: string;
  }> = [
    {
      type: 'hardware',
      title: 'Hardware Procurement',
      description: 'Laptops, monitors, workstations, docks, peripherals, and server equipment.',
      icon: <Laptop className="w-6 h-6" />,
      sla: '3–5 Business Days',
      badge: 'Popular',
    },
    {
      type: 'software',
      title: 'Software & Cloud License',
      description: 'SaaS seat assignment, IDE licenses, cloud credits, design suites, and tools.',
      icon: <KeyRound className="w-6 h-6" />,
      sla: '24–48 Hours',
    },
    {
      type: 'maintenance',
      title: 'Asset Repair / Servicing',
      description: 'Battery diagnostics, screen repair, physical damages, and periodic inspection.',
      icon: <Wrench className="w-6 h-6" />,
      sla: '24 Hours',
    },
    {
      type: 'transfer',
      title: 'Custody / Dept Transfer',
      description: 'Transfer hardware between employees, teams, branches, or department pools.',
      icon: <ArrowLeftRight className="w-6 h-6" />,
      sla: '1–2 Business Days',
    },
    {
      type: 'other',
      title: 'Custom IT Service Request',
      description: 'Access rights, network provisioning, special projects, or unlisted equipment.',
      icon: <HelpCircle className="w-6 h-6" />,
      sla: '2–4 Business Days',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      {categories.map((cat) => (
        <CategoryCard
          key={cat.type}
          type={cat.type}
          title={cat.title}
          description={cat.description}
          icon={cat.icon}
          sla={cat.sla}
          badge={cat.badge}
          onSelect={onSelectCategory}
        />
      ))}
    </div>
  );
};
