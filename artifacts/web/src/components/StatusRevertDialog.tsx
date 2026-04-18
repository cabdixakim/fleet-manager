import { useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

function fmtStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Props {
  open: boolean;
  fromStatus: string;
  toStatus: string;
  entityType: "trip" | "batch";
  isBlocked: boolean;
  blockedHint?: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading?: boolean;
}

export function StatusRevertDialog({ open, fromStatus, toStatus, entityType, isBlocked, blockedHint, onClose, onConfirm, loading }: Props) {
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    if (!reason.trim()) return;
    onConfirm(reason.trim());
    setReason("");
  };

  const handleClose = () => {
    setReason("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-warning">
            <AlertTriangle className="w-5 h-5" />
            Reversing {entityType === "trip" ? "Trip" : "Batch"} Status
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3 text-sm">
            <span className="px-2 py-1 rounded bg-muted text-muted-foreground font-mono">{fmtStatus(fromStatus)}</span>
            <span className="text-muted-foreground">→</span>
            <span className="px-2 py-1 rounded bg-warning/15 text-warning font-mono">{fmtStatus(toStatus)}</span>
          </div>

          {isBlocked ? (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
              <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-destructive text-sm">Access Restricted</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {blockedHint ?? `Reversing a ${entityType} from ${fmtStatus(fromStatus)} has financial implications and requires manager or admin access. Contact your manager to make this change.`}
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                This is a backward status move. The change will be recorded in the audit log.
                Please provide a reason so the record stays clear.
              </p>
              <div className="space-y-2">
                <Label htmlFor="revert-reason">Reason for reversal <span className="text-destructive">*</span></Label>
                <Textarea
                  id="revert-reason"
                  placeholder="e.g. Status was marked delivered by mistake — truck is still at DRC entry"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  autoFocus
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>Cancel</Button>
          {!isBlocked && (
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={!reason.trim() || loading}
            >
              {loading ? "Saving…" : "Confirm Reversal"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
