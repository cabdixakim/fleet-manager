# Optima Transport LLC - Transportation Business Management Platform

## Recent Changes (Session 10)
- **Data seeding complete**: Seeded 5 drivers (ids 3-7), 7 batches (ids 2-8, Jan–Mar 2026), 22 trips (ids 3-24), 15 trip expenses, 4 invoices (INV-JAN-001/002, INV-FEB-001/002), 10 client transactions (invoices + payments), 17 sub transactions (net payables + payments).
- **Entity Analytics tab** in Reports.tsx: New 4th tab with entity type selector (Trucks, Subcontractors, Clients, Drivers), multi-entity picker (up to 4, color-coded), period filter, comparison bar chart with metric switcher, per-entity metric cards, and monthly trend line chart.
- **`GET /api/reports/entity-list`**: Returns all trucks (with sub name), subcontractors, clients, and drivers for picker population.
- **`GET /api/reports/entity-analytics`**: Entity comparison endpoint. Params: `entity` (truck|subcontractor|client|driver), `ids` (comma-sep), `period`. Returns metrics (trips, MT loaded/delivered, delivery rate, revenue/commission/expenses) + monthly trend per entity.
- **`useGetEntityList` / `useGetEntityAnalytics` hooks**: Added to `lib/api-client-react/src/index.ts`.
- **`getPeriodRange` "all" fix**: Changed max date from JS `new Date(8640000000000000)` (Postgres overflow) to `new Date(2099, 11, 31)`.
- **Reports.tsx imports expanded**: Added `LineChart`, `Line`, entity icons (Truck, Users, Building2, UserCircle, CheckCircle2, Check), and the two new hooks.

## Recent Changes (Session 9)
- **Nominations document overflow fix**: Added `overflow-x-auto` wrapper + `minWidth: 640` on the document container. Outer scroll div now `overflow-auto` (both axes). Extra closing tag added correctly.
- **Nominations print improvements**: `@page { size: A4; margin: 10mm 8mm; }` added to suppress browser headers/footers. Print button now sets `document.title` to `"Nomination — {batch.name}"` before printing and restores it after.
- **Nominations footer**: Hardcoded `"TransportPro"` fallback replaced with `"Your Company"` (`company?.name ?? "Your Company"`).
- **Finance.tsx TRIP_COST_TYPES synced**: Now matches TripDetail EXPENSE_TYPES — `fuel_advance`, `fuel_1`, `fuel_2`, `fuel_3`, `trip_expense_tz`, `trip_expense_drc`, `mileage_allowance`, `per_diem`, `toll`, `accommodation`, `weighbridge`, `loading_fee`, `offloading_fee`, `clearing_agent`, `maintenance`, `other`.
- **TripDetail financials tab — revenue held UI**: When `fin.isRevenueHeld` is true: amber banner shown; cards switch to Projected Gross (held), Trip Expenses, Driver Salary, Current Net (Expenses); Calculation Breakdown panel hidden while held; "Current Deductions (Expenses Only)" summary panel shown instead. `Clock` icon added to imports.
- **Client Statement** (`/clients/:id/statement`): New `ClientStatement.tsx` page. Period selector, print button, KPI cards (transactions, invoiced, opening/closing balance), Account Summary waterfall, Settlement Summary, and full transaction detail table (debit/credit columns).
- **`GET /api/clients/:id/period-statement`**: New endpoint. Filters client transactions by period. Returns summary (totalInvoiced, totalAdvances, totalPayments, totalAdjustments, netBalance, openingBalance, closingBalance) + full transaction list with batch names. Imports `periodsTable`, `and/gte/lte` from drizzle.
- **Clients.tsx Statement button**: Added in both mobile and desktop header action groups linking to `/clients/:id/statement`. Added `FileText` and `Link` imports.
- **App.tsx**: Registered `/clients/:id/statement` route with `ClientStatement` component.

