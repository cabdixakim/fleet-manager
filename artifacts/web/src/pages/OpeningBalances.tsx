import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { throwOnApiError, getErrorMessage } from "@/lib/apiError";
import { Building2, TrendingUp, CheckCircle2, ArrowRight } from "lucide-react";
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

  const realBanks = banks.filter((b) => b.isActive && !b.isDefault);

  const handlePostBankBalances = async () => {
    const entries = realBanks
      .map((b) => ({ bank: b, amount: parseFloat(bankAmounts[b.id] || "0") }))
      .filter((e) => e.amount > 0);

    if (entries.length === 0) {
      toast({ variant: "destructive", title: "Enter at least one balance" });
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
      toast({ title: "Bank balances saved" });
      setBankAmounts({});
    } catch (e) {
      toast({ variant: "destructive", title: "Failed", description: getErrorMessage(e) });
    } finally {
      setPosting(false);
    }
  };

  const handlePostRetainedEarnings = async () => {
    const amt = parseFloat(retainedEarnings);
    if (isNaN(amt) || amt === 0) {
      toast({ variant: "destructive", title: "Amount cannot be zero" });
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
      toast({ title: "Retained earnings saved" });
      setRetainedEarnings("");
    } catch (e) {
      toast({ variant: "destructive", title: "Failed", description: getErrorMessage(e) });
    } finally {
      setPosting(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Opening Balances"
        subtitle="Starting balances when going live on this system"
      />
      <PageContent>
        <div className="max-w-xl space-y-5">

          {/* As-of date */}
          <div className="bg-card border border-border rounded-xl p-5">
            <Label className="text-sm font-semibold text-foreground">Go-live date</Label>
            <div className="max-w-xs mt-2">
              <Input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
              />
            </div>
          </div>

          {/* Bank accounts */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Bank Accounts</h3>
            </div>

            {realBanks.length === 0 ? (
              <div className="text-sm text-muted-foreground space-y-3">
                <p>No bank accounts added yet. Add your banks first (e.g. Raw Bank, Salaam Bank), then set their opening balances here.</p>
                <Link href="/bank-accounts">
                  <Button variant="outline" size="sm">
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
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={bankAmounts[b.id] ?? ""}
                        onChange={(e) => setBankAmounts((prev) => ({ ...prev, [b.id]: e.target.value }))}
                        className="w-36 text-right font-mono"
                      />
                    </div>
                  ))}
                </div>
                <Button
                  className="mt-4"
                  onClick={handlePostBankBalances}
                  disabled={posting || realBanks.every((b) => !bankAmounts[b.id] || parseFloat(bankAmounts[b.id]) <= 0)}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {posting ? "Saving…" : "Save"}
                </Button>
              </>
            )}
          </div>

          {/* Retained Earnings */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-success" />
              <h3 className="text-sm font-semibold text-foreground">Retained Earnings</h3>
            </div>
            <div className="flex items-end gap-3 max-w-sm">
              <div className="flex-1">
                <Label>Amount <span className="text-muted-foreground font-normal">(negative if prior loss)</span></Label>
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
                {posting ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

        </div>
      </PageContent>
    </Layout>
  );
}
