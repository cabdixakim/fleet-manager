import { relations } from "drizzle-orm/relations";
import { trips, clearances, clients, clientTransactions, batches, deliveryNotes, driverPayroll, driverPayrollAllocations, trucks, drivers, subcontractors, tripExpenses, subcontractorTransactions, invoices, tripAmendments } from "./schema";

export const clearancesRelations = relations(clearances, ({one}) => ({
	trip: one(trips, {
		fields: [clearances.tripId],
		references: [trips.id]
	}),
}));

export const tripsRelations = relations(trips, ({one, many}) => ({
	clearances: many(clearances),
	deliveryNotes: many(deliveryNotes),
	batch: one(batches, {
		fields: [trips.batchId],
		references: [batches.id]
	}),
	truck: one(trucks, {
		fields: [trips.truckId],
		references: [trucks.id]
	}),
	driver: one(drivers, {
		fields: [trips.driverId],
		references: [drivers.id]
	}),
	tripExpenses: many(tripExpenses),
	subcontractorTransactions: many(subcontractorTransactions),
	tripAmendments: many(tripAmendments),
}));

export const clientTransactionsRelations = relations(clientTransactions, ({one}) => ({
	client: one(clients, {
		fields: [clientTransactions.clientId],
		references: [clients.id]
	}),
	batch: one(batches, {
		fields: [clientTransactions.batchId],
		references: [batches.id]
	}),
}));

export const clientsRelations = relations(clients, ({many}) => ({
	clientTransactions: many(clientTransactions),
	invoices: many(invoices),
	batches: many(batches),
}));

export const batchesRelations = relations(batches, ({one, many}) => ({
	clientTransactions: many(clientTransactions),
	trips: many(trips),
	tripExpenses: many(tripExpenses),
	invoices: many(invoices),
	client: one(clients, {
		fields: [batches.clientId],
		references: [clients.id]
	}),
}));

export const deliveryNotesRelations = relations(deliveryNotes, ({one}) => ({
	trip: one(trips, {
		fields: [deliveryNotes.tripId],
		references: [trips.id]
	}),
}));

export const driverPayrollAllocationsRelations = relations(driverPayrollAllocations, ({one}) => ({
	driverPayroll: one(driverPayroll, {
		fields: [driverPayrollAllocations.payrollId],
		references: [driverPayroll.id]
	}),
}));

export const driverPayrollRelations = relations(driverPayroll, ({one, many}) => ({
	driverPayrollAllocations: many(driverPayrollAllocations),
	driver: one(drivers, {
		fields: [driverPayroll.driverId],
		references: [drivers.id]
	}),
}));

export const driversRelations = relations(drivers, ({one, many}) => ({
	truck: one(trucks, {
		fields: [drivers.assignedTruckId],
		references: [trucks.id]
	}),
	trips: many(trips),
	subcontractorTransactions: many(subcontractorTransactions),
	driverPayrolls: many(driverPayroll),
}));

export const trucksRelations = relations(trucks, ({one, many}) => ({
	drivers: many(drivers),
	subcontractor: one(subcontractors, {
		fields: [trucks.subcontractorId],
		references: [subcontractors.id]
	}),
	trips: many(trips),
	tripExpenses: many(tripExpenses),
}));

export const subcontractorsRelations = relations(subcontractors, ({many}) => ({
	trucks: many(trucks),
	tripExpenses: many(tripExpenses),
	subcontractorTransactions: many(subcontractorTransactions),
}));

export const tripExpensesRelations = relations(tripExpenses, ({one}) => ({
	trip: one(trips, {
		fields: [tripExpenses.tripId],
		references: [trips.id]
	}),
	batch: one(batches, {
		fields: [tripExpenses.batchId],
		references: [batches.id]
	}),
	truck: one(trucks, {
		fields: [tripExpenses.truckId],
		references: [trucks.id]
	}),
	subcontractor: one(subcontractors, {
		fields: [tripExpenses.subcontractorId],
		references: [subcontractors.id]
	}),
}));

export const subcontractorTransactionsRelations = relations(subcontractorTransactions, ({one}) => ({
	trip: one(trips, {
		fields: [subcontractorTransactions.tripId],
		references: [trips.id]
	}),
	driver: one(drivers, {
		fields: [subcontractorTransactions.driverId],
		references: [drivers.id]
	}),
	subcontractor: one(subcontractors, {
		fields: [subcontractorTransactions.subcontractorId],
		references: [subcontractors.id]
	}),
}));

export const invoicesRelations = relations(invoices, ({one}) => ({
	batch: one(batches, {
		fields: [invoices.batchId],
		references: [batches.id]
	}),
	client: one(clients, {
		fields: [invoices.clientId],
		references: [clients.id]
	}),
}));

export const tripAmendmentsRelations = relations(tripAmendments, ({one}) => ({
	trip: one(trips, {
		fields: [tripAmendments.tripId],
		references: [trips.id]
	}),
}));