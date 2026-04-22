import { useState } from "react";
import { useGetInvoice } from "@workspace/api-client-react";
import { useRoute, useLocation } from "wouter";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer, FilePen, AlertTriangle, CheckCircle2, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { format } from "date-fns";

const STATUS_OPTIONS = ["draft", "sent", "paid", "overdue", "cancelled"];

function generateInvoicePrintHtml(invoice: any, company: any): string {
  const companyName = company?.name ?? "Optima Transport LLC";
  const companyAddress = [company?.address, company?.city, company?.country].filter(Boolean).join(", ");
  const companyPhone = company?.phone ?? "";
  const datePrinted = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const initials = companyName.split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0].toUpperCase()).join("");
  const logoHtml = company?.logoUrl
    ? `<img src="${company.logoUrl}" style="width:38px;height:38px;object-fit:contain;border-radius:6px;flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="width:38px;height:38px;background:rgba(255,255,255,0.15);border-radius:6px;display:none;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:13px;flex-shrink:0;">${initials}</div>`
    : `<div style="width:38px;height:38px;background:rgba(255,255,255,0.15);border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:13px;flex-shrink:0;">${initials}</div>`;

  const invoiceNumber = invoice.invoiceNumber ?? `INV-${invoice.id}`;
  const clientName = invoice.clientName ?? "—";
  const batchName = invoice.batchName ?? "—";
  const issuedDate = invoice.issuedDate ? new Date(invoice.issuedDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "—";
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "—";
  const grossRevenue = parseFloat(invoice.grossRevenue ?? 0);
  const shortCharge = parseFloat(invoice.totalShortCharge ?? 0);
  const netRevenue = parseFloat(invoice.netRevenue ?? 0);
  const ratePerMt = parseFloat(invoice.ratePerMt ?? 0);
  const lineItems: any[] = invoice.lineItems ?? [];
  const acct = invoice.accountStatement;

  const totLoaded = lineItems.reduce((s, r) => s + (r.loadedQty ?? 0), 0);
  const totDelivered = lineItems.reduce((s, r) => s + (r.deliveredQty ?? 0), 0);

  const acctRows = (() => {
    if (!acct) return "";
    const rows: string[] = [];
    rows.push(`<tr><td style="padding:6px 14px;font-size:11px;font-weight:700;">Gross Revenue Invoiced</td><td style="padding:6px 14px;font-size:11px;font-weight:700;text-align:right;">$${grossRevenue.toFixed(2)}</td></tr>`);
    if (acct.totalShortCharge > 0) rows.push(`<tr style="background:#fff8f8;"><td style="padding:6px 14px 6px 28px;font-size:11px;color:#dc2626;">Less: Short Charges</td><td style="padding:6px 14px;font-size:11px;text-align:right;color:#dc2626;">−$${parseFloat(acct.totalShortCharge).toFixed(2)}</td></tr>`);
    (acct.advances ?? []).forEach((a: any) => rows.push(`<tr style="background:#fff8f8;"><td style="padding:6px 14px 6px 28px;font-size:11px;color:#dc2626;">Less: Advance${a.reference ? ` (${a.reference})` : ""}</td><td style="padding:6px 14px;font-size:11px;text-align:right;color:#dc2626;">−$${parseFloat(a.amount).toFixed(2)}</td></tr>`));
    (acct.payments ?? []).forEach((p: any) => rows.push(`<tr style="background:#fff8f8;"><td style="padding:6px 14px 6px 28px;font-size:11px;color:#dc2626;">Less: Payment${p.reference ? ` (${p.reference})` : ""}</td><td style="padding:6px 14px;font-size:11px;text-align:right;color:#dc2626;">−$${parseFloat(p.amount).toFixed(2)}</td></tr>`));
    (acct.adjustments ?? []).forEach((a: any) => { const amt = parseFloat(a.amount); rows.push(`<tr><td style="padding:6px 14px 6px 28px;font-size:11px;">Adjustment${a.reference ? ` (${a.reference})` : ""}</td><td style="padding:6px 14px;font-size:11px;text-align:right;${amt < 0 ? "color:#dc2626;" : ""}">${amt < 0 ? `−$${Math.abs(amt).toFixed(2)}` : `$${amt.toFixed(2)}`}</td></tr>`); });
    const nd = parseFloat(acct.netDue ?? netRevenue);
    rows.push(`<tr style="background:${nd > 0 ? "#f0fdf4" : nd < 0 ? "#fff8f8" : "#f8fafc"};border-top:2px solid #e5e7eb;"><td style="padding:8px 14px;font-size:12px;font-weight:700;">Net Balance Due from Client</td><td style="padding:8px 14px;font-size:16px;font-weight:700;text-align:right;color:${nd > 0 ? "#059669" : nd < 0 ? "#dc2626" : "#6b7280"};">${nd < 0 ? `Credit: $${Math.abs(nd).toFixed(2)}` : `$${nd.toFixed(2)}`}</td></tr>`);
    return rows.join("");
  })();

  const deliveryRowsHtml = lineItems.map((item: any, i: number) =>
    `<tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"};border-bottom:1px solid #e5e7eb;">
      <td style="padding:7px 10px;font-size:11px;font-weight:600;">${item.truckPlate ?? "—"}</td>
      <td style="padding:7px 10px;font-size:11px;text-align:center;font-weight:700;color:${item.product === "AGO" ? "#2563eb" : "#d97706"};">${item.product ?? "—"}</td>
      <td style="padding:7px 10px;font-size:11px;text-align:right;">${(item.loadedQty ?? 0).toFixed(3)}</td>
      <td style="padding:7px 10px;font-size:11px;text-align:right;">${(item.deliveredQty ?? 0).toFixed(3)}</td>
      <td style="padding:7px 10px;font-size:11px;text-align:right;color:${(item.shortQty ?? 0) > 0 ? "#dc2626" : "#6b7280"};">${(item.shortQty ?? 0) > 0 ? (item.shortQty).toFixed(3) : "—"}</td>
      <td style="padding:7px 10px;font-size:11px;text-align:right;">${(item.grossRevenue ?? 0) > 0 ? `$${item.grossRevenue.toFixed(2)}` : "—"}</td>
      <td style="padding:7px 10px;font-size:11px;text-align:right;color:#dc2626;">${(item.shortCharge ?? 0) > 0 ? `-$${item.shortCharge.toFixed(2)}` : "—"}</td>
      <td style="padding:7px 10px;font-size:11px;text-align:right;font-weight:700;color:#059669;">${(item.netRevenue ?? 0) > 0 ? `$${item.netRevenue.toFixed(2)}` : "—"}</td>
    </tr>`
  ).join("");

  return `
<div style="font-family:Arial,sans-serif;color:#111827;background:#fff;width:100%;max-width:720px;margin:0 auto;">

  <!-- ══ TAX INVOICE ══ -->
  <div style="background:#0f172a;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;">
    <div style="display:flex;align-items:center;gap:12px;">
      ${logoHtml}
      <div>
        <div style="color:#fff;font-size:20px;font-weight:700;">${companyName}</div>
        ${companyAddress ? `<div style="color:#94a3b8;font-size:10px;margin-top:2px;">${companyAddress}</div>` : ""}
        ${companyPhone ? `<div style="color:#94a3b8;font-size:10px;">${companyPhone}</div>` : ""}
      </div>
    </div>
    <div style="text-align:right;">
      <div style="color:#f1f5f9;font-size:16px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;">Invoice</div>
      <div style="color:#94a3b8;font-size:11px;margin-top:3px;">${invoiceNumber}</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:2px solid #e5e7eb;">
    <div style="padding:12px 18px;border-right:1px solid #e5e7eb;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;">Billed To</div>
      <div style="font-size:15px;font-weight:700;">${clientName}</div>
      ${invoice.clientEmail ? `<div style="font-size:10px;color:#6b7280;margin-top:2px;">${invoice.clientEmail}</div>` : ""}
    </div>
    <div style="padding:12px 18px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:2px;">Invoice No.</div>
          <div style="font-size:12px;font-weight:700;">${invoiceNumber}</div>
        </div>
        <div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:2px;">Batch Ref.</div>
          <div style="font-size:12px;font-weight:600;">${batchName}</div>
        </div>
        <div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:2px;">Issue Date</div>
          <div style="font-size:12px;">${issuedDate}</div>
        </div>
        <div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:2px;">Due Date</div>
          <div style="font-size:12px;">${dueDate}</div>
        </div>
      </div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;border-bottom:1px solid #e5e7eb;">
    <div style="padding:10px 14px;border-right:1px solid #e5e7eb;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:2px;">Trucks</div>
      <div style="font-size:13px;font-weight:700;">${lineItems.length}</div>
    </div>
    <div style="padding:10px 14px;border-right:1px solid #e5e7eb;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:2px;">Rate / MT</div>
      <div style="font-size:13px;font-weight:700;">$${ratePerMt.toFixed(2)}</div>
    </div>
    <div style="padding:10px 14px;border-right:1px solid #e5e7eb;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:2px;">Gross Revenue</div>
      <div style="font-size:13px;font-weight:700;">$${grossRevenue.toFixed(2)}</div>
    </div>
    <div style="padding:10px 14px;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:2px;">Short Charges</div>
      <div style="font-size:13px;font-weight:700;color:#dc2626;">${shortCharge > 0 ? `-$${shortCharge.toFixed(2)}` : "—"}</div>
    </div>
  </div>

  <!-- Account Statement -->
  <div style="margin:12px 0;">
    <div style="padding:6px 14px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">
      <span style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;letter-spacing:0.05em;">Account Statement</span>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <tbody>${acctRows}</tbody>
    </table>
  </div>

  <!-- Signatures -->
  <div style="margin-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:0 14px;">
    <div>
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;">Authorised by (${companyName})</div>
      <div style="border-bottom:1px solid #374151;padding-bottom:24px;"></div>
      <div style="font-size:9px;color:#9ca3af;margin-top:4px;">Name &amp; Signature / Date</div>
    </div>
    <div>
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;">Acknowledged by (${clientName})</div>
      <div style="border-bottom:1px solid #374151;padding-bottom:24px;"></div>
      <div style="font-size:9px;color:#9ca3af;margin-top:4px;">Name &amp; Signature / Date</div>
    </div>
  </div>

  <div style="margin-top:12px;padding:8px 14px;border-top:1px solid #e5e7eb;text-align:center;font-size:9px;color:#9ca3af;">
    ${companyName} · ${datePrinted} · ${invoiceNumber}
  </div>

  ${lineItems.length > 0 ? `
  <!-- ══ DELIVERY STATEMENT ══ -->
  <div style="page-break-before:always;padding-top:8px;">
    <div style="background:#0f172a;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;">
      <div style="display:flex;align-items:center;gap:10px;">
        ${logoHtml}
        <div>
          <div style="color:#fff;font-size:16px;font-weight:700;">${companyName}</div>
          ${companyAddress ? `<div style="color:#94a3b8;font-size:10px;margin-top:1px;">${companyAddress}</div>` : ""}
        </div>
      </div>
      <div style="text-align:right;">
        <div style="color:#f1f5f9;font-size:14px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;">Delivery Statement</div>
        <div style="color:#94a3b8;font-size:10px;margin-top:2px;">${invoiceNumber} · ${clientName} · ${batchName}</div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-top:0;">
      <thead>
        <tr style="background:#1e293b;">
          ${["Truck", "Product", "Loaded (MT)", "Delivered (MT)", "Short (MT)", "Gross ($)", "Short Chg ($)", "Net ($)"].map((h) =>
            `<th style="padding:7px 10px;text-align:${["Truck","Product"].includes(h) ? "left" : "right"};font-size:9px;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:0.04em;">${h}</th>`
          ).join("")}
        </tr>
      </thead>
      <tbody>
        ${deliveryRowsHtml || `<tr><td colspan="8" style="padding:16px;text-align:center;color:#9ca3af;font-size:11px;">No trip data.</td></tr>`}
      </tbody>
      <tfoot>
        <tr style="background:#f0fdf4;border-top:2px solid #059669;">
          <td colspan="2" style="padding:7px 10px;font-size:11px;font-weight:700;">TOTAL</td>
          <td style="padding:7px 10px;text-align:right;font-size:11px;font-weight:700;">${totLoaded.toFixed(3)}</td>
          <td style="padding:7px 10px;text-align:right;font-size:11px;font-weight:700;">${totDelivered.toFixed(3)}</td>
          <td style="padding:7px 10px;text-align:right;font-size:11px;font-weight:700;color:#dc2626;">${(totLoaded - totDelivered) > 0 ? (totLoaded - totDelivered).toFixed(3) : "—"}</td>
          <td style="padding:7px 10px;text-align:right;font-size:11px;font-weight:700;">$${grossRevenue.toFixed(2)}</td>
          <td style="padding:7px 10px;text-align:right;font-size:11px;font-weight:700;color:#dc2626;">${shortCharge > 0 ? `-$${shortCharge.toFixed(2)}` : "—"}</td>
          <td style="padding:7px 10px;text-align:right;font-size:13px;font-weight:700;color:#059669;">$${netRevenue.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>

    <div style="margin-top:12px;padding:8px 14px;border-top:1px solid #e5e7eb;text-align:center;font-size:9px;color:#9ca3af;">
      ${companyName} · ${datePrinted} · This delivery statement is attached to ${invoiceNumber} and is not a standalone tax invoice.
    </div>
  </div>` : ""}
</div>`;
}

export default function InvoiceDetail() {
  const [, params] = useRoute("/invoices/:id");
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const id = Number(params?.id);
  const { data: invoice, isLoading } = useGetInvoice(id, { query: { enabled: !!id } });
  const { settings: company } = useCompanySettings();
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Amendment state
  const [showAmendDialog, setShowAmendDialog] = useState(false);
  const [amendReason, setAmendReason] = useState("");
  const [amendOverrides, setAmendOverrides] = useState<Record<number, { deliveredQty?: string; ratePerMt?: string; loadedQty?: string; clientShortRate?: string }>>({});
  const [submittingAmend, setSubmittingAmend] = useState(false);
  const [amendError, setAmendError] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Record Payment dialog state (partial / full payment against invoice)
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [recordPayAmount, setRecordPayAmount] = useState("");
  const [recordPayDate, setRecordPayDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [recordPayRef, setRecordPayRef] = useState("");
  const [recordPayBankId, setRecordPayBankId] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [recordPayError, setRecordPayError] = useState("");

  const { data: bankAccounts = [] } = useQuery<any[]>({
    queryKey: ["/api/bank-accounts"],
    queryFn: () => fetch("/api/bank-accounts", { credentials: "include" }).then((r) => r.json()),
  });

  const handleStatusChange = async (status: string) => {
    if (status === "cancelled") { setShowCancelConfirm(true); return; }
    setUpdatingStatus(true);
    try {
      const body: Record<string, unknown> = { status };
      if (status === "paid") {
        body.paidDate = format(new Date(), "yyyy-MM-dd");
        const firstBank = (bankAccounts as any[])[0];
        if (firstBank) body.bankAccountId = firstBank.id;
      }
      await fetch(`/api/invoices/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      qc.invalidateQueries({ queryKey: [`/api/invoices/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleConfirmCancel = async () => {
    setShowCancelConfirm(false);
    setUpdatingStatus(true);
    try {
      await fetch(`/api/invoices/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "cancelled" }),
      });
      qc.invalidateQueries({ queryKey: [`/api/invoices/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const openAmendDialog = () => {
    setAmendReason("");
    setAmendOverrides({});
    setAmendError("");
    setShowAmendDialog(true);
  };

  const handleAmendSubmit = async () => {
    if (!amendReason.trim()) { setAmendError("Please enter a reason for this amendment."); return; }
    setAmendError("");
    setSubmittingAmend(true);
    try {
      const adjustments = Object.entries(amendOverrides)
        .filter(([, v]) => v.deliveredQty !== undefined || v.ratePerMt !== undefined || v.loadedQty !== undefined || v.clientShortRate !== undefined)
        .map(([tripId, v]) => ({
          tripId: Number(tripId),
          ...(v.deliveredQty !== undefined ? { deliveredQty: parseFloat(v.deliveredQty!) } : {}),
          ...(v.ratePerMt !== undefined ? { ratePerMt: parseFloat(v.ratePerMt!) } : {}),
          ...(v.loadedQty !== undefined ? { loadedQty: parseFloat(v.loadedQty!) } : {}),
          ...(v.clientShortRate !== undefined ? { clientShortRate: parseFloat(v.clientShortRate!) } : {}),
        }));
      const res = await fetch(`/api/invoices/${id}/amend`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: amendReason.trim(), adjustments }),
      });
      const data = await res.json();
      if (!res.ok) { setAmendError(data.error ?? "Failed to amend invoice."); return; }
      setShowAmendDialog(false);
      qc.invalidateQueries({ queryKey: [`/api/invoices/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
    } finally {
      setSubmittingAmend(false);
    }
  };

  const openRecordPayment = () => {
    const netDue = (invoice as any)?.accountStatement?.netDue ?? 0;
    setRecordPayAmount(netDue > 0 ? netDue.toFixed(2) : "");
    setRecordPayDate(format(new Date(), "yyyy-MM-dd"));
    setRecordPayRef("");
    setRecordPayBankId("");
    setRecordPayError("");
    setShowRecordPayment(true);
  };

  const handleRecordPayment = async () => {
    const amount = parseFloat(recordPayAmount);
    if (!amount || amount <= 0) { setRecordPayError("Enter a valid amount."); return; }
    setRecordPayError("");
    setRecordingPayment(true);
    try {
      const inv = invoice as any;
      const res = await fetch(`/api/clients/${inv.clientId}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: "payment",
          amount: amount.toFixed(2),
          transactionDate: recordPayDate,
          reference: recordPayRef || undefined,
          batchId: inv.batchId,
          invoiceId: id,
          description: `Payment against ${inv.invoiceNumber}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setRecordPayError(data.error ?? "Payment failed."); return; }
      setShowRecordPayment(false);
      qc.invalidateQueries({ queryKey: [`/api/invoices/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
      qc.invalidateQueries({ queryKey: [`/api/clients/${inv.clientId}/transactions`] });
    } catch (e: any) {
      setRecordPayError(e.message ?? "Payment failed.");
    } finally {
      setRecordingPayment(false);
    }
  };

  const handlePrint = () => {
    if (!invoice) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const html = generateInvoicePrintHtml(invoice as any, company);
    w.document.write(`<!DOCTYPE html><html><head><title>${(invoice as any).invoiceNumber ?? "Invoice"}</title><style>*{box-sizing:border-box;}body{margin:0;padding:0;background:#fff;}@media print{@page{size:A4;margin:8mm;}}</style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch (_) {} }, 350);
  };

  if (isLoading) {
    return (
      <Layout>
        <PageHeader title="Invoice" subtitle="Loading..." />
        <PageContent><div className="text-center py-16 text-muted-foreground text-sm">Loading invoice...</div></PageContent>
      </Layout>
    );
  }

  if (!invoice) {
    return (
      <Layout>
        <PageHeader title="Invoice" subtitle="Not found" />
        <PageContent><div className="text-center py-16 text-muted-foreground text-sm">Invoice not found.</div></PageContent>
      </Layout>
    );
  }

  const inv = invoice as any;
  const totalLoaded = inv.totalLoadedQty ?? 0;
  const totalDelivered = inv.totalDeliveredQty ?? 0;
  const grossRevenue = inv.grossRevenue ?? 0;
  const shortCharge = inv.totalShortCharge ?? 0;
  const netRevenue = inv.netRevenue ?? 0;
  const ratePerMt = inv.ratePerMt ?? 0;
  const lineItems: any[] = inv.lineItems ?? [];
  const isAmended = !!inv.isAmended;
  const canAmend = !["paid", "cancelled"].includes(inv.status ?? "");

  return (
    <Layout>
      <PageHeader
        title={inv.invoiceNumber ?? `Invoice #${id}`}
        subtitle={`${inv.clientName ?? "—"} · ${inv.batchName ?? "No batch"}`}
        actions={<>
          <Button variant="outline" size="sm" onClick={() => navigate("/invoices")}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
          </Button>
          <Select
            value={inv.status}
            onValueChange={handleStatusChange}
            disabled={updatingStatus}
          >
            <SelectTrigger className="h-9 w-36 text-sm shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!["paid", "cancelled"].includes(inv.status ?? "") && (
            <Button size="sm" onClick={openRecordPayment}>
              <DollarSign className="w-4 h-4 mr-1.5" /> Record Payment
            </Button>
          )}
          {canAmend && (
            <Button variant="outline" size="sm" onClick={openAmendDialog}>
              <FilePen className="w-4 h-4 mr-1.5" /> Amend
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-1.5" /> Print
          </Button>
        </>}
      />
      <PageContent>
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Amendment history banner */}
          {isAmended && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                    Amended · {inv.amendmentCount} amendment{inv.amendmentCount !== 1 ? "s" : ""}
                    {inv.amendedAt ? ` · Last amended ${formatDate(inv.amendedAt)}` : ""}
                  </p>
                  {inv.amendmentReason && (
                    <p className="text-sm text-blue-700 dark:text-blue-400 mt-0.5">Reason: {inv.amendmentReason}</p>
                  )}
                  {inv.originalGrossRevenue != null && (
                    <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">
                      Original gross: {formatCurrency(inv.originalGrossRevenue)} → Current: {formatCurrency(grossRevenue)}
                      {" "}({(grossRevenue - inv.originalGrossRevenue) >= 0 ? "+" : ""}{formatCurrency(grossRevenue - inv.originalGrossRevenue)})
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Invoice Header Card */}
          <div className="bg-card border border-border rounded-xl overflow-hidden print:border-0 print:shadow-none">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 p-4 sm:p-6 border-b border-border bg-secondary/20">
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-display font-bold text-foreground tracking-tight">
                  {inv.invoiceNumber}
                  {isAmended && <span className="ml-2 text-xs font-semibold uppercase tracking-wider text-blue-500 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full align-middle">Amended</span>}
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <StatusBadge status={inv.status} />
                  {inv.issuedDate && (
                    <span className="text-xs text-muted-foreground">Issued: {formatDate(inv.issuedDate)}</span>
                  )}
                  {inv.dueDate && (
                    <span className="text-xs text-muted-foreground">· Due: {formatDate(inv.dueDate)}</span>
                  )}
                </div>
              </div>
              <div className="sm:text-right shrink-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Net Amount Due</p>
                <p className="text-2xl sm:text-3xl font-display font-bold text-success mt-1">{formatCurrency(netRevenue)}</p>
                {isAmended && inv.originalNetRevenue != null && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-through">{formatCurrency(inv.originalNetRevenue)}</p>
                )}
              </div>
            </div>

            {/* Client / Batch info */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 sm:p-6">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Billed To</p>
                <p className="text-sm font-semibold text-foreground">{inv.clientName ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Batch Reference</p>
                <p className="text-sm font-semibold text-foreground">{inv.batchName ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Rate per MT</p>
                <p className="text-sm font-semibold text-foreground">{formatCurrency(ratePerMt)}</p>
              </div>
            </div>
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Loaded</p>
              <p className="text-xl font-bold text-foreground mt-1 font-mono">{totalLoaded.toFixed(3)} MT</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Delivered</p>
              <p className="text-xl font-bold text-foreground mt-1 font-mono">{totalDelivered.toFixed(3)} MT</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 border-warning/30 bg-warning/5">
              <p className="text-xs text-warning font-medium uppercase tracking-wider">Short Charges</p>
              <p className="text-xl font-bold text-warning mt-1 font-mono">−{formatCurrency(shortCharge)}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 border-success/30 bg-success/5">
              <p className="text-xs text-success font-medium uppercase tracking-wider">Net Revenue</p>
              <p className="text-xl font-bold text-success mt-1 font-mono">{formatCurrency(netRevenue)}</p>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Line Items — Per Truck Breakdown</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{lineItems.length} truck{lineItems.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    {["Truck", "Product", "Loaded (MT)", "Delivered (MT)", "Short Qty", "Allowance", "Chargeable", "Short Rate ($/MT)", "Short Charge", "Net Revenue"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-sm">No line items available</td>
                    </tr>
                  ) : lineItems.map((item: any) => (
                    <tr key={item.tripId} className="border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-primary">{item.truckPlate ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{item.product ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-foreground">{(item.loadedQty ?? 0).toFixed(3)}</td>
                      <td className="px-4 py-3 font-mono text-foreground">{(item.deliveredQty ?? 0).toFixed(3)}</td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">{(item.shortQty ?? 0).toFixed(3)}</td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">{(item.allowanceQty ?? item.allowance ?? 0).toFixed(3)}</td>
                      <td className="px-4 py-3 font-mono text-warning">
                        {(item.chargeableShort ?? 0) > 0 ? (item.chargeableShort).toFixed(3) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        {(item.shortRate ?? 0) > 0 ? formatCurrency(item.shortRate) : <span>—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-warning">
                        {(item.shortCharge ?? 0) > 0 ? `−${formatCurrency(item.shortCharge)}` : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-success text-right">{formatCurrency(item.netRevenue ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
                {lineItems.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border bg-secondary/50">
                      <td colSpan={2} className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Totals</td>
                      <td className="px-4 py-3 font-mono font-semibold text-foreground">{totalLoaded.toFixed(3)}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-foreground">{totalDelivered.toFixed(3)}</td>
                      <td colSpan={4} />
                      <td className="px-4 py-3 font-mono font-semibold text-warning">{shortCharge > 0 ? `−${formatCurrency(shortCharge)}` : "—"}</td>
                      <td className="px-4 py-3 font-mono font-bold text-success text-right">{formatCurrency(netRevenue)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Account Statement */}
          {(() => {
            const acct = inv.accountStatement;
            if (!acct) return null;
            const rows: { label: string; amount: number; sub?: boolean; debit?: boolean; bold?: boolean; separator?: boolean }[] = [];
            rows.push({ label: "Gross Revenue Invoiced", amount: acct.invoicedAmount, bold: true });
            if (acct.totalShortCharge > 0) {
              rows.push({ label: "Less: Short Charges", amount: -acct.totalShortCharge, debit: true, sub: true });
            }
            if (acct.advances?.length > 0) {
              acct.advances.forEach((a: any) => {
                rows.push({
                  label: `Less: Advance${a.reference ? ` (${a.reference})` : ""}`,
                  amount: -a.amount,
                  debit: true,
                  sub: true,
                });
              });
            }
            if (acct.payments?.length > 0) {
              acct.payments.forEach((p: any) => {
                rows.push({
                  label: `Less: Payment${p.reference ? ` (${p.reference})` : ""}`,
                  amount: -p.amount,
                  debit: true,
                  sub: true,
                });
              });
            }
            if (acct.adjustments?.length > 0) {
              acct.adjustments.forEach((a: any) => {
                rows.push({
                  label: `Adjustment${a.reference ? ` (${a.reference})` : ""}`,
                  amount: a.amount >= 0 ? a.amount : -Math.abs(a.amount),
                  sub: true,
                });
              });
            }
            return (
              <div className="bg-card border border-border rounded-xl overflow-hidden print:break-inside-avoid">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">Account Statement</h3>
                </div>
                <div className="divide-y divide-border/50">
                  {rows.map((row, i) => (
                    <div key={i} className={`flex items-center justify-between px-5 py-3 ${row.sub ? "pl-8" : ""}`}>
                      <span className={`text-sm ${row.bold ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{row.label}</span>
                      <span className={`text-sm font-mono tabular-nums ${row.bold ? "font-bold text-foreground" : row.debit ? "text-destructive" : "text-foreground"}`}>
                        {row.amount < 0 ? `−${formatCurrency(Math.abs(row.amount))}` : formatCurrency(row.amount)}
                      </span>
                    </div>
                  ))}
                  <div className={`flex items-center justify-between px-5 py-4 ${acct.netDue > 0 ? "bg-primary/5" : acct.netDue < 0 ? "bg-destructive/5" : "bg-secondary/30"}`}>
                    <span className="text-sm font-bold text-foreground">Net Balance Due from Client</span>
                    <span className={`text-xl font-display font-bold tabular-nums ${acct.netDue > 0 ? "text-primary" : acct.netDue < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {acct.netDue < 0 ? `Credit: ${formatCurrency(Math.abs(acct.netDue))}` : formatCurrency(acct.netDue)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Notes */}
          {inv.notes && (
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes</p>
              <p className="text-sm text-foreground">{inv.notes}</p>
            </div>
          )}
        </div>
      </PageContent>

      {/* ── Amend Invoice Dialog ── */}
      <Dialog open={showAmendDialog} onOpenChange={(o) => { if (!o) setShowAmendDialog(false); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FilePen className="w-4 h-4" /> Amend Invoice — {inv.invoiceNumber}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {/* Reason */}
            <div className="space-y-1.5">
              <Label className="text-xs">Amendment Reason <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder="e.g. Client disputed delivered quantity on trip ABC-12 — corrected from 49.0 MT to 48.2 MT"
                value={amendReason}
                onChange={(e) => setAmendReason(e.target.value)}
                className="resize-none text-sm"
                rows={2}
              />
            </div>

            {/* Per-trip overrides */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Override Per-Trip Values (leave blank to keep original)</Label>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary/50 border-b border-border">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Truck</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground">Load (MT)</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground">Del. (MT)</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground">Short Rate ($/MT)</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground">Rate ($/MT)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-sm">No line items</td></tr>
                    ) : lineItems.map((item: any) => (
                      <tr key={item.tripId} className="border-b border-border/50 last:border-0">
                        <td className="px-4 py-2.5 font-mono font-bold text-primary">{item.truckPlate ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          <Input
                            type="number" step="0.001" min="0"
                            placeholder={(item.loadedQty ?? 0).toFixed(3)}
                            value={amendOverrides[item.tripId]?.loadedQty ?? ""}
                            onChange={(e) => setAmendOverrides((prev) => ({
                              ...prev,
                              [item.tripId]: { ...prev[item.tripId], loadedQty: e.target.value || undefined },
                            }))}
                            className="h-8 text-sm text-right font-mono w-24 ml-auto"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <Input
                            type="number" step="0.001" min="0"
                            placeholder={(item.deliveredQty ?? 0).toFixed(3)}
                            value={amendOverrides[item.tripId]?.deliveredQty ?? ""}
                            onChange={(e) => setAmendOverrides((prev) => ({
                              ...prev,
                              [item.tripId]: { ...prev[item.tripId], deliveredQty: e.target.value || undefined },
                            }))}
                            className="h-8 text-sm text-right font-mono w-24 ml-auto"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <Input
                            type="number" step="0.01" min="0"
                            placeholder={(item.shortRate ?? 0).toFixed(2)}
                            value={amendOverrides[item.tripId]?.clientShortRate ?? ""}
                            onChange={(e) => setAmendOverrides((prev) => ({
                              ...prev,
                              [item.tripId]: { ...prev[item.tripId], clientShortRate: e.target.value || undefined },
                            }))}
                            className="h-8 text-sm text-right font-mono w-24 ml-auto"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <Input
                            type="number" step="0.01" min="0"
                            placeholder={ratePerMt.toFixed(2)}
                            value={amendOverrides[item.tripId]?.ratePerMt ?? ""}
                            onChange={(e) => setAmendOverrides((prev) => ({
                              ...prev,
                              [item.tripId]: { ...prev[item.tripId], ratePerMt: e.target.value || undefined },
                            }))}
                            className="h-8 text-sm text-right font-mono w-24 ml-auto"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">Current gross: <span className="font-semibold">{formatCurrency(grossRevenue)}</span>. New totals will be recalculated server-side and a correcting entry will be posted to the client ledger.</p>
            </div>

            {/* Warning about paid invoices */}
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>If this invoice has already been sent to the client, notify them of the correction. The adjustment will appear in the Account Statement below.</span>
            </div>

            {amendError && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">{amendError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAmendDialog(false)}>Cancel</Button>
            <Button onClick={handleAmendSubmit} disabled={submittingAmend || !amendReason.trim()}>
              <FilePen className="w-4 h-4 mr-1.5" />
              {submittingAmend ? "Saving..." : "Save Amendment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation */}
      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel Invoice?</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelConfirm(false)}>Keep It</Button>
            <Button variant="destructive" onClick={handleConfirmCancel}>Yes, Cancel Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={showRecordPayment} onOpenChange={(o) => { if (!o) setShowRecordPayment(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>{(invoice as any)?.invoiceNumber} · {(invoice as any)?.clientName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {(invoice as any)?.accountStatement?.netDue > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                <span className="text-xs text-muted-foreground">Balance due</span>
                <span className="text-sm font-semibold">{formatCurrency((invoice as any).accountStatement.netDue)}</span>
              </div>
            )}
            <div>
              <Label className="text-xs">Amount (USD) *</Label>
              <Input type="number" step="0.01" value={recordPayAmount} onChange={(e) => setRecordPayAmount(e.target.value)} className="mt-1" placeholder="0.00" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={recordPayDate} onChange={(e) => setRecordPayDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Reference</Label>
                <Input value={recordPayRef} onChange={(e) => setRecordPayRef(e.target.value)} className="mt-1" placeholder="e.g. TT-123" />
              </div>
            </div>
            {(bankAccounts as any[]).filter((b: any) => !b.isDefault).length > 0 && (
              <div>
                <Label className="text-xs">Bank Account</Label>
                <Select value={recordPayBankId} onValueChange={setRecordPayBankId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Default bank" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Default bank</SelectItem>
                    {(bankAccounts as any[]).filter((b: any) => !b.isDefault).map((b: any) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {recordPayError && <p className="text-xs text-destructive">{recordPayError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRecordPayment(false)}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={recordingPayment || !recordPayAmount}>
              {recordingPayment ? "Saving..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </Layout>
  );
}
