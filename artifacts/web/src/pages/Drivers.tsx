import { useState } from "react";
import { useGetDrivers, useCreateDriver, useUpdateDriver, useDeleteDriver } from "@workspace/api-client-react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { formatCurrency } from "@/lib/utils";
import { exportToExcel } from "@/lib/export";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Download, Search, User, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_FILTERS = ["all", "active", "standby", "suspended", "terminated"];
const STATUS_LABEL: Record<string, string> = { all: "All", active: "Active", standby: "Standby", suspended: "Suspended", terminated: "Terminated" };
const STATUS_COLOR: Record<string, string> = {
  active: "bg-green-500/15 text-green-400",
  standby: "bg-blue-500/15 text-blue-400",
  suspended: "bg-yellow-500/15 text-yellow-400",
  terminated: "bg-red-500/15 text-red-400",
};
const STATUS_DOT: Record<string, string> = {
  active: "bg-green-400",
  standby: "bg-blue-400",
  suspended: "bg-yellow-400",
  terminated: "bg-red-400",
};

export default function Drivers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editDriver, setEditDriver] = useState<any | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const emptyForm = { name: "", licenseNumber: "", passportNumber: "", phone: "", monthlySalary: "", status: "active", notes: "" };
  const [form, setForm] = useState(emptyForm);

  const { data: drivers = [], isLoading } = useGetDrivers();
  const { mutateAsync: createDriver, isPending: creating } = useCreateDriver();
  const { mutateAsync: updateDriver, isPending: updating } = useUpdateDriver();
  const { mutateAsync: deleteDriver, isPending: deleting } = useDeleteDriver();

  const handleDelete = async () => {
    if (!confirmDelete) return;
    await deleteDriver({ id: confirmDelete.id });
    qc.invalidateQueries({ queryKey: ["/api/drivers"] });
    setConfirmDelete(null);
  };

  const filtered = (drivers as any[]).filter((d) => {
    const matchSearch = !search || d.name?.toLowerCase().includes(search.toLowerCase()) || d.licenseNumber?.toLowerCase().includes(search.toLowerCase()) || d.phone?.includes(search);
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const validate = () => {
    const errors: string[] = [];
    if (!form.name.trim()) errors.push("name");
    if (!form.passportNumber.trim()) errors.push("passportNumber");
    if (!form.licenseNumber.trim()) errors.push("licenseNumber");
    return errors;
  };

  const handleCreate = async () => {
    const errors = validate();
    if (errors.length) { setFormErrors(errors); return; }
    setFormErrors([]);
    await createDriver({
      data: {
        name: form.name,
        licenseNumber: form.licenseNumber,
        passportNumber: form.passportNumber,
        phone: form.phone || undefined,
        monthlySalary: form.monthlySalary ? parseFloat(form.monthlySalary) : 0,
        status: form.status as any,
        notes: form.notes || undefined,
      },
    });
    qc.invalidateQueries({ queryKey: ["/api/drivers"] });
    setShowCreate(false);
    setForm(emptyForm);
    setFormErrors([]);
  };

  const handleUpdate = async () => {
    if (!editDriver) return;
    await updateDriver({
      id: editDriver.id,
      data: {
        name: editDriver.name,
        passportNumber: editDriver.passportNumber || undefined,
        licenseNumber: editDriver.licenseNumber || undefined,
        phone: editDriver.phone || undefined,
        status: editDriver.status as any,
        monthlySalary: parseFloat(editDriver.monthlySalary) || 0,
      },
    });
    qc.invalidateQueries({ queryKey: ["/api/drivers"] });
    setEditDriver(null);
  };

  const hasIncompleteDoc = (d: any) => !d.passportNumber || !d.licenseNumber;

  return (
    <Layout>
      <PageHeader
        title="Drivers"
        subtitle="Driver records, documents and salary management"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportToExcel(filtered.map((d: any) => ({ Name: d.name, License: d.licenseNumber ?? "", Passport: d.passportNumber ?? "", Phone: d.phone ?? "", "Monthly Salary": d.monthlySalary ?? 0, Status: d.status })), "drivers")}>
              <Download className="w-4 h-4 mr-2" />Export
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />Add Driver</Button>
          </>
        }
      />
      <PageContent>
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search drivers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm w-52" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {STATUS_FILTERS.map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:text-foreground"}`}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} driver{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="space-y-2">
          {isLoading ? (
            <div className="text-center py-16 text-muted-foreground">Loading drivers...</div>
          ) : filtered.length === 0 ? (
            <div className="bg-card border border-border rounded-xl flex flex-col items-center justify-center py-16 text-center">
              <User className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium">No drivers found</p>
              <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />Add Driver</Button>
            </div>
          ) : filtered.map((d: any) => (
            <div key={d.id} className="bg-card border border-border rounded-xl px-5 py-4 flex items-center gap-4 hover:border-border/80 transition-colors">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[d.status] ?? "bg-muted-foreground"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{d.name}</span>
                  {hasIncompleteDoc(d) && (
                    <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="w-3 h-3" />
                      {!d.passportNumber && !d.licenseNumber ? "Missing passport & licence" : !d.passportNumber ? "Missing passport" : "Missing licence"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  {d.licenseNumber ? <span>Lic: {d.licenseNumber}</span> : <span className="text-amber-400/70">No licence</span>}
                  {d.passportNumber && <><span>·</span><span>PP: {d.passportNumber}</span></>}
                  {d.phone && <><span>·</span><span>{d.phone}</span></>}
                  {d.monthlySalary != null && d.monthlySalary > 0 && <><span>·</span><span>{formatCurrency(d.monthlySalary)}/mo</span></>}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[d.status] ?? "bg-muted text-muted-foreground"}`}>
                  {STATUS_LABEL[d.status] ?? d.status}
                </span>
                <button onClick={() => setEditDriver({ ...d, monthlySalary: String(d.monthlySalary ?? "") })} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setConfirmDelete(d)} className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </PageContent>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) { setFormErrors([]); setForm(emptyForm); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Driver</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Full Name <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`mt-1 ${formErrors.includes("name") ? "border-destructive" : ""}`} />
              {formErrors.includes("name") && <p className="text-xs text-destructive mt-1">Full name is required</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>License Number <span className="text-destructive">*</span></Label>
                <Input value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} className={`mt-1 ${formErrors.includes("licenseNumber") ? "border-destructive" : ""}`} />
                {formErrors.includes("licenseNumber") && <p className="text-xs text-destructive mt-1">Required for cross-border operations</p>}
              </div>
              <div>
                <Label>Passport Number <span className="text-destructive">*</span></Label>
                <Input value={form.passportNumber} onChange={(e) => setForm({ ...form, passportNumber: e.target.value })} className={`mt-1 ${formErrors.includes("passportNumber") ? "border-destructive" : ""}`} />
                {formErrors.includes("passportNumber") && <p className="text-xs text-destructive mt-1">Required for cross-border operations</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" /></div>
              <div><Label>Monthly Salary (USD)</Label><Input type="number" value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} className="mt-1" /></div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="standby">Standby</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setFormErrors([]); setForm(emptyForm); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>{creating ? "Saving..." : "Add Driver"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editDriver} onOpenChange={() => setEditDriver(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Driver — {editDriver?.name}</DialogTitle></DialogHeader>
          {editDriver && (
            <div className="space-y-3 py-2">
              <div><Label>Full Name</Label>
                <Input value={editDriver.name ?? ""} onChange={(e) => setEditDriver({ ...editDriver, name: e.target.value })} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>License Number</Label>
                  <Input value={editDriver.licenseNumber ?? ""} onChange={(e) => setEditDriver({ ...editDriver, licenseNumber: e.target.value })} className="mt-1" />
                </div>
                <div><Label>Passport Number</Label>
                  <Input value={editDriver.passportNumber ?? ""} onChange={(e) => setEditDriver({ ...editDriver, passportNumber: e.target.value })} className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Phone</Label>
                  <Input value={editDriver.phone ?? ""} onChange={(e) => setEditDriver({ ...editDriver, phone: e.target.value })} className="mt-1" />
                </div>
                <div><Label>Monthly Salary (USD)</Label>
                  <Input type="number" value={editDriver.monthlySalary ?? ""} onChange={(e) => setEditDriver({ ...editDriver, monthlySalary: e.target.value })} className="mt-1" />
                </div>
              </div>
              <div><Label>Status</Label>
                <Select value={editDriver.status} onValueChange={(v) => setEditDriver({ ...editDriver, status: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="standby">Standby</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="terminated">Terminated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDriver(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updating}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Driver</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">Are you sure you want to delete <strong>{confirmDelete?.name}</strong>? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting ? "Deleting..." : "Delete Driver"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
