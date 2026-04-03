import React from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => (
  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-6 border-b pb-4">
    <div>
      <h1 className="text-2xl font-bold text-foreground tracking-tight">{title}</h1>
      {subtitle && <div className="text-muted-foreground text-sm mt-1">{subtitle}</div>}
    </div>
    {actions && <div className="flex-shrink-0">{actions}</div>}
  </div>
);
