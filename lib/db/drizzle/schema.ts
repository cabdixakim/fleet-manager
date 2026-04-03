import { pgTable, serial, integer, text, jsonb, timestamp, foreignKey, numeric, boolean, unique } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const auditLogs = pgTable("audit_logs", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id"),
	userName: text("user_name"),
	action: text().notNull(),
	entity: text().notNull(),
	entityId: text("entity_id"),
	description: text().notNull(),
	metadata: jsonb(),
	ipAddress: text("ip_address"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const clearances = pgTable("clearances", {
	id: serial().primaryKey().notNull(),
	tripId: integer("trip_id").notNull(),
	checkpoint: text().notNull(),
	documentType: text("document_type").notNull(),
	documentNumber: text("document_number"),
	status: text().default('requested').notNull(),
	requestedAt: timestamp("requested_at", { mode: 'string' }),
	approvedAt: timestamp("approved_at", { mode: 'string' }),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tripId],
			foreignColumns: [trips.id],
			name: "clearances_trip_id_trips_id_fk"
		}).onDelete("cascade"),
]);

export const clientTransactions = pgTable("client_transactions", {
	id: serial().primaryKey().notNull(),
	clientId: integer("client_id").notNull(),
	type: text().notNull(),
	amount: numeric({ precision: 12, scale:  2 }).notNull(),
	reference: text(),
	batchId: integer("batch_id"),
	description: text(),
	transactionDate: timestamp("transaction_date", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.clientId],
			foreignColumns: [clients.id],
			name: "client_transactions_client_id_clients_id_fk"
		}),
	foreignKey({
			columns: [table.batchId],
			foreignColumns: [batches.id],
			name: "client_transactions_batch_id_batches_id_fk"
		}),
]);

export const deliveryNotes = pgTable("delivery_notes", {
	id: serial().primaryKey().notNull(),
	tripId: integer("trip_id").notNull(),
	content: text().notNull(),
	attachmentUrl: text("attachment_url"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tripId],
			foreignColumns: [trips.id],
			name: "delivery_notes_trip_id_trips_id_fk"
		}).onDelete("cascade"),
]);

export const driverPayrollAllocations = pgTable("driver_payroll_allocations", {
	id: serial().primaryKey().notNull(),
	payrollId: integer("payroll_id").notNull(),
	tripId: integer("trip_id").notNull(),
	amount: numeric({ precision: 10, scale:  2 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.payrollId],
			foreignColumns: [driverPayroll.id],
			name: "driver_payroll_allocations_payroll_id_driver_payroll_id_fk"
		}).onDelete("cascade"),
]);

export const companyExpenses = pgTable("company_expenses", {
	id: serial().primaryKey().notNull(),
	category: text().notNull(),
	description: text().notNull(),
	amount: numeric({ precision: 12, scale:  2 }).notNull(),
	currency: text().default('USD').notNull(),
	expenseDate: timestamp("expense_date", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const companySettings = pgTable("company_settings", {
	id: serial().primaryKey().notNull(),
	name: text().default('My Transport Company').notNull(),
	logoUrl: text("logo_url"),
	address: text(),
	email: text(),
	phone: text(),
	currency: text().default('USD').notNull(),
	taxId: text("tax_id"),
	website: text(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	recoveryCodeHash: text("recovery_code_hash"),
	ownerEmail: text("owner_email"),
	openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).default('0').notNull(),
	revenueAttributionPolicy: text("revenue_attribution_policy").default('ORIGINAL').notNull(),
});

export const subcontractors = pgTable("subcontractors", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	contactEmail: text("contact_email"),
	contactPhone: text("contact_phone"),
	address: text(),
	commissionRate: numeric("commission_rate", { precision: 5, scale:  2 }).default('0').notNull(),
	notes: text(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const drivers = pgTable("drivers", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	passportNumber: text("passport_number"),
	licenseNumber: text("license_number"),
	phone: text(),
	status: text().default('active').notNull(),
	statusEffectiveDate: timestamp("status_effective_date", { mode: 'string' }),
	monthlySalary: numeric("monthly_salary", { precision: 10, scale:  2 }).default('0').notNull(),
	assignedTruckId: integer("assigned_truck_id"),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.assignedTruckId],
			foreignColumns: [trucks.id],
			name: "drivers_assigned_truck_id_trucks_id_fk"
		}),
]);

export const trucks = pgTable("trucks", {
	id: serial().primaryKey().notNull(),
	plateNumber: text("plate_number").notNull(),
	trailerPlate: text("trailer_plate"),
	subcontractorId: integer("subcontractor_id").notNull(),
	status: text().default('available').notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.subcontractorId],
			foreignColumns: [subcontractors.id],
			name: "trucks_subcontractor_id_subcontractors_id_fk"
		}),
	unique("trucks_plate_number_unique").on(table.plateNumber),
]);

