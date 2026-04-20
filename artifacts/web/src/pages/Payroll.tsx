import { useState } from "react";
import { useGetPayrollRuns, useCreatePayrollRun, useGetDrivers } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { formatCurrency, formatDate } from "@/lib/utils";
import { exportToExcel } from "@/lib/export";
import { Plus, Download, DollarSign, Users, Calculator, Trash2, CreditCard, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { throwOnApiError, getErrorMessage } from "@/lib/apiError";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const api = (path: string, opts?: RequestInit) => fetch(path, { credentials: "include", ...opts });

type Advance = { id: number; driverId: number; driverName: string; amount: number; date: string; description: string | null; status: string };

export default function Payroll() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [showAddAdvance, setShowAddAdvance] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({ driverId: "", amount: "", date: new Date().toISOString().slice(0, 10), description: "" });
  const [form, setForm] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), notes: "" });

  const { data: runs = [], isLoading } = useGetPayrollRuns({});
  const { data: drivers = [] } = useGetDrivers();
  const { mutateAsync: createRun, isPending } = useCreatePayrollRun();

  const { data: advances = [], refetch: refetchAdvances } = useQuery<Advance[]>({
    queryKey: ["advances"],
    queryFn: () => api("/api/advances").then((r) => r.json()),
  });

  const pendingAdvances = advances.filter((a) => a.status === "pending");

  const handleCreate = async () => {
    try {
      await createRun({ data: { month: form.month, year: form.year, notes: form.notes || undefined } });
      qc.invalidateQueries({ queryKey: ["/api/payroll"] });
      refetchAdvances();
      setShowCreate(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Couldn't run payroll", description: getErrorMessage(e, "Failed to run payroll") });
    }
  };

  const handleDeleteRun = async () => {
    if (!confirmDelete) return;
    try {
      const res = await api(`/api/payroll/${confirmDelete.id}`, { method: "DELETE" });
      await throwOnApiError(res);
      qc.invalidateQueries({ queryKey: ["/api/payroll"] });
      refetchAdvances();
      if (selectedRun?.id === confirmDelete.id) setSelectedRun(null);
      setConfirmDelete(null);
    } catch (e) {
      toast({ variant: "destructive", title: "Couldn't delete payroll", description: getErrorMessage(e, "Failed to delete payroll run") });
    }
  };

  const handleAddAdvance = async () => {
    try {
      const res = await api("/api/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(advanceForm),
      });
      await throwOnApiError(res);
      refetchAdvances();
      setShowAddAdvance(false);
      setAdvanceForm({ driverId: "", amount: "", date: new Date().toISOString().slice(0, 10), description: "" });
      toast({ title: "Advance recorded" });
    } catch (e) {
      toast({ variant: "destructive", title: "Couldn't record advance", description: getErrorMessage(e) });
    }
  };

  const handleDeleteAdvance = async (id: number) => {
    try {
      const res = await api(`/api/advances/${id}`, { method: "DELETE" });
      await throwOnApiError(res);
      refetchAdvances();
      toast({ title: "Advance removed" });
    } catch (e) {
      toast({ variant: "destructive", title: "Couldn't remove advance", description: getErrorMessage(e) });
    }
  };

  const handleExport = () => {
    if (!selectedRun) return;
    exportToExcel(
      [selectedRun].map((r: any) => ({
        Driver: r.driverName,
        Month: MONTHS[r.month - 1],
        Year: r.year,
        "Gross Salary": r.monthlySalary,
        "Advances Deducted": r.advancesDeducted ?? 0,
        "Net Pay": r.netPay ?? r.monthlySalary,
        Trips: r.tripsCount,
      })),
      `payroll-${selectedRun.month}-${selectedRun.year}`
    );
  };

  const totalPaidThisYear = runs.reduce((s: number, r: any) => s + (parseFloat(r.netPay ?? r.monthlySalary) || 0), 0);
  const totalPendingAdvances = pendingAdvances.reduce((s, a) => s + a.amount, 0);

  return (
    <Layout>
      <PageHeader
        title="Payroll"
        subtitle="Monthly driver salary runs and advance deductions"
        actions={
          <>
            {selectedRun && <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-4 h-4 mr-2" />Export</Button>}
            <Button variant="outline" size="sm" onClick={() => setShowAddAdvance(true)}><CreditCard className="w-4 h-4 mr-2" />Record Advance</Button>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />Run Payroll</Button>
          </>
        }
      />
      <PageContent>
        {/* KPI row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className="p-2 bg-success/10 rounded-lg text-success"><DollarSign className="w-5 h-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Net Paid This Year</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(totalPaidThisYear)}</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg text-primary"><Users className="w-5 h-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Active Drivers</p>
              <p className="text-lg font-bold text-foreground">{(drivers as any[]).filter((d) => d.status === "active").length}</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${totalPendingAdvances > 0 ? "bg-orange-500/10 text-orange-500" : "bg-accent/10 text-accent"}`}><Calculator className="w-5 h-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Pending Advances</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(totalPendingAdvances)}</p>
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
                {(runs as any[]).map((run) => (
                  <div
                    key={run.id}
                    onClick={() => setSelectedRun(run)}
                    className={`w-full text-left px-4 py-3 hover:bg-secondary/30 transition-colors cursor-pointer group ${selectedRun?.id === run.id ? "bg-secondary/50" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{run.driverName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{MONTHS[(run.month ?? 1) - 1]} {run.year}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-sm font-bold text-success">{formatCurrency(parseFloat(run.netPay ?? run.monthlySalary))}</p>
                          <p className="text-[10px] text-muted-foreground">{formatDate(run.createdAt)}</p>
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
                    {selectedRun.driverName} — {MONTHS[(selectedRun.month ?? 1) - 1]} {selectedRun.year}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{selectedRun.tripsCount} trips completed</p>
                </div>
                <div className="p-5 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Gross Salary</span>
                    <span className="font-medium">{formatCurrency(parseFloat(selectedRun.monthlySalary))}</span>
                  </div>
                  {parseFloat(selectedRun.advancesDeducted ?? "0") > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Advances Deducted</span>
                      <span className="font-medium text-orange-500">− {formatCurrency(parseFloat(selectedRun.advancesDeducted))}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm border-t border-border pt-3 mt-3">
                    <span className="font-semibold text-foreground">Net Pay</span>
                    <span className="font-bold text-success text-base">{formatCurrency(parseFloat(selectedRun.netPay ?? selectedRun.monthlySalary))}</span>
                  </div>
                  {selectedRun.amountPerTrip > 0 && (
                    <p className="text-xs text-muted-foreground pt-1">
                      {formatCurrency(selectedRun.amountPerTrip)} per trip × {selectedRun.tripsCount} trips
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Pending Advances */}
            {pendingAdvances.length > 0 && (
              <div className="mt-6 bg-card border border-orange-500/20 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-orange-500/20 bg-orange-500/5 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-orange-500" />
                  <h3 className="text-sm font-semibold text-foreground">Pending Advances</h3>
                  <span className="text-xs text-muted-foreground">— will be deducted on next payroll run</span>
                </div>
                <div className="divide-y divide-border">
                  {pendingAdvances.map((a) => (
                    <div key={a.id} className="flex items-center px-4 py-3 gap-3 group">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{a.driverName}</p>
                        <p className="text-xs text-muted-foreground">{a.date}{a.description ? ` · ${a.description}` : ""}</p>
                      </div>
                      <span className="text-sm font-semibold text-orange-500">{formatCurrency(a.amount)}</span>
                      <button
                        onClick={() => handleDeleteAdvance(a.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1 rounded"
                        title="Remove advance"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </PageContent>

      {/* Run Payroll Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Run Monthly Payroll</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Month *</Label>
              <Select value={String(form.month)} onValueChange={(v) => setForm({ ...form, month: parseInt(v) })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Year *</Label>
              <Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) })} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isPending}>{isPending ? "Processing..." : "Run Payroll"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Advance Dialog */}
      <Dialog open={showAddAdvance} onOpenChange={setShowAddAdvance}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Record Driver Advance</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Driver *</Label>
              <Select value={advanceForm.driverId} onValueChange={(v) => setAdvanceForm({ ...advanceForm, driverId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select driver…" /></SelectTrigger>
                <SelectContent>
                  {(drivers as any[]).filter((d) => d.status === "active").map((d: any) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Amount *</Label>
              <Input type="number" step="0.01" min="0" value={advanceForm.amount}
                onChange={(e) => setAdvanceForm({ ...advanceForm, amount: e.target.value })} className="mt-1" placeholder="0.00" />
            </div>
            <div><Label>Date *</Label>
              <Input type="date" value={advanceForm.date}
                onChange={(e) => setAdvanceForm({ ...advanceForm, date: e.target.value })} className="mt-1" />
            </div>
            <div><Label>Description</Label>
              <Input value={advanceForm.description}
                onChange={(e) => setAdvanceForm({ ...advanceForm, description: e.target.value })} className="mt-1" placeholder="Optional reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddAdvance(false)}>Cancel</Button>
            <Button onClick={handleAddAdvance} disabled={!advanceForm.driverId || !advanceForm.amount || !advanceForm.date}>
              Record Advance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Payroll Confirm */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Payroll Run</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Delete the payroll run for <strong>{confirmDelete?.driverName}</strong> ({MONTHS[(confirmDelete?.month ?? 1) - 1]} {confirmDelete?.year})?
            Any advances that were deducted will be restored to pending.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteRun}>Delete Run</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
