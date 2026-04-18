import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  useGetSubcontractors, useCreateSubcontractor, useUpdateSubcontractor, useDeleteSubcontractor,
  useGetSubcontractor, useGetSubcontractorTransactions, useCreateSubcontractorTransaction,
} from "@workspace/api-client-react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { formatCurrency, formatDate } from "@/lib/utils";
import { exportToExcel } from "@/lib/export";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Download, Search, ChevronLeft, Receipt, Pencil, Trash2, Lock, Unlock, Users, FileText, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/apiError";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const TRUCK_EXPENSE_TYPES = [
  { value: "maintenance", label: "Maintenance / Repair" },
  { value: "tyres", label: "Tyres" },
  { value: "fuel", label: "Fuel" },
  { value: "toll", label: "Toll / Road Levy" },
  { value: "loading_fee", label: "Loading Fee" },
  { value: "other", label: "Other" },
];

type Sub = {
  id: number;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  commissionRate?: number;
  openingBalance?: number | string;
  obLocked?: boolean;
  balance?: number;
  truckCount?: number;
};

function SubDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canAdjustOB = user?.role === "owner" || user?.role === "admin" || user?.role === "manager";

  const { data: sub } = useGetSubcontractor(id);
  const { data: txData } = useGetSubcontractorTransactions(id);
  const transactions: any[] = Array.isArray(txData) ? txData : Array.isArray((txData as any)?.transactions) ? (txData as any).transactions : [];
  const { data: expenses = [] } = useQuery<any[]>({
    queryKey: [`/api/subcontractors/${id}/expenses`],
    queryFn: () => fetch(`/api/subcontractors/${id}/expenses`).then((r) => r.json()),
    enabled: !!id,
  });

  const { mutateAsync: createTx, isPending } = useCreateSubcontractorTransaction();
  const { mutateAsync: updateSub, isPending: updating } = useUpdateSubcontractor();
  const { mutateAsync: deleteSub, isPending: deleting } = useDeleteSubcontractor();

  const { data: otherExpenses = [] } = useQuery<any[]>({
    queryKey: [`/api/expenses`, id, "truck"],
    queryFn: () => fetch(`/api/expenses?subcontractorId=${id}&tier=truck`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!id,
  });

  const apiTotals = txData as any;
  const statement = {
    totalGross: apiTotals?.totalGross ?? 0,
    totalCommission: apiTotals?.totalCommission ?? 0,
    totalTripExpenses: apiTotals?.totalTripExpenses ?? (expenses as any[]).reduce((s: number, e: any) => s + (e.amount ?? 0), 0),
    totalTruckExpenses: apiTotals?.totalTruckExpenses ?? (otherExpenses as any[]).reduce((s: number, e: any) => s + (e.amount ?? 0), 0),
    totalNetPayable: apiTotals?.totalNetPayable ?? 0,
    totalAdvances: apiTotals?.totalAdvancesGiven ?? transactions.filter((t: any) => t.type === "advance_given").reduce((s: number, t: any) => s + t.amount, 0),
    totalPayments: apiTotals?.totalPaymentsMade ?? transactions.filter((t: any) => t.type === "payment_made").reduce((s: number, t: any) => s + t.amount, 0),
    totalDriverSalary: apiTotals?.totalDriverSalaries ?? transactions.filter((t: any) => t.type === "driver_salary").reduce((s: number, t: any) => s + t.amount, 0),
    balance: apiTotals?.balance ?? (sub as any)?.balance ?? 0,
  };

  const { data: allTrucks = [] } = useQuery<{ id: number; plateNumber: string; subcontractorId: number | null }[]>({
    queryKey: ["/api/trucks"],
    queryFn: () => fetch("/api/trucks", { credentials: "include" }).then((r) => r.json()),
  });
  const subTrucks = (allTrucks as any[]).filter((t: any) => t.subcontractorId === id);

  const [showAddOtherExpense, setShowAddOtherExpense] = useState(false);
  const [addingOtherExpense, setAddingOtherExpense] = useState(false);
  const emptyOtherExpenseForm = { truckId: "", costType: "maintenance", description: "", amount: "", currency: "USD", expenseDate: new Date().toISOString().split("T")[0] };
  const [otherExpenseForm, setOtherExpenseForm] = useState(emptyOtherExpenseForm);

  const handleAddOtherExpense = async () => {
    if (!otherExpenseForm.truckId || !otherExpenseForm.amount || parseFloat(otherExpenseForm.amount) <= 0) return;
    setAddingOtherExpense(true);
    try {
      const r = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tier: "truck",
          truckId: parseInt(otherExpenseForm.truckId),
          subcontractorId: id,
          costType: otherExpenseForm.costType,
          description: otherExpenseForm.description || null,
          amount: parseFloat(otherExpenseForm.amount),
          currency: otherExpenseForm.currency,
          expenseDate: otherExpenseForm.expenseDate,
        }),
      });
      if (!r.ok) throw new Error("Failed");
      qc.invalidateQueries({ queryKey: [`/api/expenses`, id, "truck"] });
      qc.invalidateQueries({ queryKey: ["/api/expenses"] });
      setShowAddOtherExpense(false);
      setOtherExpenseForm(emptyOtherExpenseForm);
    } catch { /* silent */ }
    finally { setAddingOtherExpense(false); }
  };

  const { data: subTrips = [] } = useQuery<any[]>({
    queryKey: [`/api/trips`, "sub", id],
    queryFn: () => fetch(`/api/trips?subcontractorId=${id}`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!id,
  });

  const [showTx, setShowTx] = useState(false);
  const [txForm, setTxForm] = useState({ type: "payment_made", amount: "", description: "", reference: "" });
  const [activeTab, setActiveTab] = useState<"ledger" | "expenses" | "otherExpenses" | "trips">("ledger");
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [showAdjustOB, setShowAdjustOB] = useState(false);
  const [adjustOBForm, setAdjustOBForm] = useState({ newBalance: "", reason: "" });
  const [adjustingOB, setAdjustingOB] = useState(false);

  const obLocked = (sub as any)?.obLocked ?? false;
  const openingBalance = parseFloat(String((sub as any)?.openingBalance ?? "0"));

  const openEdit = () => {
    if (!sub) return;
    setEditForm({
      name: sub.name,
      contactPerson: (sub as any).contactPerson ?? "",
      email: (sub as any).email ?? "",
      phone: (sub as any).phone ?? "",
      commissionRate: String(sub.commissionRate ?? "5"),
      agoShortChargeRate: String((sub as any).agoShortChargeRate ?? "0"),
      pmsShortChargeRate: String((sub as any).pmsShortChargeRate ?? "0"),
      openingBalance: String((sub as any).openingBalance ?? "0"),
    });
    setShowEdit(true);
  };

  const handleEdit = async () => {
    if (!editForm) return;
    await updateSub({ id, data: {
      ...editForm,
      commissionRate: parseFloat(editForm.commissionRate),
      agoShortChargeRate: parseFloat(editForm.agoShortChargeRate),
      pmsShortChargeRate: parseFloat(editForm.pmsShortChargeRate),
      openingBalance: parseFloat(editForm.openingBalance),
    } });
    qc.invalidateQueries({ queryKey: [`/api/subcontractors/${id}`] });
    qc.invalidateQueries({ queryKey: ["/api/subcontractors"] });
    setShowEdit(false);
  };

  const handleDelete = async () => {
    await deleteSub({ id });
    qc.invalidateQueries({ queryKey: ["/api/subcontractors"] });
    onBack();
  };

  const handleTx = async () => {
    try {
      await createTx({ id, data: { type: txForm.type as any, amount: parseFloat(txForm.amount), description: txForm.description, reference: txForm.reference } });
    } catch (e) {
      toast({ variant: "destructive", title: "Couldn't save transaction", description: getErrorMessage(e, "Failed to save transaction") });
      return;
    }
    qc.invalidateQueries({ queryKey: [`/api/subcontractors/${id}/transactions`] });
    qc.invalidateQueries({ queryKey: [`/api/subcontractors/${id}`] });
    setShowTx(false);
    setTxForm({ type: "payment_made", amount: "", description: "", reference: "" });
  };

  const handleAdjustOB = async () => {
    setAdjustingOB(true);
    try {
      const res = await fetch(`/api/subcontractors/${id}/adjust-opening-balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newBalance: parseFloat(adjustOBForm.newBalance), reason: adjustOBForm.reason }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ variant: "destructive", title: "Error", description: err.error ?? "Failed to adjust opening balance" });
        return;
      }
      qc.invalidateQueries({ queryKey: [`/api/subcontractors/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/subcontractors"] });
      setShowAdjustOB(false);
      setAdjustOBForm({ newBalance: "", reason: "" });
    } finally {
      setAdjustingOB(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      transactions.map((t: any) => ({
        Date: formatDate(t.transactionDate),
        Type: t.type,
        Description: t.description ?? "",
        Amount: t.amount,
        Reference: t.reference ?? "",
        Running: t.runningBalance ?? 0,
      })),
      `sub-${sub?.name}-ledger`
    );
  };

  if (!sub) return null;
  const balance = (sub as any).balance ?? 0;

  return (
    <div>
      {/* Profile Header */}
      <div className="bg-card border border-border rounded-xl p-5 mb-5">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0"><ChevronLeft className="w-4 h-4" /></button>
          <div className="flex-1 min-w-0">
            {/* Name + OB badge */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-xl font-bold text-foreground">{sub.name}</h2>
              {obLocked ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 cursor-default">
                      <Lock className="w-3 h-3" />OB Locked
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Opening balance is locked after period close. Admins and managers can adjust it.</TooltipContent>
                </Tooltip>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                  <Unlock className="w-3 h-3" />OB Open
                </span>
              )}
            </div>
            {/* Contact row */}
            <p className="text-sm text-muted-foreground">
              {[(sub as any).contactPerson, (sub as any).email, (sub as any).phone].filter(Boolean).join(" · ") || "No contact info"}
            </p>
            {/* Attribute chips */}
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">Commission: {sub.commissionRate}%</span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">{(sub as any).truckCount ?? 0} trucks</span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">OB: {formatCurrency(openingBalance)}</span>
            </div>

            {/* Balance — shown inline on mobile below info */}
            <div className="mt-3 flex items-center justify-between sm:hidden">
              <div>
                <p className="text-2xl font-bold tabular-nums" style={{ color: balance >= 0 ? '#60a5fa' : 'var(--destructive)' }}>
                  {formatCurrency(Math.abs(balance))}
                </p>
                <p className="text-xs text-muted-foreground font-medium">{balance >= 0 ? "Net Payable" : "Overpaid"}</p>
              </div>
            </div>

            {/* Actions — full width on mobile */}
            <div className="flex flex-wrap gap-1.5 mt-3 sm:hidden">
              <Button size="sm" onClick={() => setShowTx(true)}><Plus className="w-3.5 h-3.5 mr-1" />Record Tx</Button>
              <Link href={`/subcontractors/${id}/statement`}>
                <Button variant="outline" size="sm" className="gap-1"><FileText className="w-3.5 h-3.5" />Statement</Button>
              </Link>
              <Button variant="outline" size="sm" onClick={openEdit}><Pencil className="w-3.5 h-3.5" /></Button>
              <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-3.5 h-3.5" /></Button>
              {obLocked && canAdjustOB && (
                <Button variant="outline" size="sm" onClick={() => { setAdjustOBForm({ newBalance: String(openingBalance), reason: "" }); setShowAdjustOB(true); }} className="text-amber-400 border-amber-500/40 hover:bg-amber-500/10">
                  <Lock className="w-3.5 h-3.5" />
                </Button>
              )}
              {(sub as any).isActive !== false ? (
                <Button variant="outline" size="sm" onClick={() => setShowDelete(true)} className="text-amber-500 border-amber-500/40 hover:bg-amber-500/10"><Trash2 className="w-3.5 h-3.5" /></Button>
              ) : (
                <Button variant="outline" size="sm" onClick={async () => { await fetch(`/api/subcontractors/${id}/reactivate`, { method: "POST", credentials: "include" }); qc.invalidateQueries({ queryKey: [`/api/subcontractors/${id}`] }); qc.invalidateQueries({ queryKey: ["/api/subcontractors"] }); }} className="text-green-500 border-green-500/40 hover:bg-green-500/10">Reactivate</Button>
              )}
            </div>
          </div>

          {/* Balance + actions — desktop only (right side) */}
          <div className="hidden sm:flex flex-col items-end gap-3 shrink-0">
            <div className="text-right">
              <p className="text-2xl font-bold tabular-nums" style={{ color: balance >= 0 ? '#60a5fa' : 'var(--destructive)' }}>
                {formatCurrency(Math.abs(balance))}
              </p>
              <p className="text-xs text-muted-foreground font-medium">{balance >= 0 ? "Net Payable" : "Overpaid"}</p>
            </div>
            <div className="flex flex-wrap gap-1.5 justify-end">
              <Button size="sm" onClick={() => setShowTx(true)}><Plus className="w-3.5 h-3.5 mr-1" />Record Tx</Button>
              <Link href={`/subcontractors/${id}/statement`}>
                <Button variant="outline" size="sm" className="gap-1"><FileText className="w-3.5 h-3.5" />Statement</Button>
              </Link>
              <Button variant="outline" size="sm" onClick={openEdit}><Pencil className="w-3.5 h-3.5" /></Button>
              <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-3.5 h-3.5" /></Button>
              {obLocked && canAdjustOB && (
                <Button variant="outline" size="sm" onClick={() => { setAdjustOBForm({ newBalance: String(openingBalance), reason: "" }); setShowAdjustOB(true); }} className="text-amber-400 border-amber-500/40 hover:bg-amber-500/10">
                  <Lock className="w-3.5 h-3.5" />
                </Button>
              )}
              {(sub as any).isActive !== false ? (
                <Button variant="outline" size="sm" onClick={() => setShowDelete(true)} className="text-amber-500 border-amber-500/40 hover:bg-amber-500/10"><Trash2 className="w-3.5 h-3.5" /></Button>
              ) : (
                <Button variant="outline" size="sm" onClick={async () => { await fetch(`/api/subcontractors/${id}/reactivate`, { method: "POST", credentials: "include" }); qc.invalidateQueries({ queryKey: [`/api/subcontractors/${id}`] }); qc.invalidateQueries({ queryKey: ["/api/subcontractors"] }); }} className="text-green-500 border-green-500/40 hover:bg-green-500/10">Reactivate</Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Financial Summary Panel */}
      <div className="bg-card border border-border rounded-xl mb-5 overflow-hidden">
        {/* Earnings breakdown */}
        <div className="px-4 pt-4 pb-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Gross Revenue</span>
            <span className="text-sm font-semibold text-foreground">{formatCurrency(statement.totalGross)}</span>
          </div>
          {statement.totalCommission > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Commission Deducted</span>
              <span className="text-sm text-destructive">−{formatCurrency(statement.totalCommission)}</span>
            </div>
          )}
          {statement.totalTripExpenses > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Trip Expenses</span>
              <span className="text-sm text-destructive">−{formatCurrency(statement.totalTripExpenses)}</span>
            </div>
          )}
          {statement.totalTruckExpenses > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Truck Expenses</span>
              <span className="text-sm text-destructive">−{formatCurrency(statement.totalTruckExpenses)}</span>
            </div>
          )}
        </div>
        {/* Net payable */}
        <div className="border-t border-border px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Net Payable (Delivered)</span>
          <span className="text-sm font-bold text-blue-400">{formatCurrency(statement.totalNetPayable)}</span>
        </div>
        {/* Paid out */}
        <div className="border-t border-border px-4 pt-3 pb-3 space-y-2.5">
          {statement.totalAdvances > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Advances Given</span>
              <span className="text-sm text-amber-400">−{formatCurrency(statement.totalAdvances)}</span>
            </div>
          )}
          {statement.totalPayments > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Payments Made</span>
              <span className="text-sm text-green-400">−{formatCurrency(statement.totalPayments)}</span>
            </div>
          )}
          {statement.totalDriverSalary > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Driver Salaries</span>
              <span className="text-sm text-purple-400">−{formatCurrency(statement.totalDriverSalary)}</span>
            </div>
          )}
        </div>
        {/* Balance */}
        <div className="border-t border-border bg-muted/30 px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Balance Due</span>
          <span className={`text-base font-bold ${statement.balance >= 0 ? "text-foreground" : "text-destructive"}`}>{formatCurrency(statement.balance)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-border overflow-x-auto">
        {(["ledger", "trips", "expenses", "otherExpenses"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap capitalize transition-colors border-b-2 -mb-px ${activeTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {tab === "ledger" ? "Account Ledger"
              : tab === "trips" ? `Trips (${(subTrips as any[]).length})`
              : tab === "expenses" ? `Trip Expenses (${(expenses as any[]).length})`
              : `Other Expenses${(otherExpenses as any[]).length ? ` (${(otherExpenses as any[]).length})` : ""}`}
          </button>
        ))}
      </div>

      {activeTab === "ledger" && (
        <>
          {/* Mobile ledger cards */}
          <div className="sm:hidden space-y-2">
            {transactions.length === 0 ? (
              <div className="bg-card border border-border rounded-xl py-12 text-center text-muted-foreground text-sm">No transactions yet</div>
            ) : transactions.map((t: any) => {
              const isCredit = !["payment_made", "advance_given", "driver_salary"].includes(t.type);
              return (
                <div key={t.id} className="bg-card border border-border rounded-xl px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs font-semibold capitalize ${
                        t.type === "payment_made" ? "text-green-400" :
                        t.type === "advance_given" ? "text-amber-400" :
                        t.type === "driver_salary" ? "text-blue-400" :
                        "text-primary"
                      }`}>{t.type.replace(/_/g, " ")}</span>
                      {t.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.description}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(t.transactionDate)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold ${isCredit ? "text-foreground" : "text-destructive"}`}>{isCredit ? "+" : "-"}{formatCurrency(t.amount)}</p>
                      <p className="text-xs text-muted-foreground">Bal: {formatCurrency(t.runningBalance ?? 0)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop ledger table */}
          <div className="hidden sm:block bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-secondary/50">
                {["Date", "Type", "Description", "Reference", "Amount", "Running Balance"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No transactions yet</td></tr>
                ) : transactions.map((t: any) => (
                  <tr key={t.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/20">
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(t.transactionDate)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium capitalize ${
                        t.type === "payment_made" ? "text-green-400" :
                        t.type === "advance_given" ? "text-amber-400" :
                        t.type === "driver_salary" ? "text-blue-400" :
                        "text-foreground"
                      }`}>{t.type.replace(/_/g, " ")}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{t.description ?? "-"}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{t.reference ?? "-"}</td>
                    <td className={`px-4 py-3 font-medium ${["payment_made", "advance_given", "driver_salary"].includes(t.type) ? "text-destructive" : "text-foreground"}`}>
                      {formatCurrency(t.amount)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatCurrency(t.runningBalance ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === "expenses" && (
        <>
          {/* Mobile expense cards */}
          <div className="sm:hidden space-y-2">
            {(expenses as any[]).length === 0 ? (
              <div className="bg-card border border-border rounded-xl py-12 flex flex-col items-center text-center">
                <Receipt className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-sm">No trip expenses recorded yet</p>
              </div>
            ) : (expenses as any[]).map((e: any) => (
              <div key={e.id} className="bg-card border border-border rounded-xl px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="text-sm font-medium capitalize">{e.category?.replace(/_/g, " ") ?? "-"}</span>
                    </div>
                    {e.description && <p className="text-xs text-muted-foreground truncate">{e.description}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {e.truckPlate && <span className="font-mono">{e.truckPlate}</span>}
                      {e.truckPlate && " · "}
                      {formatDate(e.createdAt)}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-orange-400 shrink-0">{formatCurrency(e.amount)}</span>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop expense table */}
          <div className="hidden sm:block bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-secondary/50">
                {["Trip", "Truck", "Category", "Description", "Amount", "Date"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {(expenses as any[]).length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">
                    <Receipt className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    No trip expenses recorded yet
                  </td></tr>
                ) : (expenses as any[]).map((e: any) => (
                  <tr key={e.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/20">
                    <td className="px-4 py-3 text-xs font-mono text-primary">{e.tripNumber ?? "-"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{e.truckPlate ?? "-"}</td>
                    <td className="px-4 py-3"><span className="capitalize text-xs font-medium">{e.category?.replace(/_/g, " ") ?? "-"}</span></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{e.description ?? "-"}</td>
                    <td className="px-4 py-3 font-medium text-orange-400">{formatCurrency(e.amount)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === "otherExpenses" && (
        <>
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => setShowAddOtherExpense(true)} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />Add Expense
            </Button>
          </div>
          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {(otherExpenses as any[]).length === 0 ? (
              <div className="bg-card border border-border rounded-xl py-12 flex flex-col items-center text-center">
                <Wrench className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-sm">No non-trip expenses recorded yet</p>
              </div>
            ) : (otherExpenses as any[]).map((e: any) => (
              <div key={e.id} className="bg-card border border-border rounded-xl px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="text-sm font-medium capitalize">{e.costType?.replace(/_/g, " ") ?? "-"}</span>
                      {e.truckPlate && <span className="text-xs font-mono text-muted-foreground">{e.truckPlate}</span>}
                    </div>
                    {e.description && <p className="text-xs text-muted-foreground truncate">{e.description}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">{formatDate(e.expenseDate)}</p>
                  </div>
                  <span className="text-sm font-bold text-orange-400 shrink-0">{formatCurrency(e.amount)}</span>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-secondary/50">
                {["Date", "Truck", "Category", "Description", "Amount", "Currency"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {(otherExpenses as any[]).length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">
                    <Wrench className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    No non-trip expenses recorded yet
                  </td></tr>
                ) : (otherExpenses as any[]).map((e: any) => (
                  <tr key={e.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/20">
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(e.expenseDate)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{e.truckPlate ?? "-"}</td>
                    <td className="px-4 py-3"><span className="capitalize text-xs font-medium">{e.costType?.replace(/_/g, " ") ?? "-"}</span></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{e.description ?? "-"}</td>
                    <td className="px-4 py-3 font-medium text-orange-400">{formatCurrency(e.amount)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{e.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === "trips" && (
        <div className="space-y-2">
          {(subTrips as any[]).length === 0 ? (
            <div className="bg-card border border-border rounded-xl py-12 flex flex-col items-center text-center">
              <Receipt className="w-8 h-8 text-muted-foreground/30 mb-2" />
              <p className="text-muted-foreground text-sm">No trips assigned to this subcontractor</p>
            </div>
          ) : (subTrips as any[]).map((t: any) => {
            const statusColors: Record<string, string> = {
              nominated: "bg-slate-500/20 text-slate-300",
              loading: "bg-amber-500/20 text-amber-400",
              loaded: "bg-blue-500/20 text-blue-400",
              in_transit: "bg-cyan-500/20 text-cyan-400",
              at_zambia_entry: "bg-indigo-500/20 text-indigo-300",
              at_drc_entry: "bg-violet-500/20 text-violet-300",
              delivered: "bg-green-500/20 text-green-400",
              completed: "bg-green-600/20 text-green-500",
              cancelled: "bg-red-500/20 text-red-400",
              amended_out: "bg-orange-500/20 text-orange-400",
            };
            return (
              <Link key={t.id} href={`/trips/${t.id}`}>
                <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer hover:border-primary/40 hover:bg-card/80 transition-all group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-xs font-mono text-muted-foreground">#{t.id}</span>
                      <span className="text-sm font-semibold text-foreground truncate">{t.batchName ?? "-"}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize ${statusColors[t.status] ?? "bg-secondary text-muted-foreground"}`}>
                        {t.status?.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      {t.truckPlate && <span className="font-mono">{t.truckPlate}</span>}
                      {t.batchRoute && <><span>·</span><span>{t.batchRoute.replace(/_/g, " → ")}</span></>}
                      {t.loadedQty != null && <><span>·</span><span>{t.loadedQty.toLocaleString()} MT</span></>}
                    </div>
                  </div>
                  <span className="text-muted-foreground group-hover:text-primary transition-colors text-xs">→</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Add Other Expense Dialog */}
      <Dialog open={showAddOtherExpense} onOpenChange={setShowAddOtherExpense}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Non-Trip Expense</DialogTitle>
            <DialogDescription>Log a maintenance, repair, or other truck-level cost for this subcontractor.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label>Truck *</Label>
              <Select value={otherExpenseForm.truckId} onValueChange={(v) => setOtherExpenseForm({ ...otherExpenseForm, truckId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select truck" /></SelectTrigger>
                <SelectContent>
                  {subTrucks.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.plateNumber}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category *</Label>
              <Select value={otherExpenseForm.costType} onValueChange={(v) => setOtherExpenseForm({ ...otherExpenseForm, costType: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRUCK_EXPENSE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Input className="mt-1" placeholder="e.g. Front tyre replacement" value={otherExpenseForm.description} onChange={(e) => setOtherExpenseForm({ ...otherExpenseForm, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Amount *</Label>
                <Input type="number" step="0.01" className="mt-1" value={otherExpenseForm.amount} onChange={(e) => setOtherExpenseForm({ ...otherExpenseForm, amount: e.target.value })} />
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={otherExpenseForm.currency} onValueChange={(v) => setOtherExpenseForm({ ...otherExpenseForm, currency: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["USD","ZMW","CDF","TZS","ZAR"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Date *</Label>
              <Input type="date" className="mt-1" value={otherExpenseForm.expenseDate} onChange={(e) => setOtherExpenseForm({ ...otherExpenseForm, expenseDate: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddOtherExpense(false)}>Cancel</Button>
            <Button onClick={handleAddOtherExpense} disabled={addingOtherExpense || !otherExpenseForm.truckId || !otherExpenseForm.amount}>
              {addingOtherExpense ? "Saving..." : "Save Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Transaction Dialog */}
      <Dialog open={showTx} onOpenChange={setShowTx}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Transaction</DialogTitle>
            <DialogDescription>Add a transaction to this subcontractor's ledger.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Type *</Label>
              <Select value={txForm.type} onValueChange={(v) => setTxForm({ ...txForm, type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="net_payable">Net Payable (Credit)</SelectItem>
                  <SelectItem value="advance_given">Advance Given</SelectItem>
                  <SelectItem value="payment_made">Payment Made</SelectItem>
                  <SelectItem value="driver_salary">Driver Salary Deduction</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Amount (USD) *</Label><Input type="number" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} className="mt-1" /></div>
            <div><Label>Description</Label><Input value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} className="mt-1" /></div>
            <div><Label>Reference</Label><Input value={txForm.reference} onChange={(e) => setTxForm({ ...txForm, reference: e.target.value })} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTx(false)}>Cancel</Button>
            <Button onClick={handleTx} disabled={isPending || !txForm.amount}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Subcontractor — {sub.name}</DialogTitle>
            <DialogDescription>Opening balance is {obLocked ? "locked — use Adjust OB to change it." : "editable until first period close."}</DialogDescription>
          </DialogHeader>
          {editForm && (
            <div className="space-y-3 py-2">
              <div><Label>Company Name *</Label><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="mt-1" /></div>
              <div><Label>Contact Person</Label><Input value={editForm.contactPerson} onChange={(e) => setEditForm({ ...editForm, contactPerson: e.target.value })} className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Email</Label><Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="mt-1" /></div>
                <div><Label>Phone</Label><Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Commission Rate (%)</Label>
                  <Input type="number" value={editForm.commissionRate} onChange={(e) => setEditForm({ ...editForm, commissionRate: e.target.value })} className="mt-1" />
                  <p className="text-xs text-muted-foreground mt-1">Used when no sub rate is set</p>
                </div>
                <div>
                  <Label>Default Sub Rate ($/MT)</Label>
                  <Input type="number" step="0.01" value={(editForm as any).defaultSubRatePerMt ?? ""} onChange={(e) => setEditForm({ ...editForm, defaultSubRatePerMt: e.target.value } as any)} className="mt-1" placeholder="Leave blank for commission" />
                  <p className="text-xs text-muted-foreground mt-1">If set, all trips use rate-differential model</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>AGO Short Charge Rate ($/MT)</Label>
                  <Input type="number" step="0.01" value={editForm.agoShortChargeRate} onChange={(e) => setEditForm({ ...editForm, agoShortChargeRate: e.target.value })} className="mt-1" placeholder="0.00" />
                  <p className="text-xs text-muted-foreground mt-1">Charged to sub per MT short on AGO loads</p>
                </div>
                <div>
                  <Label>PMS Short Charge Rate ($/MT)</Label>
                  <Input type="number" step="0.01" value={editForm.pmsShortChargeRate} onChange={(e) => setEditForm({ ...editForm, pmsShortChargeRate: e.target.value })} className="mt-1" placeholder="0.00" />
                  <p className="text-xs text-muted-foreground mt-1">Charged to sub per MT short on PMS loads</p>
                </div>
              </div>
              <div>
                <Label className="flex items-center gap-1.5">
                  Opening Balance (USD)
                  {obLocked && <Lock className="w-3 h-3 text-amber-400" />}
                </Label>
                <Input
                  type="number"
                  value={editForm.openingBalance}
                  onChange={(e) => setEditForm({ ...editForm, openingBalance: e.target.value })}
                  disabled={obLocked}
                  className={`mt-1 ${obLocked ? "opacity-50 cursor-not-allowed" : ""}`}
                  placeholder="0.00"
                />
                {obLocked && (
                  <p className="text-xs text-amber-400/80 mt-1">Opening balance is locked. {canAdjustOB ? "Use the Adjust OB button to override." : "Contact an admin or manager to adjust."}</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={updating || !editForm?.name}>{updating ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Opening Balance Dialog */}
      <Dialog open={showAdjustOB} onOpenChange={setShowAdjustOB}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust Opening Balance</DialogTitle>
            <DialogDescription>Override the locked opening balance for {sub.name}. This action is audited.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Current Opening Balance</Label>
              <p className="text-sm font-medium text-foreground mt-1">{formatCurrency(openingBalance)}</p>
            </div>
            <div>
              <Label>New Opening Balance (USD) *</Label>
              <Input type="number" value={adjustOBForm.newBalance} onChange={(e) => setAdjustOBForm({ ...adjustOBForm, newBalance: e.target.value })} className="mt-1" placeholder="0.00" />
            </div>
            <div>
              <Label>Reason for Adjustment *</Label>
              <Input value={adjustOBForm.reason} onChange={(e) => setAdjustOBForm({ ...adjustOBForm, reason: e.target.value })} className="mt-1" placeholder="e.g. Correcting migration error" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjustOB(false)}>Cancel</Button>
            <Button onClick={handleAdjustOB} disabled={adjustingOB || !adjustOBForm.newBalance || !adjustOBForm.reason}>
              {adjustingOB ? "Adjusting..." : "Confirm Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirm */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Deactivate Subcontractor</DialogTitle>
            <DialogDescription>All data is preserved and can be reactivated.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">This will hide <strong>{sub.name}</strong> from the active list. All ledger data, trucks, and history are preserved.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>Keep Active</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting ? "Deactivating..." : "Deactivate"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Subcontractors() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "", contactPerson: "", email: "", phone: "",
    commissionRate: "5", openingBalance: "0",
  });

  const { data: subs = [], isLoading } = useGetSubcontractors();
  const { mutateAsync: createSub, isPending } = useCreateSubcontractor();

  const filtered = (subs as Sub[]).filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    await createSub({ data: { ...form, commissionRate: parseFloat(form.commissionRate), openingBalance: parseFloat(form.openingBalance) } });
    qc.invalidateQueries({ queryKey: ["/api/subcontractors"] });
    setShowCreate(false);
    setForm({ name: "", contactPerson: "", email: "", phone: "", commissionRate: "5", openingBalance: "0" });
  };

  return (
    <Layout>
      <PageHeader
        title="Subcontractors"
        subtitle="Subcontractor accounts, ledgers and truck assignments"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportToExcel(filtered.map((s) => ({ Name: s.name, "Commission %": s.commissionRate, "Opening Balance": s.openingBalance ?? 0, Trucks: s.truckCount, Balance: s.balance })), "subcontractors")}><Download className="w-4 h-4 mr-2" />Export</Button>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />New Subcontractor</Button>
          </>
        }
      />
      <PageContent>
        {selectedId ? (
          <SubDetail id={selectedId} onBack={() => setSelectedId(null)} />
        ) : (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="Search subcontractors..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm w-56" />
              </div>
              <span className="ml-auto text-xs text-muted-foreground">{filtered.length} subcontractor{filtered.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="space-y-2">
              {isLoading ? (
                <div className="text-center py-16 text-muted-foreground">Loading subcontractors...</div>
              ) : filtered.length === 0 ? (
                <div className="bg-card border border-border rounded-xl flex flex-col items-center justify-center py-16 text-center">
                  <Users className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground font-medium">No subcontractors yet</p>
                  <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />New Subcontractor</Button>
                </div>
              ) : filtered.map((s) => {
                const balance = s.balance ?? 0;
                return (
                  <div key={s.id} onClick={() => setSelectedId(s.id)}
                    className="bg-card border border-border rounded-xl px-5 py-4 flex items-center gap-4 cursor-pointer hover:border-primary/40 hover:bg-card/80 transition-all group">
                    <div className="w-1 h-10 rounded-full bg-blue-500/40 group-hover:bg-blue-400 transition-colors shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{s.name}</span>
                        {s.obLocked && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 cursor-default">
                                <Lock className="w-2.5 h-2.5" />OB Locked
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Opening balance locked</TooltipContent>
                          </Tooltip>
                        )}
                        {s.contactPerson && <span className="text-xs text-muted-foreground">· {s.contactPerson}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>Commission: {s.commissionRate}%</span>
                        <span>·</span>
                        <span>{s.truckCount ?? 0} trucks</span>
                        <span>·</span>
                        <span>OB: {formatCurrency(parseFloat(String(s.openingBalance ?? "0")))}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className={`text-base font-bold ${balance >= 0 ? "text-primary" : "text-destructive"}`}>{formatCurrency(Math.abs(balance))}</span>
                        <p className="text-xs text-muted-foreground">{balance >= 0 ? "Payable" : "Overpaid"}</p>
                      </div>
                      <svg className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </PageContent>

      {/* Create Subcontractor Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Subcontractor</DialogTitle>
            <DialogDescription>Add a subcontractor. Set an opening balance if they have a pre-existing balance from before using this system.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Company Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" placeholder="e.g. Khayre Transport Ltd" /></div>
            <div><Label>Contact Person</Label><Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Commission Rate (%)</Label>
                <Input type="number" value={form.commissionRate} onChange={(e) => setForm({ ...form, commissionRate: e.target.value })} className="mt-1" placeholder="5" />
                <p className="text-xs text-muted-foreground mt-1">Used when no sub rate is set</p>
              </div>
              <div>
                <Label>Default Sub Rate ($/MT)</Label>
                <Input type="number" step="0.01" value={(form as any).defaultSubRatePerMt ?? ""} onChange={(e) => setForm({ ...form, defaultSubRatePerMt: e.target.value } as any)} className="mt-1" placeholder="Leave blank for commission" />
                <p className="text-xs text-muted-foreground mt-1">If set, all trips use rate-differential model</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>AGO Short Charge Rate ($/MT)</Label>
                <Input type="number" step="0.01" value={(form as any).agoShortChargeRate ?? ""} onChange={(e) => setForm({ ...form, agoShortChargeRate: e.target.value } as any)} className="mt-1" placeholder="0.00" />
              </div>
              <div>
                <Label>PMS Short Charge Rate ($/MT)</Label>
                <Input type="number" step="0.01" value={(form as any).pmsShortChargeRate ?? ""} onChange={(e) => setForm({ ...form, pmsShortChargeRate: e.target.value } as any)} className="mt-1" placeholder="0.00" />
              </div>
            </div>
            <div>
              <Label>Opening Balance (USD)</Label>
              <Input type="number" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} className="mt-1" placeholder="0.00" />
              <p className="text-xs text-muted-foreground mt-1">Enter any pre-existing balance (positive = you owe them, negative = they owe you). Editable until first period close.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isPending || !form.name}>{isPending ? "Saving..." : "Create Subcontractor"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
