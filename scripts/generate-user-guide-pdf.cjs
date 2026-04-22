const PDFDocument = require('/tmp/node_modules/pdfkit');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'docs', 'Optima-Transport-User-Guide.pdf');

const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: 'Optima Transport LLC — User Guide', Author: 'Optima Transport' } });
doc.pipe(fs.createWriteStream(OUT));

const W = doc.page.width - 112;
const TEAL = '#0d9488';
const DARK = '#111827';
const MID  = '#374151';
const MUTED = '#6b7280';
const LIGHT_BG = '#f0fdfa';
const RULE = '#d1fae5';

function rule(color = RULE, y) {
  doc.moveTo(56, y ?? doc.y).lineTo(56 + W, y ?? doc.y).strokeColor(color).lineWidth(1).stroke();
}

function h1(text) {
  doc.addPage();
  doc.rect(0, 0, doc.page.width, 6).fill(TEAL);
  doc.moveDown(0.4);
  doc.fontSize(22).fillColor(TEAL).font('Helvetica-Bold').text(text, 56, doc.y, { width: W });
  doc.moveDown(0.2);
  rule(TEAL);
  doc.moveDown(0.8);
  doc.fillColor(DARK);
}

function h2(text) {
  doc.moveDown(0.7);
  doc.fontSize(13).fillColor(TEAL).font('Helvetica-Bold').text(text, 56, doc.y, { width: W });
  doc.moveDown(0.15);
  rule(RULE);
  doc.moveDown(0.4);
  doc.fillColor(DARK);
}

function h3(text) {
  doc.moveDown(0.5);
  doc.fontSize(11).fillColor(MID).font('Helvetica-Bold').text('▸  ' + text, 56, doc.y, { width: W });
  doc.moveDown(0.3);
}

function body(text) {
  doc.fontSize(10).fillColor(MID).font('Helvetica').text(text, 56, doc.y, { width: W, lineGap: 2 });
  doc.moveDown(0.3);
}

function note(text) {
  const top = doc.y;
  doc.rect(56, top, W, 1).fill(LIGHT_BG); // pre-draw
  const saved = doc.y;
  doc.rect(56, top, 3, 999).fill(TEAL);   // left accent — clipped by content
  doc.rect(56, top, W, 1).fill(LIGHT_BG);
  doc.moveDown(0);
  // Draw note box
  const noteText = '💡  ' + text;
  const textHeight = doc.heightOfString(noteText, { width: W - 20 }) + 12;
  doc.rect(56, top, W, textHeight).fillAndStroke(LIGHT_BG, RULE);
  doc.rect(56, top, 3, textHeight).fill(TEAL);
  doc.fontSize(9).fillColor(MID).font('Helvetica-Oblique').text(noteText, 68, top + 6, { width: W - 20 });
  doc.y = top + textHeight + 6;
  doc.moveDown(0.2);
}

function step(num, title, desc) {
  const top = doc.y;
  // Number badge
  doc.circle(70, top + 7, 8).fill(TEAL);
  doc.fontSize(9).fillColor('white').font('Helvetica-Bold').text(String(num), 66, top + 3, { width: 10, align: 'center' });
  // Title
  doc.fontSize(11).fillColor(DARK).font('Helvetica-Bold').text(title, 86, top, { width: W - 30 });
  doc.moveDown(0.15);
  doc.fontSize(10).fillColor(MID).font('Helvetica').text(desc, 86, doc.y, { width: W - 30, lineGap: 2 });
  doc.moveDown(0.5);
}

function bullet(items) {
  items.forEach(item => {
    const top = doc.y;
    doc.circle(68, top + 4, 2.5).fill(TEAL);
    doc.fontSize(10).fillColor(MID).font('Helvetica').text(item, 78, top, { width: W - 22, lineGap: 2 });
    doc.moveDown(0.2);
  });
}

