import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Settings, Save, Upload, Building2, Globe, Phone, Mail, Hash, DollarSign, TrendingUp, ImageOff, Trash2 } from "lucide-react";
import { LogoCropDialog } from "@/components/LogoCropDialog";

export default function SettingsPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: "",
    logoUrl: "",
    address: "",
    email: "",
    phone: "",
    currency: "USD",
    taxId: "",
    website: "",
    openingBalance: "0",
    revenueAttributionPolicy: "ORIGINAL",
    t1ClearanceFeeUsd: "80.00",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [removeLogoConfirm, setRemoveLogoConfirm] = useState(false);

  useEffect(() => {
    fetch("/api/company-settings", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setForm({
          name: data.name ?? "",
          logoUrl: data.logoUrl ?? "",
          address: data.address ?? "",
          email: data.email ?? "",
          phone: data.phone ?? "",
          currency: data.currency ?? "USD",
          taxId: data.taxId ?? "",
          website: data.website ?? "",
          openingBalance: String(data.openingBalance ?? "0"),
          revenueAttributionPolicy: data.revenueAttributionPolicy ?? "ORIGINAL",
          t1ClearanceFeeUsd: String(data.t1ClearanceFeeUsd ?? "80.00"),
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/company-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...form, openingBalance: parseFloat(form.openingBalance) }),
      });
      qc.invalidateQueries({ queryKey: ["company-settings-sidebar"] });
      qc.invalidateQueries({ queryKey: ["company-settings-header"] });
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
        body: JSON.stringify({ ...form, logoUrl: dataUrl, openingBalance: parseFloat(form.openingBalance) }),
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

  const handleRemoveLogo = async () => {
    setForm((f) => ({ ...f, logoUrl: "" }));
    setLogoError(false);
    await fetch("/api/company-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...form, logoUrl: "", openingBalance: parseFloat(form.openingBalance) }),
    });
    qc.invalidateQueries({ queryKey: ["company-settings-sidebar"] });
    qc.invalidateQueries({ queryKey: ["company-settings-header"] });
    setRemoveLogoConfirm(false);
  };

  if (loading) {
    return (
      <Layout>
        <PageHeader title="Company Settings" subtitle="Configure your company profile and preferences" />
        <PageContent><div className="text-muted-foreground text-center py-16">Loading settings...</div></PageContent>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader
        title="Company Settings"
        subtitle="Configure your company profile and preferences"
        actions={
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
          </Button>
        }
      />
      <PageContent>
        <div className="max-w-2xl space-y-6 pb-10">

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
                <Label className="flex items-center gap-1.5"><DollarSign className="w-3 h-3" />Company Opening Balance (USD)</Label>
                <Input
                  type="number"
                  value={form.openingBalance}
                  onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
                  className="mt-1.5"
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground mt-1">The company's pre-existing cash/bank position before you started using this system. Used as the starting point for P&L reporting.</p>
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
                <p className="text-xs text-muted-foreground mt-1">Automatically added as a recoverable clearance expense when a trip enters Zambia (T1 document). Charged once per trip.</p>
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
                <p className="text-xs text-muted-foreground mt-1.5">
                  Applied when a truck is swapped after loading. Can be overridden per incident when flagging. All amendments are auditable.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="lg">
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving..." : saved ? "Saved!" : "Save All Settings"}
            </Button>
          </div>
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

      {/* Remove confirmation */}
      <AlertDialog open={removeLogoConfirm} onOpenChange={setRemoveLogoConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Logo</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the company logo from the sidebar, headers, and all documents. The company name will be shown in its place.
            </AlertDialogDescription>
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