export const trips = pgTable("trips", {
	id: serial().primaryKey().notNull(),
	batchId: integer("batch_id").notNull(),
	truckId: integer("truck_id").notNull(),
	driverId: integer("driver_id"),
	product: text().notNull(),
	capacity: numeric({ precision: 10, scale:  3 }).notNull(),
	status: text().default('nominated').notNull(),
	loadedQty: numeric("loaded_qty", { precision: 10, scale:  3 }),
	deliveredQty: numeric("delivered_qty", { precision: 10, scale:  3 }),
	mileageStart: numeric("mileage_start", { precision: 10, scale:  2 }),
	mileageEnd: numeric("mileage_end", { precision: 10, scale:  2 }),
	fuel1: numeric({ precision: 10, scale:  2 }),
	fuel2: numeric({ precision: 10, scale:  2 }),
	fuel3: numeric({ precision: 10, scale:  2 }),
	cancellationReason: text("cancellation_reason"),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.batchId],
			foreignColumns: [batches.id],
			name: "trips_batch_id_batches_id_fk"
		}),
	foreignKey({
			columns: [table.truckId],
			foreignColumns: [trucks.id],
			name: "trips_truck_id_trucks_id_fk"
		}),
	foreignKey({
			columns: [table.driverId],
			foreignColumns: [drivers.id],
			name: "trips_driver_id_drivers_id_fk"
		}),
]);

export const tripExpenses = pgTable("trip_expenses", {
	id: serial().primaryKey().notNull(),
	tripId: integer("trip_id"),
	batchId: integer("batch_id"),
	truckId: integer("truck_id"),
	subcontractorId: integer("subcontractor_id"),
	tier: text().default('trip').notNull(),
	costType: text("cost_type").notNull(),
	description: text(),
	amount: numeric({ precision: 10, scale:  2 }).notNull(),
	currency: text().default('USD').notNull(),
	expenseDate: timestamp("expense_date", { mode: 'string' }).defaultNow().notNull(),
	settled: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tripId],
			foreignColumns: [trips.id],
			name: "trip_expenses_trip_id_trips_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.batchId],
			foreignColumns: [batches.id],
			name: "trip_expenses_batch_id_batches_id_fk"
		}),
	foreignKey({
			columns: [table.truckId],
			foreignColumns: [trucks.id],
			name: "trip_expenses_truck_id_trucks_id_fk"
		}),
	foreignKey({
			columns: [table.subcontractorId],
			foreignColumns: [subcontractors.id],
			name: "trip_expenses_subcontractor_id_subcontractors_id_fk"
		}),
]);

export const subcontractorTransactions = pgTable("subcontractor_transactions", {
	id: serial().primaryKey().notNull(),
	subcontractorId: integer("subcontractor_id").notNull(),
	type: text().notNull(),
	amount: numeric({ precision: 12, scale:  2 }).notNull(),
	tripId: integer("trip_id"),
	driverId: integer("driver_id"),
	description: text(),
	transactionDate: timestamp("transaction_date", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tripId],
			foreignColumns: [trips.id],
			name: "subcontractor_transactions_trip_id_trips_id_fk"
		}),
	foreignKey({
			columns: [table.driverId],
			foreignColumns: [drivers.id],
			name: "subcontractor_transactions_driver_id_drivers_id_fk"
		}),
	foreignKey({
			columns: [table.subcontractorId],
			foreignColumns: [subcontractors.id],
			name: "subcontractor_transactions_subcontractor_id_subcontractors_id_f"
		}),
]);