function tableRow(cols, isHeader = false) {
  const colW = [W * 0.35, W * 0.65];
  const top = doc.y;
  const bg = isHeader ? TEAL : (doc._tableRow % 2 === 0 ? '#f9fafb' : 'white');
  const textColor = isHeader ? 'white' : MID;
  const font = isHeader ? 'Helvetica-Bold' : 'Helvetica';
  const rowH = Math.max(
    doc.heightOfString(cols[0], { width: colW[0] - 12 }),
    doc.heightOfString(cols[1], { width: colW[1] - 12 })
  ) + 10;
  doc.rect(56, top, colW[0], rowH).fillAndStroke(bg, '#e5e7eb');
  doc.rect(56 + colW[0], top, colW[1], rowH).fillAndStroke(bg, '#e5e7eb');
  doc.fontSize(9.5).fillColor(textColor).font(font)
    .text(cols[0], 62, top + 5, { width: colW[0] - 12 });
  doc.text(cols[1], 62 + colW[0], top + 5, { width: colW[1] - 12 });
  doc.y = top + rowH;
  if (!isHeader) doc._tableRow = (doc._tableRow || 0) + 1;
}

// ─── COVER PAGE ────────────────────────────────────────────────────────────────
doc.rect(0, 0, doc.page.width, doc.page.height).fill('#0f172a');
doc.rect(0, 0, doc.page.width, 8).fill(TEAL);
doc.rect(0, doc.page.height - 8, doc.page.width, 8).fill(TEAL);

doc.fontSize(36).fillColor('white').font('Helvetica-Bold')
  .text('Optima Transport LLC', 56, 180, { width: W, align: 'center' });
doc.fontSize(18).fillColor(TEAL).font('Helvetica')
  .text('Complete User Guide', 56, 230, { width: W, align: 'center' });

doc.moveDown(3);
doc.rect(100, 290, W - 44, 1).fill(TEAL);

doc.fontSize(11).fillColor('#94a3b8').font('Helvetica')
  .text('Logistics Management System — Fuel Tanker Cross-Border Operations', 56, 310, { width: W, align: 'center' });

doc.fontSize(10).fillColor('#64748b')
  .text('Southern & Central Africa', 56, 340, { width: W, align: 'center' });

doc.fontSize(9).fillColor('#475569')
  .text('Confidential — Internal Use Only', 56, doc.page.height - 60, { width: W, align: 'center' });

// ─── PART 1: FIRST-TIME SETUP ──────────────────────────────────────────────────
h1('Part 1 — First-Time Setup');
body('Complete these steps once when the system is new. They establish the foundation that every other feature depends on.');

h2('Step 1 — Company Settings');
body('Navigate to Settings → Company Settings. Fill in your company name, registered address, contact email, and upload your logo. The logo appears on all client invoices. This is required before the system will allow any other data entry.');

h2('Step 2 — Routes');
body('Navigate to Settings → Routes. Nine default cross-border lanes are pre-loaded (Dar es Salaam → Lubumbashi, Beira → Lusaka, etc.). You can:');
bullet(['Edit any route label or short name', 'Add a custom route for a lane not in the defaults', 'Deactivate routes you never use — they disappear from all dropdowns']);
note('Routes control the dropdown when creating a Batch. If a route you need is missing, add it here first.');

h2('Step 3 — Clients');
body('Navigate to Clients → + New Client. Create a record for every company that hires you to move fuel.');
bullet(['Client name, contact person, phone, email', 'Rate per MT (USD) — the default rate this client pays per metric ton delivered', 'Short charge rate — rate charged on quantity lost in transit (if different per product)']);
note('Each client has their own rate. The rate set here pre-fills when you create a batch for them and can be overridden per batch.');

h2('Step 4 — Agents / Brokers');
body('Navigate to Agents → + New Agent. Add every broker who sources business for you.');
bullet(['Agent name and contact details', 'Default fee per MT — their commission per metric ton on loads they bring']);
note('Agents are optional. If a client came to you directly, leave the agent field blank when creating the batch.');

h2('Step 5 — Subcontractors');
body('Navigate to Subcontractors → + New Subcontractor. Add every external fleet owner who provides trucks to you.');
bullet(['Company or owner name, contact, bank details', 'Payment model — choose one:']);
body('   • Rate Differential: Subcontractor earns a fixed rate per MT; you keep the difference between client rate and sub rate.');
body('   • Commission-based: Subcontractor earns a percentage of the gross rate; you keep the remainder.');
note('Example: Client pays $48/MT. If sub gets $38/MT flat (rate differential), Optima keeps $10/MT margin.');

h2('Step 6 — Fleet (Trucks)');
body('Navigate to Fleet → + New Truck. This is the most important setup step — the ownership type you set here drives all subcontractor financial calculations automatically.');
bullet(['Plate number, make, model, year', 'Trailer plate (if applicable)', 'Ownership: select Company if Optima owns it, or select the Subcontractor name if it belongs to an outside owner', 'Insurance policy details and expiry date', 'Roadworthy certificate expiry date']);
note('Company-owned trucks generate no subcontractor payable. Sub-owned trucks automatically track earnings to that sub whenever they complete a trip.');

