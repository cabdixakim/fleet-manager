export const sidebarConfig = [
  {
    section: "Operations",
    links: [
      { label: "Dashboard", path: "/", icon: "dashboard" },
      { label: "Batches", path: "/batches", icon: "layers" },
      { label: "Trips", path: "/trips", icon: "truck" },
      { label: "Nominations", path: "/nominations", icon: "clipboardList" },
      { label: "Clearances", path: "/clearances", icon: "shieldCheck" },
    ],
  },
  {
    section: "Fleet",
    links: [
      { label: "Trucks", path: "/trucks", icon: "truck" },
      { label: "Drivers", path: "/drivers", icon: "user" },
      { label: "Subcontractors", path: "/subcontractors", icon: "users" },
    ],
  },
  {
    section: "Finance",
    links: [
      { label: "Clients", path: "/clients", icon: "briefcase" },
      { label: "Invoices", path: "/invoices", icon: "fileText" },
      { label: "Expenses", path: "/finance", icon: "dollarSign" },
      { label: "Reports", path: "/reports", icon: "barChart" },
      { label: "Periods", path: "/periods", icon: "calendar" },
    ],
  },
  {
    section: "Compliance",
    links: [
      { label: "Audit Log", path: "/audit-log", icon: "clipboardList" },
    ],
  },
  {
    section: "Settings",
    links: [
      { label: "Company Settings", path: "/settings", icon: "settings" },
      { label: "Users", path: "/users", icon: "userCog" },
    ],
  },
];
