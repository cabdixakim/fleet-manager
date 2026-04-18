export type UserRole = "owner" | "admin" | "manager" | "accounts" | "operations" | "system";

export type SidebarLink = {
  label: string;
  path: string;
  icon: string;
  subtle?: boolean;
  roles?: UserRole[]; // if omitted → visible to all roles
  fleetOnly?: "company";   // show only when fleetMode === "company"
  fleetHide?: "company";   // hide when fleetMode === "company"
};

export type SidebarGroup = {
  section: string;
  links: SidebarLink[];
  roles?: UserRole[]; // group-level role gate (all links inherit)
};

export const sidebarConfig: SidebarGroup[] = [
  {
    section: "Operations",
    links: [
      { label: "Dashboard",    path: "/",            icon: "dashboard" },
      { label: "Batches",      path: "/batches",     icon: "layers" },
      { label: "Trips",        path: "/trips",       icon: "truck" },
      { label: "Nominations",  path: "/nominations", icon: "clipboardList", roles: ["admin", "manager", "operations"] },
      { label: "Clearances",   path: "/clearances",  icon: "shieldCheck" },
    ],
  },
  {
    section: "Fleet",
    roles: ["admin", "manager", "operations"],
    links: [
      { label: "Trucks",          path: "/trucks",         icon: "truck" },
      { label: "Drivers",         path: "/drivers",        icon: "user" },
      { label: "Subcontractors",  path: "/subcontractors", icon: "users", fleetHide: "company" },
    ],
  },
  {
    section: "Finance",
    roles: ["admin", "manager", "accounts"],
    links: [
      { label: "Clients",   path: "/clients",  icon: "briefcase" },
      { label: "Invoices",  path: "/invoices", icon: "fileText" },
      { label: "Expenses",  path: "/finance",  icon: "dollarSign" },
      { label: "Payroll",   path: "/payroll",  icon: "calculator", fleetOnly: "company" },
      { label: "Brokers",   path: "/agents",   icon: "mapPin" },
    ],
  },
  {
    section: "Accounting",
    roles: ["admin", "manager", "accounts"],
    links: [
      { label: "Chart of Accounts", path: "/gl/accounts",    icon: "bookOpen" },
      { label: "Ledger",            path: "/gl/ledger",      icon: "list" },
      { label: "Statements",        path: "/gl/statements",  icon: "barChart2" },
      { label: "Reports",           path: "/reports",        icon: "barChart" },
      { label: "Periods",           path: "/periods",        icon: "calendar" },
      { label: "Suppliers",         path: "/suppliers",      icon: "building2" },
      { label: "Petty Cash",        path: "/petty-cash",     icon: "wallet" },
    ],
  },
  {
    section: "Compliance",
    roles: ["admin", "manager"],
    links: [
      { label: "Audit Log", path: "/audit-log", icon: "clipboardList" },
    ],
  },
  {
    section: "Settings",
    roles: ["admin"],
    links: [
      { label: "Company Settings", path: "/settings", icon: "settings" },
      { label: "Users",            path: "/users",    icon: "userCog" },
    ],
  },
];