h2('Step 7 — Drivers');
body('Navigate to Drivers → + New Driver.');
bullet(['Full name, ID number, phone', 'Licence number and expiry date', 'Assigned truck (optional — link a driver to their regular truck)', 'Monthly salary (used for payroll calculations)']);

h2('Step 8 — Bank Accounts');
body('Navigate to Finance → Bank Accounts → + New Account. Add each company bank account (e.g. Raw Bank USD current account). These link to your General Ledger and are used when recording payments received from clients or paid to subcontractors and suppliers.');

h2('Step 9 — Opening Balances');
body('Navigate to Finance → Opening Balances. If you are migrating from another system and have existing debtors, creditors, or cash balances, enter them here so your financial statements start from the correct position. Skip this step if you are starting fresh with zero history.');

// ─── PART 2: RUNNING A LOAD ────────────────────────────────────────────────────
h1('Part 2 — Running a Load');
body('Every load follows this path: Batch → Trips (Nominations) → In Transit → Delivered → Invoiced → Paid');

h2('Step 10 — Create a Batch');
body('Navigate to Batches → + New Batch. A Batch is the container for a single client job on a specific route — all trucks moving under the same deal belong to one batch.');
bullet(['Name (e.g. "Total DRC — April Run 1")', 'Client — select from your client list', 'Route — e.g. Dar es Salaam → Lubumbashi', 'Rate per MT — pre-fills from client default; override for special pricing', 'Agent — select the broker if applicable; set their fee per MT for this batch', 'Notes (optional)']);
note('Think of a Batch as the purchase order from the client. All trucks moving under this PO belong to this batch.');

h2('Step 11 — Nominate Trucks (Create Trips)');
body('Open the batch → Trips tab → + Nominate Truck. A Trip = one truck making one crossing.');
bullet(['Truck — select from fleet (company or sub-owned)', 'Driver — who is operating this truck', 'Product — AGO (diesel) or PMS (petrol)', 'Loaded quantity (MT) — what was loaded at the origin depot', 'Loading date']);
note('The subcontractor linked to that truck is captured automatically. If it is a company truck, no sub payable is created for that trip.');

h2('Step 12 — Progress Through Trip Statuses');
body('As each truck moves, update its status. The system tracks: Nominated → Loading → Loaded → In Transit → At Zambia Entry → At DRC Entry → Delivered → Completed.');
bullet(['Reaching At Zambia Entry automatically creates a T1 clearance document and posts the T1 clearance fee to the General Ledger', 'Reaching At DRC Entry automatically creates a TR8 clearance document', 'You can revert a status (e.g. back from Delivered to In Transit) if a mistake was made — with an audit note']);

h2('Step 13 — Record Clearances');
body('Each border checkpoint is tracked under Clearances (also accessible from within a Trip). Record the border post name, date, documents presented, and any clearance fees paid. This creates a compliance audit trail for cross-border movement.');

h2('Step 14 — Mark Delivered and Enter Final Quantities');
body('When the truck reaches the client depot, update status to Delivered and enter:');
bullet(['Delivered quantity (MT) — actual amount offloaded (may differ from loaded due to transit shrinkage)', 'Delivery date', 'POD / delivery note reference number']);
note('Invoices and subcontractor payments are calculated on delivered MT, not loaded MT. Always enter the actual figure.');

h2('Step 15 — Record Trip Expenses');
body('Open the trip → Expenses tab → + Add Expense. Record costs incurred during this specific trip:');
bullet(['Fuel top-ups on the road', 'Border facilitation fees', 'Driver cash advances paid on the road', 'Breakdown or repair costs']);
body('Each expense selects a cost type and payment method. It posts automatically to the General Ledger.');

h2('Step 16 — Incidents and Truck Replacements');
body('If something went wrong (accident, breakdown requiring a truck swap): Open the trip → Incidents tab → + Report Incident.');
bullet(['Incident type, date, description', 'Replacement truck (if the original truck was swapped mid-trip)', 'Revenue split — if two trucks shared the trip, specify how delivered MT is split between original and replacement truck owners']);
note('This is critical for subcontractor fairness. The system calculates each sub\'s payable based on their portion of delivered MT.');

