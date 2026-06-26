import { useState } from "react";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarRange, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type DateFilterValue = {
  dateFrom: string | null;
  dateTo: string | null;
  label: string;
};

export type StatementPeriod = { id: number; name: string; startDate: string; endDate: string };

interface Props {
  value: DateFilterValue;
  onChange: (v: DateFilterValue) => void;
  periods?: StatementPeriod[];
}

const PRESETS = [
  { label: "This Month",    fn: () => ({ from: startOfMonth(new Date()),           to: endOfMonth(new Date()) }) },
  { label: "Last Month",    fn: () => ({ from: startOfMonth(subMonths(new Date(),1)), to: endOfMonth(subMonths(new Date(),1)) }) },
  { label: "Last 3 Months", fn: () => ({ from: startOfMonth(subMonths(new Date(),2)), to: endOfMonth(new Date()) }) },
  { label: "This Year",     fn: () => ({ from: startOfYear(new Date()),             to: endOfYear(new Date()) }) },
  { label: "Last Year",     fn: () => ({ from: startOfYear(subYears(new Date(),1)), to: endOfYear(subYears(new Date(),1)) }) },
];

export function StatementDateFilter({ value, onChange, periods = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(value.dateFrom ?? "");
  const [customTo, setCustomTo] = useState(value.dateTo ?? "");

  const apply = (v: DateFilterValue) => { onChange(v); setOpen(false); };

  const applyPreset = (p: typeof PRESETS[0]) => {
    const { from, to } = p.fn();
    apply({ dateFrom: format(from, "yyyy-MM-dd"), dateTo: format(to, "yyyy-MM-dd"), label: p.label });
  };

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    const label = `${format(new Date(customFrom + "T00:00:00"), "dd MMM yyyy")} – ${format(new Date(customTo + "T00:00:00"), "dd MMM yyyy")}`;
    apply({ dateFrom: customFrom, dateTo: customTo, label });
  };

  const applyPeriod = (periodId: string) => {
    const period = periods.find((p) => String(p.id) === periodId);
    if (!period) return;
    apply({ dateFrom: period.startDate.slice(0, 10), dateTo: period.endDate.slice(0, 10), label: period.name });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs max-w-52">
          <CalendarRange className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{value.label}</span>
          <ChevronDown className="w-3 h-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="px-3 pt-3 pb-2.5 border-b border-border">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quick Presets</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => apply({ dateFrom: null, dateTo: null, label: "All Time" })}
              className={cn(
                "px-2 py-1 rounded text-xs border transition-colors",
                value.label === "All Time"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-secondary"
              )}
            >All Time</button>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className={cn(
                  "px-2 py-1 rounded text-xs border transition-colors",
                  value.label === p.label
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-secondary"
                )}
              >{p.label}</button>
            ))}
          </div>
        </div>

        <div className="px-3 py-3 border-b border-border">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Custom Range</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs mb-1 block">From</Label>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-7 text-xs px-2" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">To</Label>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-7 text-xs px-2" />
            </div>
          </div>
          <Button size="sm" className="mt-2 h-7 text-xs w-full" onClick={applyCustom} disabled={!customFrom || !customTo}>
            Apply Range
          </Button>
        </div>

        {periods.length > 0 && (
          <div className="px-3 py-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Accounting Period</p>
            <Select onValueChange={applyPeriod}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select a period…" />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