## Recent Changes (Session 8)
- **EXPENSE_TYPES expanded**: Added `fuel_advance` and `per_diem` types. All types now have `leg` and `legColor` properties. Fuel legs (TZ=amber, ZM=blue, DRC=green, general=secondary/purple). Leg badges shown in expenses tab (mobile cards + desktop table).
- **TripDetail expenses tab — mobile-first**: Mobile shows card rows with leg badge + type label + description + date + amount + delete. Desktop keeps the full table with Leg column. Total bar shows on both. Defaulted new expense form to `fuel_advance`.
- **TripDetail clearances tab — mobile-first**: Mobile shows stacked card rows per checkpoint document (type, doc number, status badge, dates, full-width status select). Desktop keeps the table with horizontal scroll (`overflow-x-auto`, `min-w-[640px]`).
- **Subcontractors.tsx profile header — mobile-first**: On mobile, balance + action buttons stack below the info section inside the `flex-1` div. Desktop keeps the balance+actions column on the right.
- **Subcontractors.tsx ledger table — mobile-first**: Mobile shows card rows (type badge + description + date on left; signed amount + running balance on right). Desktop keeps full 6-column table.
- **Subcontractors.tsx expenses table — mobile-first**: Mobile shows card rows (category + description + truck + date on left; amount on right). Desktop keeps full table.
- **Clients.tsx profile header — mobile-first**: Same pattern as Subcontractors — balance + actions stack below info on mobile, right-column on desktop.
- **Clients.tsx ledger table — mobile-first**: Same pattern as Subcontractors ledger.
- **Nominations.tsx mobile layout**: On mobile (`sm:hidden`), shows either the batch list OR the nomination document, not side-by-side. Batch list rows use full-width tap targets with chevron. Document view has a "← Batches" back button. Desktop (`hidden sm:flex`) keeps the original side-by-side 2-panel layout.
- **Nominations document header**: Changed hardcoded `"TransportPro"` fallback to `"Your Company"` — uses `company?.name` from company settings.

## Recent Changes (Session 7)
- **Mobile-first Layout.tsx**: Bottom tab nav on mobile (Dashboard, Batches, Trips, Clients, Fleet, More). Collapsible overlay sidebar on mobile triggered by custom `open-sidebar` event from PageHeader hamburger. Desktop sidebar unchanged.
- **Dedicated Trips page** (`/trips`): Lists all trips across all batches with status filter pills showing counts, search, 30s auto-refresh, pulsing status dots for active trips, links to TripDetail. Route added to App.tsx.
- **GET /api/trips list endpoint**: Full JOIN query (batch+client+truck+driver+sub), supports status/batchId/truckId/search filters.
- **Audit Log timeline UI**: Timeline/feed with day grouping, action icons (color-coded), expandable metadata, user avatars, IP display. Replaced table with vertical timeline.
- **Fleet.tsx overhaul**: 30s real-time polling, driver selector in registration form (calls `engageDriver` after `createTruck`), improved driver history timeline, pulsing on_trip status, cleaner filter pills, last-updated indicator.
- **Dashboard.tsx overhaul**: Action center (alerts for uninvoiced batches, stalled clearances), dual KPI grids (ops + financial), live operations feed with trip progress bars (color-coded by status), recharts (commission trend + revenue by route), quick actions panel.
- **Reports.tsx**: Added print button, theme-aware chart colors via CSS variables (CHART_TOOLTIP_STYLE, CHART_GRID_COLOR, CHART_AXIS_COLOR constants).
- **sidebarConfig.ts**: Trips added to Operations; Clients moved to Finance section.

## Recent Changes (Session 6)
- **Critical Bug Fix**: Subcontractors route had a broken SQL JOIN — `driversTable.assignedTruckId` doesn't exist. Fixed by joining through `truckDriverAssignmentsTable` (two left joins with `isNull(unassignedAt)` condition for current driver).
- **Opening Balances fully wired**: `openingBalance` field added to create/edit forms for Clients and Subcontractors. OB field is editable when unlocked, disabled with a lock icon when locked.
- **OB Locking via Period Close**: Removed early lock triggers from invoices/payroll. OBs now lock when a period is closed (via `POST /api/periods/:id/close`) — locks all clients and subcontractors atomically.
- **Periods Management page** (`/periods`): Full CRUD for accounting periods. Close/reopen actions. Info banner explaining the locking flow. Admin-only delete and reopen; admin+manager can create/edit/close.
- **Adjust Opening Balance dialog**: Admin/manager can override locked OBs via `POST /api/clients/:id/adjust-opening-balance` and `POST /api/subcontractors/:id/adjust-opening-balance`. Requires a reason. Fully audited.
- **Lock status badges**: OB Locked / OB Open badges shown in client and subcontractor list rows and detail headers.
- **Settings page scrollable**: Removed the `flex items-center justify-center min-h-[70vh]` wrapper that blocked scrolling. Now uses `PageContent` overflow-y-auto normally.
- **Company Opening Balance**: Added `openingBalance` field to Company Settings page (Financial Settings section) with descriptive help text.
- **Sidebar fixes**: Fixed broken paths (`/audit-logs` → `/audit-log`, `/dashboard` → `/`, `/expenses` → `/finance`). Added Periods link in Finance section. Added calendar icon to icon map.