// ─── PART 3: INVOICING ─────────────────────────────────────────────────────────
h1('Part 3 — Getting Paid (Invoicing)');

h2('Step 17 — Generate an Invoice');
body('Navigate to Invoices → + New Invoice (or generate directly from the batch). Select which batch the invoice covers and which trips to include — you can invoice a partial batch.');
body('The invoice calculates:');
bullet(['Gross amount = delivered MT × client rate per MT', 'Short charges = MT lost in transit × client short rate', 'Net invoice total presented to client']);
note('The agent/broker fee is an internal deduction only — it does NOT appear on the client invoice. It is Optima\'s internal payable, calculated separately in your financials.');

h2('Step 18 — Amend an Invoice');
body('If a rate or quantity needs correcting after the invoice is drafted (but before payment), use Amend Invoice on the invoice detail page. For each trip line you can override:');
bullet(['Rate per MT — different client rate for this specific trip', 'Short charge rate — override the shortage rate for this trip', 'Delivered or loaded quantity corrections']);
body('Amending deletes the original General Ledger entry and re-posts a corrected entry. The client statement shows the original amount plus an amendment line with the delta and reason.');
note('A paid invoice cannot be amended. Void and reissue if payment has already been recorded.');

h2('Step 19 — Mark Invoice as Paid');
body('When payment is received, open the invoice and select Paid from the status dropdown. A confirmation dialog will ask for:');
bullet(['Payment date', 'Bank account the payment was received into']);
body('Confirming posts: Debit Bank Account → Credit Accounts Receivable. The client statement updates immediately.');

// ─── PART 4: PAYING SUBCONTRACTORS ────────────────────────────────────────────
h1('Part 4 — Paying Subcontractors');

h2('Step 20 — Review Subcontractor Statement');
body('Navigate to Subcontractors → select a subcontractor → Statement. The statement shows:');
bullet(['All trips their trucks completed', 'Gross payable per trip (based on their rate model)', 'Trip expenses that are deducted from their payable', 'Advances already paid', 'Net balance outstanding — what Optima owes them right now']);

h2('Step 21 — Record Earnings');
body('On the subcontractor statement, click + Record Earnings to formally post what you owe them for a period. This posts to the General Ledger: Debit Subcontractor Costs → Credit Subcontractor Payable. Until you post earnings, the balance sheet sub-payable will not reflect the amount owed.');

h2('Step 22 — Record a Payment');
body('On the subcontractor statement, click + Record Payment. Enter the amount, date, bank account used, and a reference number. This posts: Debit Subcontractor Payable → Credit Bank. The sub\'s outstanding balance reduces immediately.');

h2('Step 23 — Subcontractor Statement PDF');
body('The subcontractor statement can be downloaded as a PDF and sent to the fleet owner as their remittance / earnings summary.');

// ─── PART 5: RATES AND OVERRIDES ──────────────────────────────────────────────
h1('Part 5 — Rates and Per-Trip Overrides');

h2('Rate Hierarchy');
body('Rates cascade from defaults through to trip-level overrides:');
doc._tableRow = 0;
tableRow(['Level', 'Where Set'], true);
tableRow(['Client default rate', 'Client profile']);
tableRow(['Batch rate', 'Batch creation (inherits client default, editable)']);
tableRow(['Per-trip client rate', 'Invoice amend → override per trip line']);
tableRow(['Per-trip sub rate', 'Trip detail → Rate Overrides section']);
tableRow(['Per-trip short rates', 'Trip detail → Rate Overrides, or Invoice amend']);
doc.moveDown(0.5);

h2('Trip Rate Overrides');
body('Open any delivered trip → Rate Overrides. You can set trip-specific values for:');
bullet(['Sub rate per MT — what this sub earns on this specific trip', 'Client short rate override — what the client is charged for shortage on this trip', 'Sub short rate override — what the sub earns on shortage for this trip', 'Agent fee override — different broker fee for this trip only']);
note('Leave any field blank to use the batch or client default. Overrides only apply to the specific trip where they are set.');

// ─── PART 6: PAYROLL ──────────────────────────────────────────────────────────
h1('Part 6 — Payroll');

