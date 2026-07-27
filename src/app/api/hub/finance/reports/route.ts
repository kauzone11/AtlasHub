import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { csvCell } from "@/lib/hub/operations-validation";
import { getBudgetReport } from "@/lib/hub/operations-service";
import { organizationDate, organizationDayUtcRange } from "@/lib/hub/timezone";

function optionalDate(value: string | null, timezone: string, end = false) { if (!value) return undefined; const range = organizationDayUtcRange(value, timezone); return end ? new Date(range.endAt.getTime() - 1) : range.startAt; }
function add(map: Map<string, number>, key: string, value: number) { map.set(key, (map.get(key) || 0) + value); }

export const GET = withHubApi(async (request) => {
  const session = await requireHubPermission("finance:reports");
  const query = new URL(request.url).searchParams;
  const timezone = session.organization.timezone;
  const from = optionalDate(query.get("from"), timezone); const to = optionalDate(query.get("to"), timezone, true);
  const categoryId = query.get("categoryId"); const costCenterId = query.get("costCenterId"); const status = query.get("status");
  const entries = await prisma.hubFinancialEntry.findMany({
    where: { organizationId: session.organizationId, ...(categoryId ? { categoryId } : {}), ...(costCenterId ? { costCenterId } : {}), ...(status ? { status: status as never } : {}), ...((from || to) ? { competenceDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
    select: { id: true, direction: true, status: true, description: true, competenceDate: true, totalCents: true, currency: true, categoryId: true, costCenterId: true }, orderBy: { competenceDate: "asc" }, take: 5000,
  });
  const entryIds = entries.map((entry) => entry.id);
  const installments = entryIds.length ? await prisma.hubFinancialInstallment.findMany({ where: { organizationId: session.organizationId, entryId: { in: entryIds } }, select: { id: true, entryId: true, amountCents: true, dueDate: true, status: true } }) : [];
  const settlements = entryIds.length ? await prisma.hubFinancialSettlement.findMany({ where: { organizationId: session.organizationId, entryId: { in: entryIds } }, select: { entryId: true, installmentId: true, amountCents: true, settledAt: true, reversedAt: true } }) : [];
  const categories = await prisma.hubFinancialCategory.findMany({ where: { organizationId: session.organizationId }, select: { id: true, name: true } });
  const costCenters = await prisma.hubCostCenter.findMany({ where: { organizationId: session.organizationId }, select: { id: true, name: true } });
  const categoryNames = new Map(categories.map((item) => [item.id, item.name])); const centerNames = new Map(costCenters.map((item) => [item.id, item.name]));
  const entryById = new Map(entries.map((entry) => [entry.id, entry])); const paidByInstallment = new Map<string, number>();
  const categoryBreakdown = new Map<string, number>(); const costCenterBreakdown = new Map<string, number>(); const monthlyCashFlow = new Map<string, number>();
  let settledIncomeCents = 0; let settledExpenseCents = 0;
  const inRange = (date: Date) => (!from || date >= from) && (!to || date <= to);
  const applyMovement = (entry: typeof entries[number], installmentId: string, amount: number, date: Date) => { if (!inRange(date)) return; const signed = entry.direction === "RECEIVABLE" ? amount : -amount; add(categoryBreakdown, categoryNames.get(entry.categoryId) || "Sem categoria", signed); add(costCenterBreakdown, entry.costCenterId ? centerNames.get(entry.costCenterId) || "Outro" : "Organizacao", signed); add(monthlyCashFlow, organizationDate(date, timezone).slice(0, 7), signed); if (entry.direction === "RECEIVABLE") settledIncomeCents += amount; else settledExpenseCents += amount; };
  for (const settlement of settlements) { const entry = entryById.get(settlement.entryId)!; if (!settlement.reversedAt) add(paidByInstallment, settlement.installmentId, settlement.amountCents); applyMovement(entry, settlement.installmentId, settlement.amountCents, settlement.settledAt); if (settlement.reversedAt) applyMovement(entry, settlement.installmentId, -settlement.amountCents, settlement.reversedAt); }
  const today = organizationDate(new Date(), timezone); const overdueInstallments = installments.filter((installment) => organizationDate(installment.dueDate, timezone) < today && (paidByInstallment.get(installment.id) || 0) < installment.amountCents).map((installment) => { const entry = entryById.get(installment.entryId)!; return { entryId: entry.id, description: entry.description, dueDate: installment.dueDate, outstandingCents: installment.amountCents - (paidByInstallment.get(installment.id) || 0), currency: entry.currency }; });
  const pendingApprovals = entries.filter((entry) => entry.status === "PENDING_APPROVAL");
  const reimbursementsPendingReview = await prisma.hubReimbursementRequest.count({ where: { organizationId: session.organizationId, status: "SUBMITTED" } });
  const approvedBudgets = await prisma.hubBudget.findMany({ where: { organizationId: session.organizationId, status: "APPROVED" }, select: { id: true } });
  const budgetVsActual = await Promise.all(approvedBudgets.map(async ({ id }) => { const report = await getBudgetReport(prisma, { id: session.memberId, organizationId: session.organizationId, role: session.role, directorateId: session.directorateId ?? null }, id); const plannedCents = report.lines.reduce((sum, line) => sum + line.plannedCents, 0); const actualCents = report.lines.reduce((sum, line) => sum + line.actualCents, 0); return { id: report.budget.id, name: report.budget.name, year: report.budget.year, plannedCents, actualCents, varianceCents: plannedCents - actualCents }; }));
  const summary = { payableCents: entries.filter((entry) => entry.direction === "PAYABLE" && !["REJECTED", "CANCELLED"].includes(entry.status)).reduce((sum, entry) => sum + entry.totalCents, 0), receivableCents: entries.filter((entry) => entry.direction === "RECEIVABLE" && !["REJECTED", "CANCELLED"].includes(entry.status)).reduce((sum, entry) => sum + entry.totalCents, 0), settledIncomeCents, settledExpenseCents, cashMovementCents: settledIncomeCents - settledExpenseCents, overdueCents: overdueInstallments.reduce((sum, item) => sum + item.outstandingCents, 0), pendingApprovalCount: pendingApprovals.length, reimbursementsPendingReview };
  if (query.get("format") !== "csv") return hubJson({ summary, overdueInstallments, pendingApprovals, categoryBreakdown: [...categoryBreakdown].map(([label, amountCents]) => ({ label, amountCents })), costCenterBreakdown: [...costCenterBreakdown].map(([label, amountCents]) => ({ label, amountCents })), monthlyCashFlow: [...monthlyCashFlow].sort().map(([month, netCents]) => ({ month, netCents })), budgetVsActual, entries });
  const rows: Array<Array<string | number>> = [["direcao", "status", "descricao", "competencia", "valor_centavos", "moeda", "categoria", "centro_custo"], ...entries.map((item) => [item.direction, item.status, item.description, organizationDate(item.competenceDate, timezone), item.totalCents, item.currency, categoryNames.get(item.categoryId) || "", item.costCenterId ? centerNames.get(item.costCenterId) || "" : ""])];
  return new Response(rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=atlas-hub-financeiro.csv", "Cache-Control": "no-store" } });
});
