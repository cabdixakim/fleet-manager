import { useState } from "react";
import { History, ArrowDownUp, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";

export interface CorrectionEntry {
  id: number;
  costType: string;
  tier?: string;
  description?: string | null;
  amount: number;
  currency: string;
  expenseDate: string;
}

export interface CostTypeOption {
  value: string;
  label: string;
}

interface CorrectClosedEntryDialogProps {
  open: boolean;
  entry: CorrectionEntry | null;
  correctUrl: string;
  costTypeOptions: CostTypeOption[];
  onClose: () => void;
  onSuccess: () => void;
}

function fmtDate(d: string) {
  try { return new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}

function labelFor(options: CostTypeOption[], value: string) {
  return options.find((o) => o.value === value)?.label ?? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type Mode = "reverse_only" | "reverse_correct";

export function CorrectClosedEntryDialog({
  open, entry, correctUrl, costTypeOptions, onClose, onSuccess,
}: CorrectClosedEntryDialogProps) {
  const [mode, setMode] = useState<Mode>("reverse_correct");
  const [newAmount, setNewAmount] = useState("");
  const [newCostType, setNewCostType] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [correctionNote, setCorrectionNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<{ postingDate: string; bumped: boolean; periodName?: string } | null>(null);

  function reset() {
    setMode("reverse_correct");
    setNewAmount("");
    setNewCostType("");
    setNewDescription("");
    setCorrectionNote("");
    setError(null);
    setPosted(null);
    setLoading(false);
  }

  function handleOpenChange(open: boolean) {
    if (!open) { reset(); onClose(); }
  }

  // Pre-fill correction form whenever entry changes
  function initFromEntry() {
    if (!entry) return;
    setNewAmount(Math.abs(entry.amount).toFixed(2));
    setNewCostType(entry.costType);
    setNewDescription(entry.description ?? "");
  }

  // Called when dialog opens with a new entry
  const [lastEntryId, setLastEntryId] = useState<number | null>(null);
  if (entry && entry.id !== lastEntryId) {
    setLastEntryId(entry.id);
    initFromEntry();
  }

  const corrAmount = parseFloat(newAmount) || 0;
  const origAmount = entry ? entry.amount : 0;
  const netChange = mode === "reverse_only"
    ? -origAmount
    : -origAmount + corrAmount;

  async function handleSubmit() {
    if (!entry) return;
    if (mode === "reverse_correct" && (!newAmount || parseFloat(newAmount) <= 0)) {
      setError("Enter a valid correction amount, or switch to Reverse only.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { correctionNote: correctionNote || undefined };
      if (mode === "reverse_correct") {
        body.newAmount = parseFloat(newAmount);
        body.newCostType = newCostType || entry.costType;
        body.newDescription = newDescription || undefined;
      }
      const res = await fetch(correctUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try { const j = await res.json(); msg = j.error ?? j.message ?? msg; } catch { /* noop */ }
        setError(msg);
        return;
      }
      const result = await res.json();
      setPosted({
        postingDate: result.posting?.date ?? new Date().toISOString().split("T")[0],
        bumped: result.posting?.bumped ?? false,
        periodName: result.posting?.closedPeriodName,
      });
      onSuccess();
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-amber-500" />
            Post a Correcting Entry
          </DialogTitle>
        </DialogHeader>

        {posted ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/30">
              <ArrowDownUp className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-green-600 dark:text-green-400">Entries posted successfully</p>
                <p className="text-muted-foreground mt-1">
                  {posted.bumped
                    ? `Posted to ${posted.postingDate} (${posted.periodName ?? "current period"}).`
                    : `Dated ${posted.postingDate}.`}
                  {" "}The original entry remains in the closed period for audit history.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => { reset(); onClose(); }}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              This entry is in a closed period and cannot be deleted or edited. Post a reversal
              (and optionally a correcting entry) in the current open period instead.
            </p>

            {/* Original entry summary */}
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">{labelFor(costTypeOptions, entry.costType)}</span>
                <span className="font-mono font-semibold text-red-400">{formatCurrency(entry.amount)} {entry.currency}</span>
              </div>
              {entry.description && (
                <p className="text-muted-foreground text-xs truncate">{entry.description}</p>
              )}
              <p className="text-muted-foreground text-xs">{fmtDate(entry.expenseDate)}</p>
            </div>

            {/* Mode selector */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Correction type</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["reverse_only", "reverse_correct"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                      mode === m
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border bg-card text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    {m === "reverse_only" ? (
                      <>
                        <div className="font-medium">Reverse only</div>
                        <div className="text-xs opacity-70 mt-0.5">Zero out this entry</div>
                      </>
                    ) : (
                      <>
                        <div className="font-medium">Reverse + re-enter</div>
                        <div className="text-xs opacity-70 mt-0.5">Reversal and corrected values</div>
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Correcting entry form */}
            {mode === "reverse_correct" && (
              <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Correcting entry values</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ccorr-type">Category</Label>
                    <Select value={newCostType} onValueChange={setNewCostType}>
                      <SelectTrigger id="ccorr-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {costTypeOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ccorr-amount">Amount ({entry.currency})</Label>
                    <Input
                      id="ccorr-amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ccorr-desc">Description</Label>
                  <Input
                    id="ccorr-desc"
                    placeholder={entry.description ?? entry.costType}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Optional note */}
            <div className="space-y-1.5">
              <Label htmlFor="ccorr-note">
                Note <span className="text-muted-foreground text-xs">(optional — appears in description)</span>
              </Label>
              <Textarea
                id="ccorr-note"
                placeholder="e.g. Actual toll was $1,250 — original figure included border surcharge"
                value={correctionNote}
                onChange={(e) => setCorrectionNote(e.target.value)}
                rows={2}
              />
            </div>

            {/* Net-effect summary */}
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">What will be posted (current period)</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reversal</span>
                <span className="font-mono text-red-400">−{formatCurrency(Math.abs(origAmount))}</span>
              </div>
              {mode === "reverse_correct" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Correction</span>
                  <span className="font-mono text-emerald-400">+{formatCurrency(corrAmount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                <span>Net change</span>
                <span className={`font-mono ${netChange < 0 ? "text-red-400" : netChange > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                  {netChange < 0 ? "−" : netChange > 0 ? "+" : ""}{formatCurrency(Math.abs(netChange))}
                </span>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={loading}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? "Posting…" : "Post to Current Period"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
