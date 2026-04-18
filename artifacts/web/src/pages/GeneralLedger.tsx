import { useState } from "react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { exportToExcel } from "@/lib/export";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Plus, Download, BookOpen, ChevronDown, ChevronRight, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const REF_TYPE_LABEL: Record<string, string> = {
  invoice: "Invoice", invoice_payment: "Payment", company_expense: "Expense",
  payroll: "Payroll", trip_expense: "Trip Expense", manual: "Manual",
};
const REF_TYPE_COLOR: Record<string, string> = {
  invoice: "bg-primary/10 text-primary",
  invoice_payment: "bg-emerald-500/10 text-emerald-400",
  company_expense: "bg-amber-500/10 text-amber-400",
  payroll: "bg-purple-500/10 text-purple-400",
  trip_expense: "bg-blue-500/10 text-blue-400",
  manual: "bg-muted text-muted-foreground",
};

async function fetchEntries(from: string, to: string) {
  const r = await fetch(`/api/gl/entries?from=${from}&to=${to}`, { credentials: "include" });
  return r.json();
}
async function fetchAccounts() {
  const r = await fetch("/api/gl/accounts", { credentials: "include" });
  return r.json();
}

export default function GeneralLedger() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const now = new Date();
  const [from, setFrom] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(now), "yyyy-MM-dd"));
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["/api/gl/entries", from, to],
    queryFn: () => fetchEntries(from, to),
  });
  const { data: accounts = [] } = useQuery({ queryKey: ["/api/gl/accounts"], queryFn: fetchAccounts });

  // Manual entry form state
  const [entryForm, setEntryForm] = useState({
    description: "",
    entryDate: format(now, "yyyy-MM-dd"),
    lines: [
      { accountId: "", debit: "", credit: "", description: "" },
      { accountId: "", debit: "", credit: "", description: "" },
    ],
  });

  const totalDebit = entryForm.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = entryForm.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const { mutateAsync: createEntry, isPending: creating } = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch("/api/gl/entries", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/gl/entries"] });
      setShowCreate(false);
      setEntryForm({ description: "", entryDate: format(now, "yyyy-MM-dd"), lines: [{ accountId: "", debit: "", credit: "", description: "" }, { accountId: "", debit: "", credit: "", description: "" }] });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const { mutateAsync: deleteEntry } = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/gl/entries/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/gl/entries"] }); setConfirmDelete(null); },
    onError: (e: any) => toast({ variant: "destructive", title: "Cannot delete", description: e.message }),
  });

  const handleCreateEntry = () => {
    const validLines = entryForm.lines.filter((l) => l.accountId && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0));
    createEntry({
      description: entryForm.description,
      entryDate: entryForm.entryDate,
      referenceType: "manual",
      lines: validLines.map((l) => ({ accountId: parseInt(l.accountId), debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0, description: l.description || undefined })),
    });
  };

  const addLine = () => setEntryForm((f) => ({ ...f, lines: [...f.lines, { accountId: "", debit: "", credit: "", description: "" }] }));
  const removeLine = (i: number) => setEntryForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
  const updateLine = (i: number, field: string, value: string) => setEntryForm((f) => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? { ...l, [field]: value } : l) }));

  const handleExport = () => {
    const rows = (entries as any[]).flatMap((e: any) =>
      e.lines.map((l: any) => ({
        "Entry #": e.entryNumber,
        Date: format(new Date(e.entryDate), "dd/MM/yyyy"),
        Description: e.description,
        Reference: e.referenceType ? `${REF_TYPE_LABEL[e.referenceType] ?? e.referenceType} #${e.referenceId ?? ""}` : "",
        Account: `${l.accountCode} — ${l.accountName}`,
        "Debit": parseFloat(l.debit),
        "Credit": parseFloat(l.credit),
      }))
    );
    exportToExcel(rows, `general-ledger-${from}-${to}`);
  };

  const grandDebit = (entries as any[]).reduce((s: number, e: any) => s + (e.totalDebit ?? 0), 0);

  return (
    <Layout>
      <PageHeader
        title="General Ledger"
        subtitle={`${(entries as any[]).length} journal entries`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Export</span></Button>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Journal Entry</span></Button>
          </>
        }
      />
      <PageContent>
        {/* Date filter */}
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground shrink-0">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-sm w-36" />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground shrink-0">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-sm w-36" />
          </div>
          {grandDebit > 0 && (
            <div className="flex items-center gap-4 ml-auto text-sm">
              <span className="text-muted-foreground">Period total: <span className="font-semibold text-foreground">{formatCurrency(grandDebit)}</span></span>
            </div>
          )}
        </div>

        {/* Entries */}
        {isLoading ? (
          <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-14 bg-secondary/30 animate-pulse rounded-xl" />)}</div>
        ) : (entries as any[]).length === 0 ? (
          <div className="bg-card border border-border rounded-2xl flex flex-col items-center justify-center py-16 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-foreground font-semibold mb-1">No journal entries in this period</p>
            <p className="text-sm text-muted-foreground mb-4">Entries are created automatically when you raise invoices, record expenses, or run payroll. You can also create manual entries.</p>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />Manual Journal Entry</Button>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-8"></th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Entry #</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Description</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden md:table-cell">Reference</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Amount</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {(entries as any[]).map((entry: any) => (
                  <>
                    <tr
                      key={entry.id}
                      className="border-b border-border/50 hover:bg-secondary/20 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    >
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {expandedId === entry.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{entry.entryNumber}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{format(new Date(entry.entryDate), "dd MMM yyyy")}</td>
                      <td className="px-4 py-2.5 font-medium text-foreground">{entry.description}</td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        {entry.referenceType && (
                          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded", REF_TYPE_COLOR[entry.referenceType] ?? "bg-muted text-muted-foreground")}>
                            {REF_TYPE_LABEL[entry.referenceType] ?? entry.referenceType}
                            {entry.referenceId ? ` #${entry.referenceId}` : ""}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-foreground">{formatCurrency(entry.totalDebit)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {entry.referenceType === "manual" && (
                          <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(entry); }} className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedId === entry.id && (
                      <tr key={`${entry.id}-lines`} className="border-b border-border/50 bg-secondary/10">
                        <td colSpan={7} className="px-8 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="text-left pb-1 font-medium">Account</th>
                                <th className="text-right pb-1 font-medium">Debit</th>
                                <th className="text-right pb-1 font-medium">Credit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(entry.lines ?? []).map((line: any) => (
                                <tr key={line.id} className="border-t border-border/30">
                                  <td className="py-1 font-mono text-muted-foreground">
                                    {line.accountCode} <span className="text-foreground">{line.accountName}</span>
                                    {line.description && <span className="text-muted-foreground/60 ml-2">— {line.description}</span>}
                                  </td>
                                  <td className="py-1 text-right text-emerald-400">{parseFloat(line.debit) > 0 ? formatCurrency(parseFloat(line.debit)) : ""}</td>
                                  <td className="py-1 text-right text-amber-400">{parseFloat(line.credit) > 0 ? formatCurrency(parseFloat(line.credit)) : ""}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageContent>

      {/* Create Manual Journal Entry */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Manual Journal Entry</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Description *</Label>
                <Input value={entryForm.description} onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })} className="mt-1" placeholder="e.g. Depreciation — April 2026" />
              </div>
              <div>
                <Label>Date *</Label>
                <Input type="date" value={entryForm.entryDate} onChange={(e) => setEntryForm({ ...entryForm, entryDate: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Lines</Label>
                <button onClick={addLine} className="text-xs text-primary hover:underline">+ Add line</button>
              </div>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary/30 border-b border-border">
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Account</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground w-28">Debit</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground w-28">Credit</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground hidden md:table-cell">Memo</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entryForm.lines.map((line, i) => (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="px-2 py-1.5">
                          <Select value={line.accountId} onValueChange={(v) => updateLine(i, "accountId", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select account..." /></SelectTrigger>
                            <SelectContent className="max-h-52">
                              {(accounts as any[]).map((a: any) => (
                                <SelectItem key={a.id} value={String(a.id)}>
                                  <span className="font-mono text-muted-foreground mr-2">{a.code}</span>{a.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5"><Input value={line.debit} onChange={(e) => { updateLine(i, "debit", e.target.value); if (e.target.value) updateLine(i, "credit", ""); }} className="h-8 text-xs font-mono" placeholder="0.00" /></td>
                        <td className="px-2 py-1.5"><Input value={line.credit} onChange={(e) => { updateLine(i, "credit", e.target.value); if (e.target.value) updateLine(i, "debit", ""); }} className="h-8 text-xs font-mono" placeholder="0.00" /></td>
                        <td className="px-2 py-1.5 hidden md:table-cell"><Input value={line.description} onChange={(e) => updateLine(i, "description", e.target.value)} className="h-8 text-xs" placeholder="Optional" /></td>
                        <td className="px-1">{entryForm.lines.length > 2 && <button onClick={() => removeLine(i)} className="p-1 text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}</td>
                      </tr>
                    ))}
                    <tr className="bg-secondary/20">
                      <td className="px-3 py-2 text-xs text-right text-muted-foreground font-medium">Totals</td>
                      <td className="px-3 py-2 text-xs font-mono font-semibold text-emerald-400">{totalDebit > 0 ? formatCurrency(totalDebit) : ""}</td>
                      <td className="px-3 py-2 text-xs font-mono font-semibold text-amber-400">{totalCredit > 0 ? formatCurrency(totalCredit) : ""}</td>
                      <td colSpan={2} className="px-3 py-2">
                        {totalDebit > 0 && !isBalanced && (
                          <span className="flex items-center gap-1 text-xs text-red-400"><AlertCircle className="w-3 h-3" />Not balanced (diff: {formatCurrency(Math.abs(totalDebit - totalCredit))})</span>
                        )}
                        {isBalanced && <span className="text-xs text-emerald-400">✓ Balanced</span>}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreateEntry} disabled={creating || !isBalanced || !entryForm.description}>
              {creating ? "Posting..." : "Post Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.entryNumber}?</AlertDialogTitle>
            <AlertDialogDescription>This manual journal entry will be permanently deleted. Auto-posted entries cannot be deleted here — reverse them with a correcting entry instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteEntry(confirmDelete.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
