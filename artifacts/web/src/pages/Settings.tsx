import { useState, useEffect, useRef } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Settings, Save, Upload, Building2, Globe, Phone, Mail, Hash, DollarSign, TrendingUp, ImageOff, Trash2, ShieldAlert } from "lucide-react";
import { LogoCropDialog } from "@/components/LogoCropDialog";
import { useAuth } from "@/contexts/AuthContext";

export default function SettingsPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const [form, setForm] = useState({
    name: "",
    logoUrl: "",
    address: "",
    email: "",
    phone: "",
    currency: "USD",
    taxId: "",
    website: "",
    revenueAttributionPolicy: "ORIGINAL",
    t1ClearanceFeeUsd: "80.00",
    activeClearanceAgencyId: "",
    fleetMode: "subcontractor",
  });

  const { data: suppliers = [] } = useQuery<any[]>({
    queryKey: ["/api/suppliers"],
    queryFn: () => fetch("/api/suppliers", { credentials: "include" }).then((r) => r.json()),
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [removeLogoConfirm, setRemoveLogoConfirm] = useState(false);
  const [clearDataConfirm, setClearDataConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [testDataCleared, setTestDataCleared] = useState(false);
  const [destroyFleetConfirm, setDestroyFleetConfirm] = useState(false);
  const [destroyingFleet, setDestroyingFleet] = useState(false);
  const [fleetDataDestroyed, setFleetDataDestroyed] = useState(false);
  const [truckTypes, setTruckTypes] = useState({ hasCompany: false, hasSub: false });

  useEffect(() => {
    Promise.all([
      fetch("/api/company-settings", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/trucks", { credentials: "include" }).then((r) => r.json()),
    ]).then(([data, trucks]) => {
        setForm({
          name: data.name ?? "",
          logoUrl: data.logoUrl ?? "",
          address: data.address ?? "",
          email: data.email ?? "",
          phone: data.phone ?? "",
          currency: data.currency ?? "USD",
          taxId: data.taxId ?? "",
          website: data.website ?? "",
          revenueAttributionPolicy: data.revenueAttributionPolicy ?? "ORIGINAL",
          t1ClearanceFeeUsd: String(data.t1ClearanceFeeUsd ?? "80.00"),
          activeClearanceAgencyId: data.activeClearanceAgencyId != null ? String(data.activeClearanceAgencyId) : "",
          fleetMode: data.fleetMode ?? "subcontractor",
        });
        setTestDataCleared(!!data.testDataCleared);
        setFleetDataDestroyed(!!data.fleetDataDestroyed);
        if (Array.isArray(trucks)) {
          setTruckTypes({
            hasCompany: trucks.some((t: { companyOwned: boolean }) => t.companyOwned),
            hasSub: trucks.some((t: { companyOwned: boolean }) => !t.companyOwned),
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        activeClearanceAgencyId: form.activeClearanceAgencyId ? parseInt(form.activeClearanceAgencyId) : null,
      };
      const res = await fetch("/api/company-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const saved = await res.json();
      qc.setQueryData(["company-settings-sidebar"], saved);
      qc.setQueryData(["company-settings-header"], saved);
      qc.setQueryData(["company-settings-fleet-mode"], saved);
      qc.setQueryData(["/api/company-settings"], saved);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setRawImageSrc(objectUrl);
    setCropDialogOpen(true);
    e.target.value = "";
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read image"));
        reader.readAsDataURL(croppedBlob);
      });
      setForm((f) => ({ ...f, logoUrl: dataUrl }));
      setLogoError(false);
      await fetch("/api/company-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...form, logoUrl: dataUrl }),
      });
      qc.invalidateQueries({ queryKey: ["company-settings-sidebar"] });
      qc.invalidateQueries({ queryKey: ["company-settings-header"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Logo save error:", err);
    } finally {
      setUploading(false);
      setCropDialogOpen(false);
      if (rawImageSrc) { URL.revokeObjectURL(rawImageSrc); setRawImageSrc(null); }
    }
  };

  const handleCloseCrop = () => {
    setCropDialogOpen(false);
    if (rawImageSrc) { URL.revokeObjectURL(rawImageSrc); setRawImageSrc(null); }
  };

  const handleClearTestData = async () => {
    setClearing(true);
    try {
      const res = await fetch("/api/admin/clear-test-data", {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setTestDataCleared(true);
        qc.invalidateQueries();
      }
    } finally {
      setClearing(false);
      setClearDataConfirm(false);
    }
  };

  const handleDestroyFleet = async () => {
    setDestroyingFleet(true);
    try {
      const res = await fetch("/api/admin/destroy-fleet", {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setFleetDataDestroyed(true);
        qc.invalidateQueries();
      } else {
        alert(json.error ?? `Server error ${res.status} — please try again.`);
      }
    } catch (e: any) {
      alert(e?.message ?? "Network error — please try again.");
    } finally {
      setDestroyingFleet(false);
      setDestroyFleetConfirm(false);
    }
  };

  const handleRemoveLogo = async () => {
    setForm((f) => ({ ...f, logoUrl: "" }));
    setLogoError(false);
    await fetch("/api/company-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...form, logoUrl: "" }),
    });
    qc.invalidateQueries({ queryKey: ["company-settings-sidebar"] });
    qc.invalidateQueries({ queryKey: ["company-settings-header"] });
    setRemoveLogoConfirm(false);
  };

  if (loading) {
    return (
      <Layout>
        <PageHeader title="Company Settings" />
        <PageContent><div className="text-muted-foreground text-center py-16">Loading settings...</div></PageContent>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader
        title="Company Settings"
        subtitle="Company profile and preferences"
        actions={
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
          </Button>
        }
      />
      <PageContent>
        <div className="max-w-2xl space-y-6 pb-10 mx-auto">

          {/* Company Identity */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />Company Identity
            </h2>
            <div className="space-y-4">
              {/* Logo Upload */}
              <div>
                <Label className="text-sm">Company Logo</Label>
                <div className="flex items-center gap-4 mt-2">
                  {/* Preview */}
                  <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border bg-secondary/30 flex items-center justify-center shrink-0 overflow-hidden">
                    {form.logoUrl && !logoError ? (
                      <img
                        src={form.logoUrl}
                        alt="Company logo"
                        className="w-full h-full object-cover"
                        onError={() => setLogoError(true)}
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground/50">
                        {logoError ? <ImageOff className="w-6 h-6" /> : <Building2 className="w-6 h-6" />}
                        {logoError && <span className="text-[9px]">Invalid URL</span>}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      <Upload className="w-3.5 h-3.5 mr-1.5" />
                      {uploading ? "Uploading..." : form.logoUrl ? "Replace Logo" : "Upload Logo"}
                    </Button>
                    {form.logoUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRemoveLogoConfirm(true)}
                        className="text-destructive hover:text-destructive w-full justify-start px-2"
                        disabled={uploading}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />Remove Logo
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">PNG, JPG up to 5 MB</p>
                  </div>
                </div>
              </div>

              <div>
                <Label>Company Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5" placeholder="e.g. Khayre Transport Ltd" />
              </div>
              <div>
                <Label>Address</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1.5" placeholder="e.g. Plot 5, Posta Street, Dar es Salaam" />
              </div>
            </div>
          </div>

          {/* Contact Details */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" />Contact Details
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-1.5"><Mail className="w-3 h-3" />Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5" placeholder="info@company.com" />
                </div>
                <div>
                  <Label className="flex items-center gap-1.5"><Phone className="w-3 h-3" />Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5" placeholder="+255 XXX XXX XXX" />
                </div>
              </div>
              <div>
                <Label className="flex items-center gap-1.5"><Globe className="w-3 h-3" />Website</Label>
                <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="mt-1.5" placeholder="https://yourcompany.com" />
              </div>
            </div>
          </div>

          {/* Financial Settings */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />Financial Settings
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-1.5"><DollarSign className="w-3 h-3" />Currency</Label>
                  <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="mt-1.5" placeholder="USD" />
                </div>
                <div>
                  <Label className="flex items-center gap-1.5"><Hash className="w-3 h-3" />Tax ID / TPIN</Label>
                  <Input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} className="mt-1.5" placeholder="e.g. 123-456-789" />
                </div>
              </div>
              <div>
                <Label className="flex items-center gap-1.5"><DollarSign className="w-3 h-3" />T1 Zambia Entry Clearance Fee (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.t1ClearanceFeeUsd}
                  onChange={(e) => setForm({ ...form, t1ClearanceFeeUsd: e.target.value })}
                  className="mt-1.5"
                  placeholder="80.00"
                />
              </div>
              <div>
                <Label className="flex items-center gap-1.5"><Building2 className="w-3 h-3" />Active Clearance Agency</Label>
                <Select
                  value={form.activeClearanceAgencyId || "__none__"}
                  onValueChange={(v) => setForm({ ...form, activeClearanceAgencyId: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="None — clearance fee posted to cash" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None (post as cash)</SelectItem>
                    {(suppliers as any[]).filter((s: any) => s.type === "clearing_agent").map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}{s.country ? ` — ${s.country}` : ""}</SelectItem>
                    ))}
                    {(suppliers as any[]).filter((s: any) => s.type === "clearing_agent").length === 0 && (
                      <SelectItem value="__hint__" disabled>Add a "Clearing Agent" supplier first</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Business Settings */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Settings className="w-4 h-4 text-primary" />Operations Settings
            </h2>
            <div className="space-y-4">
              <div>
                <Label>Fleet Mode</Label>
                <Select
                  value={form.fleetMode}
                  onValueChange={(v) => setForm({ ...form, fleetMode: v })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subcontractor" disabled={truckTypes.hasCompany}>Subcontractors</SelectItem>
                    <SelectItem value="company" disabled={truckTypes.hasSub}>Company Fleet</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
                {truckTypes.hasCompany && truckTypes.hasSub && (
                  <p className="text-xs text-muted-foreground mt-1.5">Both truck types on record — only Mixed is available.</p>
                )}
              </div>
              <div>
                <Label>Default Revenue Attribution for In-Transit Amendments</Label>
                <Select
                  value={form.revenueAttributionPolicy}
                  onValueChange={(v) => setForm({ ...form, revenueAttributionPolicy: v })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ORIGINAL">Original truck's sub keeps the revenue</SelectItem>
                    <SelectItem value="REPLACEMENT">Replacement truck's sub gets the revenue</SelectItem>
                    <SelectItem value="SPLIT">Split 50/50 between original and replacement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="lg">
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving..." : saved ? "Saved!" : "Save All Settings"}
            </Button>
          </div>

          {user?.role === "owner" && !loading && (!testDataCleared || !fleetDataDestroyed) && (
            <div className="bg-card border border-destructive/40 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-destructive mb-1 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />Danger Zone
              </h2>
              <p className="text-xs text-muted-foreground mb-4">
                These actions are irreversible. Users and subcontractors are preserved.
              </p>
              {!testDataCleared && (
                <div className="flex items-center justify-between py-3 border-t border-border">
                  <div>
                    <p className="text-sm font-medium">Clear Test Data</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Permanently deletes all batches, trips, invoices, clients, clearances, and related GL entries.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setClearDataConfirm(true)}
                    disabled={clearing}
                    className="ml-6 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    {clearing ? "Clearing..." : "Clear Test Data"}
                  </Button>
                </div>
              )}
              {!fleetDataDestroyed && (
                <div className="flex items-center justify-between py-3 border-t border-border">
                  <div>
                    <p className="text-sm font-medium">Destroy Fleet Data</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Deletes all trucks (horses &amp; trailers), driver assignments, maintenance records, notifications, and expenses.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDestroyFleetConfirm(true)}
                    disabled={destroyingFleet}
                    className="ml-6 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    {destroyingFleet ? "Destroying..." : "Destroy Fleet"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </PageContent>

      {/* Crop dialog */}
      {rawImageSrc && (
        <LogoCropDialog
          open={cropDialogOpen}
          imageSrc={rawImageSrc}
          onClose={handleCloseCrop}
          onComplete={handleCropComplete}
          loading={uploading}
        />
      )}

      {/* Clear test data confirmation */}
      <AlertDialog open={clearDataConfirm} onOpenChange={setClearDataConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Test Data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all batches, trips, invoices, clients, clearances, and GL journal entries.
              Trucks, drivers, subcontractors, and users will be kept.
              <br /><br />
              <strong>This cannot be undone.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleClearTestData}
              disabled={clearing}
            >
              {clearing ? "Clearing..." : "Yes, Clear Everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Destroy fleet confirmation */}
      <AlertDialog open={destroyFleetConfirm} onOpenChange={setDestroyFleetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Destroy All Fleet Data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete every horse, trailer, driver assignment, maintenance record, notification, and expense from the database.
              <br /><br />
              Users and subcontractors are kept. <strong>This cannot be undone.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={destroyingFleet}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDestroyFleet}
              disabled={destroyingFleet}
            >
              {destroyingFleet ? "Destroying..." : "Yes, Destroy Everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove confirmation */}
      <AlertDialog open={removeLogoConfirm} onOpenChange={setRemoveLogoConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Logo</AlertDialogTitle>
            <AlertDialogDescription>The logo will be removed from all documents and headers.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRemoveLogo}
            >
              Remove Logo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
