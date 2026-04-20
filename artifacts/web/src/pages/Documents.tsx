import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useDocUpload } from "@/hooks/useDocUpload";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  FileText,
  Download,
  Trash2,
  Search,
  Plus,
  ExternalLink,
  FolderOpen,
  Filter,
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";

const ALL_DOC_TYPES = [
  { value: "delivery_note",   label: "Delivery Note",              group: "Trip" },
  { value: "pod",             label: "Proof of Delivery (POD)",    group: "Trip" },
  { value: "loading_order",   label: "Loading Order",              group: "Trip" },
  { value: "weigh_bridge",    label: "Weigh Bridge Certificate",   group: "Trip" },
  { value: "gate_pass",       label: "Gate Pass",                  group: "Trip" },
  { value: "customs_entry",   label: "Customs Entry / IM4",        group: "Trip" },
  { value: "transit_bond",    label: "Transit Bond",               group: "Trip" },
  { value: "insurance",       label: "Insurance Certificate",      group: "Truck" },
  { value: "roadworthy",      label: "Roadworthy",                 group: "Truck" },
  { value: "license_disc",    label: "Licence Disc",               group: "Truck" },
  { value: "customs_bond",    label: "Customs Bond",               group: "Truck" },
  { value: "license",         label: "Driver's Licence",           group: "Driver" },
  { value: "passport",        label: "Passport",                   group: "Driver" },
  { value: "medical",         label: "Medical Certificate",        group: "Driver" },
  { value: "work_permit",     label: "Work Permit",                group: "Driver" },
  { value: "driver_card",     label: "Driver Card",                group: "Driver" },
  { value: "nrc",             label: "NRC / National ID",          group: "Driver" },
  { value: "contract",        label: "Contract / Agreement",       group: "Batch" },
  { value: "packing_list",    label: "Packing List",               group: "Batch" },
  { value: "quota_allocation",label: "Quota Allocation",           group: "Batch" },
  { value: "other",           label: "Other",                      group: "General" },
];

const ENTITY_TYPES = [
  { value: "all",    label: "All Sources" },
  { value: "truck",  label: "Trucks" },
  { value: "driver", label: "Drivers" },
  { value: "trip",   label: "Trips" },
  { value: "batch",  label: "Batches" },
];

const STATUS_COLORS: Record<string, string> = {
  expired:  "bg-red-500/10 text-red-400 border-red-500/20",
  expiring: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  valid:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  none:     "bg-muted/30 text-muted-foreground border-border",
};

function docStatus(expiry: string | null) {
  if (!expiry) return "none";
  const d = differenceInDays(parseISO(expiry), new Date());
  if (d < 0) return "expired";
  if (d <= 30) return "expiring";
  return "valid";
}

function statusLabel(s: string) {
  return { expired: "Expired", expiring: "Expiring Soon", valid: "Valid", none: "No Expiry" }[s] ?? s;
}

function docTypeLabel(v: string) {
  return ALL_DOC_TYPES.find((t) => t.value === v)?.label ?? v;
}

