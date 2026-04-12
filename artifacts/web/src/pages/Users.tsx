import { useState } from "react";
import { Layout, PageHeader, PageContent } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  UserPlus, Pencil, Trash2, Clock, KeyRound, Lock, LockOpen,
  ShieldCheck, MoreVertical, User, Crown,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

const CREATABLE_ROLES = ["admin", "manager", "accounts", "operations"] as const;

const ROLE_META: Record<string, { color: string; label: string }> = {
  owner:      { color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",   label: "Owner" },
  admin:      { color: "bg-rose-500/15 text-rose-400 border-rose-500/30",         label: "Admin" },
  manager:    { color: "bg-violet-500/15 text-violet-400 border-violet-500/30",   label: "Manager" },
  accounts:   { color: "bg-amber-500/15 text-amber-400 border-amber-500/30",      label: "Accounts" },
  operations: { color: "bg-blue-500/15 text-blue-400 border-blue-500/30",         label: "Operations" },
};

const PROTECTED_ROLES = ["owner", "system"];

interface UserRecord {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: string;
  isActive: boolean;
}

const defaultForm = (): UserForm => ({ name: "", email: "", password: "", role: "operations", isActive: true });

function UserAvatar({ name, isActive, size = "md" }: { name: string; isActive: boolean; size?: "sm" | "md" | "lg" }) {
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const sizeClass = size === "sm" ? "w-7 h-7 text-xs" : size === "lg" ? "w-12 h-12 text-base" : "w-9 h-9 text-sm";
  return (
    <div className={`${sizeClass} rounded-full flex items-center justify-center font-bold shrink-0 ${
      isActive ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
    }`}>
      {initials}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const meta = ROLE_META[role] ?? { color: "bg-secondary text-muted-foreground border-border", label: role };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${meta.color}`}>
      {role === "owner" ? <Crown className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
      {meta.label}
    </span>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
      isActive
        ? "bg-green-500/15 text-green-400 border-green-500/30"
        : "bg-red-500/15 text-red-400 border-red-500/30"
    }`}>
      {isActive ? "Active" : "Locked"}
    </span>
  );
}

