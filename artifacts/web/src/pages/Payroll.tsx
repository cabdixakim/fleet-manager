import { useState } from "react";
import { useGetPayrollRuns, useCreatePayrollRun, useGetDrivers } from "@workspace/api-client-react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { StatusBadge } from "@/components/StatusBadge";
import { DataTable } from "@/components/DataTable";
import { formatCurrency, formatDate } from "@/lib/utils";
import { exportToExcel } from "@/lib/export";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Download, DollarSign, Users, Calculator, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function Payroll() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [form, setForm] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), notes: "" });

  const { data: runs = [], isLoading } = useGetPayrollRuns({});
  const { data: drivers = [] } = useGetDrivers();
  const { mutateAsync: createRun, isPending } = useCreatePayrollRun();

  const handleCreate = async () => {
    await createRun({ data: { month: form.month, year: form.year, notes: form.notes || undefined } });
    qc.invalidateQueries({ queryKey: ["/api/payroll"] });
    setShowCreate(false);
  };

  const handleDeleteRun = async () => {
    if (!confirmDelete) return;
    await fetch(`/api/payroll/${confirmDelete.id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["/api/payroll"] });
    if (selectedRun?.id === confirmDelete.id) setSelectedRun(null);
    setConfirmDelete(null);
  };

  const handleExport = () => {
    if (!selectedRun?.allocations) return;
    exportToExcel(
      selectedRun.allocations.map((a: any) => ({
        Driver: a.driverName,
        "Monthly Salary": a.monthlySalary,
        "Trips That Month": a.tripCount,
        "Salary per Trip": a.salaryPerTrip,
        "Total Allocated": a.totalAllocated,
        "Sub Deducted From": a.subcontractorName,
      })),
      `payroll-${selectedRun.month}-${selectedRun.year}`
    );
  };

  return (
    <Layout>
      <PageHeader
        title="Payroll"
        subtitle="Monthly driver salary runs and subcontractor deductions"
        actions={
          <>
            {selectedRun && <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-4 h-4 mr-2" />Export Run</Button>}
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />Run Payroll</Button>
          </>
        }
      />
      <PageContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className="p-2 bg-success/10 rounded-lg text-success"><DollarSign className="w-5 h-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total Paid This Year</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(runs.reduce((s: number, r: any) => s + (r.totalPaid ?? 0), 0))}</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg text-primary"><Users className="w-5 h-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Active Drivers</p>
              <p className="text-lg font-bold text-foreground">{drivers.filter((d: any) => d.status === "active").length}</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className="p-2 bg-accent/10 rounded-lg text-accent"><Calculator className="w-5 h-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Payroll Runs</p>
              <p className="text-lg font-bold text-foreground">{runs.length}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Run List */}
          <div className="lg:col-span-1 bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Payroll Runs</h3>
            </div>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
            ) : runs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No payroll runs yet</div>
            ) : (
              <div className="divide-y divide-border">
                {runs.map((run: any) => (
                  <div
                    key={run.id}
                    onClick={() => setSelectedRun(run)}
                    className={`w-full text-left px-4 py-3 hover:bg-secondary/30 transition-colors cursor-pointer group ${selectedRun?.id === run.id ? "bg-secondary/50" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{MONTHS[run.month - 1]} {run.year}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{run.driverCount} drivers</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-sm font-bold text-success">{formatCurrency(run.totalPaid)}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(run.createdAt)}</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(run); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Run Detail */}
          <div className="lg:col-span-2">
            {!selectedRun ? (
              <div className="bg-card border border-border rounded-xl flex items-center justify-center h-48 text-muted-foreground text-sm">
                Select a payroll run to view details
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">
                    {MONTHS[selectedRun.month - 1]} {selectedRun.year} — Driver Allocations
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Salary split across trips driven in the period</p>
                </div>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border bg-secondary/50">
                    {["Driver", "Salary/Month", "Trips", "Salary/Trip", "Total Allocated", "Subcontractor"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {selectedRun.allocations?.map((a: any) => (
                      <tr key={a.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/20">
                        <td className="px-4 py-3 font-medium">{a.driverName}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatCurrency(a.monthlySalary)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{a.tripCount}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatCurrency(a.salaryPerTrip)}</td>
                        <td className="px-4 py-3 font-semibold text-success">{formatCurrency(a.totalAllocated)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{a.subcontractorName}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-secondary/30">
                      <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-foreground text-right">Total Paid This Run:</td>
                      <td className="px-4 py-3 font-bold text-success">{formatCurrency(selectedRun.totalPaid)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </PageContent>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Run Monthly Payroll</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">This will calculate driver salaries based on trips completed during the selected month and create subcontractor deduction entries.</p>
            <div><Label>Month *</Label>
              <Select value={String(form.month)} onValueChange={(v) => setForm({ ...form, month: parseInt(v) })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Year *</Label>
              <Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) })} className="mt-1" />
            </div>
            <div><Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isPending}>{isPending ? "Processing..." : "Run Payroll"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Payroll Run</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">Are you sure you want to delete the <strong>{confirmDelete ? MONTHS[confirmDelete.month - 1] : ""} {confirmDelete?.year}</strong> payroll run? This will also remove all salary deductions created by this run.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteRun}>Delete Run</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
