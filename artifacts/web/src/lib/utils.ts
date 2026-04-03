import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | null | undefined, currency = 'USD') {
  if (amount == null) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(num: number | null | undefined, suffix = '') {
  if (num == null) return '-';
  return new Intl.NumberFormat('en-US').format(num) + (suffix ? ` ${suffix}` : '');
}

export function formatDate(dateString: string | null | undefined) {
  if (!dateString) return '-';
  try {
    return format(new Date(dateString), 'MMM dd, yyyy');
  } catch (e) {
    return dateString;
  }
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    // General
    available: "bg-success/20 text-success border-success/30",
    in_transit: "bg-primary/20 text-primary border-primary/30",
    maintenance: "bg-destructive/20 text-destructive border-destructive/30",
    
    // Batch / Trip
    planning: "bg-muted text-muted-foreground border-border",
    nominated: "bg-muted text-muted-foreground border-border",
    loading: "bg-warning/20 text-warning border-warning/30",
    loaded: "bg-accent/20 text-accent border-accent/30",
    at_origin_clearance: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    at_zambia_entry: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    at_drc_entry: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
    at_zambia_drc_border: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    delivered: "bg-success/20 text-success border-success/30",
    // truck statuses
    on_trip: "bg-primary/20 text-primary border-primary/30",
    idle: "bg-muted text-muted-foreground border-border",
    // driver statuses
    active: "bg-success/20 text-success border-success/30",
    inactive: "bg-muted text-muted-foreground border-border",
    on_leave: "bg-warning/20 text-warning border-warning/30",
    // payroll
    completed: "bg-success/20 text-success border-success/30",
    // invoice
    overdue: "bg-destructive/20 text-destructive border-destructive/30",
    cancelled: "bg-muted text-muted-foreground border-border",
    invoiced: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    amended_out: "bg-destructive/20 text-destructive border-destructive/30",
    
    // Clearances
    requested: "bg-muted text-muted-foreground border-border",
    pending: "bg-warning/20 text-warning border-warning/30",
    approved: "bg-success/20 text-success border-success/30",
    rejected: "bg-destructive/20 text-destructive border-destructive/30",
    // Invoices
    draft: "bg-muted text-muted-foreground border-border",
    sent: "bg-primary/20 text-primary border-primary/30",
    paid: "bg-success/20 text-success border-success/30",
  };
  return map[status] || "bg-secondary text-secondary-foreground border-border";
}

export function formatStatusName(status: string): string {
  return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