h2('Step 24 — Run Monthly Payroll');
body('Navigate to Payroll → + New Payroll Run. Select the month. The system pulls each driver\'s salary from their profile.');
body('For each driver you can add:');
bullet(['Advances or deductions already paid during the month', 'Bonuses', 'Any manual adjustments']);
body('Approve the payroll run to lock it. This posts to GL: Debit Salary Expense → Credit Bank/Cash.');

// ─── PART 7: MANAGING MONEY ───────────────────────────────────────────────────
h1('Part 7 — Managing Money');

h2('Petty Cash');
body('Navigate to Finance → Petty Cash. Record small cash expenses paid from the office float. Each entry reduces the petty cash balance and posts to the GL. Top up the float by recording a transfer from a bank account.');

h2('Company Expenses');
body('Record overhead costs not linked to a specific trip — office rent, utilities, salaries for non-drivers, insurance premiums, vehicle registration fees. Select the expense category and GL account. Posts directly to your P&L.');

h2('Suppliers');
body('Navigate to Suppliers to manage external vendors (fuel suppliers, clearing agents, mechanics). Each supplier has a balance that tracks what you owe them. Payments against suppliers reduce the balance and post to GL: Debit Supplier Payable → Credit Bank.');

h2('Bank Reconciliation');
body('Navigate to Finance → Bank Accounts → select account → Reconcile. Match your bank statement entries against GL entries. Unmatched items flag discrepancies for investigation.');

h2('Assets (Fixed Asset Register)');
body('Navigate to Assets. Record company-owned assets (trucks, trailers, equipment) for accounting purposes. Each asset tracks:');
bullet(['Purchase price and date', 'Depreciation method (straight-line or declining balance) and useful life', 'Accumulated depreciation', 'Financing details — lender, loan amount, installment plan, payments made']);
body('Asset purchase posts: Debit Fixed Assets → Credit Bank or Loan Payable. Depreciation posts monthly: Debit Depreciation Expense → Credit Accumulated Depreciation.');
note('Fleet trucks should have both a Fleet record (for trip operations) and an Asset record (for balance sheet depreciation). Sub-owned trucks only need a Fleet record — they are not Optima\'s asset.');

// ─── PART 8: REPORTS & FINANCIALS ────────────────────────────────────────────
h1('Part 8 — Reports and Financial Statements');

h2('Reports');
body('Navigate to Reports. Available reports:');
bullet(['P&L by Period — revenue, costs, and net margin per month', 'Revenue by Route — which lanes are most profitable', 'Commission Report — agent fees paid per batch', 'Fleet Performance — trips and MT moved per truck', 'Subcontractor Statement — what each sub earned and was paid']);

h2('Financial Statements');
body('Navigate to Finance → Financial Statements:');
doc._tableRow = 0;
tableRow(['Statement', 'What It Shows'], true);
tableRow(['Profit & Loss', 'Income vs expenses for any date range']);
tableRow(['Balance Sheet', 'Assets, liabilities, equity snapshot at a point in time']);
tableRow(['Trial Balance', 'All GL account balances — confirms books balance']);
tableRow(['Accounts Receivable', 'What clients currently owe Optima']);
tableRow(['Accounts Payable', 'What Optima owes subs, suppliers, and agents']);
tableRow(['Cash Flow', 'Money in vs money out over a period']);
doc.moveDown(0.5);

h2('General Ledger');
body('Navigate to Finance → General Ledger to see every journal entry posted by the system. You can also post manual adjustment entries for corrections that don\'t fit an existing workflow.');

h2('Chart of Accounts');
body('Navigate to Finance → Chart of Accounts to view and manage your account structure. System accounts (AR, AP, Revenue, etc.) are pre-seeded and protected. You can add custom accounts for specific expense categories.');

h2('Financial Periods');
body('Navigate to Finance → Periods. Each calendar month is a period that can be open or closed. Closing a period locks all historical GL entries in that month — they cannot be edited or deleted after closing. This prevents accidental changes to finalised accounts.');

// ─── PART 9: INSURANCE MANAGEMENT ────────────────────────────────────────────
h1('Part 9 — Insurance Management');

body('Optima Transport tracks two levels of insurance: company-wide policies (the master contracts held with your insurer) and individual claims filed against those policies. The system links each claim to its governing policy automatically based on the claim type.');

