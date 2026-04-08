export * from "./generated/api";
export * from "./generated/api.schemas";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useGetTruckDriverAssignments(truckId: number | null) {
  return useQuery({
    queryKey: ["/api/truck-driver-assignments", truckId],
    queryFn: async () => {
      if (!truckId) return [];
      const res = await fetch(`/api/truck-driver-assignments?truckId=${truckId}`);
      return res.json();
    },
    enabled: !!truckId,
  });
}

export function useAssignDriverToTruck() {
  return useMutation({
    mutationFn: async ({ truckId, driverId }: { truckId: number, driverId: number }) => {
      const res = await fetch(`/api/truck-driver-assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ truckId, driverId }),
      });
      return res.json();
    },
  });
}

export function useGetTruckDriverEngagements(truckId: number | null) {
  return useQuery({
    queryKey: ["/api/truck-driver-engagements", truckId],
    queryFn: async () => {
      if (!truckId) return [];
      const res = await fetch(`/api/truck-driver-engagements?truckId=${truckId}`);
      return res.json();
    },
    enabled: !!truckId,
  });
}

export function useEngageDriverToTruck() {
  return useMutation({
    mutationFn: async ({ truckId, driverId }: { truckId: number, driverId: number }) => {
      const res = await fetch(`/api/truck-driver-engagements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ truckId, driverId }),
      });
      return res.json();
    },
  });
}

export function useGetDrivers() {
  return useQuery<import("./generated/api.schemas").Driver[]>({
    queryKey: ["/api/drivers"],
    queryFn: async () => {
      const res = await fetch(`/api/drivers`);
      return res.json();
    },
  });
}

export function useGetAllCurrentTruckDriverAssignments() {
  return useQuery({
    queryKey: ["/api/truck-driver-engagements-all-current"],
    queryFn: async () => {
      const res = await fetch(`/api/truck-driver-engagements-all-current`);
      return res.json();
    },
  });
}

export function useFlagTripIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, description, replacementTruckId, revenueOwner }: { id: number; description: string; replacementTruckId?: number | null; revenueOwner?: string | null }) => {
      const res = await fetch(`/api/trips/${id}/incident`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, replacementTruckId, revenueOwner }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to flag incident");
      }
      return res.json();
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [`/api/trips/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/batches"] });
    },
  });
}

export function useGetNominations() {
  return useQuery({
    queryKey: ["/api/nominations"],
    queryFn: async () => {
      const res = await fetch("/api/nominations");
      if (!res.ok) throw new Error("Failed to fetch nominations");
      return res.json() as Promise<Array<{
        id: number; name: string; clientName: string | null;
        route: string; status: string; ratePerMt: number;
        nominatedDate: string | null; truckCount: number; createdAt: string;
      }>>;
    },
  });
}

export function useGetNominationDocument(batchId: number | null) {
  return useQuery({
    queryKey: ["/api/nominations", batchId],
    queryFn: async () => {
      const res = await fetch(`/api/nominations/${batchId}`);
      if (!res.ok) throw new Error("Failed to fetch nomination document");
      return res.json() as Promise<{
        batch: {
          id: number; name: string; clientName: string | null;
          route: string; status: string; ratePerMt: number;
          nominatedDate: string | null; notes: string | null; createdAt: string;
        };
        trips: Array<{
          id: number; status: string; product: string; capacity: number;
          truckPlate: string | null; trailerPlate: string | null;
          driverName: string | null; driverPassport: string | null;
          driverLicense: string | null; driverPhone: string | null;
          subcontractorName: string | null;
        }>;
        totalTrips: number;
        totalCapacity: number;
        company: {
          name: string; logoUrl: string | null; address: string | null;
          email: string | null; phone: string | null; taxId: string | null;
        } | null;
      }>;
    },
    enabled: !!batchId,
  });
}

export function useGetDashboardAlerts() {
  return useQuery({
    queryKey: ["/api/dashboard/alerts"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/alerts");
      if (!res.ok) throw new Error("Failed to fetch alerts");
      return res.json() as Promise<{
        uninvoicedBatches: Array<{ id: number; name: string; clientName: string; deliveredDate: string | null; route: string }>;
        pendingClearances: Array<{ id: number; type: string; status: string; truckPlate: string | null; batchId: number | null; daysWaiting: number }>;
      }>;
    },
    refetchInterval: 60000,
  });
}

export function useGetActiveOps() {
  return useQuery({
    queryKey: ["/api/dashboard/active-ops"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/active-ops");
      if (!res.ok) throw new Error("Failed to fetch active ops");
      return res.json() as Promise<Array<{
        id: number;
        name: string;
        clientName: string | null;
        route: string;
        status: string;
        totalTrips: number;
        tripsByStatus: Record<string, number>;
        pendingClearances: number;
      }>>;
    },
    refetchInterval: 30000,
  });
}

type ClearanceDoc = {
  id: number;
  tripId: number;
  checkpoint: string;
  documentType: string;
  documentNumber: string | null;
  status: string;
  requestedAt: string | null;
  approvedAt: string | null;
  notes: string | null;
  createdAt: string;
};
type ClearanceBoardTrip = {
  tripId: number;
  truckPlate: string | null;
  batchName: string | null;
  tripStatus: string;
  zambiaEntry: ClearanceDoc[];
  drcEntry: ClearanceDoc[];
};

export function useGetClearanceBoard() {
  return useQuery({
    queryKey: ["/api/clearances/board"],
    queryFn: async () => {
      const res = await fetch("/api/clearances/board", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch clearance board");
      return res.json() as Promise<ClearanceBoardTrip[]>;
    },
    refetchInterval: 30000,
  });
}

export function useUpdateClearanceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, notes, documentNumber, documentUrl }: { id: number; status: string; notes?: string; documentNumber?: string; documentUrl?: string | null }) => {
      const body: Record<string, any> = { status };
      if (notes !== undefined) body.notes = notes;
      if (documentNumber !== undefined) body.documentNumber = documentNumber;
      if (documentUrl !== undefined) body.documentUrl = documentUrl;
      if (status === "approved") body.approvedAt = new Date().toISOString();
      const res = await fetch(`/api/clearances/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update clearance");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/clearances/board"] });
    },
  });
}

