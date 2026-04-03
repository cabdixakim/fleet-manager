import { useState, useEffect, useRef } from "react";
import { useGetClearanceBoard, useUpdateClearanceStatus } from "@workspace/api-client-react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { formatDate, cn } from "@/lib/utils";
import { exportToExcel } from "@/lib/export";
import { useLocation, useSearchParams } from "wouter";
import { Download, ClipboardCheck, AlertCircle, CheckCircle2, Clock, ChevronRight, Check, X, RotateCcw, FileText, ArrowLeft, Paperclip, Loader2, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

type ClearanceDoc = {
  id: number;
  tripId: number;
  checkpoint: string;
  documentType: string;
  documentNumber: string | null;
  documentUrl: string | null;
  status: string;
  requestedAt: string | null;
  approvedAt: string | null;
  notes: string | null;
  createdAt: string;
  truckPlate?: string | null;
  batchName?: string | null;
  tripStatus?: string;
};

const STATUS_COLOR: Record<string, string> = {
  requested: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  pending: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  approved: "text-green-400 bg-green-500/10 border-green-500/30",
  rejected: "text-red-400 bg-red-500/10 border-red-500/30",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  requested: <Clock className="w-3.5 h-3.5" />,
  pending: <AlertCircle className="w-3.5 h-3.5" />,
  approved: <CheckCircle2 className="w-3.5 h-3.5" />,
  rejected: <X className="w-3.5 h-3.5" />,
};

function daysSince(dateStr: string | null) {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function ClearanceCard({
  doc, onEdit, highlighted, onApproved,
}: {
  doc: ClearanceDoc;
  onEdit: (doc: ClearanceDoc) => void;
  highlighted?: boolean;
  onApproved?: () => void;
}) {
  const { mutateAsync: updateStatus, isPending } = useUpdateClearanceStatus();
  const cardRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const days = daysSince(doc.createdAt);

  useEffect(() => {
    if (highlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);

  const quickUpdate = async (status: string) => {
    await updateStatus({ id: doc.id, status });
    if (status === "approved" && onApproved) onApproved();
  };

  const handleFileAttach = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads/clearance", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      await updateStatus({ id: doc.id, status: doc.status, documentUrl: data.url });
    } catch {
      alert("Document upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleFileRemove = async () => {
    if (!confirm("Remove attached document?")) return;
    await updateStatus({ id: doc.id, status: doc.status, documentUrl: null });
  };

  return (
    <div ref={cardRef} className={cn(
      "p-4 border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors",
      doc.status === "rejected" && "opacity-75",
      highlighted && "ring-2 ring-amber-400/60 bg-amber-500/5",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Truck + batch */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-sm text-foreground">{doc.truckPlate ?? "—"}</span>
            {doc.batchName && <span className="text-xs text-muted-foreground">· {doc.batchName}</span>}
            <span className={cn(
              "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border",
              STATUS_COLOR[doc.status] ?? STATUS_COLOR.requested
            )}>
              {STATUS_ICON[doc.status]}
              {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
            </span>
          </div>

          {/* Doc type + number */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="w-3 h-3 shrink-0" />
            <span className="font-medium text-foreground">{doc.documentType}</span>
            {doc.documentNumber && <span className="font-mono">{doc.documentNumber}</span>}
          </div>

          {/* Dates + waiting */}
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            {doc.requestedAt && <span>Requested: {formatDate(doc.requestedAt)}</span>}
            {doc.approvedAt && <span className="text-green-400">Approved: {formatDate(doc.approvedAt)}</span>}
            {days !== null && doc.status !== "approved" && doc.status !== "rejected" && (
              <span className={cn("font-medium", days > 3 ? "text-amber-400" : "text-muted-foreground")}>
                {days === 0 ? "Today" : `${days}d waiting`}
              </span>
            )}
          </div>

          {/* Attached document */}
          <div className="flex items-center gap-2 mt-1.5">
            {doc.documentUrl ? (
              <>
                <a
                  href={doc.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <Paperclip className="w-3 h-3" />
                  View document
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
                <button
                  onClick={handleFileRemove}
                  disabled={isPending || uploading}
                  className="text-xs text-muted-foreground/50 hover:text-red-400 transition-colors disabled:opacity-40"
                  title="Remove document"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </>
            ) : (
              <label className={cn("flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground cursor-pointer transition-colors", (uploading || isPending) && "opacity-40 pointer-events-none")}>
                {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                {uploading ? "Uploading..." : "Attach document"}
                <input
                  type="file"
                  className="sr-only"
                  accept="image/*,application/pdf"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileAttach(f); e.target.value = ""; }}
                />
              </label>
            )}
          </div>

          {doc.notes && <p className="text-xs text-muted-foreground mt-1 italic">{doc.notes}</p>}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {doc.status !== "approved" && (
            <button
              onClick={() => quickUpdate("approved")}
              disabled={isPending || uploading}
              className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/10 disabled:opacity-50 transition-colors"
              title="Approve"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          {doc.status !== "rejected" && (
            <button
              onClick={() => quickUpdate("rejected")}
              disabled={isPending || uploading}
              className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
              title="Reject"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {(doc.status === "approved" || doc.status === "rejected") && (
            <button
              onClick={() => quickUpdate("pending")}
              disabled={isPending || uploading}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-50 transition-colors"
              title="Reset to Pending"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => onEdit(doc)}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
            title="Edit details"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Clearances() {
  const [, navigate] = useLocation();
  const [searchParams] = useSearchParams();
  const { data: boardTrips = [], isLoading } = useGetClearanceBoard();
  const { mutateAsync: updateStatus, isPending: saving } = useUpdateClearanceStatus();

  const [editDoc, setEditDoc] = useState<ClearanceDoc | null>(null);
  const [editForm, setEditForm] = useState({ documentNumber: "", notes: "", status: "pending" });
  const [editUploading, setEditUploading] = useState(false);
  const [editDocUrl, setEditDocUrl] = useState<string | null>(null);

  const focusClearanceId = searchParams.get("clearanceId") ? parseInt(searchParams.get("clearanceId")!) : null;
  const returnTo = searchParams.get("returnTo") ?? null;

  const allDocs: ClearanceDoc[] = [];
  const zambiaDocs: ClearanceDoc[] = [];
  const drcDocs: ClearanceDoc[] = [];
  for (const trip of boardTrips as any[]) {
    for (const doc of trip.zambiaEntry ?? []) {
      const enriched = { ...doc, truckPlate: trip.truckPlate, batchName: trip.batchName, tripStatus: trip.tripStatus };
      allDocs.push(enriched);
      zambiaDocs.push(enriched);
    }
    for (const doc of trip.drcEntry ?? []) {
      const enriched = { ...doc, truckPlate: trip.truckPlate, batchName: trip.batchName, tripStatus: trip.tripStatus };
      allDocs.push(enriched);
      drcDocs.push(enriched);
    }
  }

  const statusCounts = {
    pending: allDocs.filter((c) => ["requested", "pending"].includes(c.status)).length,
    approved: allDocs.filter((c) => c.status === "approved").length,
    rejected: allDocs.filter((c) => c.status === "rejected").length,
  };

  const openEdit = (doc: ClearanceDoc) => {
    setEditDoc(doc);
    setEditForm({ documentNumber: doc.documentNumber ?? "", notes: doc.notes ?? "", status: doc.status });
    setEditDocUrl(doc.documentUrl ?? null);
  };

  const handleEditDocUpload = async (file: File) => {
    setEditUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads/clearance", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setEditDocUrl(data.url);
    } catch {
      alert("Document upload failed. Please try again.");
    } finally {
      setEditUploading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editDoc) return;
    await updateStatus({
      id: editDoc.id,
      status: editForm.status,
      notes: editForm.notes,
      documentNumber: editForm.documentNumber,
      documentUrl: editDocUrl,
    });
    setEditDoc(null);
    if (editForm.status === "approved" && focusClearanceId === editDoc.id && returnTo) {
      navigate(returnTo);
    }
  };

  const handleExport = () => {
    exportToExcel(
      allDocs.map((c) => ({
        Checkpoint: c.checkpoint === "zambia_entry" ? "Zambia Entry (T1)" : "DRC Entry (TR8)",
        Truck: c.truckPlate ?? "",
        Batch: c.batchName ?? "",
        "Doc Type": c.documentType,
        "Doc Number": c.documentNumber ?? "",
        Status: c.status,
        Requested: c.requestedAt ? formatDate(c.requestedAt) : "",
        Approved: c.approvedAt ? formatDate(c.approvedAt) : "",
        Notes: c.notes ?? "",
      })),
      "clearances"
    );
  };

  return (
    <Layout>
      <PageHeader
        title="Clearances"
        subtitle="Border document tracking — Zambia (T1) and DRC (TR8)"
        actions={<Button variant="outline" size="sm" onClick={handleExport}><Download className="w-4 h-4 mr-2" />Export</Button>}
      />
      {returnTo && (
        <div className="mx-6 mt-4 flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-300">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
          <span className="flex-1">A clearance needs approval before the trip can advance. Approve it below, then you'll be returned automatically.</span>
          <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-300 hover:bg-amber-500/20 shrink-0" onClick={() => navigate(returnTo)}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />Back to Batch
          </Button>
        </div>
      )}
      <PageContent>
        {/* Status Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Awaiting Action", count: statusCounts.pending, color: "text-amber-400", bg: "bg-amber-500/10", icon: <Clock className="w-5 h-5" /> },
            { label: "Approved", count: statusCounts.approved, color: "text-green-400", bg: "bg-green-500/10", icon: <CheckCircle2 className="w-5 h-5" /> },
            { label: "Rejected", count: statusCounts.rejected, color: "text-red-400", bg: "bg-red-500/10", icon: <AlertCircle className="w-5 h-5" /> },
          ].map((item) => (
            <div key={item.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
              <div className={`p-2 rounded-lg ${item.bg} ${item.color}`}>{item.icon}</div>
              <div>
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className={`text-2xl font-bold ${item.color}`}>{item.count}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Workflow Guide */}
        <div className="bg-secondary/40 border border-border rounded-xl px-5 py-3 mb-6 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Requested
          </div>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />Pending (at border)
          </div>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />Approved
          </div>
          <span className="ml-auto">
            Click <Check className="w-3 h-3 inline" /> to approve · <X className="w-3 h-3 inline" /> to reject · <ChevronRight className="w-3 h-3 inline" /> to edit details
          </span>
        </div>

        {/* Two-column board */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[
            { key: "zambia", title: "🇿🇲 Zambia Entry (T1)", items: zambiaDocs },
            { key: "drc", title: "🇨🇩 DRC Entry (TR8)", items: drcDocs },
          ].map((col) => (
            <div key={col.key} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{col.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {col.items.filter((c) => ["requested", "pending"].includes(c.status)).length} pending · {col.items.filter((c) => c.status === "approved").length} approved
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{col.items.length} doc(s)</span>
              </div>
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
              ) : col.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ClipboardCheck className="w-8 h-8 mb-2 opacity-30" />
                  <span className="text-sm">No clearances yet</span>
                  <span className="text-xs mt-1 opacity-60">Clearances are created automatically when trucks reach each border</span>
                </div>
              ) : (
                <div>
                  {col.items.map((c) => (
                    <ClearanceCard
                      key={c.id}
                      doc={c}
                      onEdit={openEdit}
                      highlighted={focusClearanceId === c.id}
                      onApproved={focusClearanceId === c.id && returnTo ? () => navigate(returnTo) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Edit dialog */}
        <Dialog open={!!editDoc} onOpenChange={(o) => !o && setEditDoc(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Clearance — {editDoc?.documentType}</DialogTitle>
              <DialogDescription>{editDoc?.truckPlate} · {editDoc?.batchName}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-sm font-medium">Clearance Document</Label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-2">Attach the physical T1 or TR8 document (PDF or photo)</p>
                {editDocUrl ? (
                  <div className="flex items-center gap-2 p-3 bg-secondary/40 border border-border rounded-lg">
                    <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                    <a
                      href={editDocUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-sm text-blue-400 hover:text-blue-300 truncate flex items-center gap-1"
                    >
                      View attached document <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      onClick={() => setEditDocUrl(null)}
                      className="text-muted-foreground hover:text-red-400 transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className={cn("flex flex-col items-center justify-center gap-1.5 p-5 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-secondary/30 hover:border-border/80 transition-colors text-muted-foreground", editUploading && "opacity-50 pointer-events-none")}>
                    {editUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Paperclip className="w-6 h-6" />}
                    <span className="text-sm font-medium">{editUploading ? "Uploading..." : "Click to upload document"}</span>
                    <span className="text-xs opacity-70">PDF, JPG or PNG</span>
                    <input
                      type="file"
                      className="sr-only"
                      accept="image/*,application/pdf"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleEditDocUpload(f); e.target.value = ""; }}
                    />
                  </label>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Status</Label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="requested">Requested</option>
                    <option value="pending">Pending (at border)</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
                <div>
                  <Label>Document Number</Label>
                  <Input
                    className="mt-1"
                    placeholder="e.g. T1-2024-0012"
                    value={editForm.documentNumber}
                    onChange={(e) => setEditForm((f) => ({ ...f, documentNumber: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea
                  className="mt-1"
                  placeholder="Any remarks, rejection reason, or follow-up notes..."
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDoc(null)}>Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={saving || editUploading}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContent>
    </Layout>
  );
}