h2('Company Insurance Policies');
body('Navigate to Fleet → Insurance Policies. Set up the master insurance agreements your company holds. There are three policy types:');
doc._tableRow = 0;
tableRow(['Policy Type', 'What It Covers'], true);
tableRow(['Vehicle Fleet', 'Physical damage, total loss, and theft of your own trucks and trailers (Hollard fleet policy, etc.)']);
tableRow(['Cargo Transit (Open Cover)', 'All cargo-in-transit losses across all loads. An open-cover policy applies automatically to every shipment without listing each truck individually.']);
tableRow(['Third-Party Liability', 'Damage or injury caused to third parties in road incidents. Often a statutory requirement for cross-border haulage.']);
doc.moveDown(0.5);

body('For each policy record:');
bullet([
  'Policy Type — select from the three types above',
  'Insurer Name — e.g. Hollard Insurance, Old Mutual, Jubilee Insurance',
  'Policy Number — the reference on your policy schedule',
  'Sum Insured — the maximum cover amount in your currency',
  'Premium — annual or monthly premium amount and frequency',
  'Effective Date and Expiry Date — used for tracking renewal deadlines',
  'Notes — attach any internal reference, broker name, or conditions',
]);
body('Policies can be marked Active or Inactive. Only active policies appear in the claim form\'s auto-suggest.');

h2('Insurance Claims');
body('Navigate to Fleet → Claims. Log every claim your company has filed or intends to file.');
body('When creating a new claim, the system uses the claim type to automatically suggest the right linked policy:');
doc._tableRow = 0;
tableRow(['Claim Type', 'Auto-linked Policy Type'], true);
tableRow(['Cargo Loss', 'Cargo Transit (Open Cover)']);
tableRow(['Accident', 'Vehicle Fleet']);
tableRow(['Theft', 'Vehicle Fleet']);
tableRow(['Third-Party', 'Third-Party Liability']);
tableRow(['Other', 'No auto-suggestion — select manually or leave unlinked']);
doc.moveDown(0.5);

body('When a matching active policy is found, the insurer name and policy number are auto-filled into the claim form. You can still override these fields manually if a claim involves a different underwriter or a one-off arrangement.');
body('Key claim fields:');
bullet([
  'Linked Policy — select or override the auto-suggested policy. Linking a claim to a policy lets you see total claims exposure per policy.',
  'Truck — which vehicle was involved (optional for cargo-only losses)',
  'Trip — which load was affected (optional)',
  'Incident Date, Filed Date, Settled Date — tracks the full claim lifecycle',
  'Amount Claimed vs Amount Settled — shows shortfall; system tracks both figures for reporting',
  'Status — Draft → Filed → Under Review → Settled (or Rejected)',
  'Description and Notes — internal record of what happened',
]);
body('Claim information (insurer, policy number) is snapshotted at creation. If you later change the linked policy or the policy details, historical claim records are unaffected — the original insurer and policy number are preserved for accuracy.');

// ─── PART 10: COMPLIANCE & DOCUMENTS ─────────────────────────────────────────
h1('Part 10 — Compliance and Documents');

h2('Document Vault');
body('Navigate to Documents. Upload and store any file against a truck, driver, or trip:');
bullet(['Truck roadworthy certificates', 'Driver licences and medicals', 'Insurance policies', 'Border clearance documents (T1, TR8, etc.)', 'Client contracts and rate agreements']);
body('Each document has an expiry date. The notification bell flags documents expiring within 30 days so you can renew before a truck is blocked at a border.');

h2('Clearances');
body('Navigate to Clearances (or access from within a Trip). Tracks customs checkpoints:');
bullet(['Zambia Entry — T1 document, auto-created when trip reaches At Zambia Entry status', 'DRC Entry — TR8 document, auto-created when trip reaches At DRC Entry status', 'Additional manual clearance entries can be added for any checkpoint']);

h2('Audit Log');
body('Navigate to Settings → Audit Log. Every action in the system (who created, edited, or deleted what, and when) is permanently recorded. Useful for accountability, dispute resolution, and compliance audits.');

// ─── PART 11: USERS ──────────────────────────────────────────────────────────
h1('Part 11 — Users and Access Control');

h2('User Roles');
doc._tableRow = 0;
tableRow(['Role', 'Access Level'], true);
tableRow(['Owner', 'Full access to everything including system settings']);
tableRow(['Admin', 'Full operational access; can manage users and settings']);
tableRow(['Manager', 'Batches, trips, invoices, reports; no GL or user management']);
tableRow(['Accounts', 'Financial data, invoices, GL, reports; no operations management']);
tableRow(['Operations', 'Trips, clearances, documents; no financial data']);
doc.moveDown(0.5);

