import { useState } from "react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { Plus, Building2, AlertCircle, ChevronRight, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const TYPE_LABEL: Record<string, string> = {
  fuel: "Fuel Station",
  clearing_agent: "Clearing Agent",
  other: "Other",
};
const TYPE_COLOR: Record<string, string> = {
  fuel: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  clearing_agent: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  other: "bg-muted text-muted-foreground",
};

async function fetchSuppliers() {
  const r = await fetch("/api/suppliers", { credentials: "include" });
  return r.json();
}

const EMPTY_FORM = {
  name: "", type: "fuel", contactPerson: "", phone: "", email: "",
  country: "", creditTermsDays: "30", notes: "", openingBalance: "0",
};

export default function Suppliers() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: suppliers = [], isLoading } = useQuery({ queryKey: ["/api/suppliers"], queryFn: fetchSuppliers });

  const create = useMutation({
    mutationFn: (body: any) => fetch("/api/suppliers", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/suppliers"] });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      toast({ title: "Supplier added" });
    },
    onError: () => toast({ title: "Failed to add supplier", variant: "destructive" }),
  });

  const totalOwed = suppliers.reduce((s: number, sup: any) => s + (sup.balance ?? 0), 0);

  return (
    <Layout>
      <PageHeader
        title="Suppliers"
        subtitle="Manage fuel stations and credit vendors — track balances and record payments"
        icon={<Building2 className="w-5 h-5" />}
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Supplier
          </Button>
        }
      />
      <PageContent>
        {/* Summary banner */}
        {suppliers.length > 0 && (
          <div className="flex gap-4 mb-6 flex-wrap">
            <div className="bg-card border border-border rounded-lg px-5 py-3 flex flex-col">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Total Owed</span>
              <span className={cn("text-xl font-bold", totalOwed > 0 ? "text-amber-400" : "text-emerald-400")}>
                {formatCurrency(totalOwed)}
              </span>
            </div>
            <div className="bg-card border border-border rounded-lg px-5 py-3 flex flex-col">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Active Suppliers</span>
              <span className="text-xl font-bold">{suppliers.filter((s: any) => s.isActive).length}</span>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center text-muted-foreground py-16">Loading...</div>
        ) : suppliers.length === 0 ? (
          <div className="text-center text-muted-foreground py-20 flex flex-col items-center gap-3">
            <AlertCircle className="w-8 h-8 opacity-40" />
            <p className="font-medium">No suppliers yet</p>
            <p className="text-sm">Add your fuel stations and credit vendors to start tracking what you owe them.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {suppliers.map((s: any) => (
              <div
                key={s.id}
                onClick={() => navigate(`/suppliers/${s.id}`)}
                className="bg-card border border-border rounded-lg px-5 py-4 flex items-center gap-4 cursor-pointer hover:border-primary/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{s.name}</span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full border", TYPE_COLOR[s.type] ?? TYPE_COLOR.other)}>
                      {TYPE_LABEL[s.type] ?? s.type}
                    </span>
                    {s.country && <span className="text-xs text-muted-foreground">{s.country}</span>}
                  </div>
                  {s.contactPerson && (
                    <div className="text-xs text-muted-foreground mt-0.5">{s.contactPerson}{s.phone ? ` · ${s.phone}` : ""}</div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className={cn("text-sm font-semibold", s.balance > 0 ? "text-amber-400" : "text-emerald-400")}>
                    {s.balance > 0 ? `Owed: ${formatCurrency(s.balance)}` : "Clear"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Charged: {formatCurrency(s.charged)} · Paid: {formatCurrency(s.paid)}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            ))}
          </div>
        )}
      </PageContent>

      {/* Add Supplier Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Supplier</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Ndola Fuel Station" />
              </div>
              <div>
                <Label>Type *</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fuel">Fuel Station</SelectItem>
                    <SelectItem value="clearing_agent">Clearing Agent</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Country</Label>
                <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="e.g. Zambia" />
              </div>
              <div>
                <Label>Contact Person</Label>
                <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" />
              </div>
              <div>
                <Label>Credit Terms (days)</Label>
                <Input value={form.creditTermsDays} onChange={(e) => setForm({ ...form, creditTermsDays: e.target.value })} type="number" min="0" />
              </div>
              <div>
                <Label>Opening Balance (USD)</Label>
                <Input
                  value={form.openingBalance}
                  onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() => create.mutate(form)}
              disabled={!form.name.trim() || create.isPending}
            >
              {create.isPending ? "Saving..." : "Add Supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
