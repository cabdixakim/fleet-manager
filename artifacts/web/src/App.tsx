import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";

import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Batches from "@/pages/Batches";
import BatchDetail from "@/pages/BatchDetail";
import TripDetail from "@/pages/TripDetail";
import Clients from "@/pages/Clients";
import Subcontractors from "@/pages/Subcontractors";
import Fleet from "@/pages/Fleet";
import TruckDetail from "@/pages/TruckDetail";
import Drivers from "@/pages/Drivers";
import Clearances from "@/pages/Clearances";
import Invoices from "@/pages/Invoices";
import InvoiceDetail from "@/pages/InvoiceDetail";
import Finance from "@/pages/Finance";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import Users from "@/pages/Users";
import Login from "@/pages/Login";
import Setup from "@/pages/Setup";
import AuditLog from "@/pages/AuditLog";
import Nominations from "@/pages/Nominations";
import Trips from "@/pages/Trips";
import Periods from "@/pages/Periods";
import SubcontractorStatement from "@/pages/SubcontractorStatement";
import ClientStatement from "@/pages/ClientStatement";
import Agents from "@/pages/Agents";
import Payroll from "@/pages/Payroll";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

function SetupGate({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data, isLoading } = useQuery<{ needsSetup: boolean }>({
    queryKey: ["setup-status"],
    queryFn: () => fetch("/api/setup/status").then((r) => r.json()),
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 4v4h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
        </div>
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (data?.needsSetup && location !== "/setup") {
    return <Redirect to="/setup" />;
  }

  if (!data?.needsSetup && location === "/setup") {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 4v4h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
        </div>
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <SetupGate>
      <Switch>
        <Route path="/setup" component={Setup} />
        <Route path="/login" component={Login} />
        <Route>
          <AuthGate>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/batches" component={Batches} />
              <Route path="/batches/:id" component={BatchDetail} />
              <Route path="/trips" component={Trips} />
              <Route path="/trips/:id" component={TripDetail} />
              <Route path="/clients" component={Clients} />
              <Route path="/subcontractors" component={Subcontractors} />
              <Route path="/fleet" component={Fleet} />
              <Route path="/fleet/:id" component={TruckDetail} />
              <Route path="/trucks" component={Fleet} />
              <Route path="/drivers" component={Drivers} />
              <Route path="/clearances" component={Clearances} />
              <Route path="/invoices" component={Invoices} />
              <Route path="/invoices/:id" component={InvoiceDetail} />
              <Route path="/finance" component={Finance} />
              <Route path="/reports" component={Reports} />
              <Route path="/settings" component={Settings} />
              <Route path="/users" component={Users} />
              <Route path="/audit-log" component={AuditLog} />
              <Route path="/nominations" component={Nominations} />
              <Route path="/periods" component={Periods} />
              <Route path="/subcontractors/:id/statement" component={SubcontractorStatement} />
              <Route path="/clients/:id/statement" component={ClientStatement} />
              <Route path="/agents" component={Agents} />
              <Route path="/payroll" component={Payroll} />
              <Route component={NotFound} />
            </Switch>
          </AuthGate>
        </Route>
      </Switch>
    </SetupGate>
  );
}

function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>{children}</AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default function App() {
  return (
    <AppProviders>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
      <Toaster />
    </AppProviders>
  );
}
