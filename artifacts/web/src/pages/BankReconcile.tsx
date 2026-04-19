import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { GitBranch, CheckSquare, Square, ArrowLeft, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const API = "/api/bank-accounts";

export default function BankReconcile() {
  const { id } = useParams<{ id: string }>();
  const bankId = parseInt(id);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [statementBalance, setStatementBalance] = useState("");
  const [pendingChanges, setPendingChanges] = useState<Map<number, boolean>>(new Map());

  const { data: bankAccount } = useQuery<any>({
    queryKey: [`${API}/${bankId}`],
    queryFn: async () => {
      const res = await fetch(`${API}/${bankId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  const { data: transactions = [], isLoading } = useQuery<any[]>({
    queryKey: [`${API}/${bankId}/transactions`],
    queryFn: async () => {
      const res = await fetch(`${API}/${bankId}/transactions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { mutateAsync: saveReconcile, isPending: saving } = useMutation({
    mutationFn: async (changes: Map<number, boolean>) => {
      const grouped = new Map<boolean, number[]>();
      for (const [lineId, cleared] of changes) {
        if (!grouped.has(cleared)) grouped.set(cleared, []);
        grouped.get(cleared)!.push(lineId);
      }
      for (const [isCleared, lineIds] of grouped) {
        const res = await fetch(`${API}/${bankId}/reconcile`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lineIds, isCleared }),
        });
        if (!res.ok) throw new Error("Failed to save");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`${API}/${bankId}/transactions`] });
      qc.invalidateQueries({ queryKey: [API] });
      setPendingChanges(new Map());
      toast({ title: "Reconciliation saved" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const txList = transactions as any[];

  const effectiveCleared = (t: any): boolean => {
    if (pendingChanges.has(t.lineId)) return pendingChanges.get(t.lineId)!;
    return t.isCleared;
  };

  const glBalance = useMemo(() => txList.reduce((s, t) => s + t.debit - t.credit, 0), [txList]);
  const clearedBalance = useMemo(() => txList.reduce((s, t) => effectiveCleared(t) ? s + t.debit - t.credit : s, 0), [txList, pendingChanges]);
  const unclearedBalance = glBalance - clearedBalance;
  const stmtBal = parseFloat(statementBalance) || 0;
  const difference = stmtBal - clearedBalance;

  const toggle = (lineId: number, currentCleared: boolean) => {
    const next = new Map(pendingChanges);
    const existing = next.has(lineId) ? next.get(lineId)! : currentCleared;
    next.set(lineId, !existing);
    setPendingChanges(next);
  };

  const markAll = (cleared: boolean) => {
    const next = new Map(pendingChanges);
    for (const t of txList) next.set(t.lineId, cleared);
    setPendingChanges(next);
  };

  const hasPending = pendingChanges.size > 0;

  return (
    <Layout>
      <PageHeader
        title={bankAccount ? `Reconcile — ${bankAccount.name}` : "Bank Reconciliation"}
        subtitle={bankAccount?.bankName ? `${bankAccount.bankName}${bankAccount.accountNumber ? ` · ${bankAccount.accountNumber}` : ""}` : "Match your GL transactions against the bank statement"}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate("/bank-accounts")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            {hasPending && (
              <Button size="sm" onClick={() => saveReconcile(pendingChanges)} disabled={saving}>
                <CheckCheck className="w-4 h-4 mr-1" />
                {saving ? "Saving..." : `Save (${pendingChanges.size} change${pendingChanges.size !== 1 ? "s" : ""})`}
              </Button>
            )}
          </div>
        }
      />
      <PageContent>
        {/* Summary Cards */}
        <div className="flex gap-4 mb-6 flex-wrap">
          <div className="bg-card border border-border rounded-lg px-5 py-4 flex flex-col min-w-[160px]">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">GL Balance</span>
            <span className={`text-xl font-bold mt-1 ${glBalance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatCurrency(glBalance)}
            </span>
            <span className="text-xs text-muted-foreground mt-0.5">All GL transactions</span>
          </div>
          <div className="bg-card border border-border rounded-lg px-5 py-4 flex flex-col min-w-[160px]">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Cleared Balance</span>
            <span className="text-xl font-bold mt-1 text-blue-400">{formatCurrency(clearedBalance)}</span>
            <span className="text-xs text-muted-foreground mt-0.5">Ticked as matching statement</span>
          </div>
          <div className="bg-card border border-border rounded-lg px-5 py-4 flex flex-col min-w-[160px]">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Uncleared</span>
            <span className="text-xl font-bold mt-1 text-amber-400">{formatCurrency(unclearedBalance)}</span>
            <span className="text-xs text-muted-foreground mt-0.5">Not yet on statement</span>
          </div>
          <div className="bg-card border border-border rounded-lg px-5 py-4 flex flex-col min-w-[220px]">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Bank Statement Balance</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                type="number"
                value={statementBalance}
                onChange={(e) => setStatementBalance(e.target.value)}
                placeholder="Enter from statement"
                className="bg-transparent text-xl font-bold w-full outline-none placeholder:text-muted-foreground/40"
              />
            </div>
            {statementBalance && (
              <span className={cn("text-xs mt-1 font-medium", Math.abs(difference) < 0.01 ? "text-emerald-400" : "text-red-400")}>
                {Math.abs(difference) < 0.01 ? "✓ Balanced" : `Difference: ${formatCurrency(Math.abs(difference))} ${difference > 0 ? "over" : "under"}`}
              </span>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        {txList.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-muted-foreground">{txList.length} transactions</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markAll(true)}>
              <CheckSquare className="w-3 h-3 mr-1" /> Mark All Cleared
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markAll(false)}>
              <Square className="w-3 h-3 mr-1" /> Clear All
            </Button>
          </div>
        )}

        {/* Transaction Table */}
        {isLoading ? (
          <div className="text-center text-muted-foreground py-16">Loading transactions...</div>
        ) : txList.length === 0 ? (
          <div className="text-center text-muted-foreground py-20 flex flex-col items-center gap-3">
            <GitBranch className="w-10 h-10 opacity-30" />
            <p className="font-medium">No transactions found</p>
            <p className="text-sm">Transactions posted to this bank's GL account will appear here.</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="px-4 py-2.5 text-center text-muted-foreground font-medium w-10">✓</th>
                  <th className="px-4 py-2.5 text-left text-muted-foreground font-medium">Date</th>
                  <th className="px-4 py-2.5 text-left text-muted-foreground font-medium">Description</th>
                  <th className="px-4 py-2.5 text-left text-muted-foreground font-medium">Ref</th>
                  <th className="px-4 py-2.5 text-right text-muted-foreground font-medium">Money In</th>
                  <th className="px-4 py-2.5 text-right text-muted-foreground font-medium">Money Out</th>
                </tr>
              </thead>
              <tbody>
                {txList.map((t: any) => {
                  const cleared = effectiveCleared(t);
                  const isPending = pendingChanges.has(t.lineId);
                  return (
                    <tr
                      key={t.lineId}
                      onClick={() => toggle(t.lineId, t.isCleared)}
                      className={cn(
                        "border-b border-border/50 last:border-0 cursor-pointer transition-colors",
                        cleared ? "bg-emerald-400/5 hover:bg-emerald-400/8" : "hover:bg-secondary/30",
                        isPending && "ring-1 ring-inset ring-primary/30"
                      )}
                    >
                      <td className="px-4 py-3 text-center">
                        {cleared
                          ? <CheckSquare className="w-4 h-4 text-emerald-400 mx-auto" />
                          : <Square className="w-4 h-4 text-muted-foreground/40 mx-auto" />
                        }
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap tabular-nums">
                        {t.entryDate ? formatDate(t.entryDate) : "—"}
                      </td>
                      <td className="px-4 py-3 text-foreground max-w-xs">
                        <p className="truncate">{t.entryDescription}</p>
                        {t.lineDescription && t.lineDescription !== t.entryDescription && (
                          <p className="text-xs text-muted-foreground truncate">{t.lineDescription}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs whitespace-nowrap">{t.entryNumber}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {t.debit > 0 ? <span className="text-emerald-400">{formatCurrency(t.debit)}</span> : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {t.credit > 0 ? <span className="text-amber-400">{formatCurrency(t.credit)}</span> : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/20">
                  <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                    {txList.filter(t => effectiveCleared(t)).length} of {txList.length} cleared
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-emerald-400">
                    {formatCurrency(txList.reduce((s, t) => s + t.debit, 0))}
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-amber-400">
                    {formatCurrency(txList.reduce((s, t) => s + t.credit, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {hasPending && (
          <div className="mt-4 flex justify-end">
            <Button onClick={() => saveReconcile(pendingChanges)} disabled={saving} className="gap-2">
              <CheckCheck className="w-4 h-4" />
              {saving ? "Saving..." : `Save ${pendingChanges.size} Change${pendingChanges.size !== 1 ? "s" : ""}`}
            </Button>
          </div>
        )}
      </PageContent>
    </Layout>
  );
}
