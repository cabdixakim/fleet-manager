// Unified file to handle the simple CRUD lists: Fleet(Trucks), Drivers, Clients, Subcontractors
import { Layout } from "@/components/layout";
import { useGetTrucks, useGetDrivers, useGetClients, useGetSubcontractors } from "@workspace/api-client-react";
import { Card, CardContent, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge } from "@/components/ui/design-system";
import { formatCurrency, formatStatusName, getStatusColor } from "@/lib/utils";
import { Truck, Users, Briefcase, Activity } from "lucide-react";
import { Link } from "wouter";

export function TrucksPage() {
  const { data } = useGetTrucks();
  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3"><Truck className="w-8 h-8 text-purple-400" /> Fleet Management</h1>
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Plate Number</TableHead><TableHead>Trailer</TableHead><TableHead>Subcontractor</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {data?.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono font-bold">{t.plateNumber}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{t.trailerPlate || '-'}</TableCell>
                  <TableCell>{t.subcontractorName}</TableCell>
                  <TableCell><Badge variant="custom" className={getStatusColor(t.status)}>{formatStatusName(t.status)}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>
    </Layout>
  );
}

export function DriversPage() {
  const { data } = useGetDrivers();
  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3"><Users className="w-8 h-8 text-blue-400" /> Drivers</h1>
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>License</TableHead><TableHead>Phone</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {data?.map(d => (
                <TableRow key={d.id}>
                  <TableCell className="font-bold text-white">{d.name}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{d.licenseNumber || '-'}</TableCell>
                  <TableCell>{d.phone || '-'}</TableCell>
                  <TableCell><Badge variant="custom" className={getStatusColor(d.status)}>{formatStatusName(d.status)}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>
    </Layout>
  );
}

export function ClientsPage() {
  const { data } = useGetClients();
  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3"><Activity className="w-8 h-8 text-green-400" /> Clients</h1>
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Contact</TableHead><TableHead>AGO Short Rate</TableHead><TableHead>PMS Short Rate</TableHead></TableRow></TableHeader>
            <TableBody>
              {data?.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-bold text-white">{c.name}</TableCell>
                  <TableCell><div className="text-sm">{c.contactEmail}</div><div className="text-xs text-muted-foreground">{c.contactPhone}</div></TableCell>
                  <TableCell className="font-mono text-warning">{formatCurrency(c.agoShortChargeRate)}/MT</TableCell>
                  <TableCell className="font-mono text-warning">{formatCurrency(c.pmsShortChargeRate)}/MT</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>
    </Layout>
  );
}

export function SubcontractorsPage() {
  const { data } = useGetSubcontractors();
  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3"><Briefcase className="w-8 h-8 text-pink-400" /> Subcontractors</h1>
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Contact</TableHead><TableHead>Commission Rate</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>
              {data?.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-bold text-white">{s.name}</TableCell>
                  <TableCell><div className="text-sm">{s.contactEmail}</div><div className="text-xs text-muted-foreground">{s.contactPhone}</div></TableCell>
                  <TableCell className="font-mono text-primary">{s.commissionRate}%</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/subcontractors/${s.id}/statement`} className="text-primary hover:underline text-sm font-semibold">View Statement</Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>
    </Layout>
  );
}
