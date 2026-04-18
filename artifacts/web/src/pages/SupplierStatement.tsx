import { useState } from "react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ArrowLeft, CreditCard, Building2, TrendingDown, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useParams } from "wouter";

async function fetchStatement(id: string) {
  const r = await fetch(`/api/suppliers/${id}/statement`, { credentials: "include" });
  return r.json();
}

export default function SupplierStatement() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showPay, setShowPay] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", reference: "", notes: "", paymentDate: format(new Date(), "yyyy-MM-dd") });

  const { data, isLoading } = useQuery({
    queryKey: [`/api/suppliers/${id}/statement`],
    queryFn: () => fetchStatement(id),
  });

  const pay = useMutation({
    mutationFn: (body: any) => fetch(`/api/suppliers/${id}/payments`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/suppliers/${id}/statement`] });
      qc.invalidateQueries({ queryKey: ["/api/suppliers"] });
      qc.invalidateQueries({ queryKey: ["/api/gl/entries"] });
      setShowPay(false);
      setPayForm({ amount: "", reference: "", notes: "", paymentDate: format(new Date(), "yyyy-MM-dd") });
      toast({ title: "Payment recorded — GL updated" });
    },
    onError: () => toast({ title: "Failed to record payment", variant: "destructive" }),
  });

  if (isLoading) return (
    <Layout><PageContent><div className="text-center text-muted-foreground py-20">Loading...</div></PageContent></Layout>
  );
  if (!data?.supplier) return (
    <Layout><PageContent><div className="text-center text-muted-foreground py-20">Supplier not found</div></PageContent></Layout>
  );

  const { supplier, openingBalance = 0, charged, paid, balance, tripExpenses, companyExpenses, payments } = data;

  // Merge and sort all line items chronologically
  const allLines = [
    ...(tripExpenses ?? []).map((e: any) => ({ ...e, lineType: "charge", label: e.costType ?? "Trip expense" })),
    ...(companyExpenses ?? []).map((e: any) => ({ ...e, lineType: "charge", label: e.category ?? "Expense" })),
    ...(payments ?? []).map((p: any) => ({ ...p, lineType: "payment", label: "Payment" })),
  ].sort((a, b) => new Date(a.date ?? a.paymentDate).getTime() - new Date(b.date ?? b.paymentDate).getTime());

  return (
    <Layout>
      <PageHeader
        title={supplier.name}
        subtitle={`Supplier statement · ${supplier.country ?? ""}${supplier.contactPerson ? ` · ${supplier.contactPerson}` : ""}`}
        icon={<Building2 className="w-5 h-5" />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/suppliers")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            {balance > 0 && (
              <Button size="sm" onClick={() => { setPayForm({ ...payForm, amount: balance.toFixed(2) }); setShowPay(true); }}>
                <CreditCard className="w-4 h-4 mr-1" /> Pay Balance
              </Button>
            )}
          </div>
        }
      />
      <PageContent>
        {/* Balance summary */}
        <div className="flex gap-4 mb-6 flex-wrap">
          {openingBalance !== 0 && (
            <div className="bg-card border border-border rounded-lg px-5 py-3 flex flex-col">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Opening Balance</span>
              <span className="text-xl font-bold text-blue-400">{formatCurrency(openingBalance)}</span>
            </div>
          )}
          <div className="bg-card border border-border rounded-lg px-5 py-3 flex flex-col">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Total Charged</span>
            <span className="text-xl font-bold text-amber-400">{formatCurrency(charged)}</span>
          </div>
          <div className="bg-card border border-border rounded-lg px-5 py-3 flex flex-col">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Total Paid</span>
            <span className="text-xl font-bold text-emerald-400">{formatCurrency(paid)}</span>
          </div>
          <div className="bg-card border border-border rounded-lg px-5 py-3 flex flex-col">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Outstanding Balance</span>
            <span className={cn("text-xl font-bold", balance > 0 ? "text-red-400" : "text-emerald-400")}>
              {formatCurrency(balance)}
            </span>
          </div>
        </div>

        {/* Transaction history */}
        {allLines.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 flex flex-col items-center gap-2">
            <AlertCircle className="w-8 h-8 opacity-40" />
            <p>No transactions yet. Expenses tagged to this supplier will appear here.</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left text-muted-foreground font-medium">Date</th>
                  <th className="px-4 py-3 text-left text-muted-foreground font-medium">Description</th>
                  <th className="px-4 py-3 text-right text-muted-foreground font-medium">Charge</th>
                  <th className="px-4 py-3 text-right text-muted-foreground font-medium">Payment</th>
                </tr>
              </thead>
              <tbody>
                {openingBalance !== 0 && (
                  <tr className="border-b border-border/50 bg-blue-500/5">
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">—</td>
                    <td className="px-4 py-3 text-blue-400 font-medium">Opening Balance</td>
                    <td className="px-4 py-3 text-right tabular-nums text-blue-400">{formatCurrency(openingBalance)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">—</td>
                  </tr>
                )}
                {allLines.map((line: any, i: number) => {
                  const date = new Date(line.date ?? line.paymentDate ?? line.createdAt);
                  return (
                    <tr key={`${line.lineType}-${line.id}-${i}`} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {isNaN(date.getTime()) ? "—" : format(date, "dd MMM yyyy")}
                      </td>
                      <td className="px-4 py-3">
                        <span className="capitalize">{line.label}</span>
                        {line.description && <span className="text-muted-foreground ml-1">— {line.description}</span>}
                        {line.reference && <span className="text-muted-foreground ml-1">Ref: {line.reference}</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {line.lineType === "charge" ? <span className="text-amber-400">{formatCurrency(line.amount)}</span> : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {line.lineType === "payment" ? <span className="text-emerald-400">{formatCurrency(line.amount)}</span> : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/20 font-semibold">
                  <td colSpan={2} className="px-4 py-3 text-right">Balance</td>
                  <td className="px-4 py-3 text-right text-amber-400">{formatCurrency(charged)}</td>
                  <td className={cn("px-4 py-3 text-right", balance > 0 ? "text-red-400" : "text-emerald-400")}>
                    {balance > 0 ? `Owed: ${formatCurrency(balance)}` : "Clear"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </PageContent>

      {/* Record Payment Dialog */}
      <Dialog open={showPay} onOpenChange={setShowPay}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Payment — {supplier.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Amount *</Label>
              <Input
                type="number" min="0.01" step="0.01"
                value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
              />
              {balance > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Full balance: {formatCurrency(balance)}
                  <button className="ml-2 text-primary underline" onClick={() => setPayForm({ ...payForm, amount: balance.toFixed(2) })}>
                    Pay full
                  </button>
                </p>
              )}
            </div>
            <div>
              <Label>Payment Date</Label>
              <Input type="date" value={payForm.paymentDate} onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })} />
            </div>
            <div>
              <Label>Reference</Label>
              <Input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} placeholder="e.g. Bank transfer ref" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPay(false)}>Cancel</Button>
            <Button
              onClick={() => pay.mutate({ amount: parseFloat(payForm.amount), reference: payForm.reference || undefined, notes: payForm.notes || undefined, paymentDate: payForm.paymentDate })}
              disabled={!payForm.amount || parseFloat(payForm.amount) <= 0 || pay.isPending}
            >
              {pay.isPending ? "Saving..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
