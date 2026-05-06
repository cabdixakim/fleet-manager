import { useState, useRef } from "react";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Upload,
  Pencil,
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";

const ALL_DOC_TYPES = [
  { value: "delivery_note",    label: "Delivery Note",              group: "Trip" },
  { value: "pod",              label: "Proof of Delivery (POD)",    group: "Trip" },
  { value: "loading_order",    label: "Loading Order",              group: "Trip" },
  { value: "weigh_bridge",     label: "Weigh Bridge Certificate",   group: "Trip" },
  { value: "gate_pass",        label: "Gate Pass",                  group: "Trip" },
  { value: "customs_entry",    label: "Customs Entry / IM4",        group: "Trip" },
  { value: "transit_bond",     label: "Transit Bond",               group: "Trip" },
  { value: "insurance",        label: "Insurance Certificate",      group: "Truck" },
  { value: "roadworthy",       label: "Roadworthy",                 group: "Truck" },
  { value: "license_disc",     label: "Licence Disc",               group: "Truck" },
  { value: "customs_bond",     label: "Customs Bond",               group: "Truck" },
  { value: "license",          label: "Driver's Licence",           group: "Driver" },
  { value: "passport",         label: "Passport",                   group: "Driver" },
  { value: "medical",          label: "Medical Certificate",        group: "Driver" },
  { value: "work_permit",      label: "Work Permit",                group: "Driver" },
  { value: "driver_card",      label: "Driver Card",                group: "Driver" },
  { value: "nrc",              label: "NRC / National ID",          group: "Driver" },
  { value: "contract",         label: "Contract / Agreement",       group: "Batch" },
  { value: "packing_list",     label: "Packing List",               group: "Batch" },
  { value: "quota_allocation", label: "Quota Allocation",           group: "Batch" },
  { value: "other",            label: "Other",                      group: "General" },
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

const emptyForm = {
  entityType: "truck",
  entityId: "",
  docType: "other",
  docLabel: "",
  issueDate: "",
  expiryDate: "",
  notes: "",
};

export default function Documents() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { uploadFile, isUploading } = useDocUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const editFileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [filterEntity, setFilterEntity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const [showAdd, setShowAdd] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [editDoc, setEditDoc] = useState<any | null>(null);
  const [editPendingFile, setEditPendingFile] = useState<File | null>(null);
  const [editForm, setEditForm] = useState({ docLabel: "", issueDate: "", expiryDate: "", notes: "" });

  const [form, setForm] = useState(emptyForm);

  const { data: docs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/documents", "vault"],
    queryFn: () =>
      fetch("/api/documents?limit=500", { credentials: "include" }).then((r) =>
        r.json()
      ),
  });

  // Fetch entity options for the Add dialog based on selected entity type
  const { data: entityOptions = [] } = useQuery<{ id: number; label: string }[]>({
    queryKey: ["/api/entity-options", form.entityType],
    queryFn: async () => {
      if (form.entityType === "truck") {
        const r = await fetch("/api/trucks", { credentials: "include" });
        const data = await r.json();
        return (Array.isArray(data) ? data : []).map((t: any) => ({ id: t.id, label: t.plateNumber ?? `Truck #${t.id}` }));
      }
      if (form.entityType === "driver") {
        const r = await fetch("/api/drivers", { credentials: "include" });
        const data = await r.json();
        return (Array.isArray(data) ? data : []).map((d: any) => ({ id: d.id, label: d.name ?? `Driver #${d.id}` }));
      }
      if (form.entityType === "trip") {
        const r = await fetch("/api/trips?limit=300", { credentials: "include" });
        const data = await r.json();
        const trips = Array.isArray(data) ? data : (data.trips ?? []);
        return trips.map((t: any) => ({ id: t.id, label: `Trip #${t.id}${t.product ? ` — ${t.product}` : ""}${t.batchName ? ` (${t.batchName})` : ""}` }));
      }
      if (form.entityType === "batch") {
        const r = await fetch("/api/batches", { credentials: "include" });
        const data = await r.json();
        const batches = Array.isArray(data) ? data : (data.batches ?? []);
        return batches.map((b: any) => ({ id: b.id, label: b.name ?? `Batch #${b.id}` }));
      }
      return [];
    },
    enabled: showAdd,
  });

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

  const addDoc = useMutation({
    mutationFn: async (body: any) => {
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      if (pendingFile) {
        const result = await uploadFile(pendingFile);
        if (!result) throw new Error("Upload failed");
        fileUrl = result.objectPath;
        fileName = result.fileName;
      }
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...body, fileUrl, fileName }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Document added" });
      setShowAdd(false);
      setPendingFile(null);
      setForm(emptyForm);
    },
    onError: (e: any) =>
      toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const updateDoc = useMutation({
    mutationFn: async (body: any) => {
      let fileUrl = editDoc?.fileUrl;
      let fileName = editDoc?.fileName;
      if (editPendingFile) {
        const result = await uploadFile(editPendingFile);
        if (result) { fileUrl = result.objectPath; fileName = result.fileName; }
      }
      const res = await fetch(`/api/documents/${editDoc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...body, fileUrl, fileName }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Document updated" });
      setEditDoc(null);
      setEditPendingFile(null);
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

  const openEdit = (doc: any) => {
    setEditDoc(doc);
    setEditForm({
      docLabel: doc.docLabel ?? "",
      issueDate: doc.issueDate ? doc.issueDate.slice(0, 10) : "",
      expiryDate: doc.expiryDate ? doc.expiryDate.slice(0, 10) : "",
      notes: doc.notes ?? "",
    });
    setEditPendingFile(null);
  };

  const handleAddSubmit = () => {
    if (!form.entityId) {
      toast({ variant: "destructive", title: "Entity required", description: "Please select the truck, driver, trip, or batch this document belongs to." });
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
                  <div className="flex items-center gap-0.5 shrink-0">
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
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(doc)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
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
      <Dialog open={showAdd} onOpenChange={(o) => { if (!o) { setShowAdd(false); setPendingFile(null); setForm(emptyForm); } else setShowAdd(true); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Entity Type *</Label>
              <Select
                value={form.entityType}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, entityType: v, entityId: "", docType: "other", docLabel: "" }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="truck">Truck</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                  <SelectItem value="trip">Trip</SelectItem>
                  <SelectItem value="batch">Batch</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>
                {form.entityType === "truck" ? "Truck" :
                 form.entityType === "driver" ? "Driver" :
                 form.entityType === "trip" ? "Trip" : "Batch"} *
              </Label>
              <Select
                value={form.entityId || "none"}
                onValueChange={(v) => setForm((p) => ({ ...p, entityId: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={entityOptions.length === 0 ? "Loading…" : "Select…"} />
                </SelectTrigger>
                <SelectContent>
                  {entityOptions.map((opt) => (
                    <SelectItem key={opt.id} value={String(opt.id)}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Document Type *</Label>
              <Select
                value={form.docType}
                onValueChange={(v) => {
                  const lbl = entityDocTypes.find((t) => t.value === v)?.label ?? "";
                  setForm((p) => ({ ...p, docType: v, docLabel: lbl }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {entityDocTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.docType === "other" && (
              <div className="space-y-1.5">
                <Label>Custom Label *</Label>
                <Input
                  placeholder="e.g. Special Permit"
                  value={form.docLabel === "Other" ? "" : form.docLabel}
                  onChange={(e) => setForm((p) => ({ ...p, docLabel: e.target.value }))}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Issue Date</Label>
                <Input type="date" value={form.issueDate} onChange={(e) => setForm((p) => ({ ...p, issueDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Expiry Date</Label>
                <Input type="date" value={form.expiryDate} onChange={(e) => setForm((p) => ({ ...p, expiryDate: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Attach File (PDF / Image)</Label>
              <div
                className="border border-dashed border-border rounded-lg px-4 py-3 flex items-center gap-3 cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground">
                  {pendingFile ? pendingFile.name : "Click to select file"}
                </span>
              </div>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)} />
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea placeholder="Optional notes…" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setPendingFile(null); setForm(emptyForm); }}>Cancel</Button>
            <Button onClick={handleAddSubmit} disabled={addDoc.isPending || isUploading || !form.entityId}>
              {isUploading ? "Uploading…" : addDoc.isPending ? "Saving…" : "Add Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Document Dialog */}
      <Dialog open={!!editDoc} onOpenChange={(o) => { if (!o) { setEditDoc(null); setEditPendingFile(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Label *</Label>
              <Input value={editForm.docLabel} onChange={(e) => setEditForm({ ...editForm, docLabel: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Issue Date</Label>
                <Input type="date" value={editForm.issueDate} onChange={(e) => setEditForm({ ...editForm, issueDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Expiry Date</Label>
                <Input type="date" value={editForm.expiryDate} onChange={(e) => setEditForm({ ...editForm, expiryDate: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Replace File (PDF / Image)</Label>
              <div
                className="border border-dashed border-border rounded-lg px-4 py-3 flex items-center gap-3 cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => editFileRef.current?.click()}
              >
                <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground">
                  {editPendingFile ? editPendingFile.name : editDoc?.fileName ? `Current: ${editDoc.fileName}` : "Click to attach a file"}
                </span>
              </div>
              <input ref={editFileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setEditPendingFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditDoc(null); setEditPendingFile(null); }}>Cancel</Button>
            <Button
              onClick={() => updateDoc.mutate({ docLabel: editForm.docLabel, issueDate: editForm.issueDate || null, expiryDate: editForm.expiryDate || null, notes: editForm.notes || null })}
              disabled={updateDoc.isPending || isUploading || !editForm.docLabel}
            >
              {isUploading ? "Uploading…" : updateDoc.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
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
              {confirmDelete?.docLabel ?? docTypeLabel(confirmDelete?.docType ?? "")}&rdquo; and delete the attached file from storage.
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
