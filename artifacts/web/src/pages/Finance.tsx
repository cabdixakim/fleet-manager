import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetBatches, useGetTrucks, useGetSubcontractors } from "@workspace/api-client-react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { formatCurrency, formatDate } from "@/lib/utils";
import { exportToExcel } from "@/lib/export";
import { throwOnApiError, getErrorMessage } from "@/lib/apiError";
import { useToast } from "@/hooks/use-toast";
import { Plus, Download, Trash2, Receipt, Building2, Truck, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TRIP_COST_TYPES = [
  { value: "fuel_advance",      label: "Fuel Advance (USD)" },
  { value: "fuel_1",            label: "Fuel 1 (USD)" },
  { value: "fuel_2",            label: "Fuel 2 (USD)" },
  { value: "fuel_3",            label: "Fuel 3 (USD)" },
  { value: "trip_expense_tz",   label: "Trip Expense 1" },
  { value: "trip_expense_drc",  label: "Trip Expense 2" },
  { value: "mileage_allowance", label: "Mileage Allowance" },
  { value: "per_diem",          label: "Per Diem" },
  { value: "toll",              label: "Toll / Road Levy" },
  { value: "accommodation",     label: "Accommodation" },
  { value: "weighbridge",       label: "Weighbridge" },
  { value: "loading_fee",       label: "Loading Fee" },
  { value: "offloading_fee",    label: "Offloading Fee" },
  { value: "clearing_agent",    label: "Clearing Agent" },
  { value: "maintenance",       label: "Maintenance / Repair" },
  { value: "other",             label: "Other" },
];
const OVERHEAD_CATEGORIES = [
  { value: "office_rent", label: "Office Rent" },
  { value: "salaries", label: "Staff Salaries" },
  { value: "utilities", label: "Utilities" },
  { value: "travel", label: "Travel" },
  { value: "legal", label: "Legal & Compliance" },
  { value: "accounting", label: "Accounting" },
  { value: "miscellaneous", label: "Miscellaneous" },
];
const TRUCK_EXPENSE_TYPES = [
  { value: "maintenance", label: "Maintenance / Repair" },
  { value: "tyres", label: "Tyres" },
  { value: "fuel", label: "Fuel" },
  { value: "toll", label: "Toll / Road Levy" },
  { value: "loading_fee", label: "Loading Fee" },
  { value: "other", label: "Other" },
];

async function fetchExpenses() {
  const res = await fetch("/api/expenses");
  if (!res.ok) throw new Error("Failed to fetch expenses");
  return res.json();
}
async function createExpenseApi(data: Record<string, unknown>) {
  const res = await fetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  await throwOnApiError(res);
  return res.json();
}
async function deleteExpenseApi(id: number) {
  const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
  await throwOnApiError(res);
}

export default function Finance() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [subFilter, setSubFilter] = useState("all");
  const [truckFilter, setTruckFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [deleteExpenseId, setDeleteExpenseId] = useState<number | null>(null);

  const emptyForm = { tier: "trip", batchId: "", truckId: "", costType: "toll", description: "", amount: "", currency: "USD", expenseDate: new Date().toISOString().split("T")[0] };
  const defaultCostType: Record<string, string> = { trip: "toll", truck: "maintenance", overhead: "office_rent" };
  const [form, setForm] = useState(emptyForm);

  const { data: expenses = [], isLoading } = useQuery({ queryKey: ["/api/expenses"], queryFn: fetchExpenses });
  const { data: batches = [] } = useGetBatches({});
  const { data: allTrucks = [] } = useGetTrucks();
  const { data: allSubs = [] } = useGetSubcontractors();

  const selectedTruck = (allTrucks as any[]).find((t: any) => String(t.id) === form.truckId);

  const { data: truckExpenses = [] } = useQuery({
    queryKey: ["/api/expenses", "truck-form", form.truckId],
    queryFn: async () => {
      if (!form.truckId) return [];
      const res = await fetch(`/api/expenses?truckId=${form.truckId}`);
      return res.json();
    },
    enabled: !!(form.tier === "trip" && form.truckId),
  });

  const { mutateAsync: addExpense, isPending: adding } = useMutation({
    mutationFn: createExpenseApi,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/expenses"] }),
    onError: (e) => toast({ variant: "destructive", title: "Couldn't save expense", description: getErrorMessage(e, "Failed to create expense") }),
  });
  const { mutateAsync: removeExpense } = useMutation({
    mutationFn: (id: number) => deleteExpenseApi(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/expenses"] }),
    onError: (e) => toast({ variant: "destructive", title: "Couldn't delete expense", description: getErrorMessage(e, "Failed to delete expense") }),
  });

  const handleCreate = async () => {
    const truckObj = form.truckId ? (allTrucks as any[]).find((t: any) => String(t.id) === form.truckId) : null;
    // If trip tier but no batch selected and a truck is chosen → promote to truck tier
    // so it flows into the subcontractor statement rather than floating as an orphan
    const effectiveTier = (form.tier === "trip" && !form.batchId && form.truckId) ? "truck" : form.tier;
    try {
      await addExpense({
        tier: effectiveTier,
        batchId: effectiveTier === "trip" && form.batchId ? parseInt(form.batchId) : null,
        truckId: form.truckId ? parseInt(form.truckId) : null,
        subcontractorId: (effectiveTier === "truck") && truckObj?.subcontractorId ? truckObj.subcontractorId : null,
        costType: form.costType,
        description: form.description || null,
        amount: parseFloat(form.amount),
        currency: form.currency,
        expenseDate: form.expenseDate,
      });
      setShowCreate(false);
      setForm(emptyForm);
    } catch { /* toast shown by mutation onError */ }
  };

  const expenseList = expenses as any[];

  const uniqueSubs = useMemo(() => {
    const seen = new Set<string>();
    return expenseList.filter((e) => e.subcontractorName && !seen.has(e.subcontractorName) && seen.add(e.subcontractorName));
  }, [expenseList]);

  const uniqueTrucks = useMemo(() => {
    const seen = new Set<string>();
    return expenseList.filter((e) => e.truckPlate && !seen.has(e.truckPlate) && seen.add(e.truckPlate));
  }, [expenseList]);

  const filtered = expenseList.filter((e) => {
    if (tierFilter !== "all" && e.tier !== tierFilter) return false;
    if (subFilter !== "all" && e.subcontractorName !== subFilter) return false;
    if (truckFilter !== "all" && e.truckPlate !== truckFilter) return false;
    if (dateFrom && e.expenseDate && e.expenseDate.slice(0, 10) < dateFrom) return false;
    if (dateTo && e.expenseDate && e.expenseDate.slice(0, 10) > dateTo) return false;
    if (search) {
      const q = search.toLowerCase();
      return [e.description, e.costType, e.batchName, e.truckPlate, e.subcontractorName].some((f) => f?.toLowerCase().includes(q));
    }
    return true;
  });

  const totalAll = expenseList.reduce((s, e) => s + e.amount, 0);
  const totalFiltered = filtered.reduce((s: number, e: any) => s + e.amount, 0);

  const truckExpenseList = truckExpenses as any[];
  const truckExpenseTotal = truckExpenseList.reduce((s: number, e: any) => s + e.amount, 0);

  return (
    <Layout>
      <PageHeader
        title="Expenses"
        subtitle="Trip costs and company overhead — all in one place"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportToExcel(filtered.map((e: any) => ({ Date: formatDate(e.expenseDate), Tier: e.tier, Type: e.costType, Batch: e.batchName ?? "", Truck: e.truckPlate ?? "", Subcontractor: e.subcontractorName ?? "", Description: e.description ?? "", Amount: e.amount, Currency: e.currency })), "expenses")}>
              <Download className="w-4 h-4 mr-2" />Export
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />Log Expense</Button>
          </>
        }
      />

      <PageContent>
        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { label: "Total Logged", value: formatCurrency(totalAll), sub: `${expenseList.length} entries` },
            { label: "Filtered Total", value: formatCurrency(totalFiltered), sub: `${filtered.length} of ${expenseList.length} entries` },
          ].map((k) => (
            <div key={k.label} className="bg-card border border-border rounded-lg px-4 py-3">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="text-base font-bold mt-0.5 text-foreground">{k.value}</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-7 text-xs w-36" />
          </div>

          {/* Tier chips */}
          <div className="flex gap-1 bg-secondary/40 p-0.5 rounded-md">
            {[["all","All"],["trip","Trip"],["truck","Truck"],["overhead","Overhead"]].map(([v,l]) => (
              <button key={v} onClick={() => setTierFilter(v)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${tierFilter===v?"bg-card text-foreground":"text-muted-foreground"}`}>{l}</button>
            ))}
          </div>

          {/* Date range */}
          <div className="flex items-center gap-1">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-7 text-xs w-32 border-border/60" placeholder="From" />
            <span className="text-xs text-muted-foreground">–</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-7 text-xs w-32 border-border/60" placeholder="To" />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-xs text-muted-foreground hover:text-foreground px-1">✕</button>
            )}
          </div>

          {/* Subcontractor dropdown */}
          <Select value={subFilter} onValueChange={setSubFilter}>
            <SelectTrigger className="h-7 text-xs w-40 border-border/60">
              <SelectValue placeholder="All subcontractors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subcontractors</SelectItem>
              {uniqueSubs.filter((e: any) => e.subcontractorName).map((e: any) => <SelectItem key={e.subcontractorName} value={e.subcontractorName}>{e.subcontractorName}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Truck dropdown */}
          <Select value={truckFilter} onValueChange={setTruckFilter}>
            <SelectTrigger className="h-7 text-xs w-32 border-border/60">
              <SelectValue placeholder="All trucks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All trucks</SelectItem>
              {uniqueTrucks.filter((e: any) => e.truckPlate).map((e: any) => <SelectItem key={e.truckPlate} value={e.truckPlate}>{e.truckPlate}</SelectItem>)}
            </SelectContent>
          </Select>

          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} row{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Excel-like table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-secondary/70 border-b border-border">
                  {["Date","Tier","Type","Batch","Truck","Subcontractor","Description","Amount","Currency",""].map((h, i) => (
                    <th key={i} className={`px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap ${i === 9 ? "text-center" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={10} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-10">
                    <div className="flex flex-col items-center gap-2">
                      <Receipt className="w-8 h-8 text-muted-foreground/30" />
                      <p className="text-muted-foreground">No expenses match your filters</p>
                      <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-3.5 h-3.5 mr-1" />Log Expense</Button>
                    </div>
                  </td></tr>
                ) : filtered.map((e: any, idx: number) => (
                  <tr key={e.id} className={`border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors ${idx % 2 === 0 ? "" : "bg-secondary/10"}`}>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{formatDate(e.expenseDate)}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${e.tier==="trip"?"bg-blue-500/15 text-blue-400":e.tier==="truck"?"bg-orange-500/15 text-orange-400":"bg-purple-500/15 text-purple-400"}`}>
                        {e.tier==="trip"?"Trip":e.tier==="truck"?"Truck":"OH"}
                      </span>
                    </td>
                    <td className="px-3 py-2 capitalize text-foreground/90 whitespace-nowrap">{e.costType.replace(/_/g," ")}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-28 truncate">{e.batchName??"-"}</td>
                    <td className="px-3 py-2 font-mono text-foreground/80 whitespace-nowrap">{e.truckPlate??"-"}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-28 truncate">{e.subcontractorName??"-"}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-36 truncate italic">{e.description??"-"}</td>
                    <td className="px-3 py-2 font-semibold text-foreground text-right whitespace-nowrap">{formatCurrency(e.amount)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{e.currency}</td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => setDeleteExpenseId(e.id)} title="Delete" className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-secondary/50 border-t border-border">
                    <td colSpan={7} className="px-3 py-2 text-xs font-semibold text-muted-foreground">Total ({filtered.length} entries)</td>
                    <td className="px-3 py-2 font-bold text-foreground text-right">{formatCurrency(totalFiltered)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </PageContent>

      {/* Log Expense Modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Log Expense</DialogTitle></DialogHeader>
          <div className="flex gap-5 py-2">
            <div className="flex-1 space-y-3 min-w-0">
              <div className="grid grid-cols-3 gap-2">
                {([{v:"trip",l:"Trip",sub:"Batch-linked",I:Receipt},{v:"truck",l:"Truck",sub:"Maintenance etc.",I:Truck},{v:"overhead",l:"Overhead",sub:"Company costs",I:Building2}] as const).map((t) => (
                  <button key={t.v} onClick={() => setForm({...form,tier:t.v,batchId:"",truckId:"",costType:defaultCostType[t.v]})}
                    className={`flex flex-col items-center gap-1 px-2 py-3 rounded-lg border text-center transition-all ${form.tier===t.v?"border-primary bg-primary/10 text-primary":"border-border text-muted-foreground hover:border-border/80"}`}>
                    <t.I className="w-4 h-4"/>
                    <span className="text-xs font-semibold leading-none">{t.l}</span>
                    <span className="text-[10px] leading-none opacity-70">{t.sub}</span>
                  </button>
                ))}
              </div>

              {form.tier === "trip" && (
                <>
                  <div>
                    <Label className="text-xs">Batch</Label>
                    <Select value={form.batchId} onValueChange={(v) => setForm({...form,batchId:v,truckId:""})}>
                      <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Select batch (optional)" /></SelectTrigger>
                      <SelectContent>{(batches as any[]).map((b:any)=><SelectItem key={b.id} value={String(b.id)}>{b.name||`Batch #${b.id}`} — {b.clientName}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Truck</Label>
                    <Select value={form.truckId} onValueChange={(v) => setForm({...form,truckId:v})}>
                      <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Select truck (optional)" /></SelectTrigger>
                      <SelectContent>{(allTrucks as any[]).map((t:any)=><SelectItem key={t.id} value={String(t.id)}>{t.plateNumber}{t.subcontractorName?` — ${t.subcontractorName}`:""}</SelectItem>)}</SelectContent>
                    </Select>
                    {form.truckId && !form.batchId
                      ? <p className="text-xs text-amber-400 mt-1">No batch selected — will be saved as a Truck Expense and charged to the subcontractor.</p>
                      : selectedTruck?.subcontractorName && <p className="text-xs text-muted-foreground mt-1">Sub: <span className="text-foreground font-medium">{selectedTruck.subcontractorName}</span></p>
                    }
                  </div>
                </>
              )}

              {form.tier === "truck" && (
                <div>
                  <Label className="text-xs">Truck *</Label>
                  <Select value={form.truckId} onValueChange={(v) => setForm({...form,truckId:v})}>
                    <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Select truck" /></SelectTrigger>
                    <SelectContent>{(allTrucks as any[]).map((t:any)=><SelectItem key={t.id} value={String(t.id)}>{t.plateNumber}{t.subcontractorName?` — ${t.subcontractorName}`:""}</SelectItem>)}</SelectContent>
                  </Select>
                  {selectedTruck?.subcontractorName && (
                    <p className="text-xs text-muted-foreground mt-1">Will be charged to: <span className="text-foreground font-medium">{selectedTruck.subcontractorName}</span></p>
                  )}
                </div>
              )}

              <div>
                <Label className="text-xs">{form.tier==="overhead"?"Category":"Type"} *</Label>
                <Select value={form.costType} onValueChange={(v)=>setForm({...form,costType:v})}>
                  <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{(form.tier==="overhead"?OVERHEAD_CATEGORIES:form.tier==="truck"?TRUCK_EXPENSE_TYPES:TRIP_COST_TYPES).map((c)=><SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Date *</Label>
                <Input type="date" value={form.expenseDate} onChange={(e)=>setForm({...form,expenseDate:e.target.value})} className="mt-1 h-8 text-sm" />
              </div>

              <div>
                <Label className="text-xs">Description</Label>
                <Input value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})} className="mt-1 h-8 text-sm" placeholder="Optional details" />
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Amount *</Label>
                  <Input type="number" value={form.amount} onChange={(e)=>setForm({...form,amount:e.target.value})} className="mt-1 h-8 text-sm" placeholder="0.00" />
                </div>
                <div className="w-24">
                  <Label className="text-xs">Currency</Label>
                  <Select value={form.currency} onValueChange={(v)=>setForm({...form,currency:v})}>
                    <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="TZS">TZS</SelectItem>
                      <SelectItem value="ZMW">ZMW</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {form.tier === "trip" && form.truckId && (
              <div className="w-44 shrink-0 bg-secondary/30 border border-border rounded-xl p-3 self-start">
                <p className="text-xs font-semibold text-foreground mb-0.5">{selectedTruck?.plateNumber ?? "Truck"}</p>
                {selectedTruck?.subcontractorName && <p className="text-xs text-muted-foreground mb-2">{selectedTruck.subcontractorName}</p>}
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Already Logged</p>
                {truckExpenseList.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">None yet</p>
                ) : (
                  <div className="space-y-1">
                    {truckExpenseList.slice(0,6).map((e:any)=>(
                      <div key={e.id} className="flex items-center justify-between gap-1">
                        <span className="text-[10px] text-muted-foreground truncate capitalize">{e.costType.replace(/_/g," ")}</span>
                        <span className="text-[10px] font-medium text-foreground shrink-0">{formatCurrency(e.amount)}</span>
                      </div>
                    ))}
                    {truckExpenseList.length>6&&<p className="text-[10px] text-muted-foreground">+{truckExpenseList.length-6} more</p>}
                    <div className="border-t border-border mt-1 pt-1 flex justify-between">
                      <span className="text-[10px] text-muted-foreground">Total</span>
                      <span className="text-[10px] font-bold text-foreground">{formatCurrency(truckExpenseTotal)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={adding||!form.amount||!form.costType||(form.tier==="truck"&&!form.truckId)}>{adding?"Saving...":"Log Expense"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteExpenseId !== null} onOpenChange={(o) => { if (!o) setDeleteExpenseId(null); }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>Delete expense?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This cannot be undone.</p>
          <DialogFooter className="mt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteExpenseId(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={async () => {
              if (deleteExpenseId !== null) { await removeExpense(deleteExpenseId); setDeleteExpenseId(null); }
            }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