## Recent Changes (Session 5)
- **Audit Trail**: `audit_logs` DB table. `logAudit()` helper in `api-server/src/lib/audit.ts`. Audit logging wired into all mutations: auth (login/logout/failed), users CRUD, clients CRUD+transactions, subcontractors, batches, trips, invoices, drivers, trucks, payroll, company settings.
- **Audit Log Page** (`/audit-log`): Filterable table of all system events by action, entity, and free-text search. Paginated (50/page). Action/entity color-coded badges. Admin and Manager roles only.
- **Setup Wizard** (`/setup`): Two-step first-run wizard (company profile → admin account). Backend: `GET /api/setup/status` + `POST /api/setup/complete` (only accessible when 0 users exist). Frontend: `SetupGate` component checks status on every load and redirects to `/setup` if needed. Old seed.ts removed.
- **Role-Gated Sidebar Navigation**: Nav items filtered by role. Admin = all. Manager = all except `/users`. Accounts = dashboard, clients, subcontractors, invoices, finance, reports, payroll, settings. Operations = dashboard, batches, clearances, fleet, drivers, payroll, finance.
- **Persistent Sessions**: Sessions stored in PostgreSQL `session` table via `connect-pg-simple`. Survive server restarts. 30-day expiry. Cookie: `tp.sid`.

