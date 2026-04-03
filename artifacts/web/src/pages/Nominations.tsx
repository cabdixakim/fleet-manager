import { useState } from "react";
import { useGetNominations, useGetNominationDocument } from "@workspace/api-client-react";
import { Layout, PageHeader } from "@/components/Layout";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate } from "@/lib/utils";
import { exportToExcel } from "@/lib/export";
import { Printer, Package, Truck, FileText, ChevronRight, ChevronLeft, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { getRouteLabel } from "@/lib/routes";

const STATUS_COLOR: Record<string, string> = {
  nominated: "bg-blue-100 text-blue-700",
  loading: "bg-amber-100 text-amber-700",
  loaded: "bg-amber-100 text-amber-700",
  in_transit: "bg-indigo-100 text-indigo-700",
  at_zambia_entry: "bg-purple-100 text-purple-700",
  at_drc_entry: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
  amended_out: "bg-neutral-100 text-neutral-500",
};

/* ─── Hidden print-only nomination document ─── */
function PrintDocument({ batchId }: { batchId: number }) {
  const { data } = useGetNominationDocument(batchId);
  if (!data) return null;

  const { batch, trips, totalTrips, totalCapacity, company } = data;
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const activeTrips = trips.filter((t) => !["cancelled", "amended_out"].includes(t.status));

  return (
    <div
      id="nomination-document"
      className="bg-white text-neutral-900"
      style={{ fontFamily: "Arial, sans-serif" }}
    >
      {/* HEADER BAND */}
      <div style={{ backgroundColor: "#0f172a" }} className="px-10 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {company?.logoUrl ? (
            <img
              src={company.logoUrl}
              alt={company.name ?? ""}
              className="w-10 h-10 object-contain"
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = "none";
                const fallback = target.nextElementSibling as HTMLElement | null;
                if (fallback) fallback.style.display = "flex";
              }}
            />
          ) : null}
          <div
            className="w-10 h-10 bg-white/10 rounded items-center justify-center flex-shrink-0 text-white font-bold text-sm select-none"
            style={{ display: company?.logoUrl ? "none" : "flex" }}
          >
            {(company?.name ?? "OT")
              .split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0].toUpperCase()).join("")}
          </div>
          <div>
            <div className="text-white font-bold text-lg tracking-tight">{company?.name ?? "Your Company"}</div>
            {company?.phone && <div className="text-white/60 text-xs">{company.phone}</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-white font-bold text-xl tracking-widest uppercase">{batch.name}</div>
          <div className="text-white/60 text-xs mt-0.5 uppercase tracking-widest">Truck Nomination &nbsp;·&nbsp; {today}</div>
        </div>
      </div>

      {/* CLIENT + BATCH INFO */}
      <div className="grid grid-cols-3 gap-0 border-b border-neutral-200">
        <div className="px-8 py-4 border-r border-neutral-200">
          <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Client</div>
          <div className="text-sm font-bold text-neutral-900">{batch.clientName ?? "—"}</div>
        </div>
        <div className="px-8 py-4 border-r border-neutral-200">
          <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Route</div>
          <div className="text-sm font-semibold text-neutral-800">{getRouteLabel(batch.route)}</div>
        </div>
        <div className="px-8 py-4">
          <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Nomination Date</div>
          <div className="text-sm font-semibold text-neutral-800">
            {batch.nominatedDate ? formatDate(batch.nominatedDate) : today}
          </div>
        </div>
      </div>

      {/* TRUCK TABLE */}
      <div className="px-6 py-5">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ backgroundColor: "#0f172a" }}>
              {["#", "Truck Plate", "Trailer Plate", "Driver Full Name", "Passport No.", "Driving Licence", "Product", "Capacity (MT)"].map((h, i) => (
                <th
                  key={h}
                  style={{ fontSize: 9, letterSpacing: "0.08em" }}
                  className={cn(
                    "text-white px-3 py-2.5 font-bold uppercase whitespace-nowrap",
                    i === 7 ? "text-right" : "text-left"
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeTrips.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-neutral-400 text-sm italic">
                  No trucks nominated.
                </td>
              </tr>
            ) : activeTrips.map((trip, idx) => (
              <tr
                key={trip.id}
                style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}
                className="border-b border-neutral-100"
              >
                <td className="px-3 py-2.5 text-neutral-400 text-xs font-mono">{idx + 1}</td>
                <td className="px-3 py-2.5">
                  <span className="font-mono font-bold text-neutral-900">{trip.truckPlate ?? "—"}</span>
                </td>
                <td className="px-3 py-2.5 font-mono text-neutral-600">{trip.trailerPlate ?? "—"}</td>
                <td className="px-3 py-2.5 font-semibold text-neutral-900">{trip.driverName ?? "Not assigned"}</td>
                <td className="px-3 py-2.5 font-mono text-neutral-700">{trip.driverPassport ?? "—"}</td>
                <td className="px-3 py-2.5 font-mono text-neutral-700">{trip.driverLicense ?? "—"}</td>
                <td className="px-3 py-2.5 text-neutral-800 uppercase text-xs tracking-wide">{trip.product}</td>
                <td className="px-3 py-2.5 font-mono font-bold text-neutral-900 text-right">{trip.capacity.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: "#0f172a" }}>
              <td colSpan={6} className="px-3 py-2.5 text-white text-xs font-bold uppercase tracking-wider">
                Total — {totalTrips} Truck{totalTrips !== 1 ? "s" : ""}
              </td>
              <td className="px-3 py-2.5 text-white text-xs font-bold uppercase tracking-wider">Total Capacity</td>
              <td className="px-3 py-2.5 font-mono font-bold text-white text-right">{totalCapacity.toFixed(3)} MT</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* SIGNATURE FOOTER */}
      <div className="grid grid-cols-2 border-t border-neutral-200">
        <div className="px-8 py-5 border-r border-neutral-200">
          <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-3">Authorised By — {company?.name ?? "Your Company"}</div>
          <div className="border-b border-neutral-300 mt-8 mb-1" />
          <div className="text-[10px] text-neutral-500">Signature &amp; Date</div>
        </div>
        <div className="px-8 py-5">
          <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-3">Acknowledged By — {batch.clientName ?? "Client"}</div>
          <div className="border-b border-neutral-300 mt-8 mb-1" />
          <div className="text-[10px] text-neutral-500">Signature &amp; Date</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Detail panel (visible on screen) ─── */
function BatchDetailPanel({ batchId, onBack }: { batchId: number; onBack?: () => void }) {
  const { data, isLoading } = useGetNominationDocument(batchId);

  const handlePrint = () => {
    if (!data) return;
    const prev = document.title;
    document.title = `${data.batch.name} — Nomination`;
    window.print();
    setTimeout(() => { document.title = prev; }, 500);
  };

  const handleExcel = () => {
    if (!data) return;
    const rows = data.trips.map((t, idx) => ({
      "#": idx + 1,
      "Truck Plate": t.truckPlate ?? "",
      "Trailer Plate": t.trailerPlate ?? "",
      "Driver Name": t.driverName ?? "",
      "Passport No.": t.driverPassport ?? "",
      "Driving Licence": t.driverLicense ?? "",
      "Product": t.product,
      "Capacity (MT)": t.capacity,
      "Status": t.status,
    }));
    exportToExcel(rows, `Nomination_${data.batch.name}`, "Trucks");
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Failed to load batch data.</div>
    );
  }

  const { batch, trips } = data;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border bg-secondary/20 shrink-0 gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm shrink-0">
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{batch.name}</p>
            <p className="text-xs text-muted-foreground truncate">{batch.clientName} · {getRouteLabel(batch.route)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleExcel} disabled={trips.length === 0}>
            <FileSpreadsheet className="w-4 h-4 mr-1.5" />Export Excel
          </Button>
          <Button size="sm" onClick={handlePrint} disabled={trips.length === 0}>
            <Printer className="w-4 h-4 mr-1.5" />Print PDF
          </Button>
        </div>
      </div>

      {/* Batch info row */}
      <div className="flex items-center gap-4 px-4 md:px-6 py-3 border-b border-border text-xs text-muted-foreground flex-wrap shrink-0">
        <span><span className="font-medium text-foreground">Nominated:</span> {batch.nominatedDate ? formatDate(batch.nominatedDate) : "—"}</span>
        <span><span className="font-medium text-foreground">Rate:</span> ${parseFloat(batch.ratePerMt as unknown as string).toFixed(2)}/MT</span>
        <StatusBadge status={batch.status} />
      </div>

      {/* Truck table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse min-w-[640px]">
          <thead className="sticky top-0 bg-card border-b border-border">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-8">#</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Truck</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trailer</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Driver</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Passport</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Licence</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Product</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cap (MT)</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody>
            {trips.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground text-sm italic">
                  No trucks in this batch yet.
                </td>
              </tr>
            ) : trips.map((trip, idx) => (
              <tr key={trip.id} className={cn("border-b border-border/50", idx % 2 === 0 ? "bg-background" : "bg-secondary/20")}>
                <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">{idx + 1}</td>
                <td className="px-4 py-2.5">
                  <span className="font-mono font-semibold text-foreground text-xs">
                    {trip.truckPlate ?? <span className="text-red-500 italic">Missing</span>}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {trip.trailerPlate ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-xs text-foreground">
                  {trip.driverName ?? <span className="text-red-500 italic">Not assigned</span>}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground hidden md:table-cell">
                  {trip.driverPassport ?? "—"}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground hidden md:table-cell">
                  {trip.driverLicense ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-xs uppercase tracking-wide text-foreground">{trip.product}</td>
                <td className="px-4 py-2.5 font-mono text-xs font-semibold text-foreground text-right">{trip.capacity.toFixed(2)}</td>
                <td className="px-4 py-2.5">
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold", STATUS_COLOR[trip.status] ?? "bg-secondary text-muted-foreground")}>
                    {trip.status.replace(/_/g, " ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          {trips.length > 0 && (
            <tfoot className="border-t-2 border-border bg-secondary/30">
              <tr>
                <td colSpan={7} className="px-4 py-2.5 text-xs font-semibold text-foreground">
                  {data.totalTrips} active truck{data.totalTrips !== 1 ? "s" : ""} · {trips.length} total
                </td>
                <td className="px-4 py-2.5 font-mono text-xs font-bold text-foreground text-right">
                  {data.totalCapacity.toFixed(2)} MT
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Hidden print-only document */}
      <div className="hidden print:block">
        <PrintDocument batchId={batchId} />
      </div>
    </div>
  );
}

/* ─── Main page ─── */
export default function Nominations() {
  const { data: batches = [], isLoading } = useGetNominations();
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);

  return (
    <Layout>
      <PageHeader
        title="Nominations"
        subtitle="Client-facing dispatch documents"
      />

      <style>{`
        @page {
          size: A4;
          margin: 10mm 8mm;
        }
        @media print {
          body * { visibility: hidden !important; }
          #nomination-document, #nomination-document * { visibility: visible !important; }
          #nomination-document {
            position: fixed !important;
            left: 0 !important; top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      {/* === MOBILE: show either list OR detail === */}
      <div className="sm:hidden flex-1 overflow-hidden flex flex-col" style={{ minHeight: 0 }}>
        {selectedBatchId ? (
          <BatchDetailPanel batchId={selectedBatchId} onBack={() => setSelectedBatchId(null)} />
        ) : (
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
            ) : batches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <Package className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No active batches</p>
              </div>
            ) : batches.map((b) => (
              <button key={b.id} onClick={() => setSelectedBatchId(b.id)}
                className="w-full text-left px-4 py-4 border-b border-border/50 flex items-center gap-3 hover:bg-secondary/50 active:bg-secondary/70">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-foreground block truncate">{b.name}</span>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{b.clientName ?? "—"}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <StatusBadge status={b.status} />
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <Truck className="w-3 h-3" />{b.truckCount}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* === DESKTOP: side-by-side === */}
      <div className="hidden sm:flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* LEFT: Batch list */}
        <div className="w-72 shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30 shrink-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Batches</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
            ) : batches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <Package className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No active batches</p>
              </div>
            ) : batches.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedBatchId(b.id)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-border/50 transition-colors group flex items-center gap-2",
                  selectedBatchId === b.id
                    ? "bg-primary/10 border-l-2 border-l-primary"
                    : "hover:bg-secondary/50"
                )}
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-foreground truncate block">{b.name}</span>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{b.clientName ?? "—"}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={b.status} />
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <Truck className="w-3 h-3" />{b.truckCount}
                    </span>
                  </div>
                </div>
                <ChevronRight className={cn(
                  "w-4 h-4 shrink-0 transition-colors",
                  selectedBatchId === b.id ? "text-primary" : "text-muted-foreground/30 group-hover:text-muted-foreground"
                )} />
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT: Detail panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedBatchId ? (
            <BatchDetailPanel batchId={selectedBatchId} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">Select a batch</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Choose a batch from the list to view truck details and export nomination documents.
              </p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