h2('Creating Users');
body('Navigate to Settings → Users → + Add User. Fill in name, email, and set a strong password (minimum 8 characters, must include uppercase, lowercase, number, and special character). After creation, the credentials are shown once for copying — the password is not retrievable after closing the dialog.');

h2('Resetting Passwords');
body('From the Users list, open the dropdown menu next to any user and select Reset Password. Set the new password using the same strength requirements. After reset, the new password is shown once for sharing with the user.');

h2('Locking Accounts');
body('From the Users dropdown, select Lock Account to immediately prevent a user from logging in. Active sessions expire. Unlock at any time from the same menu. Use this when a staff member leaves or a device is compromised.');

// ─── PART 12: GL REFERENCE ────────────────────────────────────────────────────
h1('Part 12 — What Hits the General Ledger');
body('Every financial event in the system auto-posts a double-entry journal entry. Nothing needs to be posted manually for standard operations.');

doc._tableRow = 0;
tableRow(['Event', 'Journal Entry'], true);
tableRow(['Invoice created', 'Dr Accounts Receivable → Cr Freight Revenue']);
tableRow(['Invoice payment received', 'Dr Bank → Cr Accounts Receivable']);
tableRow(['Invoice voided or deleted', 'Full reversal of both entries above']);
tableRow(['Invoice amended', 'Original entry deleted, corrected entry re-posted']);
tableRow(['Trip expense recorded', 'Dr Expense account → Cr Bank or Petty Cash']);
tableRow(['Company expense recorded', 'Dr Expense account → Cr Bank or Petty Cash']);
tableRow(['Payroll approved', 'Dr Salary Expense → Cr Bank']);
tableRow(['Sub earnings posted', 'Dr Subcontractor Costs → Cr Subcontractor Payable']);
tableRow(['Sub payment made', 'Dr Subcontractor Payable → Cr Bank']);
tableRow(['Asset purchased', 'Dr Fixed Assets → Cr Bank or Loan Payable']);
tableRow(['Asset depreciation', 'Dr Depreciation Expense → Cr Accumulated Depreciation']);
tableRow(['Asset installment paid', 'Dr Loan Payable → Cr Bank']);
tableRow(['Petty cash top-up', 'Dr Petty Cash → Cr Bank']);
tableRow(['T1/TR8 clearance fee', 'Dr Clearance Expense → Cr Supplier Payable or Cash']);
tableRow(['Maintenance record', 'Dr Maintenance Expense → Cr Bank']);
tableRow(['Client opening balance', 'Dr Accounts Receivable → Cr Equity']);
tableRow(['Sub opening balance', 'Dr Equity → Cr Subcontractor Payable']);
doc.moveDown(0.8);

// ─── QUICK REFERENCE ─────────────────────────────────────────────────────────
h1('Quick Reference — Key Concepts');

doc._tableRow = 0;
tableRow(['Term', 'Definition'], true);
tableRow(['Batch', 'The job/contract — one client, one route, multiple trucks. Acts like a purchase order.']);
tableRow(['Trip', 'One truck\'s single crossing within a batch.']);
tableRow(['MT', 'Metric ton — the unit all billing and sub payments are based on.']);
tableRow(['Delivered MT', 'The figure everything bills on — actual amount offloaded, not the loaded amount.']);
tableRow(['Short Charge', 'Amount billed or paid on quantity lost in transit (loaded MT minus delivered MT).']);
tableRow(['Rate Differential', 'Sub payment model: sub gets a fixed rate per MT; Optima keeps the spread.']);
tableRow(['Commission-based', 'Sub payment model: sub gets a % of gross; Optima keeps the remainder.']);
tableRow(['Agent Fee', 'Broker commission — internal to Optima, not shown on client invoices.']);
tableRow(['Financial Period', 'A calendar month that can be open (editable) or closed (locked).']);
tableRow(['GL', 'General Ledger — the complete record of every financial entry in double-entry format.']);
doc.moveDown(1);

// Footer on last page
const pageCount = doc.bufferedPageRange().count + doc.bufferedPageRange().start;
doc.fontSize(8).fillColor(MUTED).text(
  'Optima Transport LLC — Confidential User Guide  •  Generated ' + new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
  56, doc.page.height - 40, { width: W, align: 'center' }
);

doc.end();
console.log('PDF written to', OUT);
