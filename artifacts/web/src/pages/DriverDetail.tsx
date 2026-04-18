import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ArrowLeft, User, Phone, CreditCard, FileText, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DocumentsPanel } from "@/components/DocumentsPanel";

const STATUS_COLOR: Record<string, string> = {
  active:     "bg-green-500/10 text-green-400 border-green-500/20",
  standby:    "bg-blue-500/10 text-blue-400 border-blue-500/20",
  suspended:  "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  terminated: "bg-red-500/10 text-red-400 border-red-500/20",
};

export default function DriverDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"info" | "documents">("documents");

  const { data: driver, isLoading } = useQuery<any>({
    queryKey: [`/api/drivers/${id}`],
    queryFn: () => fetch(`/api/drivers/${id}`, { credentials: "include" }).then((r) => r.json()),
  });

  const { data: payroll = [] } = useQuery<any[]>({
    queryKey: [`/api/payroll/driver/${id}`],
    queryFn: () => fetch(`/api/payroll/driver/${id}`, { credentials: "include" }).then((r) => r.json()),
    retry: false,
  });

  if (isLoading) return (
    <Layout><PageContent><div className="text-center text-muted-foreground py-20">Loading…</div></PageContent></Layout>
  );
  if (!driver || driver.error) return (
    <Layout><PageContent><div className="text-center text-muted-foreground py-20">Driver not found.</div></PageContent></Layout>
  );

  const totalPaid = (payroll as any[]).reduce((s: number, p: any) => s + parseFloat(p.totalPaid ?? "0"), 0);

  return (
    <Layout>
      <PageHeader
        title={driver.name}
        subtitle={`Driver profile · ${driver.status}`}
        icon={<User className="w-5 h-5" />}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/drivers")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        }
      />
      <PageContent>
        {/* Summary cards */}
        <div className="flex gap-3 flex-wrap mb-6">
          <div className="bg-card border border-border rounded-lg px-5 py-3 flex flex-col min-w-[140px]">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Status</span>
            <span className={cn("text-sm font-semibold px-2 py-0.5 rounded-full border self-start mt-1", STATUS_COLOR[driver.status] ?? STATUS_COLOR.active)}>
              {driver.status}
            </span>
          </div>
          <div className="bg-card border border-border rounded-lg px-5 py-3 flex flex-col min-w-[140px]">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Monthly Salary</span>
            <span className="text-xl font-bold text-emerald-400 mt-0.5">{formatCurrency(parseFloat(driver.monthlySalary ?? "0"))}</span>
          </div>
          {driver.phone && (
            <div className="bg-card border border-border rounded-lg px-5 py-3 flex items-center gap-2 min-w-[160px]">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{driver.phone}</span>
            </div>
          )}
          {driver.licenseNumber && (
            <div className="bg-card border border-border rounded-lg px-5 py-3 flex items-center gap-2 min-w-[160px]">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              <div>
                <span className="text-xs text-muted-foreground block">Licence</span>
                <span className="text-sm font-mono">{driver.licenseNumber}</span>
              </div>
            </div>
          )}
          {driver.passportNumber && (
            <div className="bg-card border border-border rounded-lg px-5 py-3 flex items-center gap-2 min-w-[160px]">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <div>
                <span className="text-xs text-muted-foreground block">Passport</span>
                <span className="text-sm font-mono">{driver.passportNumber}</span>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border gap-1 mb-4">
          {(["documents", "info"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "documents"
                ? <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" />Documents</span>
                : <span className="flex items-center gap-1"><Activity className="w-3.5 h-3.5" />Details</span>}
            </button>
          ))}
        </div>

        {activeTab === "documents" && (
          <DocumentsPanel entityType="driver" entityId={parseInt(id)} entityName={driver.name} />
        )}

        {activeTab === "info" && (
          <div className="space-y-3 text-sm">
            {driver.notes && (
              <div className="bg-card border border-border rounded-lg px-5 py-4">
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Notes</p>
                <p>{driver.notes}</p>
              </div>
            )}
            <div className="bg-card border border-border rounded-lg px-5 py-4">
              <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Added</p>
              <p>{driver.createdAt ? format(new Date(driver.createdAt), "dd MMM yyyy") : "—"}</p>
            </div>
          </div>
        )}
      </PageContent>
    </Layout>
  );
}