export const invoices = pgTable("invoices", {
	id: serial().primaryKey().notNull(),
	invoiceNumber: text("invoice_number").notNull(),
	batchId: integer("batch_id").notNull(),
	clientId: integer("client_id").notNull(),
	totalLoadedQty: numeric("total_loaded_qty", { precision: 10, scale:  3 }).default('0').notNull(),
	totalDeliveredQty: numeric("total_delivered_qty", { precision: 10, scale:  3 }).default('0').notNull(),
	ratePerMt: numeric("rate_per_mt", { precision: 10, scale:  4 }).notNull(),
	grossRevenue: numeric("gross_revenue", { precision: 14, scale:  2 }).default('0').notNull(),
	totalShortCharge: numeric("total_short_charge", { precision: 14, scale:  2 }).default('0').notNull(),
	netRevenue: numeric("net_revenue", { precision: 14, scale:  2 }).default('0').notNull(),
	status: text().default('draft').notNull(),
	issuedDate: timestamp("issued_date", { mode: 'string' }),
	dueDate: timestamp("due_date", { mode: 'string' }),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.batchId],
			foreignColumns: [batches.id],
			name: "invoices_batch_id_batches_id_fk"
		}),
	foreignKey({
			columns: [table.clientId],
			foreignColumns: [clients.id],
			name: "invoices_client_id_clients_id_fk"
		}),
	unique("invoices_invoice_number_unique").on(table.invoiceNumber),
]);

export const users = pgTable("users", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	passwordHash: text("password_hash").notNull(),
	role: text().default('operations').notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	lastLoginAt: timestamp("last_login_at", { mode: 'string' }),
}, (table) => [
	unique("users_email_unique").on(table.email),
]);

export const clients = pgTable("clients", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	contactEmail: text("contact_email"),
	contactPhone: text("contact_phone"),
	address: text(),
	agoShortChargeRate: numeric("ago_short_charge_rate", { precision: 10, scale:  4 }).default('0').notNull(),
	pmsShortChargeRate: numeric("pms_short_charge_rate", { precision: 10, scale:  4 }).default('0').notNull(),
	notes: text(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const batches = pgTable("batches", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	clientId: integer("client_id").notNull(),
	route: text().notNull(),
	status: text().default('planning').notNull(),
	ratePerMt: numeric("rate_per_mt", { precision: 10, scale:  4 }).notNull(),
	nominatedDate: timestamp("nominated_date", { mode: 'string' }),
	loadedDate: timestamp("loaded_date", { mode: 'string' }),
	deliveredDate: timestamp("delivered_date", { mode: 'string' }),
	cancellationReason: text("cancellation_reason"),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.clientId],
			foreignColumns: [clients.id],
			name: "batches_client_id_clients_id_fk"
		}),
]);

export const driverPayroll = pgTable("driver_payroll", {
	id: serial().primaryKey().notNull(),
	driverId: integer("driver_id").notNull(),
	month: integer().notNull(),
	year: integer().notNull(),
	monthlySalary: numeric("monthly_salary", { precision: 10, scale:  2 }).notNull(),
	tripsCount: integer("trips_count").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.driverId],
			foreignColumns: [drivers.id],
			name: "driver_payroll_driver_id_drivers_id_fk"
		}),
]);

export const tripAmendments = pgTable("trip_amendments", {
	id: serial().primaryKey().notNull(),
	tripId: integer("trip_id").notNull(),
	amendmentType: text("amendment_type").notNull(),
	oldTruckId: integer("old_truck_id"),
	newTruckId: integer("new_truck_id"),
	oldDriverId: integer("old_driver_id"),
	newDriverId: integer("new_driver_id"),
	reason: text().notNull(),
	amendedAt: timestamp("amended_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tripId],
			foreignColumns: [trips.id],
			name: "trip_amendments_trip_id_trips_id_fk"
		}),
]);