export function useGlobalSearch(query: string) {
  return useQuery({
    queryKey: ["/api/search", query],
    queryFn: async () => {
      if (!query.trim()) return { batches: [], clients: [], trucks: [], drivers: [] };
      const [batchRes, clientRes, truckRes, driverRes] = await Promise.all([
        fetch(`/api/batches?limit=5`).then((r) => r.json()),
        fetch(`/api/clients`).then((r) => r.json()),
        fetch(`/api/trucks`).then((r) => r.json()),
        fetch(`/api/drivers`).then((r) => r.json()),
      ]);
      const q = query.toLowerCase();
      return {
        batches: (batchRes as any[]).filter((b: any) => b.name?.toLowerCase().includes(q) || b.clientName?.toLowerCase().includes(q)).slice(0, 4),
        clients: (clientRes as any[]).filter((c: any) => c.name?.toLowerCase().includes(q)).slice(0, 3),
        trucks: (truckRes as any[]).filter((t: any) => t.plateNumber?.toLowerCase().includes(q)).slice(0, 3),
        drivers: (driverRes as any[]).filter((d: any) => d.name?.toLowerCase().includes(q)).slice(0, 3),
      };
    },
    enabled: query.trim().length >= 2,
    staleTime: 0,
  });
}

export function useGetEntityList() {
  return useQuery({
    queryKey: ["/api/reports/entity-list"],
    queryFn: async () => {
      const res = await fetch("/api/reports/entity-list");
      return res.json() as Promise<{ trucks: any[]; subcontractors: any[]; clients: any[]; drivers: any[] }>;
    },
    staleTime: 60_000,
  });
}

export function useGetCommissionBreakdown(params: { period?: string; year?: number; month?: number }) {
  const { period = "month", year, month } = params;
  return useQuery({
    queryKey: ["/api/reports/commission-breakdown", period, year, month],
    queryFn: async () => {
      const p = new URLSearchParams({ period });
      if (year) p.set("year", String(year));
      if (month) p.set("month", String(month));
      const res = await fetch(`/api/reports/commission-breakdown?${p.toString()}`);
      return res.json() as Promise<{ period: string; trips: any[] }>;
    },
    staleTime: 30_000,
  });
}

export function useGetAgents() {
  return useQuery({
    queryKey: ["/api/agents"],
    queryFn: async () => {
      const res = await fetch("/api/agents", { credentials: "include" });
      return res.json() as Promise<any[]>;
    },
  });
}

export function useGetAgent(id: number | null) {
  return useQuery({
    queryKey: ["/api/agents", id],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${id}`, { credentials: "include" });
      return res.json() as Promise<any>;
    },
    enabled: !!id,
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(data) });
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/agents"] }),
  });
}

export function useUpdateAgent(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/agents/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(data) });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/agents"] }); qc.invalidateQueries({ queryKey: ["/api/agents", id] }); },
  });
}

export function useGetAgentTransactions(agentId: number | null) {
  return useQuery({
    queryKey: ["/api/agents", agentId, "transactions"],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/transactions`, { credentials: "include" });
      return res.json() as Promise<any[]>;
    },
    enabled: !!agentId,
  });
}

export function useCreateAgentTransaction(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/agents/${agentId}/transactions`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(data) });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/agents", agentId, "transactions"] }); qc.invalidateQueries({ queryKey: ["/api/agents"] }); qc.invalidateQueries({ queryKey: ["/api/agents", agentId] }); },
  });
}

export function useDeleteAgentTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ txnId, agentId }: { txnId: number; agentId: number }) => {
      await fetch(`/api/agents/transactions/${txnId}`, { method: "DELETE", credentials: "include" });
      return { txnId, agentId };
    },
    onSuccess: ({ agentId }) => { qc.invalidateQueries({ queryKey: ["/api/agents"] }); qc.invalidateQueries({ queryKey: ["/api/agents", agentId, "transactions"] }); },
  });
}

export function useGetEntityAnalytics(params: { entity: string; ids: number[]; period?: string; year?: number; month?: number }) {
  const { entity, ids, period = "all", year, month } = params;
  const idsStr = ids.join(",");
  return useQuery({
    queryKey: ["/api/reports/entity-analytics", entity, idsStr, period, year, month],
    queryFn: async () => {
      if (!entity || ids.length === 0) return { entity, entities: [] };
      const params = new URLSearchParams({ entity, ids: idsStr, period });
      if (year) params.set("year", String(year));
      if (month) params.set("month", String(month));
      const res = await fetch(`/api/reports/entity-analytics?${params.toString()}`);
      return res.json() as Promise<{ entity: string; entities: any[] }>;
    },
    enabled: ids.length > 0,
  });
}
