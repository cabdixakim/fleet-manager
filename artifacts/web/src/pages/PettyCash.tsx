import { useState } from "react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { Wallet, Plus, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

async function fetchPettyCash() {
  const r = await fetch("/api/petty-cash", { credentials: "include" });
  return r.json();
}

export default function PettyCash() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpForm, setTopUpForm] = useState({ amount: "", description: "", date: format(new Date(), "yyyy-MM-dd") });

  const { data, isLoading } = useQuery({ queryKey: ["/api/petty-cash"], queryFn: fetchPettyCash });

  const topUp = useMutation({
    mutationFn: (body: any) => fetch("/api/petty-cash/top-up", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/petty-cash"] });
      qc.invalidateQueries({ queryKey: ["/api/gl/entries"] });
      setShowTopUp(false);
      setTopUpForm({ amount: "", description: "", date: format(new Date(), "yyyy-MM-dd") });
      toast({ title: "Petty cash topped up — GL updated" });
    },
    onError: () => toast({ title: "Failed to top up", variant: "destructive" }),
  });

  const balance = data?.balance ?? 0;
  const transactions: any[] = data?.transactions ?? [];

  const totalIn = transactions.filter((t) => t.type === "top_up").reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalOut = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <Layout>
      <PageHeader
        title="Petty Cash"
        subtitle="Track the physical cash tin — top it up from bank, see where every dollar went"
        icon={<Wallet className="w-5 h-5" />}
        actions={
          <Button size="sm" onClick={() => setShowTopUp(true)}>
            <Plus className="w-4 h-4 mr-1" /> Top Up
          </Button>
        }
      />
      <PageContent>
        {/* Balance cards */}
        <div className="flex gap-4 mb-6 flex-wrap">
          <div className="bg-card border border-border rounded-lg px-6 py-4 flex flex-col min-w-[160px]">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Current Balance</span>
            <span className={cn("text-2xl font-bold mt-1", balance >= 0 ? "text-emerald-400" : "text-red-400")}>
              {formatCurrency(balance)}
            </span>
            <span className="text-xs text-muted-foreground mt-0.5">Should be in the tin right now</span>
          </div>
          <div className="bg-card border border-border rounded-lg px-5 py-4 flex flex-col min-w-[140px]">
            <span className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-400" /> Total Added
            </span>
            <span className="text-lg font-semibold text-emerald-400 mt-1">{formatCurrency(totalIn)}</span>
          </div>
          <div className="bg-card border border-border rounded-lg px-5 py-4 flex flex-col min-w-[140px]">
            <span className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <TrendingDown className="w-3 h-3 text-amber-400" /> Total Spent
            </span>
            <span className="text-lg font-semibold text-amber-400 mt-1">{formatCurrency(totalOut)}</span>
          </div>
        </div>

        {/* Transaction history */}
        {isLoading ? (
          <div className="text-center text-muted-foreground py-16">Loading...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center text-muted-foreground py-20 flex flex-col items-center gap-3">
            <AlertCircle className="w-8 h-8 opacity-40" />
            <p className="font-medium">No transactions yet</p>
            <p className="text-sm">Top up the petty cash tin to start tracking, or log expenses as "Petty Cash" to see them here.</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Transaction History
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="px-4 py-2.5 text-left text-muted-foreground font-medium">Date</th>
                  <th className="px-4 py-2.5 text-left text-muted-foreground font-medium">Description</th>
                  <th className="px-4 py-2.5 text-right text-muted-foreground font-medium">In</th>
                  <th className="px-4 py-2.5 text-right text-muted-foreground font-medium">Out</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t: any) => {
                  const date = new Date(t.transactionDate);
                  const isIn = t.type === "top_up";
                  const amt = Math.abs(t.amount);
                  return (
                    <tr key={t.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                        {isNaN(date.getTime()) ? "—" : format(date, "dd MMM yyyy")}
                      </td>
                      <td className="px-4 py-3">{t.description}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {isIn ? <span className="text-emerald-400 font-medium">{formatCurrency(amt)}</span> : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {!isIn ? <span className="text-amber-400">{formatCurrency(amt)}</span> : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PageContent>

      {/* Top Up Dialog */}
      <Dialog open={showTopUp} onOpenChange={setShowTopUp}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Top Up Petty Cash</DialogTitle></DialogHeader>
          <div className="text-sm text-muted-foreground mb-2">
            This moves money from your bank account into the petty cash tin. Both accounts will update in the GL automatically.
          </div>
          <div className="space-y-4">
            <div>
              <Label>Amount *</Label>
              <Input
                type="number" min="0.01" step="0.01"
                value={topUpForm.amount}
                onChange={(e) => setTopUpForm({ ...topUpForm, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={topUpForm.date} onChange={(e) => setTopUpForm({ ...topUpForm, date: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={topUpForm.description}
                onChange={(e) => setTopUpForm({ ...topUpForm, description: e.target.value })}
                placeholder="e.g. Cash for Tanzania trip"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTopUp(false)}>Cancel</Button>
            <Button
              onClick={() => topUp.mutate({ amount: parseFloat(topUpForm.amount), description: topUpForm.description || undefined, date: topUpForm.date })}
              disabled={!topUpForm.amount || parseFloat(topUpForm.amount) <= 0 || topUp.isPending}
            >
              {topUp.isPending ? "Saving..." : "Top Up"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
