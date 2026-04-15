import { useQuery } from "@tanstack/react-query";

export type FleetMode = "subcontractor" | "company" | "mixed";

export function useFleetMode(): FleetMode {
  const { data } = useQuery<{ fleetMode?: string }>({
    queryKey: ["company-settings-fleet-mode"],
    queryFn: () => fetch("/api/company-settings", { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });
  return (data?.fleetMode as FleetMode) ?? "subcontractor";
}
