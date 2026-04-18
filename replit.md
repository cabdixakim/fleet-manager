# Optima Transport LLC - Transportation Business Management Platform

## Overview

Optima Transport LLC is a full-stack logistics management system designed for fuel tanker transportation operations across Southern and Central Africa. The platform's primary purpose is to streamline and manage cross-border trips, particularly from Dar es Salaam or Beira to Lubumbashi via Zambia. It encompasses critical functionalities such as border clearance tracking, comprehensive cost management, subcontractor ledger maintenance, and client invoicing, including specialized AGO/PMS short-charge calculations. The system aims to optimize operational efficiency, enhance financial tracking, and provide robust reporting for transportation businesses in the region.

## User Preferences

- The user wants a mobile-first design approach.
- The user prefers real-time data updates and polling for critical operational views.
- The user requires clear visual indicators for status and alerts (e.g., pulsing dots, color-coded badges, amber banners for held revenue).
- The user needs an audit trail for all system events and critical mutations.
- The user wants role-based access control for different user types (Admin, Manager, Accounts, Operations).
- The user prefers that opening balances for clients and subcontractors lock when an accounting period is closed.
- Closed-period write policy: NEW financial entries back-dated into a closed period are auto-bumped to today (current open period) with the original date preserved in the description and audit log; the user is shown a confirmation dialog before submission and a toast after. UPDATE/DELETE of historical rows that fall in a closed period are hard-rejected (409). Payroll runs against a closed month are hard-rejected. See `artifacts/api-server/src/lib/financialPeriod.ts` (`bumpDateIfClosed`, `blockIfClosed`) and frontend hook `artifacts/web/src/hooks/useClosedPeriodConfirm.tsx`.
- The user expects the system to block truck/driver swaps for trips already at 'loaded' status or beyond, allowing only cancellation.
- The user wants consolidated and unified modules for expenses.
- The user desires printable reports and documents with appropriate formatting.
- The user prefers clear KPI cards and detailed financial breakdowns.
- The user wants a streamlined setup process for new installations.

## System Architecture

### UI/UX Decisions
The platform adopts a mobile-first design philosophy, ensuring responsiveness and optimal experience across devices. Key UI/UX elements include:
- **Mobile Navigation:** Bottom tab navigation for mobile (`Dashboard`, `Batches`, `Trips`, `Clients`, `Fleet`, `More`) with a collapsible overlay sidebar.
- **Card-Row Design:** Consistent use of card-row designs across list pages (`Batches`, `Fleet`, `Drivers`, `Clients`, `Subcontractors`, `Audit Log`, `Expenses`, `Ledgers`) featuring status indicator dots, left color bars, and chevron arrows for improved readability and interaction.
- **Status Indicators:** Pulsing status dots for active trips, color-coded badges for entity types, expense legs, and document statuses.
- **Financial Visualizations:** KPI cards, waterfall charts for account summaries, comparison bar charts, and monthly trend line charts are used for financial and operational reporting.
- **Theming:** Print-friendly layouts with specific `@page` CSS rules and theme-aware chart colors via CSS variables.

### Technical Implementations
- **Monorepo Structure:** Managed with `pnpm workspaces` for efficient development across `api-server`, `web`, and shared `lib` packages.
- **Backend:** Node.js 24 with Express 5, utilizing PostgreSQL and Drizzle ORM for database management. Zod is used for schema validation.
- **Frontend:** React with Vite, React Query for data fetching, Tailwind CSS v4 for styling, shadcn/ui for UI components, and Recharts for data visualization.
- **API Communication:** OpenAPI specification for API definition, with Orval used for generating React Query hooks and Zod schemas, ensuring type safety and consistency.
- **Authentication:** Session-based authentication using `express-session` and `connect-pg-simple` for persistent sessions stored in PostgreSQL. bcrypt is used for password hashing.
- **Audit Trail:** Comprehensive logging of system events and mutations stored in a dedicated `audit_logs` table.
- **Financial Engine:** Dedicated `lib/financials` module within the API server handles complex calculations like Net Payable and Short Charges.
- **Dynamic Content:** Real-time polling for critical data (e.g., Fleet, Dashboard) and dynamic filtering/searching across lists.
- **Period Management:** Robust system for managing accounting periods, including closing/reopening, which atomically locks client and subcontractor opening balances.
- **Role-Based Access Control:** Sidebar navigation and specific functionalities are gated based on user roles (Admin, Manager, Accounts, Operations).
- **First-Run Wizard:** A setup wizard (`/setup`) guides initial company and admin account configuration, ensuring a smooth onboarding process.

### Feature Specifications
- **Entity Management:** CRUD operations for Clients, Subcontractors, Trucks, Drivers, Batches, Trips, Invoices, Payroll, Company Expenses, Users.
- **Trip Workflow:** Comprehensive trip status flow (`nominated` to `delivered`), including amendments and cancellations.
- **Clearance Tracking:** Detailed tracking of border clearances (Zambia T1, DRC TR8) with document types, numbers, and status updates.
- **Financial Ledgers:** Running ledgers for Clients and Subcontractors, tracking transactions, payments, advances, and adjustments.
- **Expense Management:** Unified expenses module allowing logging of both trip-specific and overhead expenses, with payment method tagging (Petty Cash / Fuel Credit / Bank Transfer / Cash). GL posts to the correct credit account automatically.
- **Supplier / Vendor Ledger:** Full supplier management (fuel stations, clearing agents, etc.) with running credit balance per supplier, expense-to-supplier linking, and monthly payment recording. GL: Dr Supplier Payables (2050) / Cr Bank on payment.
- **Petty Cash Cashbook:** Real petty cash account with live balance. Top-up from bank posts Dr Petty Cash (1003) / Cr Bank (1002). Expenses paid from petty cash deduct from balance and post Dr Expense / Cr Petty Cash automatically.
- **GL Account additions:** 1003 Petty Cash (asset), 2050 Supplier Payables (liability) seeded on startup.
- **Payroll System:** Monthly payroll runs (company mode only), driver salary allocation across trips, GL auto-posting (Dr Staff Expense / Cr AP).
- **General Ledger (GL):** Full double-entry accounting system with auto-posting on invoice creation (Dr AR / Cr Revenue), invoice payment (Dr Bank / Cr AR), company expense creation (Dr Expense / Cr AP), and payroll runs. Schema: `gl_accounts`, `gl_journal_entries`, `gl_journal_entry_lines`. Default 27-account COA seed. Manual journal entries supported with balance validation.
- **Financial Statements:** P&L Statement, Balance Sheet, and Trial Balance generated from the GL. Accessible at `/gl/statements`.
- **Chart of Accounts:** Manage accounts by type (Asset, Liability, Equity, Revenue, Expense) at `/gl/accounts`.
- **Reporting:** Various reports including operational analytics, commission reports, entity analytics, and client statements.
- **Company Settings:** Centralized management of company profile, logo, financial settings, and currency.

## External Dependencies

- **Database:** PostgreSQL
- **ORM:** Drizzle ORM
- **API Specification:** OpenAPI
- **API Client Generation:** Orval
- **Session Management:** `connect-pg-simple` (for PostgreSQL session storage)
- **Password Hashing:** bcrypt
- **UI Component Library:** shadcn/ui
- **Charting Library:** Recharts
- **Styling Framework:** Tailwind CSS v4
- **Validation Library:** Zod