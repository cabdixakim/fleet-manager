import { useState, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetTrip, useUpdateTrip, useCreateTripExpense, useDeleteTripExpense,
  useCreateClearance, useUpdateClearance, useCreateDeliveryNote, useAmendTrip, useGetTrucks, useGetDrivers,
  useFlagTripIncident,
} from "@workspace/api-client-react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { exportToExcel } from "@/lib/export";
import { ChevronLeft, ChevronRight, Plus, Download, Trash2, FileText, Camera, Upload, X, Loader2, AlertTriangle, RefreshCw, Clock, MoreVertical, Pencil, Printer, AlertCircle, CheckCircle2, ArrowRight, Paperclip, Unlink2, Receipt } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useAuth } from "@/contexts/AuthContext";
import { StatusRevertDialog } from "@/components/StatusRevertDialog";

const TRIP_STATUS_ORDER = ["nominated", "loading", "loaded", "in_transit", "at_zambia_entry", "at_drc_entry", "delivered", "completed"];
const TRIP_FINANCIAL_STATUSES = ["delivered", "completed"];
const TRIP_STATUSES = ["nominated", "loading", "loaded", "in_transit", "at_zambia_entry", "at_drc_entry", "delivered", "cancelled"];
const EXPENSE_TYPES = [
  { value: "fuel_advance", label: "Fuel Advance (USD)", leg: "general", legColor: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  { value: "fuel_1",       label: "Fuel 1 (USD)",      leg: "general", legColor: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  { value: "fuel_2",       label: "Fuel 2 (USD)",      leg: "general", legColor: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  { value: "fuel_3",       label: "Fuel 3 (USD)",      leg: "general", legColor: "bg-green-500/15 text-green-400 border-green-500/30" },
  { value: "trip_expense_tz",  label: "Trip Expense 1", leg: "general", legColor: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  { value: "trip_expense_drc", label: "Trip Expense 2", leg: "general", legColor: "bg-green-500/15 text-green-400 border-green-500/30" },
  { value: "clearance_fee", label: "T1 Clearance Fee", leg: "general", legColor: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  { value: "mileage_allowance", label: "Mileage Allowance", leg: "general",  legColor: "bg-secondary text-muted-foreground border-border" },
  { value: "per_diem",     label: "Per Diem",                leg: "general",  legColor: "bg-secondary text-muted-foreground border-border" },
  { value: "maintenance",  label: "Maintenance",             leg: "general",  legColor: "bg-secondary text-muted-foreground border-border" },
  { value: "toll",         label: "Toll / Road Levy",        leg: "general",  legColor: "bg-secondary text-muted-foreground border-border" },
  { value: "accommodation", label: "Accommodation",          leg: "general",  legColor: "bg-secondary text-muted-foreground border-border" },
  { value: "other",        label: "Other",                   leg: "general",  legColor: "bg-secondary text-muted-foreground border-border" },
];
const CLEARANCE_DOCS = ["T1", "TR8", "customs_declaration", "transit_permit", "health_cert", "other"];

import { getRouteLabel } from "@/lib/routes";
import { TaskTrigger } from "@/components/TaskPanel";
import { TripDiscussion } from "@/components/TripDiscussion";

function generateTripClientHtml(trip: any, company: any): string {
  const fin = trip.financials ?? {};
  const loaded = parseFloat(trip.loadedQty ?? 0);
  const delivered = parseFloat(trip.deliveredQty ?? 0);
  const shortQty = Math.max(0, loaded - delivered);
  const gross = parseFloat(fin.grossRevenue ?? 0);
  const shortCharge = parseFloat(fin.shortCharge ?? 0);
  const net = gross - shortCharge;

  const companyName = company?.name ?? "Optima Transport LLC";
  const companyAddress = [company?.address, company?.city, company?.country].filter(Boolean).join(", ");
  const companyPhone = company?.phone ?? "";
  const datePrinted = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const routeLabel = getRouteLabel(trip.batchRoute ?? trip.route ?? "");
  const initials = companyName.split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0].toUpperCase()).join("");
  const logoHtml = company?.logoUrl
    ? `<img src="${company.logoUrl}" style="width:38px;height:38px;object-fit:contain;border-radius:6px;flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="width:38px;height:38px;background:rgba(255,255,255,0.15);border-radius:6px;display:none;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:13px;flex-shrink:0;">${initials}</div>`
    : `<div style="width:38px;height:38px;background:rgba(255,255,255,0.15);border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:13px;flex-shrink:0;">${initials}</div>`;

  const html = `
<div style="font-family:Arial,sans-serif;color:#111827;background:#fff;width:100%;max-width:680px;margin:0 auto;">
  <div style="background:#0f172a;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;">
    <div style="display:flex;align-items:center;gap:12px;">
      ${logoHtml}
      <div>
        <div style="color:#fff;font-size:18px;font-weight:700;">${companyName}</div>
        ${companyAddress ? `<div style="color:#94a3b8;font-size:10px;margin-top:2px;">${companyAddress}</div>` : ""}
        ${companyPhone ? `<div style="color:#94a3b8;font-size:10px;">${companyPhone}</div>` : ""}
      </div>
    </div>
    <div style="text-align:right;">
      <div style="color:#f1f5f9;font-size:15px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;">Trip Delivery Note</div>
      <div style="color:#94a3b8;font-size:11px;margin-top:3px;">${datePrinted}</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:2px solid #e5e7eb;">
    <div style="padding:10px 16px;border-right:1px solid #e5e7eb;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Client</div>
      <div style="font-size:13px;font-weight:700;">${trip.clientName ?? "—"}</div>
    </div>
    <div style="padding:10px 16px;border-right:1px solid #e5e7eb;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Batch Reference</div>
      <div style="font-size:13px;font-weight:700;">${trip.batchName ?? "—"}</div>
    </div>
    <div style="padding:10px 16px;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Route</div>
      <div style="font-size:12px;font-weight:600;">${routeLabel}</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;border-bottom:1px solid #e5e7eb;">
    <div style="padding:10px 16px;border-right:1px solid #e5e7eb;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Truck</div>
      <div style="font-size:13px;font-weight:700;">${trip.truckPlate ?? "—"}</div>
      ${trip.trailerPlate ? `<div style="font-size:10px;color:#6b7280;">Trailer: ${trip.trailerPlate}</div>` : ""}
    </div>
    <div style="padding:10px 16px;border-right:1px solid #e5e7eb;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Product</div>
      <div style="font-size:13px;font-weight:700;color:${trip.product === "AGO" ? "#2563eb" : "#d97706"};">${trip.product ?? "—"}</div>
    </div>
    <div style="padding:10px 16px;border-right:1px solid #e5e7eb;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Driver</div>
      <div style="font-size:12px;font-weight:600;">${trip.driverName ?? "—"}</div>
    </div>
    <div style="padding:10px 16px;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Subcontractor</div>
      <div style="font-size:12px;font-weight:600;">${trip.subcontractorName ?? "—"}</div>
    </div>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-top:0;">
    <thead>
      <tr style="background:#1e293b;">
        ${["Description", "Loaded (MT)", "Delivered (MT)", "Short (MT)", "Amount (USD)"].map((h) =>
          `<th style="padding:8px 12px;text-align:${h === "Description" ? "left" : "right"};font-size:9px;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:0.05em;">${h}</th>`
        ).join("")}
      </tr>
    </thead>
    <tbody>
      <tr style="border-bottom:1px solid #e5e7eb;background:#fff;">
        <td style="padding:8px 12px;font-size:12px;font-weight:600;">Freight Revenue</td>
        <td style="padding:8px 12px;text-align:right;font-size:12px;">${loaded > 0 ? loaded.toFixed(3) : "—"}</td>
        <td style="padding:8px 12px;text-align:right;font-size:12px;">${delivered > 0 ? delivered.toFixed(3) : "—"}</td>
        <td style="padding:8px 12px;text-align:right;font-size:12px;color:${shortQty > 0 ? "#dc2626" : "#6b7280"};">${shortQty > 0 ? shortQty.toFixed(3) : "—"}</td>
        <td style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;">${gross > 0 ? `$${gross.toFixed(2)}` : "—"}</td>
      </tr>
      ${shortCharge > 0 ? `
      <tr style="border-bottom:1px solid #e5e7eb;background:#fff8f8;">
        <td style="padding:8px 12px;font-size:12px;color:#dc2626;">Short Delivery Allowance</td>
        <td colspan="3" style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;">${shortQty.toFixed(3)} MT × allowance rate</td>
        <td style="padding:8px 12px;text-align:right;font-size:12px;color:#dc2626;">− $${shortCharge.toFixed(2)}</td>
      </tr>` : ""}
    </tbody>
    <tfoot>
      <tr style="background:#f0fdf4;border-top:2px solid #059669;">
        <td colspan="4" style="padding:10px 12px;font-size:12px;font-weight:700;">NET AMOUNT DUE</td>
        <td style="padding:10px 12px;text-align:right;font-size:16px;font-weight:700;color:#059669;">$${net.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>

  <div style="margin-top:32px;display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:0 12px;">
    <div>
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;">Authorised by (${companyName})</div>
      <div style="border-bottom:1px solid #374151;padding-bottom:24px;"></div>
      <div style="font-size:9px;color:#9ca3af;margin-top:4px;">Name &amp; Signature / Date</div>
    </div>
    <div>
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;">Acknowledged by (${trip.clientName ?? "Client"})</div>
      <div style="border-bottom:1px solid #374151;padding-bottom:24px;"></div>
      <div style="font-size:9px;color:#9ca3af;margin-top:4px;">Name &amp; Signature / Date</div>
    </div>
  </div>

  <div style="margin-top:16px;padding:10px 16px;border-top:1px solid #e5e7eb;text-align:center;font-size:9px;color:#9ca3af;">
    Generated by ${companyName} · ${datePrinted} · This document is a trip delivery note only and is not a tax invoice.
  </div>
</div>`;

  return html;
}

export default function TripDetail() {
  const [, params] = useRoute("/trips/:id");
  const [, navigate] = useLocation();
  const id = parseInt(params?.id ?? "0");
  const qc = useQueryClient();

  const { data: trip, isLoading } = useGetTrip(id);
  const { mutateAsync: updateTrip } = useUpdateTrip();
  const { mutateAsync: createExpense, isPending: savingExpense } = useCreateTripExpense();
  const { mutateAsync: deleteExpense } = useDeleteTripExpense();
  const { mutateAsync: createClearance } = useCreateClearance();
  const { mutateAsync: updateClearance } = useUpdateClearance();
  const { mutateAsync: createNote } = useCreateDeliveryNote();
  const { mutateAsync: amendTrip } = useAmendTrip();
  const { mutateAsync: flagIncident, isPending: flaggingIncident, error: incidentError } = useFlagTripIncident();
  const { data: trucks = [] } = useGetTrucks();
  const { data: drivers = [] } = useGetDrivers();
  const { user } = useAuth();
  const { settings: companySettings } = useCompanySettings();
  const { toast } = useToast();
  const [confirmRemoveClearanceId, setConfirmRemoveClearanceId] = useState<number | null>(null);

  const [activeTab, setActiveTab] = useState<"details" | "financials" | "clearances" | "expenses" | "amendments" | "discussion">("details");
  const [showExpense, setShowExpense] = useState(false);
  const [showClearance, setShowClearance] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const parseNote = (content?: string) => {
    if (!content) return { docType: "waybill", docNumber: "", url: "", notes: "" };
    try { const p = JSON.parse(content); if (typeof p === "object") return { docType: "waybill", docNumber: "", url: "", notes: "", ...p }; } catch {}
    return { docType: "other", docNumber: "", url: content, notes: "" };
  };
  const [showAmend, setShowAmend] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ costType: "fuel_1", description: "", amount: "", currency: "USD", expenseDate: new Date().toISOString().split("T")[0], paymentMethod: "petty_cash", supplierId: "", bankAccountId: "" });
  const [clearanceForm, setClearanceForm] = useState({ checkpoint: "zambia_entry", documentType: "T1", documentNumber: "", status: "requested", notes: "" });
  const [noteForm, setNoteForm] = useState({ docType: "waybill", docNumber: "", url: "", notes: "" });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setNoteForm((f) => ({ ...f, url: data.url }));
    } catch {
      toast({ variant: "destructive", title: "Upload failed", description: "File upload failed. Please try again." });
    } finally {
      setUploading(false);
    }
  };
  const [amendForm, setAmendForm] = useState({ amendmentType: "driver_swap", reason: "", newTruckId: "", newDriverId: "", newCapacity: "" });
  const [editingStatus, setEditingStatus] = useState(false);
  const [statusUpdate, setStatusUpdate] = useState({ status: "", loadedQty: "", deliveredQty: "", cancellationReason: "" });
  const [editQty, setEditQty] = useState<{ field: "loadedQty" | "deliveredQty"; value: string } | null>(null);
  const [showIncident, setShowIncident] = useState(false);
  const [incidentDescription, setIncidentDescription] = useState("");
  const [incidentReplacementTruckId, setIncidentReplacementTruckId] = useState<string>("");
  const [incidentRevenueOwner, setIncidentRevenueOwner] = useState<string>("");
  const [revertDialog, setRevertDialog] = useState<{ open: boolean; pendingStatus: string } | null>(null);
  const [deleteExpenseId, setDeleteExpenseId] = useState<number | null>(null);
  const [unlinkingExpenseId, setUnlinkingExpenseId] = useState<number | null>(null);
  const [confirmUnlinkId, setConfirmUnlinkId] = useState<number | null>(null);

  const handleUnlinkExpense = async (expenseId: number) => {
    setConfirmUnlinkId(null);
    setUnlinkingExpenseId(expenseId);
    try {
      const res = await fetch(`/api/expenses/${expenseId}/unlink-trip`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) { toast({ variant: "destructive", title: "Error", description: data.error ?? "Failed to unlink expense." }); return; }
      invalidate();
    } finally { setUnlinkingExpenseId(null); }
  };
  const [rateOverrides, setRateOverrides] = useState<{ subRatePerMt: string; clientShortRateOverride: string; subShortRateOverride: string } | null>(null);
  const [savingRateOverrides, setSavingRateOverrides] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [clearanceBlock, setClearanceBlock] = useState<{ clearanceId: number; checkpoint: string; message: string } | null>(null);
  const [uploadingClearanceDoc, setUploadingClearanceDoc] = useState<number | null>(null);
  const [invoiceRevertWarning, setInvoiceRevertWarning] = useState<{ invoiceId: number } | null>(null);

  // Reassign to batch
  const [showReassignDialog, setShowReassignDialog] = useState(false);
  const [reassignBatchId, setReassignBatchId] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [reassignError, setReassignError] = useState("");
  const { data: allBatches = [] } = useQuery<any[]>({
    queryKey: ["/api/batches"],
    queryFn: () => fetch("/api/batches", { credentials: "include" }).then((r) => r.json()),
  });
  const { data: suppliers = [] } = useQuery<any[]>({
    queryKey: ["/api/suppliers"],
    queryFn: () => fetch("/api/suppliers", { credentials: "include" }).then((r) => r.json()),
  });
  const { data: bankAccounts = [] } = useQuery<any[]>({
    queryKey: ["/api/bank-accounts"],
    queryFn: () => fetch("/api/bank-accounts", { credentials: "include" }).then((r) => r.json()),
  });
  const selectableBatches = (allBatches as any[]).filter(
    (b) => !["cancelled", "closed", "invoiced"].includes(b.status) && b.id !== trip?.batchId
  );

  const handleReassignBatch = async () => {
    if (!reassignBatchId) { setReassignError("Please select a batch."); return; }
    setReassigning(true); setReassignError("");
    try {
      const res = await fetch(`/api/trips/${id}/reassign-batch`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ batchId: parseInt(reassignBatchId) }),
      });
      const data = await res.json();
      if (!res.ok) { setReassignError(data.error ?? "Failed to reassign trip."); return; }
      setShowReassignDialog(false);
      invalidate();
      qc.invalidateQueries({ queryKey: ["/api/batches"] });
    } finally { setReassigning(false); }
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: [`/api/trips/${id}`] });

  const performStatusUpdate = async (revertReason?: string) => {
    setSavingStatus(true);
    try {
      const result: any = await updateTrip({
        id,
        data: {
          status: statusUpdate.status as any,
          loadedQty: statusUpdate.loadedQty ? parseFloat(statusUpdate.loadedQty) : null,
          deliveredQty: statusUpdate.deliveredQty ? parseFloat(statusUpdate.deliveredQty) : null,
          cancellationReason: statusUpdate.cancellationReason || null,
          ...(revertReason ? { revertReason } : {}),
        } as any,
      });
      if (result?._invoiceWarning) setInvoiceRevertWarning(result._invoiceWarning);
      setClearanceBlock(null);
      invalidate();
      qc.invalidateQueries({ queryKey: [`/api/batches/${trip?.batchId}`] });
      setEditingStatus(false);
      setRevertDialog(null);
    } catch (err: any) {
      if (err?.status === 409 && err?.data?.blocked) {
        const { clearanceId, checkpoint, error: message } = err.data;
        setClearanceBlock({ clearanceId, checkpoint, message });
        invalidate();
        setActiveTab("clearances");
        setEditingStatus(false);
        return;
      }
      // Period-closed or other error — surface as a toast so the user knows why it failed
      const description =
        err?.data?.error ?? err?.data?.message ?? err?.message ?? "The status could not be updated.";
      toast({ variant: "destructive", title: "Update blocked", description });
    } finally {
      setSavingStatus(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!trip) return;
    const fromIdx = TRIP_STATUS_ORDER.indexOf(trip.status);
    const toIdx = TRIP_STATUS_ORDER.indexOf(statusUpdate.status);
    const isBackward = fromIdx !== -1 && toIdx !== -1 && toIdx < fromIdx;
    if (isBackward) {
      setRevertDialog({ open: true, pendingStatus: statusUpdate.status });
      return;
    }
    await performStatusUpdate();
  };

  const handleQtySave = async () => {
    if (!editQty) return;
    const val = parseFloat(editQty.value);
    if (isNaN(val) || val < 0) return;
    await updateTrip({ id, data: { [editQty.field]: val } });
    invalidate();
    qc.invalidateQueries({ queryKey: [`/api/batches/${trip?.batchId}`] });
    setEditQty(null);
  };

  const handleRateOverridesSave = async () => {
    if (!rateOverrides) return;
    setSavingRateOverrides(true);
    try {
      const payload: Record<string, any> = {
        subRatePerMt: rateOverrides.subRatePerMt.trim() !== "" ? parseFloat(rateOverrides.subRatePerMt) : null,
        clientShortRateOverride: rateOverrides.clientShortRateOverride.trim() !== "" ? parseFloat(rateOverrides.clientShortRateOverride) : null,
        subShortRateOverride: rateOverrides.subShortRateOverride.trim() !== "" ? parseFloat(rateOverrides.subShortRateOverride) : null,
      };
      await updateTrip({ id, data: payload });
      invalidate();
      qc.invalidateQueries({ queryKey: [`/api/batches/${trip?.batchId}`] });
      setRateOverrides(null);
    } finally {
      setSavingRateOverrides(false);
    }
  };

  const handleExpenseSave = async () => {
    await createExpense({ id, data: {
      ...expenseForm,
      amount: parseFloat(expenseForm.amount),
      paymentMethod: expenseForm.paymentMethod,
      supplierId: expenseForm.paymentMethod === "fuel_credit" && expenseForm.supplierId ? parseInt(expenseForm.supplierId) : null,
      bankAccountId: expenseForm.paymentMethod === "bank_transfer" && expenseForm.bankAccountId ? parseInt(expenseForm.bankAccountId) : null,
    }});
    invalidate();
    qc.invalidateQueries({ queryKey: ["/api/expenses"] });
    setShowExpense(false);
    setExpenseForm({ costType: "fuel_1", description: "", amount: "", currency: "USD", expenseDate: new Date().toISOString().split("T")[0], paymentMethod: "petty_cash", supplierId: "", bankAccountId: "" });
  };

  const handleClearanceSave = async () => {
    await createClearance({ id, data: { ...clearanceForm, checkpoint: clearanceForm.checkpoint as any, status: clearanceForm.status as any } });
    invalidate();
    setShowClearance(false);
    setClearanceForm({ checkpoint: "zambia_entry", documentType: "T1", documentNumber: "", status: "requested", notes: "" });
  };

  const handleClearanceStatusChange = async (clearanceId: number, status: string) => {
    await updateClearance({ id: clearanceId, data: { status: status as any } });
    if (clearanceBlock?.clearanceId === clearanceId && status === "approved") {
      setClearanceBlock(null);
    }
    invalidate();
  };

  const handleClearanceDocUpload = async (clearanceId: number, file: File) => {
    setUploadingClearanceDoc(clearanceId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads/clearance", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      await updateClearance({ id: clearanceId, data: { documentUrl: data.url } as any });
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Upload failed", description: "Document upload failed. Please try again." });
    } finally {
      setUploadingClearanceDoc(null);
    }
  };

  const handleClearanceDocRemove = (clearanceId: number) => {
    setConfirmRemoveClearanceId(clearanceId);
  };

  const handleClearanceDocRemoveConfirmed = async () => {
    if (confirmRemoveClearanceId === null) return;
    await updateClearance({ id: confirmRemoveClearanceId, data: { documentUrl: null } as any });
    invalidate();
    setConfirmRemoveClearanceId(null);
  };

  const handleNoteSave = async () => {
    await createNote({ id, data: { content: JSON.stringify(noteForm) } });
    invalidate();
    setShowNote(false);
    setNoteForm({ docType: "waybill", docNumber: "", url: "", notes: "" });
  };

  const handleAmend = async () => {
    await amendTrip({
      id,
      data: {
        amendmentType: amendForm.amendmentType as any,
        reason: amendForm.reason,
        newTruckId: amendForm.newTruckId ? parseInt(amendForm.newTruckId) : null,
        newDriverId: amendForm.newDriverId ? parseInt(amendForm.newDriverId) : null,
        ...(amendForm.amendmentType === "capacity_change" && amendForm.newCapacity ? { newCapacity: parseFloat(amendForm.newCapacity) } : {}),
      } as any,
    });
    invalidate();
    setShowAmend(false);
  };

  const handlePrintTripDoc = () => {
    if (!trip) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const html = generateTripClientHtml(trip, companySettings);
    w.document.write(`<!DOCTYPE html><html><head><title>${trip.truckPlate ?? "Trip"} — Delivery Note</title><style>*{box-sizing:border-box;}body{margin:0;padding:0;background:#fff;}@media print{@page{size:A4;margin:8mm;}}</style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch (_) {} }, 350);
  };

  const handleExport = () => {
    if (!trip) return;
    exportToExcel([{
      "Truck": trip.truckPlate,
      "Trailer": trip.trailerPlate ?? "",
      "Driver": trip.driverName ?? "",
      "Subcontractor": trip.subcontractorName,
      "Product": trip.product,
      "Capacity": trip.capacity,
      "Status": trip.status,
      "Loaded Qty": trip.loadedQty ?? "",
      "Delivered Qty": trip.deliveredQty ?? "",
      "Gross Revenue": trip.financials?.grossRevenue ?? "",
      "Commission": trip.financials?.commission ?? "",
      "Short Charge": trip.financials?.shortCharge ?? "",
      "Trip Expenses": trip.financials?.tripExpensesTotal ?? "",
      "Driver Salary": trip.financials?.driverSalaryAllocation ?? "",
      "Net Payable": trip.financials?.netPayable ?? "",
    }], `trip-${trip.truckPlate}`);
  };

  // Helper: is trip amendable after loaded?
  const isAmendableAfterLoaded = trip && ["loaded", "in_transit", "at_zambia_entry", "at_drc_entry", "delivered"].includes(trip.status);
  // Helper: get policy label
  function getPolicyLabel(policy: string) {
    switch (policy) {
      case "ORIGINAL": return "Revenue/costs remain with original assignment (flagged for audit)";
      case "REPLACEMENT": return "Revenue/costs assigned to replacement assignment";
      case "SPLIT": return "Custom/split attribution (see audit log)";
      default: return "Unknown policy";
    }
  }

  if (isLoading || !trip) {
    return (
      <Layout>
        <PageContent>
          <div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>
        </PageContent>
      </Layout>
    );
  }

  const fin = trip.financials;
  const tabs = [
    { id: "details", label: "Details" },
    { id: "financials", label: "Financials" },
    { id: "clearances", label: `Clearances (${trip.clearances?.length ?? 0})` },
    { id: "expenses", label: `Expenses (${trip.expenses?.length ?? 0})` },
    { id: "amendments", label: `Amendments (${trip.amendments?.length ?? 0})` },
    { id: "discussion", label: "Discussion" },
  ];

  return (
    <Layout>
      <PageHeader
        title={`${trip.truckPlate} — ${trip.batchName}`}
        subtitle={`${trip.subcontractorName} · ${trip.driverName ?? "No driver"} · ${trip.product}`}
        actions={
          <>
            {/* Back button — always shown */}
            <Button variant="outline" size="sm" onClick={() => navigate(`/batches/${trip.batchId}`)}><ChevronLeft className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Batch</span></Button>
            {/* Status badge — always shown */}
            <StatusBadge status={trip.status} />
            {/* Task trigger — always shown */}
            <TaskTrigger recordType="trip" recordId={id} recordLabel={`${trip.truckPlate} — ${trip.batchName}`} />
            {/* Incident badge — always shown if flagged */}
            {(trip as any).incidentFlag && (
              <span className="flex items-center gap-1 text-xs font-semibold bg-red-500/10 text-red-600 border border-red-300 px-2.5 py-1 rounded-full">
                <AlertTriangle className="w-3.5 h-3.5" /><span className="hidden sm:inline">INCIDENT</span>
              </span>
            )}
            {/* Desktop-only action buttons */}
            <div className="hidden md:flex items-center gap-2">
              {["loading", "loaded", "in_transit", "at_zambia_entry", "at_drc_entry"].includes(trip.status) && !(trip as any).incidentFlag && (
                <Button variant="destructive" size="sm" onClick={() => { setIncidentDescription(""); setShowIncident(true); }}>
                  <AlertTriangle className="w-4 h-4 mr-1.5" />Flag Incident
                </Button>
              )}
              {!(trip.status === "loaded" || trip.status === "in_transit" || trip.status === "at_zambia_entry" || trip.status === "at_drc_entry" || trip.status === "delivered" || trip.status === "cancelled") && (
                <Button variant="destructive" size="sm" onClick={() => { setAmendForm({ ...amendForm, amendmentType: "cancellation" }); setShowAmend(true); }}>Cancel Trip</Button>
              )}
              {trip.status !== "cancelled" && (
                <Button variant="outline" size="sm" onClick={() => setShowAmend(true)}
                  disabled={trip.status === "loaded" || trip.status === "in_transit" || trip.status === "at_zambia_entry" || trip.status === "at_drc_entry" || trip.status === "delivered" || trip.status === "cancelled"}
                >Amend Trip</Button>
              )}
              <Button variant="outline" size="sm" onClick={() => { setReassignBatchId(""); setReassignError(""); setShowReassignDialog(true); }}>
                <ArrowRight className="w-4 h-4 mr-1.5" />Reassign Batch
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrintTripDoc} disabled={!trip.financials?.grossRevenue}><Printer className="w-4 h-4 mr-2" />Client Note</Button>
              <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-4 h-4 mr-2" />Export</Button>
            </div>
            {/* Mobile — overflow menu */}
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm"><MoreVertical className="w-4 h-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {["loading", "loaded", "in_transit", "at_zambia_entry", "at_drc_entry"].includes(trip.status) && !(trip as any).incidentFlag && (
                    <DropdownMenuItem onSelect={() => { setIncidentDescription(""); setShowIncident(true); }} className="text-destructive">
                      <AlertTriangle className="w-4 h-4 mr-2" />Flag Incident
                    </DropdownMenuItem>
                  )}
                  {trip.status !== "cancelled" && !(trip.status === "loaded" || trip.status === "in_transit" || trip.status === "at_zambia_entry" || trip.status === "at_drc_entry" || trip.status === "delivered") && (
                    <DropdownMenuItem onSelect={() => { setAmendForm({ ...amendForm, amendmentType: "cancellation" }); setShowAmend(true); }} className="text-destructive">
                      Cancel Trip
                    </DropdownMenuItem>
                  )}
                  {trip.status !== "cancelled" && !(trip.status === "loaded" || trip.status === "in_transit" || trip.status === "at_zambia_entry" || trip.status === "at_drc_entry" || trip.status === "delivered") && (
                    <DropdownMenuItem onSelect={() => setShowAmend(true)}>
                      Amend Trip
                    </DropdownMenuItem>
                  )}
                  {trip.financials?.grossRevenue && (
                    <DropdownMenuItem onSelect={handlePrintTripDoc}>
                      <Printer className="w-4 h-4 mr-2" />Client Note
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => { setReassignBatchId(""); setReassignError(""); setShowReassignDialog(true); }}>
                    <ArrowRight className="w-4 h-4 mr-2" />Reassign Batch
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleExport}>
                    <Download className="w-4 h-4 mr-2" />Export
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        }
      />
      <PageContent>
        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-secondary/50 p-1 rounded-lg w-fit overflow-x-auto">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "details" && (
          <div className="space-y-5">
            {/* Invoice de-link warning — shown when a status revert cleared the trip's invoice stamp */}
            {invoiceRevertWarning && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Trip removed from Invoice #{invoiceRevertWarning.invoiceId}</p>
                      <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                        This trip was previously included in Invoice #{invoiceRevertWarning.invoiceId}.
                        The status revert has de-linked it — it will be picked up again the next time you raise an invoice for this batch after re-delivery.
                        Review the invoice if it has already been sent to the client.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setInvoiceRevertWarning(null)}
                    className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 text-lg leading-none shrink-0"
                    aria-label="Dismiss"
                  >×</button>
                </div>
              </div>
            )}

            {/* Incident alert banner */}
            {(trip as any).incidentFlag && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-red-700 dark:text-red-400">Incident — Original Truck in Maintenance · Trip Continuing</p>
                    <p className="text-sm text-red-600 dark:text-red-500 mt-0.5">{(trip as any).incidentDescription}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs pl-8">
                  {(trip as any).incidentReplacementTruckId ? (
                    <span className="inline-flex items-center gap-1 bg-red-100 dark:bg-red-900/40 px-2.5 py-1 rounded-lg text-red-700 dark:text-red-300 font-medium">
                      Replacement truck: {(trucks as any[]).find((t) => t.id === (trip as any).incidentReplacementTruckId)?.plateNumber ?? `#${(trip as any).incidentReplacementTruckId}`}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-red-100 dark:bg-red-900/40 px-2.5 py-1 rounded-lg text-red-700 dark:text-red-300 font-medium">
                      No replacement assigned
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 bg-red-100 dark:bg-red-900/40 px-2.5 py-1 rounded-lg text-red-700 dark:text-red-300 font-medium capitalize">
                    Revenue: {(trip as any).incidentRevenueOwner ?? "original"} subcontractor
                  </span>
                  {!(trip as any).incidentReplacementTruckId && (
                    <span className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-900/30 px-2.5 py-1 rounded-lg text-amber-700 dark:text-amber-300 font-medium">
                      Original sub credited for loaded quantity
                    </span>
                  )}
                </div>
              </div>
            )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Info Card */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-sm text-foreground">Trip Information</h3>
              {[
                ["Truck Plate", trip.truckPlate],
                ["Trailer", trip.trailerPlate ?? "-"],
                ["Driver", trip.driverName ?? "-"],
                ["Subcontractor", trip.subcontractorName],
                ["Product", trip.product],
                ["Capacity", `${formatNumber(trip.capacity)} MT`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="text-foreground font-medium">{value}</span>
                </div>
              ))}
              {/* Loaded Qty — editable for corrections */}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Loaded Qty</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-foreground font-medium">{trip.loadedQty ? `${formatNumber(trip.loadedQty)} MT` : "-"}</span>
                  <button onClick={() => setEditQty({ field: "loadedQty", value: trip.loadedQty?.toString() ?? "" })}
                    className="text-muted-foreground hover:text-primary transition-colors" title="Correct loaded quantity">
                    <Pencil className="w-3 h-3" />
                  </button>
                </span>
              </div>
              {/* Delivered Qty — editable for POD corrections */}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Delivered Qty</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-foreground font-medium">{trip.deliveredQty ? `${formatNumber(trip.deliveredQty)} MT` : "-"}</span>
                  <button onClick={() => setEditQty({ field: "deliveredQty", value: trip.deliveredQty?.toString() ?? "" })}
                    className="text-muted-foreground hover:text-primary transition-colors" title="Correct delivered quantity">
                    <Pencil className="w-3 h-3" />
                  </button>
                </span>
              </div>
              {/* Fuel rows — L quantity + USD cost per leg */}
              {([["fuel_1", trip.fuel1], ["fuel_2", trip.fuel2], ["fuel_3", trip.fuel3]] as [string, number | null][]).map(([key, litres], i) => {
                const usd = (trip.expenses ?? []).filter((e: any) => e.costType === key).reduce((t: number, e: any) => t + e.amount, 0);
                const label = `Fuel ${i + 1}`;
                if (!litres && usd === 0) return null;
                return (
                  <div key={key} className="flex justify-between text-sm border-t border-border/40 pt-2 mt-1 first:border-0 first:pt-0 first:mt-0">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-foreground font-medium flex gap-3">
                      {litres ? <span className="text-muted-foreground">{formatNumber(litres)} L</span> : null}
                      {usd > 0 ? <span>{formatCurrency(usd)}</span> : null}
                    </span>
                  </div>
                );
              })}
              {/* Trip Expense rows (TZ / DRC) */}
              {(["trip_expense_tz", "trip_expense_drc"] as string[]).map((key, i) => {
                const usd = (trip.expenses ?? []).filter((e: any) => e.costType === key).reduce((t: number, e: any) => t + e.amount, 0);
                if (usd === 0) return null;
                return (
                  <div key={key} className="flex justify-between text-sm border-t border-border/40 pt-2 mt-1">
                    <span className="text-muted-foreground">Trip Expense {i + 1}</span>
                    <span className="text-foreground font-medium">{formatCurrency(usd)}</span>
                  </div>
                );
              })}
            </div>

            {/* Status Update */}
            <div className={`bg-card border rounded-xl p-5 space-y-4 ${clearanceBlock ? "border-amber-400 dark:border-amber-600" : "border-border"}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-foreground">Update Status</h3>
                {!editingStatus && (
                  <button onClick={() => { setEditingStatus(true); setStatusUpdate({ status: trip.status, loadedQty: trip.loadedQty?.toString() ?? "", deliveredQty: trip.deliveredQty?.toString() ?? "", cancellationReason: "" }); }}
                    className="text-xs text-primary hover:text-primary/80">Edit</button>
                )}
              </div>
              {clearanceBlock && (
                <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Advance blocked — clearance required</p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">{clearanceBlock.message}</p>
                    <button onClick={() => setActiveTab("clearances")} className="text-[11px] font-medium text-amber-700 dark:text-amber-400 underline mt-1">Go to clearances →</button>
                  </div>
                  <button onClick={() => setClearanceBlock(null)} className="text-amber-500 hover:text-amber-700 shrink-0"><X className="w-3.5 h-3.5" /></button>
                </div>
              )}
              {editingStatus ? (
                <div className="space-y-3">
                  <div><Label className="text-xs">Status</Label>
                    <Select value={statusUpdate.status} onValueChange={(v) => setStatusUpdate({ ...statusUpdate, status: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{TRIP_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {["loading", "loaded", "in_transit", "at_zambia_entry", "at_drc_entry", "delivered"].includes(statusUpdate.status) && (
                    <div><Label className="text-xs">Loaded Quantity (MT)</Label>
                      <Input type="number" value={statusUpdate.loadedQty} onChange={(e) => setStatusUpdate({ ...statusUpdate, loadedQty: e.target.value })} className="mt-1" />
                    </div>
                  )}
                  {statusUpdate.status === "delivered" && (
                    <div><Label className="text-xs">Delivered Quantity (MT)</Label>
                      <Input type="number" value={statusUpdate.deliveredQty} onChange={(e) => setStatusUpdate({ ...statusUpdate, deliveredQty: e.target.value })} className="mt-1" />
                    </div>
                  )}
                  {statusUpdate.status === "cancelled" && (
                    <div><Label className="text-xs">Cancellation Reason</Label>
                      <Input value={statusUpdate.cancellationReason} onChange={(e) => setStatusUpdate({ ...statusUpdate, cancellationReason: e.target.value })} className="mt-1" />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleStatusUpdate}>Save</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingStatus(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Current Status</span><StatusBadge status={trip.status} /></div>
                  {trip.notes && (() => {
                    const batchMoves = [...(trip.notes as string).matchAll(/\[moved from batch #(\d+)(?:\s+"([^"]+)")?\]/g)];
                    const cleanNotes = (trip.notes as string).replace(/\n?\[moved from batch #\d+(?:\s+"[^"]+")?\]/g, "").trim();
                    return (
                      <div className="space-y-1.5">
                        {batchMoves.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {batchMoves.map((m, i) => (
                              <span key={i} className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border whitespace-nowrap">
                                moved from {m[2] ? `"${m[2]}"` : `batch #${m[1]}`}
                              </span>
                            ))}
                          </div>
                        )}
                        {cleanNotes && <div className="p-3 bg-secondary/50 rounded-lg text-sm text-muted-foreground">{cleanNotes}</div>}
                      </div>
                    );
                  })()}
                  {trip.cancellationReason && <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">{trip.cancellationReason}</div>}
                </div>
              )}

              {/* Delivery Note */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-foreground">Delivery Note</h4>
                  <button onClick={() => { setNoteForm(parseNote(trip.deliveryNote?.content)); setShowNote(true); }} className="text-xs text-primary hover:text-primary/80">
                    {trip.deliveryNote ? "Edit" : "+ Add"}
                  </button>
                </div>
                {trip.deliveryNote ? (() => {
                  const n = parseNote(trip.deliveryNote.content);
                  const DOC_LABELS: Record<string, string> = { waybill: "Waybill", cmr: "CMR", bill_of_lading: "Bill of Lading", customs: "Customs Declaration", other: "Document" };
                  const isImage = n.url && /\.(jpg|jpeg|png|webp|heic)$/i.test(n.url);
                  return (
                    <div className="p-3 bg-secondary/30 rounded-lg space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-foreground">{DOC_LABELS[n.docType] ?? n.docType}</span>
                        {n.docNumber && <span className="text-xs text-muted-foreground">#{n.docNumber}</span>}
                        {n.url && !isImage && <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline ml-auto">Open Document ↗</a>}
                      </div>
                      {isImage && n.url && (
                        <a href={n.url} target="_blank" rel="noopener noreferrer">
                          <img src={n.url} alt="Delivery document" className="w-full max-h-32 object-contain rounded border border-border/40" />
                        </a>
                      )}
                      {n.notes && <p className="text-xs text-muted-foreground">{n.notes}</p>}
                    </div>
                  );
                })() : (
                  <p className="text-xs text-muted-foreground/60">No document attached. Add a reference after delivery for dispute resolution.</p>
                )}
              </div>
            </div>
          </div>
          </div>
        )}

        {activeTab === "financials" && (
          <div className="space-y-6">
            {/* Revenue held banner */}
            {fin?.isRevenueHeld && (
              <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                <Clock className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-400">Revenue held — awaiting delivery confirmation</p>
                  <p className="text-xs text-amber-400/70 mt-0.5">
                    Revenue is recognised only on delivery. Current deductions: expenses{fin.driverSalaryAllocation > 0 ? " + driver salary" : ""}.
                    {fin.projectedGross != null && ` Projected gross: ${formatCurrency(fin.projectedGross)}.`}
                  </p>
                </div>
              </div>
            )}

            {/* Per-trip rate overrides card */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Per-Trip Rate Settings</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {fin?.billingModel === "rate_differential"
                      ? <span className="text-primary font-medium">Rate Differential model active — sub earns at their agreed rate; spread is company margin</span>
                      : "Commission model (default). Set a Sub Rate to switch this trip to the rate-differential model."}
                  </p>
                </div>
                {rateOverrides === null && (
                  <Button variant="outline" size="sm" onClick={() => setRateOverrides({
                    subRatePerMt: trip.subRatePerMt != null ? String(trip.subRatePerMt) : "",
                    clientShortRateOverride: trip.clientShortRateOverride != null ? String(trip.clientShortRateOverride) : "",
                    subShortRateOverride: trip.subShortRateOverride != null ? String(trip.subShortRateOverride) : "",
                  })}>
                    Edit
                  </Button>
                )}
              </div>
              {rateOverrides !== null ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">Sub Rate ($/MT)</label>
                      <p className="text-[10px] text-muted-foreground">If set, replaces commission — sub earns at this rate</p>
                      <input
                        type="number" step="0.01" min="0"
                        placeholder={fin?.subDefaultRatePerMt != null ? `${fin.subDefaultRatePerMt} (sub default)` : "e.g. 45.00"}
                        value={rateOverrides.subRatePerMt}
                        onChange={(e) => setRateOverrides((p) => p && ({ ...p, subRatePerMt: e.target.value }))}
                        className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">Client Short Rate Override ($/MT)</label>
                      <p className="text-[10px] text-muted-foreground">Overrides client's default short rate for this trip</p>
                      <input
                        type="number" step="0.01" min="0"
                        placeholder={fin?.baseClientShortChargeRate != null && fin.baseClientShortChargeRate > 0 ? `${fin.baseClientShortChargeRate} (client default)` : "Default from client"}
                        value={rateOverrides.clientShortRateOverride}
                        onChange={(e) => setRateOverrides((p) => p && ({ ...p, clientShortRateOverride: e.target.value }))}
                        className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">Sub Short Rate Override ($/MT)</label>
                      <p className="text-[10px] text-muted-foreground">Overrides sub's default short rate for this trip</p>
                      <input
                        type="number" step="0.01" min="0"
                        placeholder={fin?.baseSubShortChargeRate != null && fin.baseSubShortChargeRate > 0 ? `${fin.baseSubShortChargeRate} (sub default)` : "Default from sub"}
                        value={rateOverrides.subShortRateOverride}
                        onChange={(e) => setRateOverrides((p) => p && ({ ...p, subShortRateOverride: e.target.value }))}
                        className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background font-mono"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Leave any field blank to use the default from client/sub records. Save with blank Sub Rate to revert to commission model.</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleRateOverridesSave} disabled={savingRateOverrides}>{savingRateOverrides ? "Saving…" : "Save Rate Settings"}</Button>
                    <Button variant="outline" size="sm" onClick={() => setRateOverrides(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Sub Rate ($/MT)</p>
                    <p className="font-mono font-semibold mt-0.5 text-foreground">
                      {trip.subRatePerMt != null ? formatCurrency(parseFloat(String(trip.subRatePerMt))) : <span className="text-muted-foreground font-normal">Default (commission)</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Client Short Rate Override ($/MT)</p>
                    <p className="font-mono font-semibold mt-0.5">
                      {trip.clientShortRateOverride != null ? formatCurrency(parseFloat(String(trip.clientShortRateOverride))) : <span className="text-muted-foreground font-normal">Default from client</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sub Short Rate Override ($/MT)</p>
                    <p className="font-mono font-semibold mt-0.5">
                      {trip.subShortRateOverride != null ? formatCurrency(parseFloat(String(trip.subShortRateOverride))) : <span className="text-muted-foreground font-normal">Default from sub</span>}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {fin?.isRevenueHeld ? [
                { label: "Projected Gross", value: fin.projectedGross != null ? formatCurrency(fin.projectedGross) : "Awaiting Load", color: "text-muted-foreground", held: true },
                { label: "Trip Expenses", value: formatCurrency(fin.tripExpensesTotal), color: "text-orange-400" },
                { label: "Driver Salary", value: formatCurrency(fin.driverSalaryAllocation), color: "text-accent" },
                { label: "Current Net (Expenses)", value: fin.netPayable != null ? formatCurrency(fin.netPayable) : "—", color: fin.netPayable != null && fin.netPayable < 0 ? "text-destructive" : "text-primary" },
              ].map((item) => (
                <div key={item.label} className={`bg-card border rounded-xl p-4 ${(item as any).held ? "border-amber-500/30 bg-amber-500/5" : "border-border"}`}>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{item.label}</p>
                  {(item as any).held && <p className="text-[10px] text-amber-500/60 uppercase font-bold tracking-wider">Held</p>}
                  <p className={`text-xl font-bold mt-1 ${item.color}`}>{item.value}</p>
                </div>
              )) : [
                { label: "Gross Revenue", value: fin?.grossRevenue != null ? formatCurrency(fin.grossRevenue) : "Pending", color: "text-foreground" },
                { label: fin?.billingModel === "rate_differential" ? "Margin (Spread)" : "Commission (Our Cut)", value: fin?.commission != null ? formatCurrency(fin.commission) : "Pending", color: "text-success" },
                { label: "Short Qty", value: fin?.shortQty != null ? `${formatNumber(fin.shortQty)} MT` : "Pending", color: "text-warning" },
                { label: "Short Charge", value: fin?.shortCharge != null ? formatCurrency(fin.shortCharge) : "Pending", color: "text-destructive" },
                { label: "Trip Expenses", value: formatCurrency(fin?.tripExpensesTotal ?? 0), color: "text-orange-400" },
                { label: "Driver Salary", value: formatCurrency(fin?.driverSalaryAllocation ?? 0), color: "text-accent" },
                { label: "Net Payable to Sub", value: fin?.netPayable != null ? formatCurrency(fin.netPayable) : "Pending", color: "text-primary" },
              ].map((item) => (
                <div key={item.label} className="bg-card border border-border rounded-xl p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{item.label}</p>
                  <p className={`text-xl font-bold mt-1 ${item.color}`}>{item.value}</p>
                </div>
              ))}
            </div>
            {fin && !fin.isRevenueHeld && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4">Calculation Breakdown</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Gross Revenue (Loaded × Client Rate)</span><span>{fin.grossRevenue != null ? formatCurrency(fin.grossRevenue) : "-"}</span></div>
                  {fin.agentFeeTotal != null && fin.agentFeeTotal > 0 && (
                    <div className="flex justify-between text-destructive"><span>− Broker Fee ({fin.agentFeePerMt != null ? formatCurrency(fin.agentFeePerMt) : "—"}/MT)</span><span>({formatCurrency(fin.agentFeeTotal)})</span></div>
                  )}
                  {fin.billingModel === "rate_differential" ? (
                    <>
                      <div className="flex justify-between text-muted-foreground"><span className="pl-4">Sub Rate: {fin.subRatePerMt != null ? formatCurrency(fin.subRatePerMt) : "—"}/MT × {formatNumber(trip.loadedQty ?? 0)} MT loaded</span></div>
                      <div className="flex justify-between text-success"><span>Company Margin (Rate Spread)</span><span>+{fin.commission != null ? formatCurrency(fin.commission) : "-"}</span></div>
                      <div className="flex justify-between text-muted-foreground text-xs"><span className="pl-4">Client rate − Sub rate = {fin.commissionRatePct?.toFixed(2)}% effective margin</span></div>
                    </>
                  ) : (
                    <div className="flex justify-between text-destructive"><span>− Commission ({fin.commissionRatePct?.toFixed(1)}%)</span><span>({fin.commission != null ? formatCurrency(fin.commission) : "-"})</span></div>
                  )}
                  {fin.shortQty != null && (
                    <>
                      <div className="flex justify-between text-muted-foreground text-xs"><span className="pl-4">Short Qty: {formatNumber(fin.shortQty)} MT | Allowance: {fin.allowancePct}% = {formatNumber(fin.allowanceQty ?? 0)} MT</span></div>
                      <div className="flex justify-between text-destructive">
                        <span>− Short Charge ({formatNumber(fin.chargeableShort ?? 0)} MT × {fin.subShortChargeRate != null ? formatCurrency(fin.subShortChargeRate) : "—"}/MT)</span>
                        <span>({fin.shortCharge != null ? formatCurrency(fin.shortCharge) : "-"})</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-destructive"><span>− Trip Expenses</span><span>({formatCurrency(fin.tripExpensesTotal)})</span></div>
                  <div className="flex justify-between text-destructive"><span>− Driver Salary Allocation</span><span>({formatCurrency(fin.driverSalaryAllocation)})</span></div>
                  <div className="border-t border-border pt-2 flex justify-between font-bold text-primary"><span>= Net Payable to Subcontractor</span><span>{fin.netPayable != null ? formatCurrency(fin.netPayable) : "Pending"}</span></div>
                </div>
              </div>
            )}
            {fin?.isRevenueHeld && (fin.tripExpensesTotal > 0 || fin.driverSalaryAllocation > 0) && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Current Deductions (Expenses Only)</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-destructive"><span>− Trip Expenses incurred</span><span>({formatCurrency(fin.tripExpensesTotal)})</span></div>
                  {fin.driverSalaryAllocation > 0 && <div className="flex justify-between text-destructive"><span>− Driver Salary Allocation</span><span>({formatCurrency(fin.driverSalaryAllocation)})</span></div>}
                  <div className="border-t border-border pt-2 flex justify-between font-bold text-destructive"><span>= Net (before revenue recognition)</span><span>{fin.netPayable != null ? formatCurrency(fin.netPayable) : "—"}</span></div>
                  <p className="text-xs text-muted-foreground pt-1">Full settlement including gross revenue will be calculated upon delivery.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "clearances" && (
          <div className="space-y-4">
            {/* Clearance-block banner */}
            {clearanceBlock && (
              <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Trip advance blocked — clearance required</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{clearanceBlock.message}</p>
                </div>
                <button onClick={() => setClearanceBlock(null)} className="text-amber-500 hover:text-amber-700 shrink-0"><X className="w-4 h-4" /></button>
              </div>
            )}
            {["zambia_entry", "drc_entry"].map((checkpoint) => {
              const docs = trip.clearances?.filter((c) => c.checkpoint === checkpoint) ?? [];
              const isBlockedCheckpoint = clearanceBlock?.checkpoint === checkpoint;
              return (
                <div key={checkpoint} className={`bg-card border rounded-xl overflow-hidden transition-all ${isBlockedCheckpoint ? "border-amber-400 dark:border-amber-600 shadow-amber-200 dark:shadow-amber-900/40 shadow-md" : "border-border"}`}>
                  <div className={`px-5 py-3 border-b flex items-center justify-between gap-2 ${isBlockedCheckpoint ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-700" : "bg-secondary/30 border-border"}`}>
                    <h3 className="font-semibold text-sm text-foreground">
                      {checkpoint === "zambia_entry" ? "🇿🇲 Zambia Entry (T1)" : "🇨🇩 DRC Entry (TR8)"}
                    </h3>
                    {isBlockedCheckpoint && <span className="text-xs font-bold text-amber-600 dark:text-amber-400 animate-pulse">APPROVAL REQUIRED</span>}
                  </div>
                  {!docs.length ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">No documents for this checkpoint</div>
                  ) : (
                    <div className="divide-y divide-border/50">
                      {docs.map((doc) => {
                        const isBlocking = clearanceBlock?.clearanceId === doc.id;
                        const isUploading = uploadingClearanceDoc === doc.id;
                        return (
                          <div key={doc.id} className={`px-4 py-4 space-y-3 ${isBlocking ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}`}>
                            {/* Row 1: Doc info + status badge */}
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-semibold">{doc.documentType}</p>
                                  <StatusBadge status={doc.status} />
                                  {isBlocking && <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Blocking</span>}
                                </div>
                                {doc.documentNumber && <p className="text-xs text-muted-foreground font-mono mt-0.5">{doc.documentNumber}</p>}
                                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap mt-1">
                                  {doc.requestedAt && <span>Req: {formatDate(doc.requestedAt)}</span>}
                                  {doc.approvedAt && <span className="text-green-600 dark:text-green-400 font-medium">✓ Approved: {formatDate(doc.approvedAt)}</span>}
                                  {doc.notes && <span>{doc.notes}</span>}
                                </div>
                              </div>
                            </div>

                            {/* Row 2: Quick-action buttons + status select */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {doc.status === "requested" && (
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleClearanceStatusChange(doc.id, "pending")}>
                                  <ArrowRight className="w-3 h-3 mr-1" />Mark Pending
                                </Button>
                              )}
                              {(doc.status === "requested" || doc.status === "pending") && (
                                <Button size="sm" className={`h-7 text-xs ${isBlocking ? "bg-amber-600 hover:bg-amber-700" : ""}`} onClick={() => handleClearanceStatusChange(doc.id, "approved")}>
                                  <CheckCircle2 className="w-3 h-3 mr-1" />Approve
                                </Button>
                              )}
                              {doc.status === "approved" && (
                                <Button size="sm" variant="outline" className="h-7 text-xs text-muted-foreground" onClick={() => handleClearanceStatusChange(doc.id, "pending")}>
                                  Revert to Pending
                                </Button>
                              )}
                              <Select value={doc.status} onValueChange={(v) => handleClearanceStatusChange(doc.id, v)}>
                                <SelectTrigger className="h-7 w-28 text-xs ml-auto"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {["requested", "pending", "approved", "rejected"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Row 3: Document attachment */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {doc.documentUrl ? (
                                <>
                                  <a href={doc.documentUrl} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                                    <Paperclip className="w-3 h-3" />View Document
                                  </a>
                                  <button onClick={() => handleClearanceDocRemove(doc.id)}
                                    className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
                                    <X className="w-3 h-3" />Remove
                                  </button>
                                </>
                              ) : (
                                <label className={`flex items-center gap-1.5 text-xs cursor-pointer text-muted-foreground hover:text-foreground transition-colors ${isUploading ? "opacity-50 pointer-events-none" : ""}`}>
                                  {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                                  {isUploading ? "Uploading..." : "Attach Document"}
                                  <input type="file" className="sr-only" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleClearanceDocUpload(doc.id, f); e.target.value = ""; }} />
                                </label>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "expenses" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">Expenses are deducted from the subcontractor's net payable.</p>
              <Button size="sm" onClick={() => { setExpenseForm({ costType: "fuel_advance", description: "", amount: "", currency: "USD", expenseDate: new Date().toISOString().split("T")[0] }); setShowExpense(true); }}>
                <Plus className="w-4 h-4 mr-1.5" />Add Expense
              </Button>
            </div>

            {!trip.expenses?.length ? (
              <div className="bg-card border border-border rounded-xl flex flex-col items-center justify-center py-12 text-center">
                <Receipt className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No expenses recorded yet</p>
              </div>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="sm:hidden space-y-2">
                  {trip.expenses.map((e) => {
                    const et = EXPENSE_TYPES.find((t) => t.value === e.costType);
                    return (
                      <div key={e.id} className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {et && et.leg !== "general" && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wide ${et.legColor}`}>{et.leg}</span>
                            )}
                            <span className="text-sm font-medium">{et?.label ?? (e.costType as string).replace(/_/g, " ")}</span>
                          </div>
                          {(() => {
                            const raw = (e.description as string | undefined) ?? "";
                            const fromTruck = raw.includes("[from truck]");
                            const clean = raw.replace(/\s*\[from truck\]/, "").trim();
                            return (fromTruck || clean) ? (
                              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                {fromTruck && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 whitespace-nowrap">from truck</span>
                                )}
                                {clean && <p className="text-xs text-muted-foreground">{clean}</p>}
                              </div>
                            ) : null;
                          })()}
                          <p className="text-xs text-muted-foreground mt-1">{formatDate(e.expenseDate ?? e.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-base font-bold">{formatCurrency(e.amount)}</span>
                          <TaskTrigger
                            recordType="expense"
                            recordId={e.id}
                            recordLabel={`${et?.label ?? e.costType} — ${formatCurrency(e.amount)}`}
                          />
                          {(e as any).truckId && (
                            <button
                              onClick={() => setConfirmUnlinkId(e.id)}
                              className="text-muted-foreground hover:text-amber-400"
                              title="Unlink from trip"
                              disabled={unlinkingExpenseId === e.id}
                            >
                              {unlinkingExpenseId === e.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink2 className="w-4 h-4" />}
                            </button>
                          )}
                          <button onClick={() => setDeleteExpenseId(e.id)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block bg-card border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border bg-secondary/50">
                      {["Leg", "Type", "Description", "Date", "Amount", ""].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {trip.expenses.map((e) => {
                        const et = EXPENSE_TYPES.find((t) => t.value === e.costType);
                        return (
                          <tr key={e.id} className="border-b border-border/50 last:border-0 group">
                            <td className="px-4 py-3">
                              {et && et.leg !== "general" ? (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wide ${et.legColor}`}>{et.leg}</span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-3 font-medium text-sm">{et?.label ?? (e.costType as string).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">
                              {(() => {
                                const raw = (e.description as string | undefined) ?? "";
                                const fromTruck = raw.includes("[from truck]");
                                const clean = raw.replace(/\s*\[from truck\]/, "").trim();
                                return (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {fromTruck && (
                                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 whitespace-nowrap">from truck</span>
                                    )}
                                    <span>{clean || (fromTruck ? "" : "-")}</span>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(e.expenseDate ?? e.createdAt)}</td>
                            <td className="px-4 py-3 font-semibold">{formatCurrency(e.amount)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <TaskTrigger
                                  recordType="expense"
                                  recordId={e.id}
                                  recordLabel={`${et?.label ?? e.costType} — ${formatCurrency(e.amount)}`}
                                />
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {(e as any).truckId && (
                                    <button
                                      onClick={() => setConfirmUnlinkId(e.id)}
                                      className="text-muted-foreground hover:text-amber-400"
                                      title="Unlink from trip"
                                      disabled={unlinkingExpenseId === e.id}
                                    >
                                      {unlinkingExpenseId === e.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink2 className="w-4 h-4" />}
                                    </button>
                                  )}
                                  <button onClick={() => setDeleteExpenseId(e.id)} className="text-muted-foreground hover:text-destructive">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="px-4 py-3 border-t border-border flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{trip.expenses.length} expense{trip.expenses.length !== 1 ? "s" : ""}</span>
                    <span className="text-sm font-bold text-foreground">Total: {formatCurrency(trip.expenses.reduce((s, e) => s + e.amount, 0))}</span>
                  </div>
                </div>
                {/* Mobile total */}
                <div className="sm:hidden flex items-center justify-between pt-1 px-1">
                  <span className="text-xs text-muted-foreground">{trip.expenses.length} expense{trip.expenses.length !== 1 ? "s" : ""}</span>
                  <span className="text-sm font-bold">Total: {formatCurrency(trip.expenses.reduce((s, e) => s + e.amount, 0))}</span>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "amendments" && (
          <div className="space-y-2">
            {!trip.amendments?.length ? (
              <div className="flex flex-col items-center py-16 gap-3 text-center">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground text-sm">No amendments recorded for this trip.</p>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute left-5 top-4 bottom-4 w-px bg-border" />
                {trip.amendments.map((a, idx) => {
                  const isIncident = a.amendmentType === "incident";
                  const isCancellation = a.amendmentType === "cancellation";
                  const iconColor = isIncident ? "text-red-500 bg-red-500/10 border-red-500/20" : isCancellation ? "text-destructive bg-destructive/10 border-destructive/20" : "text-primary bg-primary/10 border-primary/20";
                  return (
                    <div key={a.id} className={`relative flex gap-4 pb-4 ${idx === trip.amendments.length - 1 ? "" : ""}`}>
                      <div className={`w-10 h-10 rounded-full border flex items-center justify-center shrink-0 z-10 ${iconColor}`}>
                        {isIncident ? <AlertTriangle className="w-4 h-4" /> : isCancellation ? <Trash2 className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 bg-card border border-border rounded-xl p-4 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                          <span className={`text-xs font-semibold uppercase tracking-wider ${isIncident ? "text-red-500" : isCancellation ? "text-destructive" : "text-primary"}`}>
                            {a.amendmentType.replace(/_/g, " ")}
                          </span>
                          <span className="text-xs text-muted-foreground">{formatDate(a.amendedAt)}</span>
                        </div>
                        <p className="text-sm text-foreground">{a.reason}</p>
                        {(a.oldTruckId || a.newTruckId) && a.oldTruckId !== a.newTruckId && (
                          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium">Truck:</span>
                            <span>{(trucks as any[]).find((t) => t.id === a.oldTruckId)?.plateNumber ?? `#${a.oldTruckId}`}</span>
                            <ChevronRight className="w-3 h-3" />
                            <span className="text-foreground font-medium">{a.newTruckId ? ((trucks as any[]).find((t) => t.id === a.newTruckId)?.plateNumber ?? `#${a.newTruckId}`) : "—"}</span>
                          </div>
                        )}
                        {(a.oldDriverId || a.newDriverId) && a.oldDriverId !== a.newDriverId && (
                          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium">Driver:</span>
                            <span>{(drivers as any[]).find((d) => d.id === a.oldDriverId)?.name ?? `#${a.oldDriverId}`}</span>
                            <ChevronRight className="w-3 h-3" />
                            <span className="text-foreground font-medium">{a.newDriverId ? ((drivers as any[]).find((d) => d.id === a.newDriverId)?.name ?? `#${a.newDriverId}`) : "—"}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Discussion Tab ── */}
        {activeTab === "discussion" && (
          <div className="max-w-2xl">
            <TripDiscussion tripId={parseInt(id)} />
          </div>
        )}
      </PageContent>

      {/* Quantity Correction Dialog */}
      <Dialog open={!!editQty} onOpenChange={(o) => !o && setEditQty(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>
              Correct {editQty?.field === "loadedQty" ? "Loaded" : "Delivered"} Quantity
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-xs text-muted-foreground">
              {editQty?.field === "loadedQty"
                ? "Update if the initial loaded quantity was recorded incorrectly. This affects financials."
                : "Update based on POD if the delivered quantity differs from what was originally recorded."}
            </p>
            <div>
              <Label>Quantity (MT)</Label>
              <Input
                type="number"
                className="mt-1"
                value={editQty?.value ?? ""}
                onChange={(e) => setEditQty((q) => q ? { ...q, value: e.target.value } : q)}
                placeholder="e.g. 37850"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditQty(null)}>Cancel</Button>
            <Button onClick={handleQtySave} disabled={!editQty?.value}>Save Correction</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modals */}
      <Dialog open={showExpense} onOpenChange={setShowExpense}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Trip Expense</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Date *</Label>
                <Input type="date" value={expenseForm.expenseDate} onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })} className="mt-1" />
              </div>
              <div><Label>Type *</Label>
                <Select value={expenseForm.costType} onValueChange={(v) => setExpenseForm({ ...expenseForm, costType: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{EXPENSE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Description</Label><Input value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} className="mt-1" placeholder="e.g. Nakonde border crossing toll" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount *</Label><Input type="number" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} className="mt-1" /></div>
              <div><Label>Currency</Label>
                <Select value={expenseForm.currency} onValueChange={(v) => setExpenseForm({ ...expenseForm, currency: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="ZMW">ZMW</SelectItem>
                    <SelectItem value="CDF">CDF</SelectItem>
                    <SelectItem value="TZS">TZS</SelectItem>
                    <SelectItem value="ZAR">ZAR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Paid via</Label>
              <Select value={expenseForm.paymentMethod} onValueChange={(v) => setExpenseForm({ ...expenseForm, paymentMethod: v, supplierId: "", bankAccountId: "" })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="petty_cash">Petty Cash</SelectItem>
                  <SelectItem value="fuel_credit">Fuel Credit (Supplier)</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {expenseForm.paymentMethod === "fuel_credit" && (
              <div><Label>Supplier *</Label>
                <Select value={expenseForm.supplierId} onValueChange={(v) => setExpenseForm({ ...expenseForm, supplierId: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>
                    {(suppliers as any[]).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {expenseForm.paymentMethod === "bank_transfer" && (bankAccounts as any[]).filter((b: any) => b.isActive).length > 0 && (
              <div><Label>Bank Account</Label>
                <Select value={expenseForm.bankAccountId} onValueChange={(v) => setExpenseForm({ ...expenseForm, bankAccountId: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select bank (optional)" /></SelectTrigger>
                  <SelectContent>
                    {(bankAccounts as any[]).filter((b: any) => b.isActive).map((b: any) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}{b.bankName ? ` — ${b.bankName}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExpense(false)}>Cancel</Button>
            <Button onClick={handleExpenseSave} disabled={savingExpense || !expenseForm.amount}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showClearance} onOpenChange={setShowClearance}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Clearance Document</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Checkpoint *</Label>
              <Select value={clearanceForm.checkpoint} onValueChange={(v) => setClearanceForm({ ...clearanceForm, checkpoint: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="zambia_entry">Zambia Entry (T1)</SelectItem>
                  <SelectItem value="drc_entry">DRC Entry (TR8)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Document Type *</Label>
              <Select value={clearanceForm.documentType} onValueChange={(v) => setClearanceForm({ ...clearanceForm, documentType: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{CLEARANCE_DOCS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Document Number</Label><Input value={clearanceForm.documentNumber} onChange={(e) => setClearanceForm({ ...clearanceForm, documentNumber: e.target.value })} className="mt-1" /></div>
            <div><Label>Status</Label>
              <Select value={clearanceForm.status} onValueChange={(v) => setClearanceForm({ ...clearanceForm, status: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{["requested", "pending", "approved", "rejected"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Input value={clearanceForm.notes} onChange={(e) => setClearanceForm({ ...clearanceForm, notes: e.target.value })} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearance(false)}>Cancel</Button>
            <Button onClick={handleClearanceSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNote} onOpenChange={setShowNote}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Delivery Document Reference</DialogTitle><p className="text-xs text-muted-foreground mt-1">Attach a document reference (waybill, CMR, etc.) for dispute resolution.</p></DialogHeader>
          <div className="py-2 space-y-4">
            <div>
              <Label>Document Type</Label>
              <Select value={noteForm.docType} onValueChange={(v) => setNoteForm({ ...noteForm, docType: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="waybill">Waybill</SelectItem>
                  <SelectItem value="cmr">CMR</SelectItem>
                  <SelectItem value="bill_of_lading">Bill of Lading</SelectItem>
                  <SelectItem value="customs">Customs Declaration</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Document Number</Label>
              <Input value={noteForm.docNumber} onChange={(e) => setNoteForm({ ...noteForm, docNumber: e.target.value })} className="mt-1" placeholder="e.g. WB-2024-00123" />
            </div>
            <div>
              <Label>Document / Photo</Label>
              <div className="mt-1 space-y-2">
                {/* Upload buttons */}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="flex-1" disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}>
                    {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    Upload File
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="flex-1" disabled={uploading}
                    onClick={() => cameraInputRef.current?.click()}>
                    <Camera className="w-4 h-4 mr-2" />
                    Take Photo
                  </Button>
                  <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
                  <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
                </div>
                {/* File preview */}
                {noteForm.url && (() => {
                  const isImage = /\.(jpg|jpeg|png|webp|heic)$/i.test(noteForm.url);
                  return (
                    <div className="relative border border-border rounded-lg overflow-hidden bg-secondary/20">
                      {isImage ? (
                        <img src={noteForm.url} alt="Uploaded document" className="w-full max-h-40 object-contain" />
                      ) : (
                        <div className="flex items-center gap-3 p-3">
                          <FileText className="w-8 h-8 text-primary shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">Document uploaded</p>
                            <a href={noteForm.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Open ↗</a>
                          </div>
                        </div>
                      )}
                      <button onClick={() => setNoteForm((f) => ({ ...f, url: "" }))}
                        className="absolute top-1.5 right-1.5 bg-background/80 rounded-full p-0.5 hover:bg-destructive hover:text-destructive-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })()}
                {/* Manual URL fallback */}
                {!noteForm.url && (
                  <Input value={noteForm.url} onChange={(e) => setNoteForm({ ...noteForm, url: e.target.value })}
                    placeholder="Or paste a link: https://drive.google.com/..." />
                )}
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={noteForm.notes} onChange={(e) => setNoteForm({ ...noteForm, notes: e.target.value })} className="mt-1 h-20" placeholder="Any additional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNote(false)}>Cancel</Button>
            <Button onClick={handleNoteSave} disabled={!noteForm.docNumber && !noteForm.url}>Save Document</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAmend} onOpenChange={setShowAmend}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{amendForm.amendmentType === "cancellation" ? "Cancel Trip" : "Amend Trip"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* Show policy info if amending after loaded */}
            {isAmendableAfterLoaded && companySettings?.revenueAttributionPolicy && (
              <div className="bg-secondary/30 border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground">
                <b>Company Policy:</b> {getPolicyLabel(companySettings.revenueAttributionPolicy)}
              </div>
            )}
            {amendForm.amendmentType !== "cancellation" && (
              <div><Label>Amendment Type *</Label>
                <Select value={amendForm.amendmentType} onValueChange={(v) => setAmendForm({ ...amendForm, amendmentType: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="truck_swap">Swap Truck</SelectItem>
                    <SelectItem value="driver_swap">Swap Driver</SelectItem>
                    <SelectItem value="capacity_change">Change Capacity</SelectItem>
                    <SelectItem value="cancellation">Cancel Trip</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {amendForm.amendmentType === "truck_swap" && (
              <div><Label>New Truck *</Label>
                <Select value={amendForm.newTruckId || ""} onValueChange={(v) => setAmendForm({ ...amendForm, newTruckId: v })}>
                  <SelectTrigger className="mt-1"><SelectValue />
                    {amendForm.newTruckId ? trucks.find(t => t.id === parseInt(amendForm.newTruckId))?.plateNumber : "Select truck"}
                  </SelectTrigger>
                  <SelectContent>
                    {trucks.filter(t => t.id !== trip.truckId).map(t => (
                      <SelectItem key={t.id} value={t.id.toString()}>{t.plateNumber} {t.trailerPlate ? `(${t.trailerPlate})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {amendForm.amendmentType === "driver_swap" && (
              <div><Label>New Driver *</Label>
                <Select value={amendForm.newDriverId || ""} onValueChange={(v) => setAmendForm({ ...amendForm, newDriverId: v })}>
                  <SelectTrigger className="mt-1"><SelectValue />
                    {amendForm.newDriverId ? drivers.find(d => d.id === parseInt(amendForm.newDriverId))?.name : "Select driver"}
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.filter(d => d.id !== trip.driverId).map(d => (
                      <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {amendForm.amendmentType === "capacity_change" && (
              <div>
                <Label>New Capacity (MT) *</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amendForm.newCapacity}
                    onChange={(e) => setAmendForm({ ...amendForm, newCapacity: e.target.value })}
                    placeholder="e.g. 34.5"
                    className="flex-1"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">Current: {formatNumber(trip.capacity)} MT</span>
                </div>
              </div>
            )}
            {amendForm.amendmentType === "cancellation" && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3 text-sm text-destructive">
                This will permanently cancel the trip and release the truck back to available.
              </div>
            )}
            <div><Label>Reason *</Label><Input value={amendForm.reason} onChange={(e) => setAmendForm({ ...amendForm, reason: e.target.value })} className="mt-1" placeholder="Reason for amendment" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAmend(false)}>Close</Button>
            <Button variant={amendForm.amendmentType === "cancellation" ? "destructive" : "default"} onClick={handleAmend}
              disabled={
                !amendForm.reason ||
                (amendForm.amendmentType === "truck_swap" && !amendForm.newTruckId) ||
                (amendForm.amendmentType === "driver_swap" && !amendForm.newDriverId) ||
                (amendForm.amendmentType === "capacity_change" && !amendForm.newCapacity)
              }
            >
              {amendForm.amendmentType === "cancellation" ? "Confirm Cancellation" : "Apply Amendment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Incident Dialog */}
      <Dialog open={showIncident} onOpenChange={(o) => { if (!o) { setIncidentDescription(""); setIncidentReplacementTruckId(""); setIncidentRevenueOwner(""); } setShowIncident(o); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Flag as Incident
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-4">
            <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700 dark:text-red-400">
                This will mark <strong>{trip?.truckPlate}</strong> as under maintenance. Optionally assign a replacement truck to continue the journey — this creates a new trip linked to this one.
              </p>
            </div>

            <div>
              <Label>Incident Description *</Label>
              <Textarea
                value={incidentDescription}
                onChange={(e) => setIncidentDescription(e.target.value)}
                placeholder="Describe what happened, where, and any losses or injuries."
                rows={3}
                className="mt-1.5 resize-none"
              />
            </div>

            <div>
              <Label>Replacement Truck <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Select value={incidentReplacementTruckId || "none"} onValueChange={(v) => setIncidentReplacementTruckId(v === "none" ? "" : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select replacement truck (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None — I'll add one later</SelectItem>
                  {(trucks as any[]).filter((t) => t.id !== trip?.truckId && t.status !== "maintenance").map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.plateNumber} {t.subcontractorName ? `· ${t.subcontractorName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Revenue Attribution</Label>
              <Select
                value={incidentRevenueOwner || companySettings?.revenueAttributionPolicy?.toLowerCase() || "original"}
                onValueChange={setIncidentRevenueOwner}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="original">Original sub — keeps revenue (credited for loaded qty)</SelectItem>
                  {incidentReplacementTruckId && (
                    <SelectItem value="replacement">Replacement sub — takes revenue (original sub gets nothing)</SelectItem>
                  )}
                  {incidentReplacementTruckId && (
                    <SelectItem value="split">Split — original and replacement share revenue</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Company default: <span className="font-medium">{companySettings?.revenueAttributionPolicy ?? "ORIGINAL"}</span>.
                {!incidentReplacementTruckId && " Assign a replacement truck above to access split or replacement options."}
              </p>
            </div>

            {incidentError && (
              <p className="text-xs text-red-600">{(incidentError as Error).message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowIncident(false); setIncidentDescription(""); setIncidentReplacementTruckId(""); setIncidentRevenueOwner(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!incidentDescription.trim() || flaggingIncident}
              onClick={async () => {
                const repTruckId = incidentReplacementTruckId ? Number(incidentReplacementTruckId) : null;
                const revOwner = incidentReplacementTruckId ? (incidentRevenueOwner || companySettings?.revenueAttributionPolicy?.toLowerCase() || "original") : null;
                await flagIncident({ id, description: incidentDescription.trim(), replacementTruckId: repTruckId, revenueOwner: revOwner });
                setShowIncident(false);
                setIncidentDescription("");
                setIncidentReplacementTruckId("");
                setIncidentRevenueOwner("");
              }}
            >
              {flaggingIncident ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Flagging...</> : "Confirm Incident"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {revertDialog && trip && (
        <StatusRevertDialog
          open={revertDialog.open}
          fromStatus={trip.status}
          toStatus={revertDialog.pendingStatus}
          entityType="trip"
          isBlocked={
            TRIP_FINANCIAL_STATUSES.includes(trip.status) &&
            !["owner", "admin", "manager"].includes(user?.role ?? "")
          }
          blockedHint="This trip is tied to posted financials. Reopen the period first, or create a correcting entry in the current period."
          onClose={() => setRevertDialog(null)}
          onConfirm={(reason) => performStatusUpdate(reason)}
          loading={savingStatus}
        />
      )}

      <Dialog open={deleteExpenseId !== null} onOpenChange={(o) => { if (!o) setDeleteExpenseId(null); }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>Delete expense?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This cannot be undone.</p>
          <DialogFooter className="mt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteExpenseId(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={async () => {
              if (deleteExpenseId !== null) { await deleteExpense({ id: deleteExpenseId }).then(invalidate); setDeleteExpenseId(null); }
            }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlink expense from trip confirmation dialog */}
      <Dialog open={confirmUnlinkId !== null} onOpenChange={(o) => { if (!o) setConfirmUnlinkId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Unlink expense from trip?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-1">
            This expense will be returned to the truck's Other Expenses tab. You can re-link it to any trip afterwards.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmUnlinkId(null)}>Cancel</Button>
            <Button variant="default" onClick={() => confirmUnlinkId !== null && handleUnlinkExpense(confirmUnlinkId)}>
              Unlink
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassign to Batch dialog */}
      <Dialog open={showReassignDialog} onOpenChange={(o) => { if (!reassigning) setShowReassignDialog(o); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reassign to Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              This trip and all its expenses will move to the selected batch.
            </p>
            <div className="space-y-1.5">
              <Label>Select Batch</Label>
              <Select value={reassignBatchId} onValueChange={setReassignBatchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a batch..." />
                </SelectTrigger>
                <SelectContent>
                  {selectableBatches.length === 0
                    ? <SelectItem value="none" disabled>No available batches</SelectItem>
                    : selectableBatches.map((b: any) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name} <span className="text-muted-foreground ml-1">({b.status})</span>
                        </SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>
            {reassignError && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">{reassignError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReassignDialog(false)} disabled={reassigning}>Cancel</Button>
            <Button onClick={handleReassignBatch} disabled={reassigning || !reassignBatchId}>
              {reassigning ? "Moving..." : "Reassign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmRemoveClearanceId !== null} onOpenChange={(open) => { if (!open) setConfirmRemoveClearanceId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove attached document?</AlertDialogTitle>
            <AlertDialogDescription>The document link will be removed from this clearance record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={handleClearanceDocRemoveConfirmed}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
