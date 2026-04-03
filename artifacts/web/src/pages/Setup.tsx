import { useState, FormEvent } from "react";
import { Truck, Building2, User, ArrowRight, CheckCircle, ShieldAlert, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step = "company" | "owner" | "done";

interface CompanyForm { name: string; address: string; email: string; phone: string; currency: string; }
interface AdminForm { name: string; email: string; password: string; confirm: string; }

const defaultCompany = (): CompanyForm => ({ name: "", address: "", email: "", phone: "", currency: "USD" });
const defaultAdmin = (): AdminForm => ({ name: "", email: "", password: "", confirm: "" });

export default function SetupPage() {
  const [step, setStep] = useState<Step>("company");
  const [company, setCompany] = useState<CompanyForm>(defaultCompany());
  const [admin, setAdmin] = useState<AdminForm>(defaultAdmin());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [systemPassword, setSystemPassword] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCompanyNext = (e: FormEvent) => {
    e.preventDefault();
    if (!company.name.trim()) { setError("Company name is required"); return; }
    setError("");
    setStep("owner");
  };

  const handleOwnerSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!admin.name || !admin.email || !admin.password) { setError("All fields are required"); return; }
    if (admin.password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (admin.password !== admin.confirm) { setError("Passwords do not match"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/setup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, admin: { name: admin.name, email: admin.email, password: admin.password } }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Setup failed");
        return;
      }
      const data = await res.json();
      setSystemPassword(data.systemPassword ?? "");
      setStep("done");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(systemPassword).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4">
            <Truck className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Optima Transport LLC</h1>
          <p className="text-sm text-muted-foreground mt-1">First-time setup</p>
        </div>

        {/* Step indicator */}
        {step !== "done" && (
          <div className="flex items-center justify-center gap-2 mb-6">
            {[
              { key: "company", label: "Company", icon: Building2 },
              { key: "owner", label: "Owner Account", icon: User },
            ].map((s, i) => {
              const isActive = step === s.key;
              const isDone = (s.key === "company" && step === "owner");
              return (
                <div key={s.key} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    isActive ? "bg-primary text-primary-foreground" :
                    isDone ? "bg-primary/20 text-primary" :
                    "bg-secondary text-muted-foreground"
                  }`}>
                    <s.icon className="w-3 h-3" />
                    {s.label}
                  </div>
                  {i < 1 && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40" />}
                </div>
              );
            })}
          </div>
        )}

        {step === "done" ? (
          <div className="bg-card border border-border rounded-xl p-8 space-y-6">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Setup Complete</h2>
              <p className="text-sm text-muted-foreground">Your company profile and owner account have been created. You can now sign in to start managing your operations.</p>
            </div>

            {/* Emergency access box */}
            {systemPassword && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-400">Emergency Access Password</p>
                    <p className="text-xs text-amber-400/80 mt-0.5">This is the one-time system emergency password. Store it somewhere safe — it will not be shown again.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-background/60 border border-amber-500/30 rounded px-3 py-2 text-sm font-mono text-amber-300 tracking-wider select-all">
                    {systemPassword}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 shrink-0"
                    onClick={handleCopy}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Login email: <span className="font-mono text-foreground">system@optima.internal</span>
                </p>
              </div>
            )}

            <Button className="w-full" onClick={() => window.location.href = "/"}>
              Go to Sign In
            </Button>
          </div>
        ) : step === "company" ? (
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-base font-semibold text-foreground mb-1 flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" />Company Profile</h2>
            <p className="text-xs text-muted-foreground mb-5">This information will appear on invoices and reports.</p>
            <form onSubmit={handleCompanyNext} className="space-y-4">
              <div>
                <Label>Company Name *</Label>
                <Input value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} className="mt-1.5" placeholder="e.g. Khayre Transport Ltd" />
              </div>
              <div>
                <Label>Physical Address</Label>
                <Input value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} className="mt-1.5" placeholder="Plot 5, Posta Street, Dar es Salaam" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={company.email} onChange={(e) => setCompany({ ...company, email: e.target.value })} className="mt-1.5" placeholder="info@company.com" />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} className="mt-1.5" placeholder="+255 XXX XXX XXX" />
                </div>
              </div>
              <div>
                <Label>Currency</Label>
                <Input value={company.currency} onChange={(e) => setCompany({ ...company, currency: e.target.value })} className="mt-1.5" placeholder="USD" />
              </div>
              {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
              <Button type="submit" className="w-full">Continue <ArrowRight className="w-4 h-4 ml-2" /></Button>
            </form>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-base font-semibold text-foreground mb-1 flex items-center gap-2"><User className="w-4 h-4 text-primary" />Owner Account</h2>
            <p className="text-xs text-muted-foreground mb-5">This will be the primary owner account with full system access. You can add more users after setup.</p>
            <form onSubmit={handleOwnerSubmit} className="space-y-4">
              <div>
                <Label>Full Name</Label>
                <Input value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} className="mt-1.5" placeholder="John Doe" />
              </div>
              <div>
                <Label>Email Address</Label>
                <Input type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} className="mt-1.5" placeholder="owner@yourcompany.com" />
              </div>
              <div>
                <Label>Password</Label>
                <Input type="password" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} className="mt-1.5" placeholder="Minimum 6 characters" />
              </div>
              <div>
                <Label>Confirm Password</Label>
                <Input type="password" value={admin.confirm} onChange={(e) => setAdmin({ ...admin, confirm: e.target.value })} className="mt-1.5" placeholder="Repeat password" />
              </div>
              {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-2">
                <Button variant="outline" type="button" onClick={() => { setStep("company"); setError(""); }} className="flex-1">Back</Button>
                <Button type="submit" className="flex-1" disabled={loading}>{loading ? "Creating..." : "Complete Setup"}</Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
