import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  trend?: { value: number; label: string };
  className?: string;
}

export function KpiCard({ title, value, subtitle, icon: Icon, iconColor = "text-primary", trend, className }: KpiCardProps) {
  return (
    <div className={cn("bg-card border border-border rounded-xl p-5", className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-display font-bold text-foreground mt-1">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          {trend && (
            <div className={cn("flex items-center gap-1 mt-2 text-xs", trend.value >= 0 ? "text-success" : "text-destructive")}>
              <span>{trend.value >= 0 ? "+" : ""}{trend.value}%</span>
              <span className="text-muted-foreground">{trend.label}</span>
            </div>
          )}
        </div>
        <div className={cn("p-2.5 rounded-lg bg-secondary", iconColor)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