function ProtectedLock({ role }: { role: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Lock className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            {role === "owner"
              ? "Owner accounts cannot have their role changed, be locked, or deleted."
              : "System accounts cannot have their role changed, be locked, or deleted."}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserRecord | null>(null);
  const [resetUser, setResetUser] = useState<UserRecord | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [lockUser, setLockUser] = useState<UserRecord | null>(null);
  const [form, setForm] = useState<UserForm>(defaultForm());

  const { data: users = [], isLoading } = useQuery<UserRecord[]>({
    queryKey: ["users"],
    queryFn: () => fetch("/api/users", { credentials: "include" }).then((r) => r.json()),
  });

  const createUser = useMutation({
    mutationFn: (data: UserForm) =>
      fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setAddOpen(false); setForm(defaultForm()); },
  });

  const updateUser = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<UserForm> }) =>
      fetch(`/api/users/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setEditUser(null); setResetUser(null); setLockUser(null); setForm(defaultForm()); setNewPassword(""); },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/users/${id}`, { method: "DELETE", credentials: "include" }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setDeleteUser(null); },
  });

  const openEdit = (u: UserRecord) => {
    setEditUser(u);
    setForm({ name: u.name, email: u.email, password: "", role: u.role, isActive: u.isActive });
  };

  const canManageUsers = currentUser?.role === "system" || currentUser?.role === "owner" || currentUser?.role === "admin";

  if (!canManageUsers) {
    return (
      <Layout>
        <PageHeader title="Users" subtitle="Manage system access and roles" />
        <PageContent>
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <Lock className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">Owner or admin access required to manage users.</p>
          </div>
        </PageContent>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader
        title="Users"
        subtitle={`${users.length} team member${users.length !== 1 ? "s" : ""}`}
        actions={
          <Button onClick={() => { setForm(defaultForm()); setAddOpen(true); }}>
            <UserPlus className="w-4 h-4 mr-2" />Add User
          </Button>
        }
      />
      <PageContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map((i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse h-20" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <User className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">No users yet. Add the first team member.</p>
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="sm:hidden space-y-2">
              {users.map((u) => {
                const isProtected = PROTECTED_ROLES.includes(u.role);
                return (
                  <div
                    key={u.id}
                    className={`bg-card border border-border rounded-xl p-4 transition-opacity ${!u.isActive ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <UserAvatar name={u.name} isActive={u.isActive} size="lg" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-sm truncate">{u.name}</span>
                          {u.id === currentUser?.id && (
                            <span className="text-xs text-muted-foreground">(you)</span>
                          )}
                          {isProtected && <ProtectedLock role={u.role} />}
                          {!u.isActive && <Lock className="w-3 h-3 text-muted-foreground shrink-0" />}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{u.email}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <RoleBadge role={u.role} />
                          <StatusBadge isActive={u.isActive} />
                        </div>
                        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>
                            {u.lastLoginAt
                              ? `Last login ${format(new Date(u.lastLoginAt), "MMM d, yyyy 'at' HH:mm")}`
                              : "Never logged in"}
                          </span>
                        </div>
                      </div>

                      {/* Actions dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="w-8 h-8 shrink-0">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {u.role === "owner" && u.id !== currentUser?.id ? (
                            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground select-none">
                              <Lock className="w-3 h-3 shrink-0" />
                              Owner account is protected
                            </div>
                          ) : (
                            <>
                              <DropdownMenuItem onClick={() => openEdit(u)}>
                                <Pencil className="w-4 h-4 mr-2" />Edit Profile
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setResetUser(u); setNewPassword(""); }} className="text-amber-500">
                                <KeyRound className="w-4 h-4 mr-2" />Reset Password
                              </DropdownMenuItem>
                              {u.id !== currentUser?.id && !isProtected && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => setLockUser(u)} className={u.isActive ? "text-destructive" : "text-green-500"}>
                                    {u.isActive ? <><Lock className="w-4 h-4 mr-2" />Lock Account</> : <><LockOpen className="w-4 h-4 mr-2" />Unlock Account</>}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setDeleteUser(u)} className="text-destructive">
                                    <Trash2 className="w-4 h-4 mr-2" />Delete User
                                  </DropdownMenuItem>
                                </>
                              )}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-secondary/30">
                  <tr>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Name</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Email</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Role</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Last Login</th>
                    <th className="py-3 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isProtected = PROTECTED_ROLES.includes(u.role);
                    return (
                      <tr key={u.id} className={`border-b border-border/50 hover:bg-secondary/20 transition-colors ${!u.isActive ? "opacity-60" : ""}`}>
                        <td className="py-3 px-4 font-medium">
                          <div className="flex items-center gap-2.5">
                            <UserAvatar name={u.name} isActive={u.isActive} size="sm" />
                            <span>{u.name}</span>
                            {u.id === currentUser?.id && <span className="text-xs text-muted-foreground">(you)</span>}
                            {isProtected && <ProtectedLock role={u.role} />}
                            {!u.isActive && <Lock className="w-3 h-3 text-muted-foreground" />}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{u.email}</td>
                        <td className="py-3 px-4"><RoleBadge role={u.role} /></td>
                        <td className="py-3 px-4"><StatusBadge isActive={u.isActive} /></td>
                        <td className="py-3 px-4 text-muted-foreground text-xs">
                          {u.lastLoginAt ? (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {format(new Date(u.lastLoginAt), "MMM d, yyyy HH:mm")}
                            </span>
                          ) : "Never"}
                        </td>
                        <td className="py-3 px-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="w-7 h-7">
                                <MoreVertical className="w-3.5 h-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {u.role === "owner" && u.id !== currentUser?.id ? (
                                <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground select-none">
                                  <Lock className="w-3 h-3 shrink-0" />
                                  Owner account is protected
                                </div>
                              ) : (
                                <>
                                  <DropdownMenuItem onClick={() => openEdit(u)}>
                                    <Pencil className="w-4 h-4 mr-2" />Edit Profile
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setResetUser(u); setNewPassword(""); }} className="text-amber-500">
                                    <KeyRound className="w-4 h-4 mr-2" />Reset Password
                                  </DropdownMenuItem>
                                  {u.id !== currentUser?.id && !isProtected && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onClick={() => setLockUser(u)} className={u.isActive ? "text-destructive" : "text-green-500"}>
                                        {u.isActive ? <><Lock className="w-4 h-4 mr-2" />Lock Account</> : <><LockOpen className="w-4 h-4 mr-2" />Unlock Account</>}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => setDeleteUser(u)} className="text-destructive">
                                        <Trash2 className="w-4 h-4 mr-2" />Delete User
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </PageContent>

      {/* Add User Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Full Name</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" /></div>
            <div><Label>Email</Label><Input className="mt-1" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@company.com" /></div>
            <div><Label>Password</Label><Input className="mt-1" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" /></div>
            <div>
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{CREATABLE_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_META[r]?.label ?? r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => createUser.mutate(form)} disabled={createUser.isPending}>
              {createUser.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User — {editUser?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Full Name</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Email</Label><Input className="mt-1" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            {editUser && !PROTECTED_ROLES.includes(editUser.role) && (
              <div>
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{CREATABLE_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_META[r]?.label ?? r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {editUser?.id !== currentUser?.id && editUser && !PROTECTED_ROLES.includes(editUser.role) && (
              <div>
                <Label>Account Status</Label>
                <Select value={form.isActive ? "active" : "locked"} onValueChange={(v) => setForm({ ...form, isActive: v === "active" })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active — can log in</SelectItem>
                    <SelectItem value="locked">Locked — cannot log in</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {editUser && PROTECTED_ROLES.includes(editUser.role) && (
              <p className="text-xs text-muted-foreground bg-secondary/40 rounded-lg px-3 py-2 flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                Role and account status cannot be changed for this account.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={() => editUser && updateUser.mutate({ id: editUser.id, data: { name: form.name, email: form.email, role: form.role, isActive: form.isActive } })} disabled={updateUser.isPending}>
              {updateUser.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetUser} onOpenChange={(o) => !o && setResetUser(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Reset Password</DialogTitle></DialogHeader>
          <div className="flex items-center gap-3 bg-secondary/40 rounded-lg px-3 py-2.5 mb-1">
            <UserAvatar name={resetUser?.name ?? ""} isActive={true} size="sm" />
            <div>
              <p className="text-sm font-medium">{resetUser?.name}</p>
              <p className="text-xs text-muted-foreground">{resetUser?.email}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Set a new password. They will need to use it on their next login.</p>
          <div>
            <Label>New Password</Label>
            <Input className="mt-1" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 6 characters" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetUser(null)}>Cancel</Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-black"
              onClick={() => resetUser && updateUser.mutate({ id: resetUser.id, data: { password: newPassword } })}
              disabled={updateUser.isPending || newPassword.length < 6}
            >
              <KeyRound className="w-3.5 h-3.5 mr-1.5" />
              {updateUser.isPending ? "Resetting..." : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lock / Unlock Confirmation */}
      <AlertDialog open={!!lockUser} onOpenChange={(o) => !o && setLockUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{lockUser?.isActive ? "Lock Account" : "Unlock Account"}</AlertDialogTitle>
            <AlertDialogDescription>
              {lockUser?.isActive
                ? <>Locking <strong>{lockUser?.name}</strong>'s account will immediately prevent them from logging in. Any active sessions will expire.</>
                : <>Unlocking <strong>{lockUser?.name}</strong>'s account will restore their access. They can log in again with their existing password.</>
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={lockUser?.isActive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-green-600 text-white hover:bg-green-700"}
              onClick={() => lockUser && updateUser.mutate({ id: lockUser.id, data: { isActive: !lockUser.isActive } })}
            >
              {lockUser?.isActive ? "Lock Account" : "Unlock Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteUser} onOpenChange={(o) => !o && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently remove <strong>{deleteUser?.name}</strong> from the system? Consider locking their account instead if you need to preserve their history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteUser && deleteUserMutation.mutate(deleteUser.id)}>
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
