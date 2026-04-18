import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, differenceInDays, parseISO } from "date-fns";
import { Plus, FileText, Trash2, Upload, ExternalLink, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useDocUpload } from "@/hooks/useDocUpload";

const TRUCK_DOC_TYPES = [
  { value: "c29",          label: "C29 Cross-Border Permit" },
  { value: "white_book",   label: "White Book (Registration)" },
  { value: "insurance",    label: "Insurance Certificate" },
  { value: "road_tax",     label: "Road Tax Disc" },
  { value: "fitness",      label: "Fitness Certificate" },
  { value: "tare_cert",    label: "Tare Certificate" },
  { value: "route_permit", label: "Route Permit" },
  { value: "customs_bond", label: "Customs Bond" },
  { value: "other",        label: "Other" },
];

const DRIVER_DOC_TYPES = [
  { value: "license",      label: "Driver's Licence" },
  { value: "passport",     label: "Passport" },
  { value: "medical",      label: "Medical Certificate" },
  { value: "work_permit",  label: "Work Permit" },
  { value: "driver_card",  label: "Driver Card" },
  { value: "nrc",          label: "NRC / National ID" },
  { value: "other",        label: "Other" },
];

function getDocStatus(expiryDate: string | null): "expired" | "expiring" | "valid" | "none" {
  if (!expiryDate) return "none";
  const days = differenceInDays(parseISO(expiryDate), new Date());
  if (days < 0) return "expired";
  if (days <= 30) return "expiring";
  return "valid";
}

const STATUS_CONFIG = {
  expired:  { label: "Expired",       icon: XCircle,       cls: "text-red-400 bg-red-500/10 border-red-500/20" },
  expiring: { label: "Expiring Soon", icon: AlertTriangle,  cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  valid:    { label: "Valid",          icon: CheckCircle,   cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  none:     { label: "No Expiry",      icon: Clock,         cls: "text-muted-foreground bg-muted/30 border-border" },
};

interface Props {
  entityType: "truck" | "driver";
  entityId: number;
  entityName?: string;
}

export function DocumentsPanel({ entityType, entityId, entityName }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { uploadFile, isUploading } = useDocUpload();
  const fileRef = useRef<HTMLInputElement>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const docTypes = entityType === "truck" ? TRUCK_DOC_TYPES : DRIVER_DOC_TYPES;

  const emptyForm = { docType: docTypes[0].value, docLabel: docTypes[0].label, issueDate: "", expiryDate: "", notes: "" };
  const [form, setForm] = useState(emptyForm);

  const { data: docs = [] } = useQuery<any[]>({
    queryKey: [`/api/documents`, entityType, entityId],
    queryFn: () => fetch(`/api/documents?entityType=${entityType}&entityId=${entityId}`, { credentials: "include" }).then((r) => r.json()),
  });

  const addDoc = useMutation({
    mutationFn: async (body: any) => {
      let fileUrl = null;
      let fileName = null;
      if (pendingFile) {
        const result = await uploadFile(pendingFile);
        if (result) { fileUrl = result.objectPath; fileName = result.fileName; }
      }
      return fetch("/api/documents", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, fileUrl, fileName }),
      }).then((r) => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/documents`, entityType, entityId] });
      qc.invalidateQueries({ queryKey: ["/api/documents/expiring"] });
      setShowAdd(false);
      setForm(emptyForm);
      setPendingFile(null);
      toast({ title: "Document saved" });
    },
    onError: () => toast({ title: "Failed to save document", variant: "destructive" }),
  });

  const deleteDoc = useMutation({
    mutationFn: (id: number) => fetch(`/api/documents/${id}`, { method: "DELETE", credentials: "include" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/documents`, entityType, entityId] });
      qc.invalidateQueries({ queryKey: ["/api/documents/expiring"] });
      setConfirmDelete(null);
      toast({ title: "Document removed" });
    },
  });

  // Sort: expired → expiring → valid → no-expiry
  const sorted = [...docs].sort((a, b) => {
    const order = { expired: 0, expiring: 1, valid: 2, none: 3 };
    return order[getDocStatus(a.expiryDate)] - order[getDocStatus(b.expiryDate)];
  });

  const handleDocTypeChange = (value: string) => {
    const found = docTypes.find((d) => d.value === value);
    setForm({ ...form, docType: value, docLabel: found?.label ?? value });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Documents</h3>
        <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4 mr-1" /> Add Document
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center text-muted-foreground py-10 border border-dashed border-border rounded-lg">
          <FileText className="w-7 h-7 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No documents yet. Add C29s, insurance, road tax and more.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((doc: any) => {
            const status = getDocStatus(doc.expiryDate);
            const cfg = STATUS_CONFIG[status];
            const Icon = cfg.icon;
            const daysLeft = doc.expiryDate
              ? differenceInDays(parseISO(doc.expiryDate), new Date())
              : null;
            return (
              <div key={doc.id} className="bg-card border border-border rounded-lg px-4 py-3 flex items-start gap-3">
                <FileText className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{doc.docLabel}</span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full border flex items-center gap-1", cfg.cls)}>
                      <Icon className="w-3 h-3" />
                      {status === "expiring" && daysLeft !== null ? `Expires in ${daysLeft}d` : cfg.label}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                    {doc.issueDate && <span>Issued: {format(parseISO(doc.issueDate), "dd MMM yyyy")}</span>}
                    {doc.expiryDate && <span>Expires: {format(parseISO(doc.expiryDate), "dd MMM yyyy")}</span>}
                    {doc.notes && <span className="italic">{doc.notes}</span>}
                  </div>
                  {doc.fileName && (
                    <a
                      href={`/api/storage${doc.fileUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary underline flex items-center gap-1 mt-1"
                    >
                      <ExternalLink className="w-3 h-3" /> {doc.fileName}
                    </a>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="shrink-0 text-muted-foreground hover:text-red-400"
                  onClick={() => setConfirmDelete(doc)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Document Dialog */}
      <Dialog open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) { setForm(emptyForm); setPendingFile(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Document</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Document Type *</Label>
              <Select value={form.docType} onValueChange={handleDocTypeChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {docTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.docType === "other" && (
              <div>
                <Label>Custom Name *</Label>
                <Input value={form.docLabel === "Other" ? "" : form.docLabel} onChange={(e) => setForm({ ...form, docLabel: e.target.value })} placeholder="e.g. Special Permit" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Issue Date</Label>
                <Input type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
              </div>
              <div>
                <Label>Expiry Date</Label>
                <Input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Attach File (PDF / Image)</Label>
              <div
                className="mt-1 border border-dashed border-border rounded-lg px-4 py-3 flex items-center gap-3 cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground">
                  {pendingFile ? pendingFile.name : "Click to select file"}
                </span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="e.g. Renewal applied for" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setForm(emptyForm); setPendingFile(null); }}>Cancel</Button>
            <Button
              onClick={() => addDoc.mutate({ entityType, entityId, docType: form.docType, docLabel: form.docLabel || form.docType, issueDate: form.issueDate || null, expiryDate: form.expiryDate || null, notes: form.notes || null })}
              disabled={addDoc.isPending || isUploading}
            >
              {isUploading ? "Uploading…" : addDoc.isPending ? "Saving…" : "Save Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{confirmDelete?.docLabel}</strong> from the records. The uploaded file will remain in storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteDoc.mutate(confirmDelete.id)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
