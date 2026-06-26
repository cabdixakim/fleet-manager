---
name: Statement Date Filter
description: How date filtering works across the 4 statement pages and their API endpoints
---

## The pattern

Frontend resolves dates to `{ dateFrom: string|null, dateTo: string|null, label: string }` and sends
`?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD` to the API. The API never receives a label — it returns
`periodName` from its own logic but the frontend overrides it with `filter.label` in print headers.

## Component: StatementDateFilter

`artifacts/web/src/components/StatementDateFilter.tsx`
- Exports `DateFilterValue`, `StatementPeriod`, `StatementDateFilter`
- Presets: All Time, This Month, Last Month, Last 3 Months, This Year, Last Year
- Custom range: From/To date inputs + Apply button
- Period picker: optional `periods` prop (fetched from /api/periods)

## API endpoints that accept dateFrom/dateTo

All four are backward-compatible — no params = all time:
- GET /api/clients/:id/period-statement?dateFrom=&dateTo=
- GET /api/subcontractors/:id/period-statement?dateFrom=&dateTo=
- GET /api/trucks/:id/detail?dateFrom=&dateTo= (shared with TruckDetail — safe, no params there)
- GET /api/suppliers/:id/statement?dateFrom=&dateTo=

**Why:** trucks detail endpoint is shared with TruckDetail page. TruckDetail never sends date
params, so adding optional filtering is fully backward-compatible.

## Print HTML label override

generateClientStatementHtml(statement, company, userName, periodLabel?) — pass filter.label
as 4th arg to override statement.periodName in the printed Duration line.
generateFleetStatementHtml(data, company, userName, periodLabel?) — shows in sub-header.
generateSubStatementHtml already had periodLabel as 3rd arg — now driven by filter.label.
