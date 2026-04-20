import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { throwOnApiError, getErrorMessage } from "@/lib/apiError";
import { Building2, TrendingUp, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { Link } from "wouter";

const api = (path: string, opts?: RequestInit) =>
  fetch(path, { credentials: "include", ...opts });

type BankAccount = {
  id: number;
  name: string;
  bankName: string | null;
  glCode: string;
  isActive: boolean;
  isDefault: boolean;
};

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

  // Exclude the internal default bank — it's just a tracking placeholder, not a real account
  const realBanks = banks.filter((b) => b.isActive && !b.isDefault);

  const handlePostBankBalances = async () => {
    const entries = realBanks
      .map((b) => ({ bank: b, amount: parseFloat(bankAmounts[b.id] || "0") }))
      .filter((e) => e.amount > 0);

    if (entries.length === 0) {
      toast({ variant: "destructive", title: "No amounts entered", description: "Enter a balance for at least one bank account." });
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
      toast({ title: "Bank balances recorded", description: `${entries.length} account(s) set as of ${asOfDate}.` });
      setBankAmounts({});
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to record", description: getErrorMessage(e, "Error recording bank balances") });
    } finally {
      setPosting(false);
    }
  };

  const handlePostRetainedEarnings = async () => {
    const amt = parseFloat(retainedEarnings);
    if (isNaN(amt) || amt === 0) {
      toast({ variant: "destructive", title: "Invalid amount", description: "Enter your prior profit or loss — cannot be zero." });
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
      toast({ title: "Prior earnings recorded", description: `$${Math.abs(amt).toLocaleString()} saved.` });
      setRetainedEarnings("");
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to record", description: getErrorMessage(e, "Error recording prior earnings") });
    } finally {
      setPosting(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Opening Balances"
        subtitle="Enter your starting figures when you first go live — bank balances and prior profits carried forward"
      />
      <PageContent>
        <div className="max-w-2xl space-y-6">

          {/* Info banner */}
          <div className="flex items-start gap-3 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Do this once when you start using the system</p>
              <p>This locks in your starting point — what money was in the bank and what profit you carried in from before. You don't need to enter anything else for equity; the system handles that automatically.</p>
            </div>
          </div>

          {/* As-of date */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-1">What date did you start using this system?</h3>
            <p className="text-xs text-muted-foreground mb-3">All starting balances will be recorded on this date.</p>
            <div className="max-w-xs">
              <Input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
              />
            </div>
          </div>

          {/* Bank account opening balances */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Bank Account Balances</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              What was in each of your real bank accounts on the start date?
            </p>

            {realBanks.length === 0 ? (
              <div className="rounded-lg border border-border bg-secondary/30 p-4 text-sm text-muted-foreground space-y-2">
                <p>You haven't added any real bank accounts yet.</p>
                <p>Go to <strong>Bank Accounts</strong> and add your actual bank (e.g. First National Bank, Stanbic), then come back here to enter its opening balance.</p>
                <Link href="/bank-accounts">
                  <Button variant="outline" size="sm" className="mt-1">
                    Go to Bank Accounts <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {realBanks.map((b) => (
                    <div key={b.id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{b.name}</p>
                        {b.bankName && <p className="text-xs text-muted-foreground">{b.bankName}</p>}
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
                <Button
                  className="mt-4"
                  onClick={handlePostBankBalances}
                  disabled={posting || realBanks.every((b) => !bankAmounts[b.id] || parseFloat(bankAmounts[b.id]) <= 0)}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {posting ? "Saving…" : "Save Bank Balances"}
                </Button>
              </>
            )}
          </div>

          {/* Prior year profit/loss */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-success" />
              <h3 className="text-sm font-semibold text-foreground">Prior Year Profit / Loss</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Total profit your company made in all years before switching to this system. If you were running at a loss, enter a negative number. Skip this if you're starting fresh with zero history.
            </p>
            <div className="flex items-end gap-3 max-w-sm">
              <div className="flex-1">
                <Label>Amount (e.g. 45000 for profit, -12000 for loss)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
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
                Save
              </Button>
            </div>
          </div>

        </div>
      </PageContent>
    </Layout>
  );
}