export default function Documents() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { uploadFile, isUploading } = useDocUpload();

  const [search, setSearch] = useState("");
  const [filterEntity, setFilterEntity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const [showAdd, setShowAdd] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [form, setForm] = useState({
    entityType: "trip",
    entityId: "",
    docType: "other",
    docLabel: "",
    issueDate: "",
    expiryDate: "",
    notes: "",
  });

  const { data: docs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/documents", "vault"],
    queryFn: () =>
      fetch("/api/documents?limit=500", { credentials: "include" }).then((r) =>
        r.json()
      ),
  });

  const addDoc = useMutation({
    mutationFn: async (body: any) => {
      let fileUrl = null;
      if (pendingFile) {
        fileUrl = await uploadFile(pendingFile);
        if (!fileUrl) throw new Error("Upload failed");
      }
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...body, fileUrl }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Document added" });
      setShowAdd(false);
      setPendingFile(null);
      setForm({ entityType: "trip", entityId: "", docType: "other", docLabel: "", issueDate: "", expiryDate: "", notes: "" });
    },
    onError: (e: any) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deleteDoc = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Document deleted" });
      setConfirmDelete(null);
    },
    onError: (e: any) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const filtered = docs.filter((d) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (d.docLabel ?? "").toLowerCase().includes(q) ||
      (d.entityName ?? "").toLowerCase().includes(q) ||
      docTypeLabel(d.docType).toLowerCase().includes(q);
    const matchEntity =
      filterEntity === "all" || d.entityType === filterEntity;
    const matchStatus =
      filterStatus === "all" || docStatus(d.expiryDate) === filterStatus;
    return matchSearch && matchEntity && matchStatus;
  });

  const handleAddSubmit = () => {
    if (!form.entityId || isNaN(parseInt(form.entityId))) {
      toast({ variant: "destructive", title: "Entity ID required", description: "Enter a valid numeric ID for the truck, driver, trip, or batch." });
      return;
    }
    addDoc.mutate({
      entityType: form.entityType,
      entityId: parseInt(form.entityId),
      docType: form.docType,
      docLabel: form.docLabel || docTypeLabel(form.docType),
      issueDate: form.issueDate || null,
      expiryDate: form.expiryDate || null,
      notes: form.notes || null,
    });
  };

  const entityDocTypes = ALL_DOC_TYPES.filter(
    (t) =>
      form.entityType === "trip"
        ? ["Trip", "General"].includes(t.group)
        : form.entityType === "batch"
        ? ["Batch", "General"].includes(t.group)
        : form.entityType === "truck"
        ? ["Truck", "General"].includes(t.group)
        : ["Driver", "General"].includes(t.group)
  );

  return (
    <Layout>
      <PageHeader
        title="Document Vault"
        subtitle="All compliance, trip, and fleet documents in one place"
        actions={
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Document
          </Button>
        }
      />
      <PageContent>
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="pl-9 h-9"
            />
          </div>
          <Select value={filterEntity} onValueChange={setFilterEntity}>
            <SelectTrigger className="w-[140px] h-9">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENTITY_TYPES.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="expiring">Expiring Soon</SelectItem>
              <SelectItem value="valid">Valid</SelectItem>
              <SelectItem value="none">No Expiry</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground text-sm py-12 text-center">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <FolderOpen className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {docs.length === 0
                ? "No documents on record yet."
                : "No documents match your filters."}
            </p>
            {docs.length === 0 && (
              <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
                <Plus className="w-4 h-4 mr-1" /> Add First Document
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((doc) => {
              const status = docStatus(doc.expiryDate);
              return (
                <div
                  key={doc.id}
                  className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-4"
                >
                  <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">
                        {doc.docLabel ?? docTypeLabel(doc.docType)}
                      </span>
                      <span className="text-xs text-muted-foreground bg-secondary rounded px-1.5 py-0.5 capitalize">
                        {doc.entityType}
                      </span>
                      {doc.entityName && (
                        <span className="text-xs text-muted-foreground truncate">
                          — {doc.entityName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-[11px] text-muted-foreground">
                        {docTypeLabel(doc.docType)}
                      </span>
                      {doc.issueDate && (
                        <span className="text-[11px] text-muted-foreground">
                          Issued: {format(parseISO(doc.issueDate), "dd MMM yyyy")}
                        </span>
                      )}
                      {doc.expiryDate && (
                        <span className="text-[11px] text-muted-foreground">
                          Expires: {format(parseISO(doc.expiryDate), "dd MMM yyyy")}
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 h-4 ${STATUS_COLORS[status]}`}
                      >
                        {statusLabel(status)}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {doc.fileUrl && (
                      <a
                        href={`/api/storage${doc.fileUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        download
                      >
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Download className="w-4 h-4" />
                        </Button>
                      </a>
                    )}
                    {doc.fileUrl && (
                      <a
                        href={`/api/storage${doc.fileUrl}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete(doc)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PageContent>

      {/* Add Document Dialog */}
      <Dialog open={showAdd} onOpenChange={(o) => !o && setShowAdd(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Entity Type</Label>
                <Select
                  value={form.entityType}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, entityType: v, docType: "other" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="truck">Truck</SelectItem>
                    <SelectItem value="driver">Driver</SelectItem>
                    <SelectItem value="trip">Trip</SelectItem>
                    <SelectItem value="batch">Batch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Entity ID</Label>
                <Input
                  type="number"
                  placeholder="e.g. 42"
                  value={form.entityId}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, entityId: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Document Type</Label>
              <Select
                value={form.docType}
                onValueChange={(v) => {
                  const lbl = ALL_DOC_TYPES.find((t) => t.value === v)?.label ?? "";
                  setForm((p) => ({ ...p, docType: v, docLabel: lbl }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {entityDocTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Label (optional)</Label>
              <Input
                placeholder="Custom label…"
                value={form.docLabel}
                onChange={(e) =>
                  setForm((p) => ({ ...p, docLabel: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Issue Date</Label>
                <Input
                  type="date"
                  value={form.issueDate}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, issueDate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Expiry Date</Label>
                <Input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, expiryDate: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Attach File</Label>
              <Input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input
                placeholder="Optional notes…"
                value={form.notes}
                onChange={(e) =>
                  setForm((p) => ({ ...p, notes: e.target.value }))
                }
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={handleAddSubmit}
                disabled={addDoc.isPending || isUploading}
                className="flex-1"
              >
                {addDoc.isPending || isUploading ? "Saving…" : "Add Document"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAdd(false);
                  setPendingFile(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove &ldquo;
              {confirmDelete?.docLabel ?? docTypeLabel(confirmDelete?.docType ?? "")}&rdquo;.
              The file will remain in storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => confirmDelete && deleteDoc.mutate(confirmDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
