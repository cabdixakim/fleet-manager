import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { throwOnApiError, getErrorMessage } from "@/lib/apiError";
import { Building2, TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";

const api = (path: string, opts?: RequestInit) =>
  fetch(path, { credentials: "include", ...opts });

type BankAccount = { id: number; name: string; bankName: string | null; glCode: string; isActive: boolean };

export default function OpeningBalances() {
  const { toast } = useToast();
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [bankAmounts, setBankAmounts] = useState<Record<number, string>>({});
  const [retainedEarnings, setRetainedEarnings] = useState("");
  const [posting, setPosting] = useState(false);

  const { data: banks = [] } = useQuery<BankAccount[]>({
    queryKey: ["bank-accounts"],
    queryFn: () => api("/api/bank-accounts").then((r) => r.json()),
  });

  const activeBanks = banks.filter((b) => b.isActive);

  const handlePostBankBalances = async () => {
    const entries = activeBanks
      .map((b) => ({ bank: b, amount: parseFloat(bankAmounts[b.id] || "0") }))
      .filter((e) => e.amount > 0);

    if (entries.length === 0) {
      toast({ variant: "destructive", title: "No amounts entered", description: "Enter at least one bank opening balance." });
      return;
    }

    setPosting(true);
    try {
      for (const e of entries) {
        const res = await api(`/api/opening-balances/bank/${e.bank.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: e.amount, asOfDate }),
        });
        await throwOnApiError(res);
      }
      toast({ title: "Bank balances posted", description: `${entries.length} account(s) posted to GL on ${asOfDate}.` });
      setBankAmounts({});
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to post", description: getErrorMessage(e, "Error posting bank balances") });
    } finally {
      setPosting(false);
    }
  };

  const handlePostRetainedEarnings = async () => {
    const amt = parseFloat(retainedEarnings);
    if (isNaN(amt) || amt === 0) {
      toast({ variant: "destructive", title: "Invalid amount", description: "Enter a non-zero retained earnings figure." });
      return;
    }

    setPosting(true);
    try {
      const res = await api("/api/opening-balances/retained-earnings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, asOfDate }),
      });
      await throwOnApiError(res);
      toast({ title: "Retained earnings posted", description: `$${Math.abs(amt).toFixed(2)} posted to GL on ${asOfDate}.` });
      setRetainedEarnings("");
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to post", description: getErrorMessage(e, "Error posting retained earnings") });
    } finally {
      setPosting(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Opening Balances"
        subtitle="Set go-live balances for bank accounts and prior year equity — posts directly to the General Ledger"
      />
      <PageContent>
        <div className="max-w-2xl space-y-6">

          {/* Info banner */}
          <div className="flex items-start gap-3 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-0.5">Use this once at go-live</p>
              Each submission posts a journal entry to the GL. Run it once per account per go-live date.
              If you need to correct an entry, reverse it from the <strong>Ledger</strong> view.
            </div>
          </div>

          {/* As-of date */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Go-Live Date</h3>
            <div className="max-w-xs">
              <Label>Date</Label>
              <Input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">All entries below will be dated on this date.</p>
            </div>
          </div>

          {/* Bank account opening balances */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Bank Account Balances</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Posts: <span className="font-mono text-foreground">DR [Bank GL] / CR 3000 Opening Balance Equity</span>
            </p>
            {activeBanks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active bank accounts found. Add bank accounts under <strong>Bank Accounts</strong> first.</p>
            ) : (
              <div className="space-y-3">
                {activeBanks.map((b) => (
                  <div key={b.id} className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{b.name}</p>
                      <p className="text-xs text-muted-foreground">{b.bankName} · GL {b.glCode}</p>
                    </div>
                    <div className="w-36">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={bankAmounts[b.id] ?? ""}
                        onChange={(e) => setBankAmounts((prev) => ({ ...prev, [b.id]: e.target.value }))}
                        className="text-right font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {activeBanks.length > 0 && (
              <Button
                className="mt-4"
                onClick={handlePostBankBalances}
                disabled={posting || activeBanks.every((b) => !bankAmounts[b.id] || parseFloat(bankAmounts[b.id]) <= 0)}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {posting ? "Posting…" : "Post Bank Balances"}
              </Button>
            )}
          </div>

          {/* Prior year retained earnings */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-success" />
              <h3 className="text-sm font-semibold text-foreground">Prior Year Retained Earnings</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Profit: <span className="font-mono text-foreground">DR 3000 / CR 3002 Retained Earnings</span>
              <br />Loss: enter a negative number — <span className="font-mono text-foreground">DR 3002 / CR 3000</span>
            </p>
            <div className="flex items-end gap-3 max-w-xs">
              <div className="flex-1">
                <Label>Amount (negative = loss)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 45000.00 or -12000.00"
                  value={retainedEarnings}
                  onChange={(e) => setRetainedEarnings(e.target.value)}
                  className="mt-1 font-mono"
                />
              </div>
              <Button
                onClick={handlePostRetainedEarnings}
                disabled={posting || !retainedEarnings || retainedEarnings === "0"}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Post
              </Button>
            </div>
          </div>

        </div>
      </PageContent>
    </Layout>
  );
}
