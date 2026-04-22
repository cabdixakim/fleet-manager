# Optima Transport LLC — Complete User Guide

**Scenario throughout this guide:** You run a mixed fleet — some trucks are company-owned, some belong to subcontractors (outside fleet owners). A client has hired you to move fuel from Dar es Salaam to Lubumbashi. An agent (broker) sourced the deal.

---

## Part 1 — First-Time Setup

### Step 1: Company Setup
Go to **Settings → Company Settings**.

Fill in:
- Company name, address, email
- Default currency (USD)
- Logo (appears on invoices)

This is the only step that is required before anything else works.

---

### Step 2: Set Up Your Routes
Go to **Settings → Routes**.

Your 9 default routes are already loaded (Dar → Lubumbashi, Beira → Lusaka, etc.). You can:
- **Edit** a route label or short name if you want different display text
- **Add** a custom route for a lane you operate that isn't listed
- **Deactivate** routes you never use (they won't appear in dropdowns)

> Routes control the dropdown when creating a Batch. If a route is missing, add it here first.

---

### Step 3: Add Your Clients
Go to **Clients → + New Client**.

Fill in:
- Client name (e.g. "Total Energies DRC")
- Contact person, phone, email
- **Rate per MT (USD)** — what this client pays per metric ton delivered
- Short charge rate (if different from standard)

> Each client can have their own rate. The rate set here is the default when you create a batch for them — you can override it per batch.

Repeat for every client you work with.

---

### Step 4: Add Your Agents / Brokers
Go to **Agents → + New Agent**.

Fill in:
- Agent name and contact
- Default fee per MT (USD) — their commission per metric ton

> Agents are optional. If a client came directly to you without a broker, leave the agent field blank when creating the batch.

---

### Step 5: Add Your Subcontractors
Go to **Subcontractors → + New Subcontractor**.

Fill in:
- Company/owner name, contact, bank details
- **Payment model** — choose one:
  - **Commission-based**: Subcontractor earns gross rate minus your commission percentage
  - **Rate differential**: Subcontractor earns a fixed rate per MT; you keep the difference

> Example: Client pays $48/MT. If sub gets $38/MT flat (rate differential), Optima keeps $10/MT. If commission-based at 20%, sub gets 80% of gross.

Repeat for every fleet owner who provides trucks to you.

---

### Step 6: Set Up Your Fleet (Trucks)
Go to **Fleet → + New Truck**.

For each truck fill in:
- Plate number, make, model, year
- **Ownership type:**
  - Select **Company** if Optima owns the truck
  - Select the **Subcontractor name** if it belongs to an outside owner
- Trailer plate (if applicable)
- Insurance policy, expiry date
- Roadworthy certificate expiry

> This is the key relationship: **Truck → Subcontractor**. When you assign a truck to a trip, the system automatically knows who to pay (the sub) and how (their payment model).
>
> Company-owned trucks have no subcontractor payable — their costs show as direct company expenses.

---

### Step 7: Add Your Drivers
Go to **Drivers → + New Driver**.

Fill in:
- Full name, ID number, phone
- Licence number and expiry
- Assigned truck (optional — you can link a driver to their regular truck)
- Monthly salary (used for payroll)

---

### Step 8: Set Up Bank Accounts
Go to **Finance → Bank Accounts → + New Account**.

Add each company bank account (e.g. Raw Bank USD account). These link to your General Ledger and are used when recording payments received from clients or paid to subcontractors.

---

### Step 9: Set Opening Balances (if switching from another system)
Go to **Finance → Opening Balances**.

If you have existing debtors, creditors, or cash balances from before using this system, enter them here. This ensures your financial statements start from the correct position.

Skip this if you are starting fresh with zero history.

---

## Part 2 — Running a Load (The Core Workflow)

Every load follows this path:
**Batch → Nominations (Trips) → In Transit → Delivered → Invoice → Paid**

---

### Step 10: Create a Batch
Go to **Batches → + New Batch**.

A **Batch** is a contract/job for a client on a specific route. It groups all the trucks moving under that deal.

Fill in:
- **Name** — e.g. "Total DRC — April Run 1"
- **Client** — select from your client list
- **Route** — e.g. "Dar es Salaam → Lubumbashi"
- **Rate per MT** — pre-fills from client default; override if this job has a special rate
- **Agent** — select the broker if applicable; enter their fee per MT for this batch
- Notes (optional)

> Think of a Batch as a purchase order from the client. All trucks moving under this PO belong to this batch.

---

### Step 11: Nominate Trucks (Create Trips)
Open the batch, go to the **Trips** tab → **+ Nominate Truck**.

A **Trip** = one truck making one crossing. Fill in:
- **Truck** — select from fleet (company or sub truck)
- **Driver** — who is driving
- **Product** — AGO (diesel) or PMS (petrol)
- **Loaded quantity (MT)** — what was loaded at origin
- **Loading date**

> The subcontractor linked to that truck is automatically captured. If it's a company truck, no sub payable is created.

Nominate as many trucks as are going in this batch. Each truck = one trip.

---

### Step 12: Mark Trips In Transit
Once a truck departs, open the trip and update status to **In Transit**.

You can record:
- Border crossing date
- Any early trip expenses (border fees, fuel advances)

---

### Step 13: Record Clearances (Border Crossings)
Go to **Clearances** or open the trip → Clearances tab.

At each border post, record:
- Border name, date
- Documents presented
- Any clearance fees

> This is your audit trail for cross-border compliance. Required if a client or authority asks for proof of transit.

---

### Step 14: Mark Delivered + Enter Final Quantities
When the truck reaches the client depot, update the trip status to **Delivered**.

Enter:
- **Delivered quantity (MT)** — what was actually offloaded (may differ from loaded due to transit losses)
- **Delivery date**
- **Delivery note / POD reference**

> Invoices and subcontractor payments are calculated on **delivered MT**, not loaded MT. Always enter the actual figure.

---

### Step 15: Record Trip Expenses
Open the trip → **Expenses** tab → + Add Expense.

Record any costs incurred during this specific trip:
- Fuel top-ups on the road
- Border facilitation fees
- Driver cash advances
- Breakdown repairs

> Trip expenses reduce Optima's net margin on that trip. They post automatically to the General Ledger.

---

### Step 16: Handle Incidents (if applicable)
If something went wrong during a trip (accident, breakdown requiring truck swap):

Open the trip → **Incidents** tab → + Report Incident.

Fill in:
- Incident type, date, description
- Replacement truck (if the original truck was swapped mid-trip)
- Revenue split — if two trucks shared the trip, specify how delivered MT revenue is split between the original and replacement truck owners

> This is critical for subcontractor fairness. The system calculates each sub's payable based on their portion of delivered MT.

---

## Part 3 — Getting Paid (Invoicing)

### Step 17: Generate an Invoice
Once a batch has delivered trips, go to **Invoices → + New Invoice** (or generate directly from the batch).

Select:
- Which batch this invoice covers
- Which trips to include (you can invoice partial batches)

The invoice calculates:
- Gross amount = delivered MT × client rate per MT
- Presented total to client (they see full gross — no internal deductions visible)

> The agent/broker fee is an **internal deduction** — it does NOT appear on the client invoice. It's Optima's payable, calculated separately in your financials.

---

### Step 18: Send and Track Invoice
On the Invoice detail page:
- Download PDF to send to client
- Update status to **Sent** when emailed
- Update to **Paid** when payment is received, recording the payment date and bank account it landed in

> Marking an invoice Paid automatically posts the receipt to the General Ledger (Accounts Receivable → Bank).

---

## Part 4 — Paying Your Subcontractors

### Step 19: Review Subcontractor Statement
Go to **Subcontractors → [Sub Name] → Statement**.

This shows:
- All trips this sub's trucks completed
- Gross payable per trip (based on their rate model)
- Any advances already paid to them
- **Net balance outstanding**

> This is what you owe the sub. It updates automatically as trips are delivered.

---

### Step 20: Record a Payment to a Subcontractor
On the subcontractor statement, click **+ Record Payment**.

Enter:
- Amount paid
- Payment date
- Bank account used
- Reference/receipt number

> The GL posts: Debit Subcontractor Payable → Credit Bank. The sub's outstanding balance reduces immediately.

---

## Part 5 — Paying Your Drivers (Payroll)

### Step 21: Run Monthly Payroll
Go to **Payroll → + New Payroll Run**.

Select the month. The system pulls each driver's salary from their profile.

For each driver you can add:
- Advances/deductions already paid during the month
- Bonuses
- Any adjustments

Approve the payroll run to lock it and post to GL.

---

## Part 6 — Managing Money (Finance)

### Petty Cash
Go to **Finance → Petty Cash**.

Record small cash expenses paid out of the office float. Each entry reduces the petty cash balance and posts to GL.

---

### Company Expenses
Go to **Finance → Expenses** (or from the Finance overview).

Record overhead costs not linked to a specific trip:
- Office rent, utilities
- Salaries (non-driver)
- Insurance premiums
- Vehicle registration fees

Select the expense category and GL account. These post directly to your P&L.

---

### Bank Reconciliation
Go to **Finance → Bank Accounts → [Account] → Reconcile**.

Upload or manually enter your bank statement entries. Match them against GL entries. Unmatched items flag discrepancies for investigation.

---

## Part 7 — Reports & Financial Statements

### Reports
Go to **Reports**. Available reports:
- **P&L by Period** — revenue, costs, and net margin per month
- **Revenue by Route** — which lanes are most profitable
- **Commission Report** — agent fees paid per batch
- **Fleet Performance** — trips and MT moved per truck
- **Subcontractor Statement** — what each sub earned and was paid

---

### Financial Statements
Go to **Finance → Financial Statements**:
- **Profit & Loss** — income vs expenses for any date range
- **Balance Sheet** — assets, liabilities, equity snapshot
- **Trial Balance** — all GL account balances
- **Accounts Receivable** — what clients owe you
- **Accounts Payable** — what you owe subs and suppliers
- **Cash Flow** — money in vs out

---

### General Ledger
Go to **Finance → General Ledger** to see every journal entry posted by the system. You can also post manual entries for adjustments.

**Chart of Accounts** — view and manage your account structure under Finance → Chart of Accounts.

---

## Part 8 — Compliance & Documents

### Document Vault
Go to **Documents**.

Upload and store:
- Truck roadworthy certificates
- Driver licences
- Insurance policies
- Border clearance documents
- Client contracts

Each document has an expiry date. Approaching expiries are flagged in the notification bell.

---

### Audit Log
Go to **Settings → Audit Log**.

Every action in the system (who created, edited, or deleted what, and when) is recorded here. Useful for accountability and dispute resolution.

---

## Part 9 — Users & Access Control

Go to **Settings → Users → + Invite User**.

Roles:
- **Admin** — full access to everything including financial statements, user management, and settings
- **Manager** — can manage batches, trips, invoices, and reports; no access to GL or user management
- **Dispatcher** — can manage trips and clearances; no financial access

> Create one admin account for yourself and manager/dispatcher accounts for your operations team.

---

## Quick Reference — Who Pays Who

| What happens | Money flows |
|---|---|
| Client pays invoice | AR → Bank (GL auto-posts) |
| You pay subcontractor | Sub Payable → Bank (GL auto-posts) |
| You pay agent/broker | Agent Payable → Bank (manual or from batch close) |
| Driver gets salary | Salary Expense → Bank/Cash |
| Trip expense paid | Expense → Bank/Petty Cash |

---

## Key Concepts to Remember

**Batch** = the job/contract (one client, one route, multiple trucks)

**Trip** = one truck's single crossing within a batch

**Truck ownership** = Company truck or Subcontractor truck — this drives all subcontractor financials automatically

**Delivered MT** = the number everything bills on — not loaded, not nominal

**Agent fee** = internal deduction only — clients never see it

**Financial periods** = months that can be opened or closed; closing a period locks historical entries so they can't be accidentally changed
