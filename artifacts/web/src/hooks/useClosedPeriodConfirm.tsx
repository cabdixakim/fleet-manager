import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Period = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
};

function toDateStr(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") {
    const m = d.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function findClosedFor(date: string | Date | null | undefined, periods: Period[] | undefined): Period | null {
  const ds = toDateStr(date);
  if (!ds || !periods) return null;
  return periods.find((p) => p.isClosed && p.startDate <= ds && p.endDate >= ds) ?? null;
}

type Pending = {
  closed: Period;
  resolve: (ok: boolean) => void;
};

/**
 * useClosedPeriodConfirm
 *
 * Returns a `confirm(date)` function that resolves to `true` if the user wants
 * to proceed, and a `dialog` JSX node that renders the confirmation modal.
 *
 * Usage in a form handler:
 *   const { confirm: confirmClosedPeriod, dialog: closedPeriodDialog } = useClosedPeriodConfirm();
 *   const onSubmit = async () => {
 *     if (!(await confirmClosedPeriod(form.expenseDate))) return;
 *     // ... actually mutate
 *   };
 *   return <>{closedPeriodDialog} ...form...</>
 *
 * If the date is NOT in a closed period, `confirm` resolves immediately with `true`
 * and no dialog is shown. If the date IS in a closed period, the modal explains
 * the entry will be posted to the current open period instead, and the user
 * confirms or cancels.
 */
export function useClosedPeriodConfirm() {
  const { data: periods, refetch } = useQuery<Period[]>({
    queryKey: ["/api/periods"],
    queryFn: () => fetch("/api/periods", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });

  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    async (date: Date | string | null | undefined): Promise<boolean> => {
      // If periods haven't loaded yet, fetch them now so we never silently
      // skip the confirm dialog due to a cold cache.
      let list = periods;
      if (!list) {
        const r = await refetch();
        list = r.data;
      }
      const closed = findClosedFor(date, list);
      if (!closed) return true;
      // If a previous confirm is still open, resolve it as cancelled before
      // showing the new one — prevents orphaned promises on rapid double-click.
      return new Promise<boolean>((resolve) => {
        setPending((prev) => {
          if (prev) prev.resolve(false);
          return { closed, resolve };
        });
      });
    },
    [periods, refetch],
  );

  const handleClose = useCallback(
    (proceed: boolean) => {
      if (!pending) return;
      pending.resolve(proceed);
      setPending(null);
    },
    [pending],
  );

  const dialog = useMemo(() => {
    if (!pending) return null;
    return (
      <AlertDialog open onOpenChange={(open) => { if (!open) handleClose(false); }}>
        <AlertDialogContent data-testid="dialog-closed-period-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{pending.closed.name} is closed</AlertDialogTitle>
            <AlertDialogDescription>
              The date you entered falls in <strong>{pending.closed.name}</strong>, which has been closed.
              This entry will be posted to today's date in the current open period instead, and the
              original date will be preserved in the description and audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleClose(false)} data-testid="button-closed-period-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handleClose(true)} data-testid="button-closed-period-confirm">
              Post to current period
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }, [pending, handleClose]);

  return { confirm, dialog };
}
