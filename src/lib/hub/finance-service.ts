import crypto from "crypto";
import type { HubRole, Prisma, PrismaClient } from "@prisma/client";
import { HubApiError } from "@/lib/hub/api";
import { writeHubAudit } from "@/lib/hub/audit";
import { hasHubPermission } from "@/lib/hub/permissions";
import { hubCoreTransaction } from "@/lib/hub/core-transaction";

type Actor = { organizationId: string; memberId: string; role: HubRole; directorateId?: string | null; currency: string };

export async function getCoreFinances(client: PrismaClient, actor: Actor, filters: { from?: Date; to?: Date; direction?: "RECEIVABLE" | "PAYABLE"; directorateId?: string; projectId?: string; query?: string } = {}) {
  const where: Prisma.HubFinancialEntryWhereInput = { organizationId: actor.organizationId, ...(filters.from || filters.to ? { competenceDate: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lt: filters.to } : {}) } } : {}), ...(filters.direction ? { direction: filters.direction } : {}), ...(filters.directorateId ? { OR: [{ directorateId: filters.directorateId }, { costCenterId: { in: (await client.hubCostCenter.findMany({ where: { organizationId: actor.organizationId, directorateId: filters.directorateId }, select: { id: true } })).map((item) => item.id) } }] } : {}), ...(filters.projectId ? { projectId: filters.projectId } : {}), ...(filters.query?.trim() ? { description: { contains: filters.query.trim(), mode: "insensitive" } } : {}) };
  const entries = await client.hubFinancialEntry.findMany({ where, orderBy: [{ competenceDate: "desc" }, { createdAt: "desc" }], take: 500 });
  const settlements = await client.hubFinancialSettlement.findMany({ where: { organizationId: actor.organizationId, reversedAt: null, entryId: { in: entries.map((item) => item.id) } }, select: { entryId: true, amountCents: true, settledAt: true } });
  const allEntries = await client.hubFinancialEntry.findMany({ where: { organizationId: actor.organizationId, status: { notIn: ["DRAFT", "REJECTED", "CANCELLED"] } }, select: { id: true, direction: true } });
  const directions = new Map(allEntries.map((item) => [item.id, item.direction]));
  const allSettlements = await client.hubFinancialSettlement.findMany({ where: { organizationId: actor.organizationId, reversedAt: null, entryId: { in: allEntries.map((item) => item.id) } }, select: { entryId: true, amountCents: true } });
  const balanceCents = allSettlements.reduce((sum, item) => sum + (directions.get(item.entryId) === "RECEIVABLE" ? item.amountCents : -item.amountCents), 0);
  return { currency: actor.currency, balanceCents, entries: entries.map((entry) => ({ ...entry, settledCents: settlements.filter((item) => item.entryId === entry.id).reduce((sum, item) => sum + item.amountCents, 0), capabilities: { canEdit: entry.createdById === actor.memberId && ["DRAFT", "PENDING_APPROVAL"].includes(entry.status) && hasHubPermission(actor.role, "finance:create"), canCancel: hasHubPermission(actor.role, "finance:create") && ["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(entry.status) } })) };
}

async function defaultCategory(tx: Prisma.TransactionClient, organizationId: string, direction: "RECEIVABLE" | "PAYABLE") {
  const type = direction === "RECEIVABLE" ? "INCOME" : "EXPENSE";
  const normalizedName = direction === "RECEIVABLE" ? "receitas" : "despesas";
  return tx.hubFinancialCategory.upsert({ where: { organizationId_normalizedName: { organizationId, normalizedName } }, update: { isActive: true }, create: { organizationId, name: direction === "RECEIVABLE" ? "Receitas" : "Despesas", normalizedName, type } });
}

export async function createCoreFinancialEntry(client: PrismaClient, actor: Actor, input: { direction: "RECEIVABLE" | "PAYABLE"; description: string; totalCents: number; competenceDate: Date; dueDate: Date; directorateId?: string | null; projectId?: string | null }, idempotencyKey: string = crypto.randomUUID()) {
  if (!hasHubPermission(actor.role, "finance:create")) throw new HubApiError("Ação não permitida.", 403);
  if (!Number.isSafeInteger(input.totalCents) || input.totalCents <= 0 || input.description.trim().length < 2) throw new HubApiError("Dados financeiros inválidos.", 400);
  return hubCoreTransaction(client, async (tx) => {
    const duplicate = await tx.hubFinancialEntry.findUnique({ where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey } } });
    if (duplicate) return duplicate;
    if (input.directorateId && !(await tx.hubDirectorate.count({ where: { id: input.directorateId, organizationId: actor.organizationId } }))) throw new HubApiError("Diretoria não encontrada.", 404);
    if (input.projectId && !(await tx.hubProject.count({ where: { id: input.projectId, organizationId: actor.organizationId } }))) throw new HubApiError("Projeto não encontrado.", 404);
    const category = await defaultCategory(tx, actor.organizationId, input.direction);
    const entry = await tx.hubFinancialEntry.create({ data: { organizationId: actor.organizationId, direction: input.direction, status: "PENDING_APPROVAL", description: input.description.trim(), categoryId: category.id, directorateId: input.directorateId || null, projectId: input.projectId || null, issueDate: input.competenceDate, competenceDate: input.competenceDate, totalCents: input.totalCents, currency: actor.currency, createdById: actor.memberId, submittedAt: new Date(), submittedById: actor.memberId, idempotencyKey, requestHash: crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex") } });
    await tx.hubFinancialInstallment.create({ data: { organizationId: actor.organizationId, entryId: entry.id, number: 1, amountCents: input.totalCents, dueDate: input.dueDate } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.memberId, action: "FINANCE_SIMPLE_ENTRY_CREATED", entity: "FINANCIAL_ENTRY", entityId: entry.id, metadata: { direction: input.direction, totalCents: input.totalCents } });
    return entry;
  });
}

export async function updateCoreFinancialEntry(client: PrismaClient, actor: Actor, id: string, input: { description?: string; totalCents?: number; competenceDate?: Date; dueDate?: Date; directorateId?: string | null; projectId?: string | null; cancelReason?: string }) {
  if (!hasHubPermission(actor.role, "finance:create")) throw new HubApiError("Ação não permitida.", 403);
  return hubCoreTransaction(client, async (tx) => {
    const entry = await tx.hubFinancialEntry.findFirst({ where: { id, organizationId: actor.organizationId } });
    if (!entry) throw new HubApiError("Lançamento não encontrado.", 404);
    const cancelling = Boolean(input.cancelReason?.trim());
    if (entry.createdById !== actor.memberId && !hasHubPermission(actor.role, "finance:manage")) throw new HubApiError("Ação não permitida.", 403);
    if (!cancelling && !["DRAFT", "PENDING_APPROVAL"].includes(entry.status)) throw new HubApiError("Somente lançamentos pendentes podem ser editados.", 409);
    if (cancelling && ["SETTLED", "CANCELLED"].includes(entry.status)) throw new HubApiError("Este lançamento não pode ser cancelado.", 409);
    if (input.totalCents !== undefined && (!Number.isSafeInteger(input.totalCents) || input.totalCents <= 0)) throw new HubApiError("Valor inválido.", 400);
    const updated = await tx.hubFinancialEntry.update({ where: { id }, data: { ...(input.description?.trim() ? { description: input.description.trim() } : {}), ...(input.totalCents !== undefined ? { totalCents: input.totalCents } : {}), ...(input.competenceDate ? { competenceDate: input.competenceDate, issueDate: input.competenceDate } : {}), ...(input.directorateId !== undefined ? { directorateId: input.directorateId || null } : {}), ...(input.projectId !== undefined ? { projectId: input.projectId || null } : {}), ...(cancelling ? { status: "CANCELLED", cancelledAt: new Date(), cancelledById: actor.memberId, cancellationReason: input.cancelReason!.trim() } : {}) } });
    if (!cancelling && (input.totalCents !== undefined || input.dueDate)) await tx.hubFinancialInstallment.updateMany({ where: { entryId: id }, data: { ...(input.totalCents !== undefined ? { amountCents: input.totalCents } : {}), ...(input.dueDate ? { dueDate: input.dueDate } : {}) } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.memberId, action: cancelling ? "FINANCE_SIMPLE_ENTRY_CANCELLED" : "FINANCE_SIMPLE_ENTRY_UPDATED", entity: "FINANCIAL_ENTRY", entityId: id });
    return updated;
  });
}