## Recent Changes (Session 4)
- **Full CRUD** across all entities: Edit + Delete dialogs added to Clients, Subcontractors, Batches, Drivers, Fleet, Invoices, Payroll. Backend DELETE routes added for batches, invoices, payroll runs.
- **Company Settings** (`/settings`): Single-row `company_settings` DB table. Settings page with logo upload, company name/address, contact details, currency, tax ID. `GET/PUT /api/company-settings`.
- **Users & Auth** (`/users`, `/login`): `users` DB table with bcrypt password hashing. `express-session` middleware for session-based auth. Auth routes: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`. Users CRUD at `/api/users`. Login page with default credentials hint. `AuthContext` React context wrapping the app with `useAuth()` hook. `AuthGate` component redirects unauthenticated users to `/login`. Default admin seeded on first boot: `admin@company.com` / `admin123`. Users management page (admin-only). Sidebar shows logged-in user name/role + logout button.

## Recent Changes (Session 3)
- **Unified Expenses Module** (`/finance`): New expenses page with KPI cards, tier filter (Trip/Overhead), settle-toggle per expense, "Log Expense" modal with live cost summary panel per truck. Backend: new `/api/expenses` route with full CRUD.
- **Amendment Gate**: Backend now blocks truck/driver swaps for trips already at `loaded` status or beyond. Only cancellation is allowed at that stage. Frontend: shows "Cancel Trip" (red) for locked statuses, "Amend" for pre-load, hidden when cancelled.
- **TripDetail expenses tab**: Read-only — shows linked expenses, removed the inline entry form; added "Open Expenses" link to navigate to the unified module.
- **UI Overhaul — card-row design** across all list pages: Batches, Fleet, Drivers, Clients replaced with card rows (status indicator dots, left color bars, chevron arrows, proper hover states).
- **Schema**: `trip_expenses` extended with `batchId`, `truckId`, `subcontractorId`, `tier` (trip/overhead), `expenseDate`, `settled` columns; `tripId` made nullable to support overhead expenses.

## Overview

Full-stack logistics management system for fuel tanker transportation operations across Southern/Central Africa. Manages batches of trucks doing cross-border trips (Dar es Salaam or Beira → Lubumbashi via Zambia), with border clearance tracking, cost management, subcontractor ledgers, and client invoicing with AGO/PMS short-charge calculations.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec → React Query hooks + Zod schemas)
- **Frontend**: React + Vite, React Query, Tailwind CSS v4, shadcn/ui, Recharts
- **Build**: esbuild (CJS bundle)

## Business Domain

### Key Entities

- **Clients**: Companies that order fuel transport. Have per-cargo-type short charge rates (AGO rate, PMS rate in $/MT). Running ledger with invoice, payment, advance, adjustment transactions.
- **Subcontractors**: Truck owners. Each has a commission rate (%). Running ledger tracks net_payable, advance_given, payment_made, driver_salary, adjustment transactions.
- **Trucks**: Belong to subcontractors. Have plate number, trailer plate, capacity (MT), status (available/idle/on_trip/maintenance).
- **Drivers**: Have monthly salary. We pay drivers directly and deduct from subcontractor ledger.
- **Batches**: A group of trucks doing a trip together. Fixed routes: `dar_to_lubumbashi` or `beira_to_lubumbashi`. Cargo: AGO or PMS. Rate per MT loaded.
- **Trips**: Individual truck within a batch. Status flow: `nominated → loading → loaded → in_transit → at_zambia_entry → at_drc_entry → delivered`. Can be `cancelled` or `amended_out`.
- **Clearances**: 2 checkpoints per trip: `zambia_entry` (T1) and `drc_entry` (TR8). Each tracks document type, number, status (requested/pending/approved/rejected).
- **TripExpenses**: Expenses we pay on behalf of subcontractors. Deducted from net payable.
- **Payroll**: Monthly salary runs. Salary split across trips driven that month. Creates driver_salary transactions on subcontractor ledger.
- **Invoices**: Client-facing invoices. Linked to batches.
- **CompanyExpenses**: Company overhead tracking (rent, salaries, utilities, etc.) for P&L.

### Net Payable Formula

```
Gross Revenue (loaded qty × rate/MT)
− Commission (sub's commission rate %)
− Short Charges (excess above 0.3%/AGO or 0.5%/PMS allowance × client rate)
− Trip Expenses (fuel, maintenance, tolls, etc. we paid)
− Driver Salary Allocation (monthly salary ÷ trips that month)
= Net Payable to Subcontractor
```

### Short Charge Calculation

- Short qty = loaded qty - delivered qty
- Allowance = 0.3% of loaded qty (AGO) or 0.5% of loaded qty (PMS)
- Chargeable short = max(0, short qty - allowance)
- Short charge = chargeable short × client's rate (agoShortChargeRate or pmsShortChargeRate)

## Structure

```text
workspace/
├── artifacts/
│   ├── api-server/             # Express 5 API server (port 8080)
│   │   └── src/
│   │       ├── routes/         # All route handlers
│   │       └── lib/financials  # Net payable calculation engine
│   └── web/                    # React + Vite frontend
│       └── src/
│           ├── pages/          # All page components
│           ├── components/     # Layout, DataTable, KpiCard, StatusBadge
│           └── lib/            # utils, export helpers
├── lib/
│   ├── api-spec/               # OpenAPI spec + Orval codegen config
│   ├── api-client-react/       # Generated React Query hooks
│   ├── api-zod/                # Generated Zod schemas from OpenAPI
│   └── db/
│       └── src/schema/         # 15-table Drizzle schema
└── scripts/
```

## Frontend Pages

- `/` — Dashboard (KPIs, commission trend chart, recent batches)
- `/batches` — Batch list with status filters and search
- `/batches/:id` — Batch detail with trip board and financials tab
- `/trips/:id` — Trip detail with status updates, clearances, expenses, amendments
- `/clients` — Client list + drill-down to running ledger
- `/subcontractors` — Subcontractor list + drill-down to running ledger
- `/fleet` — Truck registry with status management
- `/drivers` — Driver registry with salary management
- `/payroll` — Monthly payroll runs and salary allocation breakdown
- `/clearances` — Border clearance board (Zambia T1 + DRC TR8)
- `/invoices` — Invoice management with status tracking
- `/finance` — P&L statement + company expense management
- `/reports` — Revenue analytics, commission reports, route analysis
- `/settings` — Company settings (admin/manager)
- `/users` — User management (admin only)
- `/audit-log` — Full audit trail of all system events (admin/manager)
- `/setup` — First-run setup wizard (inaccessible after initial setup)
- `/login` — Authentication page

## API Routes

All routes prefixed with `/api`:
- `GET/POST /api/clients` + `GET/PUT/DELETE /api/clients/:id`
- `GET /api/clients/:id/transactions` + `POST`
- `GET/POST /api/subcontractors` + `/subcontractors/:id` + `/transactions`
- `GET/POST /api/trucks` + `/trucks/:id`
- `GET/POST /api/drivers` + `/drivers/:id`
- `GET/POST /api/payroll` + run processing
- `GET/POST /api/batches` + `GET/PUT /api/batches/:id`
- `POST /api/batches/:id/nominate` — bulk truck nomination
- `GET /api/batches/:id/financials` — computed batch P&L
- `GET/PUT /api/trips/:id` + amend + expenses + clearances + delivery-note
- `GET /api/clearances/board`
- `GET/POST /api/invoices` + `/invoices/:id`
- `GET/POST /api/company-expenses` + `/company-expenses/:id`
- `GET /api/dashboard/metrics` + `/dashboard/analytics`
- `GET /api/reports/pnl` + `/reports/commission`

## Key Configuration

- Vite proxy: `/api` → `http://localhost:8080` (API server)
- Database: PostgreSQL via `DATABASE_URL` env var
- API server port: `8080` (set via `PORT` env var)
- Web frontend port: `22333` (set via `PORT` env var)

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes to database
