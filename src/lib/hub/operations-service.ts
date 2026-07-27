import { Prisma, PrismaClient } from "@prisma/client";
import { HubApiError } from "./api";
import { requestHash, assertMatchingRequestHash, prismaErrorCode, serializationConflict } from "./collaboration-idempotency";
import { createHubNotifications, notifyHubPermissionRecipients } from "./notifications";
import { hubOperationalPolicy, type HubOperationalActor } from "./operations-policy";
import { assertPositiveCents, assertSafeHttpsUrl } from "./operations-validation";
import { writeHubAudit } from "./audit";
import { hasHubPermission } from "./permissions";
import { organizationDayUtcRange } from "./timezone";

type Tx = Prisma.TransactionClient;
const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;

async function serializable<T>(prisma: PrismaClient, action: (tx: Tx) => Promise<T>) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try { return await prisma.$transaction(action, SERIALIZABLE); }
    catch (error) {
      if (!["P2034", "40001", "40P01"].includes(prismaErrorCode(error))) throw error;
      if (attempt === 5) throw serializationConflict();
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 10));
    }
  }
  throw serializationConflict();
}

async function organizationCurrency(tx: Tx, organizationId: string) {
  const organization = await tx.hubOrganization.findUnique({ where: { id: organizationId }, select: { currency: true, timezone: true } });
  if (!organization) throw new HubApiError("Organizacao nao encontrada.", 404);
  return organization;
}

async function assertReference(tx: Tx, model: "category" | "costCenter" | "counterparty", id: string | null | undefined, organizationId: string) {
  if (!id) return;
  const found = model === "category"
    ? await tx.hubFinancialCategory.findFirst({ where: { id, organizationId }, select: { id: true } })
    : model === "costCenter"
      ? await tx.hubCostCenter.findFirst({ where: { id, organizationId }, select: { id: true } })
      : await tx.hubCounterparty.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!found) throw new HubApiError("Registro relacionado nao encontrado.", 404);
}

function localPeriod(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "numeric" }).formatToParts(date);
  return { year: Number(parts.find((p) => p.type === "year")?.value), month: Number(parts.find((p) => p.type === "month")?.value) };
}

async function assertOpenPeriod(tx: Tx, organizationId: string, date: Date, timezone: string) {
  const period = localPeriod(date, timezone);
  const closed = await tx.hubFinancialPeriod.findUnique({ where: { organizationId_year_month: { organizationId, ...period } }, select: { status: true } });
  if (closed?.status === "CLOSED") throw new HubApiError("O periodo financeiro esta fechado.", 409, { code: "PERIOD_CLOSED" });
}

async function assertOpenFinancialDates(tx: Tx, organizationId: string, timezone: string, dates: Array<Date | null | undefined>) {
  await Promise.all(dates.filter((date): date is Date => Boolean(date)).map((date) => assertOpenPeriod(tx, organizationId, date, timezone)));
}

export type FinancialEntryInput = {
  direction: "PAYABLE" | "RECEIVABLE"; description: string; categoryId: string; costCenterId?: string | null;
  counterpartyId?: string | null; projectId?: string | null; issueDate: Date; competenceDate: Date; totalCents: number;
  installments: Array<{ amountCents: number; dueDate: Date }>; idempotencyKey: string;
};

export async function createFinancialEntry(prisma: PrismaClient, actor: HubOperationalActor, input: FinancialEntryInput) {
  assertPositiveCents(input.totalCents, "total");
  if (!input.description.trim() || !input.idempotencyKey.trim()) throw new HubApiError("Descricao e chave de idempotencia sao obrigatorias.", 400);
  if (!input.installments.length || input.installments.reduce((sum, item) => sum + item.amountCents, 0) !== input.totalCents)
    throw new HubApiError("A soma das parcelas deve ser igual ao total.", 400);
  input.installments.forEach((item) => assertPositiveCents(item.amountCents, "parcela"));
  const hash = requestHash(input);
  return serializable(prisma, async (tx) => {
    const duplicate = await tx.hubFinancialEntry.findUnique({ where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey: input.idempotencyKey } } });
    if (duplicate) { assertMatchingRequestHash(duplicate.requestHash, hash); return duplicate; }
    const organization = await organizationCurrency(tx, actor.organizationId);
    await Promise.all([
      assertReference(tx, "category", input.categoryId, actor.organizationId),
      assertReference(tx, "costCenter", input.costCenterId, actor.organizationId),
      assertReference(tx, "counterparty", input.counterpartyId, actor.organizationId),
    ]);
    if (input.projectId) {
      const project = await tx.hubProject.findFirst({ where: { id: input.projectId, organizationId: actor.organizationId }, select: { id: true } });
      if (!project) throw new HubApiError("Registro relacionado nao encontrado.", 404);
    }
    await assertOpenFinancialDates(tx, actor.organizationId, organization.timezone, [input.issueDate, input.competenceDate, ...input.installments.map((item) => item.dueDate)]);
    const entry = await tx.hubFinancialEntry.create({ data: {
      organizationId: actor.organizationId, direction: input.direction, description: input.description.trim(), categoryId: input.categoryId,
      costCenterId: input.costCenterId || null, counterpartyId: input.counterpartyId || null, projectId: input.projectId || null,
      issueDate: input.issueDate, competenceDate: input.competenceDate, totalCents: input.totalCents, currency: organization.currency,
      createdById: actor.id, idempotencyKey: input.idempotencyKey, requestHash: hash,
    } });
    await tx.hubFinancialInstallment.createMany({ data: input.installments.map((item, index) => ({ organizationId: actor.organizationId, entryId: entry.id, number: index + 1, amountCents: item.amountCents, dueDate: item.dueDate })) });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "FINANCIAL_ENTRY_CREATED", entity: "HubFinancialEntry", entityId: entry.id, metadata: { direction: entry.direction, totalCents: entry.totalCents, currency: entry.currency } });
    return entry;
  });
}

export async function submitFinancialEntry(prisma: PrismaClient, actor: HubOperationalActor, entryId: string) {
  return serializable(prisma, async (tx) => {
    const entry = await tx.hubFinancialEntry.findFirst({ where: { id: entryId, organizationId: actor.organizationId } });
    if (!entry) throw new HubApiError("Lancamento nao encontrado.", 404);
    if (entry.status !== "DRAFT") throw new HubApiError("Somente rascunhos podem ser enviados.", 409);
    const organization = await organizationCurrency(tx, actor.organizationId);
    await assertOpenPeriod(tx, actor.organizationId, entry.competenceDate, organization.timezone);
    const updated = await tx.hubFinancialEntry.update({ where: { id: entry.id }, data: { status: "PENDING_APPROVAL", submittedAt: new Date(), submittedById: actor.id } });
    await notifyHubPermissionRecipients(tx, { organizationId: actor.organizationId, actorMemberId: actor.id, excludeActor: true, permission: "finance:review", type: "FINANCIAL_ENTRY_SUBMITTED", title: "Lancamento aguardando aprovacao", body: "Um lancamento financeiro aguarda revisao.", href: `/hub/financeiro/lancamentos/${entry.id}`, entityType: "FINANCIAL_ENTRY", entityId: entry.id, idempotencyKey: `financial-entry:${entry.id}:submitted` });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "FINANCIAL_ENTRY_SUBMITTED", entity: "HubFinancialEntry", entityId: entry.id });
    return updated;
  });
}

export async function updateDraftFinancialEntry(prisma: PrismaClient, actor: HubOperationalActor, entryId: string, input: Omit<FinancialEntryInput, "idempotencyKey">) {
  assertPositiveCents(input.totalCents, "total");
  if (!input.description.trim() || !input.installments.length || input.installments.reduce((sum, item) => sum + item.amountCents, 0) !== input.totalCents)
    throw new HubApiError("A soma das parcelas deve ser igual ao total.", 400);
  return serializable(prisma, async (tx) => {
    const entry = await tx.hubFinancialEntry.findFirst({ where: { id: entryId, organizationId: actor.organizationId } });
    if (!entry) throw new HubApiError("Lancamento nao encontrado.", 404);
    if (entry.status !== "DRAFT") throw new HubApiError("Somente rascunhos podem ser editados.", 409);
    if (!hubOperationalPolicy.canEditFinancialEntry(actor, entry)) throw new HubApiError("Acesso negado.", 403);
    const organization = await organizationCurrency(tx, actor.organizationId);
    await Promise.all([assertReference(tx, "category", input.categoryId, actor.organizationId), assertReference(tx, "costCenter", input.costCenterId, actor.organizationId), assertReference(tx, "counterparty", input.counterpartyId, actor.organizationId)]);
    if (input.projectId) { const project = await tx.hubProject.findFirst({ where: { id: input.projectId, organizationId: actor.organizationId }, select: { id: true } }); if (!project) throw new HubApiError("Registro relacionado nao encontrado.", 404); }
    await assertOpenFinancialDates(tx, actor.organizationId, organization.timezone, [entry.issueDate, entry.competenceDate, input.issueDate, input.competenceDate, ...input.installments.map((item) => item.dueDate)]);
    await tx.hubFinancialInstallment.deleteMany({ where: { entryId: entry.id, organizationId: actor.organizationId } });
    const updated = await tx.hubFinancialEntry.update({ where: { id: entry.id }, data: { direction: input.direction, description: input.description.trim(), categoryId: input.categoryId, costCenterId: input.costCenterId || null, counterpartyId: input.counterpartyId || null, projectId: input.projectId || null, issueDate: input.issueDate, competenceDate: input.competenceDate, totalCents: input.totalCents, currency: organization.currency, requestHash: requestHash(input) } });
    await tx.hubFinancialInstallment.createMany({ data: input.installments.map((item, index) => ({ organizationId: actor.organizationId, entryId: entry.id, number: index + 1, amountCents: item.amountCents, dueDate: item.dueDate })) });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "FINANCIAL_ENTRY_UPDATED", entity: "HubFinancialEntry", entityId: entry.id, metadata: { totalCents: input.totalCents } });
    return updated;
  });
}

export async function rejectFinancialEntry(prisma: PrismaClient, actor: HubOperationalActor, entryId: string, reason: string) {
  if (!reason.trim()) throw new HubApiError("Informe o motivo da rejeicao.", 400);
  return serializable(prisma, async (tx) => {
    const entry = await tx.hubFinancialEntry.findFirst({ where: { id: entryId, organizationId: actor.organizationId } });
    if (!entry) throw new HubApiError("Lancamento nao encontrado.", 404);
    if (!hubOperationalPolicy.canApproveFinancialEntry(actor, entry)) throw new HubApiError("Acesso negado.", 403);
    if (entry.status !== "PENDING_APPROVAL") throw new HubApiError("O lancamento nao esta pendente.", 409);
    const organization = await organizationCurrency(tx, actor.organizationId);
    await assertOpenPeriod(tx, actor.organizationId, entry.competenceDate, organization.timezone);
    const updated = await tx.hubFinancialEntry.update({ where: { id: entry.id }, data: { status: "REJECTED", rejectedAt: new Date(), rejectedById: actor.id, rejectionReason: reason.trim() } });
    await createHubNotifications(tx, [{ organizationId: actor.organizationId, recipientMemberId: entry.createdById, actorMemberId: actor.id, type: "FINANCIAL_ENTRY_REJECTED", title: "Lancamento rejeitado", body: "Seu lancamento financeiro foi rejeitado. Consulte os detalhes.", href: `/hub/financeiro/lancamentos/${entry.id}`, entityType: "FINANCIAL_ENTRY", entityId: entry.id, idempotencyKey: `financial-entry:${entry.id}:rejected:${entry.createdById}` }]);
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "FINANCIAL_ENTRY_REJECTED", entity: "HubFinancialEntry", entityId: entry.id, metadata: { reason: reason.trim().slice(0, 160) } });
    return updated;
  });
}

export async function cancelFinancialEntry(prisma: PrismaClient, actor: HubOperationalActor, entryId: string, reason: string) {
  if (!reason.trim()) throw new HubApiError("Informe o motivo do cancelamento.", 400);
  return serializable(prisma, async (tx) => {
    const entry = await tx.hubFinancialEntry.findFirst({ where: { id: entryId, organizationId: actor.organizationId } });
    if (!entry) throw new HubApiError("Lancamento nao encontrado.", 404);
    if (!(["DRAFT", "PENDING_APPROVAL", "APPROVED"] as string[]).includes(entry.status)) throw new HubApiError("O lancamento nao pode ser cancelado.", 409);
    if (!hubOperationalPolicy.canCancelFinancialEntry(actor, entry)) throw new HubApiError("Acesso negado.", 403);
    const organization = await organizationCurrency(tx, actor.organizationId);
    await assertOpenPeriod(tx, actor.organizationId, entry.competenceDate, organization.timezone);
    if (await tx.hubFinancialSettlement.count({ where: { entryId: entry.id, reversedAt: null } })) throw new HubApiError("Reverta as liquidacoes antes de cancelar.", 409);
    const updated = await tx.hubFinancialEntry.update({ where: { id: entry.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: actor.id, cancellationReason: reason.trim() } });
    await tx.hubFinancialInstallment.updateMany({ where: { entryId: entry.id }, data: { status: "CANCELLED" } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "FINANCIAL_ENTRY_CANCELLED", entity: "HubFinancialEntry", entityId: entry.id, metadata: { reason: reason.trim().slice(0, 160) } });
    return updated;
  });
}

export async function approveFinancialEntry(prisma: PrismaClient, actor: HubOperationalActor, entryId: string) {
  return serializable(prisma, async (tx) => {
    const entry = await tx.hubFinancialEntry.findFirst({ where: { id: entryId, organizationId: actor.organizationId } });
    if (!entry) throw new HubApiError("Lancamento nao encontrado.", 404);
    if (entry.status !== "PENDING_APPROVAL") throw new HubApiError("O lancamento nao esta pendente.", 409);
    const organization = await organizationCurrency(tx, actor.organizationId);
    await assertOpenPeriod(tx, actor.organizationId, entry.competenceDate, organization.timezone);
    let exceptionalSelfApproval = false;
    if (!hubOperationalPolicy.canApproveFinancialEntry(actor, entry)) {
      const onlyAdministrator = entry.createdById === actor.id && ["SUPER_ADMIN", "ADMIN"].includes(actor.role) && await tx.hubMember.count({ where: { organizationId: actor.organizationId, status: "ACTIVE", role: { in: ["SUPER_ADMIN", "ADMIN"] } } }) === 1;
      if (!onlyAdministrator) throw new HubApiError("Autoaprovacao nao e permitida.", 403);
      exceptionalSelfApproval = true;
    }
    const updated = await tx.hubFinancialEntry.update({ where: { id: entry.id }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: actor.id } });
    await createHubNotifications(tx, [{ organizationId: actor.organizationId, recipientMemberId: entry.createdById, actorMemberId: actor.id, type: "FINANCIAL_ENTRY_APPROVED", title: "Lancamento aprovado", body: "Seu lancamento financeiro foi aprovado.", href: `/hub/financeiro/lancamentos/${entry.id}`, entityType: "FINANCIAL_ENTRY", entityId: entry.id, idempotencyKey: `financial-entry:${entry.id}:approved:${entry.createdById}` }]);
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "FINANCIAL_ENTRY_APPROVED", entity: "HubFinancialEntry", entityId: entry.id, metadata: exceptionalSelfApproval ? { exceptionalSelfApproval: true } : undefined });
    return updated;
  });
}

export type SettlementInput = { installmentId: string; amountCents: number; settledAt: Date; method: "PIX" | "BANK_TRANSFER" | "CASH" | "CARD" | "BOLETO" | "OTHER"; reference?: string | null; idempotencyKey: string };

async function refreshEntryStatus(tx: Tx, entryId: string, actorMemberId: string) {
  const entry = await tx.hubFinancialEntry.findUniqueOrThrow({ where: { id: entryId }, select: { totalCents: true } });
  const settled = await tx.hubFinancialSettlement.aggregate({ where: { entryId, reversedAt: null }, _sum: { amountCents: true } });
  const amount = settled._sum.amountCents || 0;
  const status = amount === 0 ? "APPROVED" : amount === entry.totalCents ? "SETTLED" : "PARTIALLY_SETTLED";
  const updated = await tx.hubFinancialEntry.update({ where: { id: entryId }, data: { status } });
  const reimbursement = await tx.hubReimbursementRequest.findFirst({ where: { financialEntryId: entryId, organizationId: updated.organizationId } });
  if (reimbursement) {
    const reimbursementStatus = status === "SETTLED" ? "PAID" : "APPROVED";
    if (reimbursement.status !== reimbursementStatus) {
      await tx.hubReimbursementRequest.update({ where: { id: reimbursement.id }, data: { status: reimbursementStatus, paidAt: reimbursementStatus === "PAID" ? new Date() : null } });
      if (reimbursementStatus === "PAID") await createHubNotifications(tx, [{ organizationId: updated.organizationId, recipientMemberId: reimbursement.requesterMemberId, actorMemberId, type: "REIMBURSEMENT_PAID", title: "Reembolso pago", body: "O pagamento do seu reembolso foi registrado.", href: "/hub/financeiro/reembolsos", entityType: "REIMBURSEMENT", entityId: reimbursement.id, idempotencyKey: `reimbursement:${reimbursement.id}:paid:${reimbursement.requesterMemberId}` }]);
      await writeHubAudit(tx, { organizationId: updated.organizationId, memberId: actorMemberId, action: reimbursementStatus === "PAID" ? "REIMBURSEMENT_PAID" : "REIMBURSEMENT_PAYMENT_REVERSED", entity: "HubReimbursementRequest", entityId: reimbursement.id, metadata: { financialEntryId: entryId } });
    }
  }
  return updated;
}

export async function recordSettlement(prisma: PrismaClient, actor: HubOperationalActor, entryId: string, input: SettlementInput) {
  assertPositiveCents(input.amountCents);
  const hash = requestHash(input);
  return serializable(prisma, async (tx) => {
    const duplicate = await tx.hubFinancialSettlement.findUnique({ where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey: input.idempotencyKey } } });
    if (duplicate) { assertMatchingRequestHash(duplicate.requestHash, hash); return duplicate; }
    const entry = await tx.hubFinancialEntry.findFirst({ where: { id: entryId, organizationId: actor.organizationId } });
    if (!entry) throw new HubApiError("Lancamento nao encontrado.", 404);
    if (!hubOperationalPolicy.canSettleFinancialEntry(actor, entry)) throw new HubApiError("Acesso negado.", 403);
    if (!(["APPROVED", "PARTIALLY_SETTLED"] as string[]).includes(entry.status)) throw new HubApiError("O lancamento nao pode ser liquidado.", 409);
    const installment = await tx.hubFinancialInstallment.findFirst({ where: { id: input.installmentId, entryId, organizationId: actor.organizationId } });
    if (!installment) throw new HubApiError("Parcela nao encontrada.", 404);
    const organization = await organizationCurrency(tx, actor.organizationId);
    await assertOpenPeriod(tx, actor.organizationId, input.settledAt, organization.timezone);
    const prior = await tx.hubFinancialSettlement.aggregate({ where: { installmentId: installment.id, reversedAt: null }, _sum: { amountCents: true } });
    if ((prior._sum.amountCents || 0) + input.amountCents > installment.amountCents) throw new HubApiError("A liquidacao excede o saldo da parcela.", 409);
    const settlement = await tx.hubFinancialSettlement.create({ data: { organizationId: actor.organizationId, entryId, installmentId: installment.id, amountCents: input.amountCents, settledAt: input.settledAt, method: input.method, reference: input.reference?.trim() || null, createdById: actor.id, idempotencyKey: input.idempotencyKey, requestHash: hash } });
    const paid = (prior._sum.amountCents || 0) + input.amountCents;
    await tx.hubFinancialInstallment.update({ where: { id: installment.id }, data: { status: paid === installment.amountCents ? "SETTLED" : "PARTIALLY_SETTLED" } });
    await refreshEntryStatus(tx, entryId, actor.id);
    await notifyHubPermissionRecipients(tx, { organizationId: actor.organizationId, actorMemberId: actor.id, excludeActor: true, permission: "finance:access", type: "FINANCIAL_SETTLEMENT_RECORDED", title: "Liquidacao registrada", body: "Uma liquidacao financeira foi registrada.", href: `/hub/financeiro/lancamentos/${entry.id}`, entityType: "FINANCIAL_SETTLEMENT", entityId: settlement.id, idempotencyKey: `financial-settlement:${settlement.id}:recorded` });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "FINANCIAL_SETTLEMENT_RECORDED", entity: "HubFinancialSettlement", entityId: settlement.id, metadata: { amountCents: settlement.amountCents, method: settlement.method } });
    return settlement;
  });
}

export async function reverseSettlement(prisma: PrismaClient, actor: HubOperationalActor, settlementId: string, reason: string) {
  if (!reason.trim()) throw new HubApiError("O motivo da reversao e obrigatorio.", 400);
  return serializable(prisma, async (tx) => {
    const settlement = await tx.hubFinancialSettlement.findFirst({ where: { id: settlementId, organizationId: actor.organizationId } });
    if (!settlement) throw new HubApiError("Liquidacao nao encontrada.", 404);
    if (settlement.reversedAt) return settlement;
    const entry = await tx.hubFinancialEntry.findUniqueOrThrow({ where: { id: settlement.entryId } });
    if (!hubOperationalPolicy.canSettleFinancialEntry(actor, entry)) throw new HubApiError("Acesso negado.", 403);
    const organization = await organizationCurrency(tx, actor.organizationId);
    await assertOpenPeriod(tx, actor.organizationId, new Date(), organization.timezone);
    const updated = await tx.hubFinancialSettlement.update({ where: { id: settlement.id }, data: { reversedAt: new Date(), reversedById: actor.id, reversalReason: reason.trim() } });
    const active = await tx.hubFinancialSettlement.aggregate({ where: { installmentId: settlement.installmentId, reversedAt: null }, _sum: { amountCents: true } });
    const installment = await tx.hubFinancialInstallment.findUniqueOrThrow({ where: { id: settlement.installmentId } });
    await tx.hubFinancialInstallment.update({ where: { id: installment.id }, data: { status: !active._sum.amountCents ? "OPEN" : active._sum.amountCents === installment.amountCents ? "SETTLED" : "PARTIALLY_SETTLED" } });
    await refreshEntryStatus(tx, entry.id, actor.id);
    await notifyHubPermissionRecipients(tx, { organizationId: actor.organizationId, actorMemberId: actor.id, excludeActor: true, permission: "finance:access", type: "FINANCIAL_SETTLEMENT_REVERSED", title: "Liquidacao revertida", body: "Uma liquidacao financeira foi revertida.", href: `/hub/financeiro/lancamentos/${entry.id}`, entityType: "FINANCIAL_SETTLEMENT", entityId: settlement.id, idempotencyKey: `financial-settlement:${settlement.id}:reversed` });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "FINANCIAL_SETTLEMENT_REVERSED", entity: "HubFinancialSettlement", entityId: settlement.id, metadata: { reason: reason.trim().slice(0, 160) } });
    return updated;
  });
}

export async function setFinancialPeriodStatus(prisma: PrismaClient, actor: HubOperationalActor, input: { year: number; month: number; status: "OPEN" | "CLOSED"; reason?: string }) {
  if (input.month < 1 || input.month > 12) throw new HubApiError("Mes invalido.", 400);
  if (input.status === "OPEN" && !input.reason?.trim()) throw new HubApiError("Informe o motivo da reabertura.", 400);
  return serializable(prisma, async (tx) => {
    if (!hubOperationalPolicy.canOperateFinancialPeriod(actor, { organizationId: actor.organizationId })) throw new HubApiError("Acesso negado.", 403);
    if (input.status === "CLOSED") {
      const organization = await organizationCurrency(tx, actor.organizationId);
      const start = organizationDayUtcRange(`${input.year}-${String(input.month).padStart(2, "0")}-01`, organization.timezone).startAt;
      const nextYear = input.month === 12 ? input.year + 1 : input.year; const nextMonth = input.month === 12 ? 1 : input.month + 1;
      const end = organizationDayUtcRange(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01`, organization.timezone).startAt;
      const inconsistent = await tx.hubFinancialEntry.count({ where: { organizationId: actor.organizationId, status: "PENDING_APPROVAL", competenceDate: { gte: start, lt: end } } });
      if (inconsistent) throw new HubApiError("Existem lancamentos pendentes no periodo.", 409);
    }
    const period = await tx.hubFinancialPeriod.upsert({ where: { organizationId_year_month: { organizationId: actor.organizationId, year: input.year, month: input.month } }, create: { organizationId: actor.organizationId, year: input.year, month: input.month, status: input.status, ...(input.status === "CLOSED" ? { closedAt: new Date(), closedById: actor.id } : { reopenedAt: new Date(), reopenedById: actor.id, reopenReason: input.reason!.trim() }) }, update: input.status === "CLOSED" ? { status: "CLOSED", closedAt: new Date(), closedById: actor.id, version: { increment: 1 } } : { status: "OPEN", reopenedAt: new Date(), reopenedById: actor.id, reopenReason: input.reason!.trim(), version: { increment: 1 } } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: input.status === "CLOSED" ? "FINANCIAL_PERIOD_CLOSED" : "FINANCIAL_PERIOD_REOPENED", entity: "HubFinancialPeriod", entityId: period.id, metadata: input.reason ? { reason: input.reason.trim().slice(0, 160) } : undefined });
    return period;
  });
}

export async function createBudget(prisma: PrismaClient, actor: HubOperationalActor, input: { name: string; year: number; lines: Array<{ categoryId: string; costCenterId?: string | null; month: number; plannedCents: number }> }) {
  if (!input.name.trim() || !Number.isInteger(input.year) || input.year < 2000 || input.year > 2200 || !input.lines.length) throw new HubApiError("Orcamento invalido.", 400);
  const keys = new Set<string>();
  for (const line of input.lines) { if (!Number.isInteger(line.plannedCents) || line.plannedCents < 0 || line.month < 1 || line.month > 12) throw new HubApiError("Linha orcamentaria invalida.", 400); const key = `${line.categoryId}:${line.costCenterId || "organization"}:${line.month}`; if (keys.has(key)) throw new HubApiError("Linha orcamentaria duplicada.", 409); keys.add(key); }
  return serializable(prisma, async (tx) => {
    if (!hubOperationalPolicy.canCreateBudget(actor, { organizationId: actor.organizationId })) throw new HubApiError("Acesso negado.", 403);
    for (const line of input.lines) { await assertReference(tx, "category", line.categoryId, actor.organizationId); await assertReference(tx, "costCenter", line.costCenterId, actor.organizationId); }
    const latest = await tx.hubBudget.findFirst({ where: { organizationId: actor.organizationId, year: input.year, name: input.name.trim() }, orderBy: { revision: "desc" }, select: { revision: true } });
    const budget = await tx.hubBudget.create({ data: { organizationId: actor.organizationId, name: input.name.trim(), year: input.year, revision: (latest?.revision || 0) + 1, createdById: actor.id } });
    await tx.hubBudgetLine.createMany({ data: input.lines.map((line) => ({ organizationId: actor.organizationId, budgetId: budget.id, categoryId: line.categoryId, costCenterId: line.costCenterId || null, month: line.month, plannedCents: line.plannedCents })) });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "BUDGET_CREATED", entity: "HubBudget", entityId: budget.id, metadata: { year: budget.year, revision: budget.revision, lineCount: input.lines.length } });
    return budget;
  });
}

export async function setBudgetStatus(prisma: PrismaClient, actor: HubOperationalActor, budgetId: string, status: "APPROVED" | "ARCHIVED") {
  return serializable(prisma, async (tx) => {
    const budget = await tx.hubBudget.findFirst({ where: { id: budgetId, organizationId: actor.organizationId } });
    if (!budget) throw new HubApiError("Orcamento nao encontrado.", 404);
    if (!hubOperationalPolicy.canCreateBudget(actor, budget)) throw new HubApiError("Acesso negado.", 403);
    if (status === "APPROVED" && budget.status !== "DRAFT") throw new HubApiError("Somente rascunhos podem ser aprovados.", 409);
    if (status === "ARCHIVED" && budget.status === "ARCHIVED") return budget;
    const updated = await tx.hubBudget.update({ where: { id: budget.id }, data: status === "APPROVED" ? { status, approvedAt: new Date(), approvedById: actor.id } : { status, archivedAt: new Date(), archivedById: actor.id } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: status === "APPROVED" ? "BUDGET_APPROVED" : "BUDGET_ARCHIVED", entity: "HubBudget", entityId: budget.id });
    return updated;
  });
}

export async function getBudgetReport(prisma: PrismaClient, actor: HubOperationalActor, budgetId: string) {
  const budget = await prisma.hubBudget.findFirst({ where: { id: budgetId, organizationId: actor.organizationId } });
  if (!budget) throw new HubApiError("Orcamento nao encontrado.", 404);
  const directorRead = actor.role === "DIRECTOR" && Boolean(actor.directorateId) && budget.status === "APPROVED";
  if (!hubOperationalPolicy.canAccessBudget(actor, budget) && !directorRead) throw new HubApiError("Acesso negado.", 403);
  const organization = await prisma.hubOrganization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
  const permittedCostCenters = directorRead ? await prisma.hubCostCenter.findMany({ where: { organizationId: actor.organizationId, directorateId: actor.directorateId }, select: { id: true } }) : [];
  const lines = await prisma.hubBudgetLine.findMany({ where: { budgetId: budget.id, organizationId: actor.organizationId, ...(directorRead ? { costCenterId: { in: permittedCostCenters.map((item) => item.id) } } : {}) }, orderBy: [{ month: "asc" }, { categoryId: "asc" }] });
  const entries = await prisma.hubFinancialEntry.findMany({ where: { organizationId: actor.organizationId, categoryId: { in: [...new Set(lines.map((line) => line.categoryId))] }, status: { in: ["PARTIALLY_SETTLED", "SETTLED"] } }, select: { id: true, categoryId: true, costCenterId: true, direction: true } });
  const settlements = entries.length ? await prisma.hubFinancialSettlement.findMany({ where: { organizationId: actor.organizationId, entryId: { in: entries.map((entry) => entry.id) } }, select: { entryId: true, amountCents: true, settledAt: true, reversedAt: true } }) : [];
  const entryById = new Map(entries.map((entry) => [entry.id, entry])); const actual = new Map<string, number>();
  for (const settlement of settlements) { const entry = entryById.get(settlement.entryId)!; for (const movement of [{ date: settlement.settledAt, amount: settlement.amountCents }, ...(settlement.reversedAt ? [{ date: settlement.reversedAt, amount: -settlement.amountCents }] : [])]) { const period = localPeriod(movement.date, organization.timezone); if (period.year !== budget.year) continue; const key = `${entry.categoryId}:${entry.costCenterId || "organization"}:${period.month}`; const signed = entry.direction === "PAYABLE" ? movement.amount : -movement.amount; actual.set(key, (actual.get(key) || 0) + signed); } }
  return { budget, lines: lines.map((line) => { const actualCents = actual.get(`${line.categoryId}:${line.costCenterId || "organization"}:${line.month}`) || 0; return { ...line, actualCents, varianceCents: line.plannedCents - actualCents }; }) };
}

export async function createReimbursement(prisma: PrismaClient, actor: HubOperationalActor, input: { description: string; costCenterId?: string | null; items: Array<{ description: string; expenseDate: Date; amountCents: number; categoryId: string; receiptReference?: string | null }>; idempotencyKey: string }) {
  if (!input.items.length) throw new HubApiError("Inclua ao menos um item.", 400);
  if (new Set(input.items.map((item) => item.categoryId)).size > 1) throw new HubApiError("Todos os itens do reembolso devem usar a mesma categoria.", 400);
  for (const item of input.items) { assertPositiveCents(item.amountCents); if (item.receiptReference?.startsWith("http")) assertSafeHttpsUrl(item.receiptReference); }
  const totalCents = input.items.reduce((sum, item) => sum + item.amountCents, 0); const hash = requestHash(input);
  return serializable(prisma, async (tx) => {
    const duplicate = await tx.hubReimbursementRequest.findUnique({ where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey: input.idempotencyKey } } });
    if (duplicate) { assertMatchingRequestHash(duplicate.requestHash, hash); return duplicate; }
    const organization = await organizationCurrency(tx, actor.organizationId); await assertReference(tx, "costCenter", input.costCenterId, actor.organizationId);
    for (const item of input.items) await assertReference(tx, "category", item.categoryId, actor.organizationId);
    await assertOpenFinancialDates(tx, actor.organizationId, organization.timezone, input.items.map((item) => item.expenseDate));
    const request = await tx.hubReimbursementRequest.create({ data: { organizationId: actor.organizationId, requesterMemberId: actor.id, description: input.description.trim(), totalCents, currency: organization.currency, costCenterId: input.costCenterId || null, idempotencyKey: input.idempotencyKey, requestHash: hash } });
    await tx.hubReimbursementItem.createMany({ data: input.items.map((item) => ({ organizationId: actor.organizationId, requestId: request.id, description: item.description.trim(), expenseDate: item.expenseDate, amountCents: item.amountCents, categoryId: item.categoryId, receiptReference: item.receiptReference?.trim() || null })) });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "REIMBURSEMENT_CREATED", entity: "HubReimbursementRequest", entityId: request.id, metadata: { totalCents, itemCount: input.items.length } });
    return request;
  });
}

export async function updateDraftReimbursement(prisma: PrismaClient, actor: HubOperationalActor, requestId: string, input: { description: string; costCenterId?: string | null; items: Array<{ description: string; expenseDate: Date; amountCents: number; categoryId: string; receiptReference?: string | null }> }) {
  if (!input.description.trim() || !input.items.length) throw new HubApiError("Descricao e itens sao obrigatorios.", 400);
  if (new Set(input.items.map((item) => item.categoryId)).size > 1) throw new HubApiError("Todos os itens do reembolso devem usar a mesma categoria.", 400);
  for (const item of input.items) { assertPositiveCents(item.amountCents); if (item.receiptReference?.startsWith("http")) assertSafeHttpsUrl(item.receiptReference); }
  const totalCents = input.items.reduce((sum, item) => sum + item.amountCents, 0);
  return serializable(prisma, async (tx) => {
    const request = await tx.hubReimbursementRequest.findFirst({ where: { id: requestId, organizationId: actor.organizationId } });
    if (!request) throw new HubApiError("Reembolso nao encontrado.", 404);
    if (request.requesterMemberId !== actor.id) throw new HubApiError("Acesso negado.", 403);
    if (request.status !== "DRAFT") throw new HubApiError("Somente rascunhos podem ser editados.", 409);
    const organization = await organizationCurrency(tx, actor.organizationId);
    await assertReference(tx, "costCenter", input.costCenterId, actor.organizationId); for (const item of input.items) await assertReference(tx, "category", item.categoryId, actor.organizationId);
    await assertOpenFinancialDates(tx, actor.organizationId, organization.timezone, input.items.map((item) => item.expenseDate));
    await tx.hubReimbursementItem.deleteMany({ where: { requestId: request.id, organizationId: actor.organizationId } });
    await tx.hubReimbursementItem.createMany({ data: input.items.map((item) => ({ organizationId: actor.organizationId, requestId: request.id, description: item.description.trim(), expenseDate: item.expenseDate, amountCents: item.amountCents, categoryId: item.categoryId, receiptReference: item.receiptReference?.trim() || null })) });
    const updated = await tx.hubReimbursementRequest.update({ where: { id: request.id }, data: { description: input.description.trim(), costCenterId: input.costCenterId || null, totalCents, requestHash: requestHash(input) } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "REIMBURSEMENT_DRAFT_UPDATED", entity: "HubReimbursementRequest", entityId: request.id, metadata: { totalCents, itemCount: input.items.length } });
    return updated;
  });
}

export async function cancelReimbursement(prisma: PrismaClient, actor: HubOperationalActor, requestId: string) {
  return serializable(prisma, async (tx) => {
    const request = await tx.hubReimbursementRequest.findFirst({ where: { id: requestId, organizationId: actor.organizationId } });
    if (!request) throw new HubApiError("Reembolso nao encontrado.", 404);
    if (request.requesterMemberId !== actor.id) throw new HubApiError("Acesso negado.", 403);
    if (!["DRAFT", "SUBMITTED"].includes(request.status)) throw new HubApiError("O reembolso nao pode ser cancelado.", 409);
    const updated = await tx.hubReimbursementRequest.update({ where: { id: request.id }, data: { status: "CANCELLED" } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "REIMBURSEMENT_CANCELLED", entity: "HubReimbursementRequest", entityId: request.id });
    return updated;
  });
}

export async function submitReimbursement(prisma: PrismaClient, actor: HubOperationalActor, requestId: string) {
  return serializable(prisma, async (tx) => {
    const request = await tx.hubReimbursementRequest.findFirst({ where: { id: requestId, organizationId: actor.organizationId } });
    if (!request) throw new HubApiError("Reembolso nao encontrado.", 404);
    if (request.requesterMemberId !== actor.id) throw new HubApiError("Acesso negado.", 403);
    if (request.status !== "DRAFT") throw new HubApiError("Somente rascunhos podem ser enviados.", 409);
    const updated = await tx.hubReimbursementRequest.update({ where: { id: request.id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
    await notifyHubPermissionRecipients(tx, { organizationId: actor.organizationId, actorMemberId: actor.id, excludeActor: true, permission: "finance:review", type: "REIMBURSEMENT_SUBMITTED", title: "Reembolso aguardando revisao", body: "Uma solicitacao de reembolso aguarda revisao.", href: "/hub/financeiro/reembolsos", entityType: "REIMBURSEMENT", entityId: request.id, idempotencyKey: `reimbursement:${request.id}:submitted` });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "REIMBURSEMENT_SUBMITTED", entity: "HubReimbursementRequest", entityId: request.id, metadata: { totalCents: request.totalCents, currency: request.currency } }); return updated;
  });
}

export async function reviewReimbursement(prisma: PrismaClient, actor: HubOperationalActor, requestId: string, input: { decision: "APPROVE" | "REJECT"; rejectionReason?: string }) {
  return serializable(prisma, async (tx) => {
    const request = await tx.hubReimbursementRequest.findFirst({ where: { id: requestId, organizationId: actor.organizationId } });
    if (!request) throw new HubApiError("Reembolso nao encontrado.", 404);
    if (!hubOperationalPolicy.canReviewReimbursement(actor, request)) throw new HubApiError("Auto-revisao nao e permitida.", 403);
    if (request.status !== "SUBMITTED") throw new HubApiError("O reembolso nao esta pendente.", 409);
    if (input.decision === "REJECT") { if (!input.rejectionReason?.trim()) throw new HubApiError("Informe o motivo da rejeicao.", 400); const rejected = await tx.hubReimbursementRequest.update({ where: { id: request.id }, data: { status: "REJECTED", reviewedAt: new Date(), reviewedById: actor.id, rejectionReason: input.rejectionReason.trim() } }); await createHubNotifications(tx, [{ organizationId: actor.organizationId, recipientMemberId: request.requesterMemberId, actorMemberId: actor.id, type: "REIMBURSEMENT_REJECTED", title: "Reembolso rejeitado", body: "Seu reembolso foi rejeitado. Consulte os detalhes.", href: "/hub/financeiro/reembolsos", entityType: "REIMBURSEMENT", entityId: request.id, idempotencyKey: `reimbursement:${request.id}:rejected:${request.requesterMemberId}` }]); await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "REIMBURSEMENT_REJECTED", entity: "HubReimbursementRequest", entityId: request.id }); return rejected; }
    const items = await tx.hubReimbursementItem.findMany({ where: { requestId: request.id, organizationId: actor.organizationId }, orderBy: { createdAt: "asc" } });
    if (!items.length || items.reduce((sum, item) => sum + item.amountCents, 0) !== request.totalCents) throw new HubApiError("Os itens nao reconciliam com o total.", 409);
    if (new Set(items.map((item) => item.categoryId)).size > 1) throw new HubApiError("Itens de categorias diferentes exigem alocacoes explicitas.", 409);
    const organization = await organizationCurrency(tx, actor.organizationId);
    const now = new Date();
    await assertOpenFinancialDates(tx, actor.organizationId, organization.timezone, [now, ...items.map((item) => item.expenseDate)]);
    const entry = await tx.hubFinancialEntry.create({ data: { organizationId: actor.organizationId, direction: "PAYABLE", status: "APPROVED", description: `Reembolso aprovado`, categoryId: items[0].categoryId, costCenterId: request.costCenterId, issueDate: now, competenceDate: now, totalCents: request.totalCents, currency: request.currency, createdById: actor.id, submittedAt: now, submittedById: request.requesterMemberId, approvedAt: now, approvedById: actor.id, idempotencyKey: `reimbursement:${request.id}`, requestHash: requestHash({ reimbursementId: request.id, totalCents: request.totalCents }) } });
    await tx.hubFinancialInstallment.create({ data: { organizationId: actor.organizationId, entryId: entry.id, number: 1, amountCents: request.totalCents, dueDate: now } });
    const approved = await tx.hubReimbursementRequest.update({ where: { id: request.id }, data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: actor.id, financialEntryId: entry.id } });
    await createHubNotifications(tx, [{ organizationId: actor.organizationId, recipientMemberId: request.requesterMemberId, actorMemberId: actor.id, type: "REIMBURSEMENT_APPROVED", title: "Reembolso aprovado", body: "Seu reembolso foi aprovado e segue para pagamento.", href: "/hub/financeiro/reembolsos", entityType: "REIMBURSEMENT", entityId: request.id, idempotencyKey: `reimbursement:${request.id}:approved:${request.requesterMemberId}` }]);
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "REIMBURSEMENT_APPROVED", entity: "HubReimbursementRequest", entityId: request.id, metadata: { financialEntryId: entry.id, totalCents: request.totalCents } }); return approved;
  });
}

export async function assignOnboarding(prisma: PrismaClient, actor: HubOperationalActor, input: { templateId: string; memberId: string }) {
  return serializable(prisma, async (tx) => {
    const [template, member] = await Promise.all([tx.hubOnboardingTemplate.findFirst({ where: { id: input.templateId, organizationId: actor.organizationId, isActive: true } }), tx.hubMember.findFirst({ where: { id: input.memberId, organizationId: actor.organizationId }, select: { id: true, status: true, directorateId: true } })]);
    if (!template || !member) throw new HubApiError("Modelo ou membro nao encontrado.", 404);
    if (member.status !== "ACTIVE" && member.status !== "INVITED") throw new HubApiError("Membro desligado nao pode receber novas atribuicoes.", 409);
    if (!hubOperationalPolicy.canManageDirectorate(actor, { organizationId: actor.organizationId, directorateId: member.directorateId })) throw new HubApiError("Acesso negado.", 403);
    const items = await tx.hubOnboardingTemplateItem.findMany({ where: { templateId: template.id, organizationId: actor.organizationId }, orderBy: { order: "asc" } }); const now = new Date();
    const assignment = await tx.hubOnboardingAssignment.create({ data: { organizationId: actor.organizationId, templateId: template.id, memberId: member.id, assignedById: actor.id } });
    await tx.hubOnboardingAssignmentItem.createMany({ data: items.map((item) => ({ organizationId: actor.organizationId, assignmentId: assignment.id, templateItemId: item.id, ownerMemberId: member.id, title: item.title, description: item.description, dueDate: item.dueAfterDays == null ? null : new Date(now.getTime() + item.dueAfterDays * 86400000) })) });
    await createHubNotifications(tx, [{ organizationId: actor.organizationId, recipientMemberId: member.id, actorMemberId: actor.id, type: "ONBOARDING_ASSIGNED", title: "Onboarding atribuido", body: "Voce recebeu novos itens de onboarding.", href: "/hub/pessoas", entityType: "ONBOARDING_ASSIGNMENT", entityId: assignment.id, idempotencyKey: `onboarding:${assignment.id}:${member.id}` }]);
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "ONBOARDING_ASSIGNED", entity: "HubOnboardingAssignment", entityId: assignment.id, metadata: { memberId: member.id, itemCount: items.length } }); return assignment;
  });
}

export async function createOnboardingTemplate(prisma: PrismaClient, actor: HubOperationalActor, input: { name: string; directorateId?: string | null; items: Array<{ title: string; description?: string | null; dueAfterDays?: number | null }> }) {
  if (!input.name.trim() || !input.items.length || input.items.some((item) => !item.title.trim())) throw new HubApiError("Nome e itens de onboarding sao obrigatorios.", 400);
  return serializable(prisma, async (tx) => {
    const scope = { organizationId: actor.organizationId, directorateId: input.directorateId || null };
    if (!hubOperationalPolicy.canManageDirectorate(actor, scope)) throw new HubApiError("Acesso negado.", 403);
    if (input.directorateId && !await tx.hubDirectorate.count({ where: { id: input.directorateId, organizationId: actor.organizationId, isActive: true } })) throw new HubApiError("Diretoria nao encontrada.", 404);
    const template = await tx.hubOnboardingTemplate.create({ data: { organizationId: actor.organizationId, directorateId: input.directorateId || null, name: input.name.trim(), createdById: actor.id } });
    await tx.hubOnboardingTemplateItem.createMany({ data: input.items.map((item, index) => ({ organizationId: actor.organizationId, templateId: template.id, title: item.title.trim(), description: item.description?.trim() || null, order: index + 1, dueAfterDays: item.dueAfterDays == null ? null : Math.max(0, Math.trunc(item.dueAfterDays)) })) });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "ONBOARDING_TEMPLATE_CREATED", entity: "HubOnboardingTemplate", entityId: template.id, metadata: { directorateId: template.directorateId, itemCount: input.items.length } });
    return template;
  });
}

export async function updateOnboardingTemplate(prisma: PrismaClient, actor: HubOperationalActor, templateId: string, input: { name?: string; isActive?: boolean }) {
  return serializable(prisma, async (tx) => {
    const template = await tx.hubOnboardingTemplate.findFirst({ where: { id: templateId, organizationId: actor.organizationId } });
    if (!template) throw new HubApiError("Modelo de onboarding nao encontrado.", 404);
    if (!hubOperationalPolicy.canManageDirectorate(actor, template)) throw new HubApiError("Acesso negado.", 403);
    const updated = await tx.hubOnboardingTemplate.update({ where: { id: template.id }, data: { ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "ONBOARDING_TEMPLATE_UPDATED", entity: "HubOnboardingTemplate", entityId: template.id, metadata: { isActive: updated.isActive } });
    return updated;
  });
}

export async function updateOwnProfile(prisma: PrismaClient, actor: HubOperationalActor, input: { phone?: string | null; university?: string | null; course?: string | null; semester?: string | null; linkedinUrl?: string | null; bio?: string | null }) {
  const linkedinUrl = input.linkedinUrl ? assertSafeHttpsUrl(input.linkedinUrl) : null;
  return serializable(prisma, async (tx) => {
    const profile = await tx.hubMemberProfile.upsert({ where: { memberId: actor.id }, create: { organizationId: actor.organizationId, memberId: actor.id, phone: input.phone?.trim() || null, university: input.university?.trim() || null, course: input.course?.trim() || null, semester: input.semester?.trim() || null, linkedinUrl, bio: input.bio?.trim().slice(0, 1000) || null }, update: { phone: input.phone?.trim() || null, university: input.university?.trim() || null, course: input.course?.trim() || null, semester: input.semester?.trim() || null, linkedinUrl, bio: input.bio?.trim().slice(0, 1000) || null } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "MEMBER_PROFILE_SELF_UPDATED", entity: "HubMemberProfile", entityId: profile.id, metadata: { fields: Object.keys(input) } });
    return profile;
  });
}

export async function updateDevelopmentGoal(prisma: PrismaClient, actor: HubOperationalActor, goalId: string, input: { version: number; progress: number; status?: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED" }) {
  if (!Number.isInteger(input.progress) || input.progress < 0 || input.progress > 100) throw new HubApiError("Progresso deve estar entre 0 e 100.", 400);
  return serializable(prisma, async (tx) => {
    const goal = await tx.hubDevelopmentGoal.findFirst({ where: { id: goalId, organizationId: actor.organizationId } });
    if (!goal) throw new HubApiError("Meta nao encontrada.", 404);
    const owner = await tx.hubMember.findFirst({ where: { id: goal.ownerMemberId, organizationId: actor.organizationId }, select: { organizationId: true, directorateId: true } });
    if (!owner) throw new HubApiError("Membro nao encontrado.", 404);
    if (goal.ownerMemberId !== actor.id && goal.managerMemberId !== actor.id && !hubOperationalPolicy.canManageDirectorate(actor, owner)) throw new HubApiError("Acesso negado.", 403);
    const nextStatus = input.status || goal.status;
    const result = await tx.hubDevelopmentGoal.updateMany({ where: { id: goal.id, version: input.version }, data: { progress: input.progress, status: nextStatus, completedAt: nextStatus === "COMPLETED" ? (goal.completedAt || new Date()) : goal.status === "COMPLETED" ? null : goal.completedAt, version: { increment: 1 } } });
    if (!result.count) throw new HubApiError("A meta foi alterada por outra pessoa.", 409, { code: "STALE_VERSION" });
    if (goal.ownerMemberId !== actor.id) await createHubNotifications(tx, [{ organizationId: actor.organizationId, recipientMemberId: goal.ownerMemberId, actorMemberId: actor.id, type: "DEVELOPMENT_GOAL_UPDATED", title: "Meta de desenvolvimento atualizada", body: "Uma meta do seu plano de desenvolvimento foi atualizada.", href: "/hub/desenvolvimento", entityType: "DEVELOPMENT_GOAL", entityId: goal.id, idempotencyKey: `development-goal:${goal.id}:version:${input.version + 1}` }]);
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "DEVELOPMENT_GOAL_UPDATED", entity: "HubDevelopmentGoal", entityId: goal.id, metadata: { progress: input.progress, status: input.status } });
    return tx.hubDevelopmentGoal.findUniqueOrThrow({ where: { id: goal.id } });
  });
}

export async function submitEvaluation(prisma: PrismaClient, actor: HubOperationalActor, evaluationId: string, input: { version: number; responses: Array<{ criterionId: string; score: number; comment?: string }> }) {
  return serializable(prisma, async (tx) => {
    const evaluation = await tx.hubEvaluation.findFirst({ where: { id: evaluationId, organizationId: actor.organizationId } });
    if (!evaluation) throw new HubApiError("Avaliacao nao encontrada.", 404);
    if (evaluation.evaluatorMemberId !== actor.id) throw new HubApiError("Acesso negado.", 403);
    if (evaluation.status !== "PENDING") throw new HubApiError("A avaliacao ja foi enviada.", 409);
    const cycle = await tx.hubPeopleCycle.findFirst({ where: { id: evaluation.cycleId, organizationId: actor.organizationId } });
    if (!cycle || cycle.status !== "ACTIVE") throw new HubApiError("O ciclo esta fechado.", 409);
    const criteria = await tx.hubEvaluationCriterion.findMany({ where: { cycleId: cycle.id, organizationId: actor.organizationId } });
    if (criteria.length !== input.responses.length) throw new HubApiError("Responda todos os criterios.", 400);
    const byId = new Map(criteria.map((item) => [item.id, item]));
    for (const response of input.responses) { const criterion = byId.get(response.criterionId); if (!criterion || response.score < criterion.scaleMin || response.score > criterion.scaleMax) throw new HubApiError("Resposta de avaliacao invalida.", 400); }
    const changed = await tx.hubEvaluation.updateMany({ where: { id: evaluation.id, status: "PENDING", version: input.version }, data: { status: "SUBMITTED", submittedAt: new Date(), version: { increment: 1 } } });
    if (!changed.count) throw new HubApiError("A avaliacao ja foi enviada ou foi alterada.", 409);
    await tx.hubEvaluationResponse.createMany({ data: input.responses.map((item) => ({ organizationId: actor.organizationId, evaluationId: evaluation.id, criterionId: item.criterionId, score: item.score, comment: item.comment?.trim() || null })) });
    if (evaluation.evaluatedMemberId !== actor.id) await createHubNotifications(tx, [{ organizationId: actor.organizationId, recipientMemberId: evaluation.evaluatedMemberId, actorMemberId: actor.id, type: "EVALUATION_COMPLETED", title: "Avaliacao concluida", body: "Uma avaliacao atribuida foi concluida.", href: "/hub/avaliacoes", entityType: "EVALUATION", entityId: evaluation.id, idempotencyKey: `evaluation:${evaluation.id}:completed` }]);
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "EVALUATION_COMPLETED", entity: "HubEvaluation", entityId: evaluation.id });
    return tx.hubEvaluation.findUniqueOrThrow({ where: { id: evaluation.id } });
  });
}

export async function moveCandidateStage(prisma: PrismaClient, actor: HubOperationalActor, candidateId: string, input: { toStageId: string; expectedVersion: number; idempotencyKey: string; reason?: string }) {
  const hash = requestHash(input);
  return serializable(prisma, async (tx) => {
    const duplicate = await tx.hubCandidateStageEvent.findUnique({ where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey: input.idempotencyKey } } });
    if (duplicate) { assertMatchingRequestHash(duplicate.requestHash, hash); return duplicate; }
    if (!hubOperationalPolicy.canAccessRecruitment(actor, { organizationId: actor.organizationId })) throw new HubApiError("Acesso negado.", 403);
    const candidate = await tx.hubCandidate.findFirst({ where: { id: candidateId, organizationId: actor.organizationId } });
    const stage = await tx.hubRecruitmentStage.findFirst({ where: { id: input.toStageId, organizationId: actor.organizationId, processId: candidate?.processId } });
    if (!candidate || !stage) throw new HubApiError("Candidato ou etapa nao encontrado.", 404);
    const process = await tx.hubRecruitmentProcess.findFirst({ where: { id: candidate.processId, organizationId: actor.organizationId, status: "OPEN" }, select: { id: true } });
    if (!process || candidate.status !== "ACTIVE") throw new HubApiError("O candidato nao pode mais mudar de etapa.", 409);
    const changed = await tx.hubCandidate.updateMany({ where: { id: candidate.id, version: input.expectedVersion, status: "ACTIVE" }, data: { currentStageId: stage.id, version: { increment: 1 } } });
    if (!changed.count) throw new HubApiError("O candidato foi alterado por outra pessoa.", 409);
    const event = await tx.hubCandidateStageEvent.create({ data: { organizationId: actor.organizationId, candidateId: candidate.id, fromStageId: candidate.currentStageId, toStageId: stage.id, movedById: actor.id, reason: input.reason?.trim() || null, idempotencyKey: input.idempotencyKey, requestHash: hash } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "CANDIDATE_STAGE_MOVED", entity: "HubCandidate", entityId: candidate.id, metadata: { fromStageId: candidate.currentStageId, toStageId: stage.id } });
    return event;
  });
}

const SELF_PROFILE_SELECT = {
  id: true, memberId: true, phone: true, birthDate: true, university: true, course: true,
  semester: true, linkedinUrl: true, bio: true, visibility: true, joinedAt: true, employmentType: true,
} satisfies Prisma.HubMemberProfileSelect;

const SENSITIVE_PROFILE_SELECT = {
  ...SELF_PROFILE_SELECT, leftAt: true, emergencyContactName: true, emergencyContactPhone: true,
} satisfies Prisma.HubMemberProfileSelect;

async function managedMember(tx: Tx, actor: HubOperationalActor, memberId: string, allowSelf = false) {
  const member = await tx.hubMember.findFirst({
    where: { id: memberId, organizationId: actor.organizationId, status: { not: "DELETED" } },
    select: { id: true, organizationId: true, directorateId: true, status: true, role: true, name: true, normalizedEmail: true },
  });
  if (!member) throw new HubApiError("Membro nao encontrado.", 404);
  if (!(allowSelf && actor.id === member.id) && !hubOperationalPolicy.canManageDirectorate(actor, member)) throw new HubApiError("Acesso negado.", 403);
  return member;
}

export async function getMemberProfile(prisma: PrismaClient, actor: HubOperationalActor, memberId: string) {
  const member = await prisma.hubMember.findFirst({ where: { id: memberId, organizationId: actor.organizationId, status: { not: "DELETED" } }, select: { id: true, organizationId: true, directorateId: true, name: true, role: true, status: true } });
  if (!member) throw new HubApiError("Membro nao encontrado.", 404);
  if (!hubOperationalPolicy.canAccessMemberProfile(actor, { ...member, memberId: member.id })) throw new HubApiError("Acesso negado.", 403);
  const sensitive = hubOperationalPolicy.canReadSensitivePeopleData(actor, member);
  const profile = await prisma.hubMemberProfile.findFirst({ where: { memberId, organizationId: actor.organizationId }, select: sensitive ? SENSITIVE_PROFILE_SELECT : SELF_PROFILE_SELECT });
  return { member, profile, sensitiveFieldsVisible: sensitive };
}

export async function updateManagedProfile(prisma: PrismaClient, actor: HubOperationalActor, memberId: string, input: { joinedAt?: Date | null; leftAt?: Date | null; employmentType?: string | null; emergencyContactName?: string | null; emergencyContactPhone?: string | null; birthDate?: Date | null; visibility?: "PRIVATE" | "ORGANIZATION" }) {
  return serializable(prisma, async (tx) => {
    await managedMember(tx, actor, memberId);
    if (!hubOperationalPolicy.canReadSensitivePeopleData(actor, { organizationId: actor.organizationId })) throw new HubApiError("Acesso negado.", 403);
    const profile = await tx.hubMemberProfile.upsert({ where: { memberId }, create: { organizationId: actor.organizationId, memberId, ...input }, update: input, select: SENSITIVE_PROFILE_SELECT });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "MEMBER_PROFILE_SENSITIVE_UPDATED", entity: "HubMemberProfile", entityId: profile.id, metadata: { fields: Object.keys(input) } });
    return profile;
  });
}

export async function completeOnboardingItem(prisma: PrismaClient, actor: HubOperationalActor, itemId: string, expectedVersion: number) {
  return serializable(prisma, async (tx) => {
    const item = await tx.hubOnboardingAssignmentItem.findFirst({ where: { id: itemId, organizationId: actor.organizationId } });
    if (!item) throw new HubApiError("Item de onboarding nao encontrado.", 404);
    const assignment = await tx.hubOnboardingAssignment.findFirst({ where: { id: item.assignmentId, organizationId: actor.organizationId } });
    if (!assignment) throw new HubApiError("Onboarding nao encontrado.", 404);
    const target = await tx.hubMember.findFirst({ where: { id: assignment.memberId, organizationId: actor.organizationId }, select: { id: true, organizationId: true, directorateId: true } });
    if (!target) throw new HubApiError("Membro nao encontrado.", 404);
    if (actor.id !== item.ownerMemberId && actor.id !== assignment.memberId && !hubOperationalPolicy.canManageDirectorate(actor, target)) throw new HubApiError("Acesso negado.", 403);
    const changed = await tx.hubOnboardingAssignmentItem.updateMany({ where: { id: item.id, organizationId: actor.organizationId, version: expectedVersion, completedAt: null }, data: { completedAt: new Date(), completedById: actor.id, version: { increment: 1 } } });
    if (changed.count !== 1) throw new HubApiError("O item ja foi alterado. Atualize e tente novamente.", 409);
    const updated = await tx.hubOnboardingAssignmentItem.findUniqueOrThrow({ where: { id: item.id } });
    if (!await tx.hubOnboardingAssignmentItem.count({ where: { assignmentId: assignment.id, completedAt: null } })) await tx.hubOnboardingAssignment.update({ where: { id: assignment.id }, data: { completedAt: new Date() } });
    await createHubNotifications(tx, [{ organizationId: actor.organizationId, recipientMemberId: assignment.memberId, actorMemberId: actor.id, type: "ONBOARDING_ITEM_COMPLETED", title: "Item de onboarding concluido", body: "Um item do seu onboarding foi concluido.", href: "/hub/pessoas", entityType: "ONBOARDING_ITEM", entityId: item.id, idempotencyKey: `onboarding-item:${item.id}:completed` }]);
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "ONBOARDING_ITEM_COMPLETED", entity: "HubOnboardingAssignmentItem", entityId: item.id });
    return updated;
  });
}

export async function createCompetency(prisma: PrismaClient, actor: HubOperationalActor, input: { name: string; description?: string | null; category?: string | null }) {
  if (!input.name.trim()) throw new HubApiError("Nome e obrigatorio.", 400);
  return serializable(prisma, async (tx) => {
    if (!hasPeopleManagement(actor)) throw new HubApiError("Acesso negado.", 403);
    const competency = await tx.hubCompetency.create({ data: { organizationId: actor.organizationId, name: input.name.trim(), normalizedName: input.name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(), description: input.description?.trim() || null, category: input.category?.trim() || null } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "COMPETENCY_CREATED", entity: "HubCompetency", entityId: competency.id });
    return competency;
  });
}

function hasPeopleManagement(actor: HubOperationalActor) { return hasHubPermission(actor.role, "people:manage"); }

export async function assessCompetency(prisma: PrismaClient, actor: HubOperationalActor, input: { memberId: string; competencyId: string; level: number }) {
  if (!Number.isInteger(input.level) || input.level < 1 || input.level > 5) throw new HubApiError("O nivel deve estar entre 1 e 5.", 400);
  return serializable(prisma, async (tx) => {
    await managedMember(tx, actor, input.memberId);
    const competency = await tx.hubCompetency.findFirst({ where: { id: input.competencyId, organizationId: actor.organizationId, isActive: true }, select: { id: true } });
    if (!competency) throw new HubApiError("Competencia nao encontrada.", 404);
    const assessment = await tx.hubMemberCompetency.upsert({ where: { memberId_competencyId: { memberId: input.memberId, competencyId: input.competencyId } }, create: { organizationId: actor.organizationId, memberId: input.memberId, competencyId: input.competencyId, level: input.level, assessedById: actor.id }, update: { level: input.level, assessedAt: new Date(), assessedById: actor.id } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "MEMBER_COMPETENCY_ASSESSED", entity: "HubMemberCompetency", entityId: assessment.id, metadata: { level: input.level } });
    return assessment;
  });
}

export async function createDevelopmentGoal(prisma: PrismaClient, actor: HubOperationalActor, input: { ownerMemberId: string; title: string; description?: string | null; managerMemberId?: string | null; dueDate?: Date | null }) {
  if (!input.title.trim()) throw new HubApiError("Titulo e obrigatorio.", 400);
  return serializable(prisma, async (tx) => {
    const owner = await managedMember(tx, actor, input.ownerMemberId, true);
    if (actor.id === owner.id && !hasHubPermission(actor.role, "people:manage-own-profile")) throw new HubApiError("Acesso negado.", 403);
    if (input.managerMemberId) await managedMember(tx, actor, input.managerMemberId, true);
    let plan = await tx.hubDevelopmentPlan.findFirst({ where: { organizationId: actor.organizationId, memberId: owner.id, isActive: true }, orderBy: { createdAt: "desc" } });
    if (!plan) plan = await tx.hubDevelopmentPlan.create({ data: { organizationId: actor.organizationId, memberId: owner.id, title: `Plano de desenvolvimento de ${owner.name}`, createdById: actor.id } });
    const goal = await tx.hubDevelopmentGoal.create({ data: { organizationId: actor.organizationId, planId: plan.id, ownerMemberId: owner.id, managerMemberId: input.managerMemberId || null, title: input.title.trim(), description: input.description?.trim() || null, dueDate: input.dueDate || null, status: "ACTIVE" } });
    await createHubNotifications(tx, [{ organizationId: actor.organizationId, recipientMemberId: owner.id, actorMemberId: actor.id, type: "DEVELOPMENT_GOAL_ASSIGNED", title: "Nova meta de desenvolvimento", body: "Uma meta de desenvolvimento foi atribuida a voce.", href: "/hub/desenvolvimento", entityType: "DEVELOPMENT_GOAL", entityId: goal.id, idempotencyKey: `development-goal:${goal.id}:assigned` }]);
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "DEVELOPMENT_GOAL_CREATED", entity: "HubDevelopmentGoal", entityId: goal.id, metadata: { ownerMemberId: owner.id } });
    return goal;
  });
}

export async function createPeopleCycle(prisma: PrismaClient, actor: HubOperationalActor, input: { name: string; startsAt?: Date | null; endsAt?: Date | null; criteria: Array<{ title: string; description?: string | null; scaleMin?: number; scaleMax?: number }> }) {
  if (!input.name.trim() || !input.criteria.length) throw new HubApiError("Ciclo e criterios sao obrigatorios.", 400);
  return serializable(prisma, async (tx) => {
    if (!hasHubPermission(actor.role, "people:cycles-manage")) throw new HubApiError("Acesso negado.", 403);
    const cycle = await tx.hubPeopleCycle.create({ data: { organizationId: actor.organizationId, name: input.name.trim(), startsAt: input.startsAt || null, endsAt: input.endsAt || null, createdById: actor.id } });
    await tx.hubEvaluationCriterion.createMany({ data: input.criteria.map((criterion, order) => ({ organizationId: actor.organizationId, cycleId: cycle.id, title: criterion.title.trim(), description: criterion.description?.trim() || null, scaleMin: criterion.scaleMin || 1, scaleMax: criterion.scaleMax || 5, order: order + 1 })) });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "PEOPLE_CYCLE_CREATED", entity: "HubPeopleCycle", entityId: cycle.id, metadata: { criterionCount: input.criteria.length } });
    return cycle;
  });
}

export async function setPeopleCycleStatus(prisma: PrismaClient, actor: HubOperationalActor, cycleId: string, status: "ACTIVE" | "CLOSED" | "ARCHIVED") {
  return serializable(prisma, async (tx) => {
    if (!hasHubPermission(actor.role, "people:cycles-manage")) throw new HubApiError("Acesso negado.", 403);
    const cycle = await tx.hubPeopleCycle.findFirst({ where: { id: cycleId, organizationId: actor.organizationId } });
    if (!cycle) throw new HubApiError("Ciclo nao encontrado.", 404);
    if (cycle.status === "ARCHIVED") throw new HubApiError("Ciclos arquivados sao terminais.", 409);
    if (cycle.status === "CLOSED" && status === "ACTIVE") throw new HubApiError("Ciclos fechados sao somente leitura.", 409);
    const updated = await tx.hubPeopleCycle.update({ where: { id: cycle.id }, data: { status } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: `PEOPLE_CYCLE_${status}`, entity: "HubPeopleCycle", entityId: cycle.id });
    return updated;
  });
}

export async function createFeedback(prisma: PrismaClient, actor: HubOperationalActor, input: { recipientMemberId: string; body: string; visibility: "PRIVATE_TO_RECIPIENT" | "MANAGER_AND_RECIPIENT" | "PEOPLE_ADMIN"; cycleId?: string | null }) {
  if (!input.body.trim()) throw new HubApiError("Feedback e obrigatorio.", 400);
  return serializable(prisma, async (tx) => {
    const recipient = await tx.hubMember.findFirst({ where: { id: input.recipientMemberId, organizationId: actor.organizationId, status: "ACTIVE" }, select: { id: true, organizationId: true, directorateId: true } });
    if (!recipient) throw new HubApiError("Membro nao encontrado.", 404);
    if (actor.id !== recipient.id && !hubOperationalPolicy.canManageDirectorate(actor, recipient) && !hasHubPermission(actor.role, "people:evaluate")) throw new HubApiError("Acesso negado.", 403);
    if (input.cycleId) { const cycle = await tx.hubPeopleCycle.findFirst({ where: { id: input.cycleId, organizationId: actor.organizationId } }); if (!cycle) throw new HubApiError("Ciclo nao encontrado.", 404); if (cycle.status === "CLOSED" || cycle.status === "ARCHIVED") throw new HubApiError("O ciclo esta fechado.", 409); }
    const feedback = await tx.hubFeedback.create({ data: { organizationId: actor.organizationId, cycleId: input.cycleId || null, authorMemberId: actor.id, recipientMemberId: recipient.id, body: input.body.trim(), visibility: input.visibility } });
    await createHubNotifications(tx, [{ organizationId: actor.organizationId, recipientMemberId: recipient.id, actorMemberId: actor.id, type: "FEEDBACK_RECEIVED", title: "Novo feedback recebido", body: "Voce recebeu um feedback confidencial no Atlas Hub.", href: "/hub/avaliacoes", entityType: "FEEDBACK", entityId: feedback.id, idempotencyKey: `feedback:${feedback.id}:received` }]);
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "FEEDBACK_CREATED", entity: "HubFeedback", entityId: feedback.id, metadata: { recipientMemberId: recipient.id, visibility: input.visibility } });
    return { id: feedback.id, recipientMemberId: feedback.recipientMemberId, visibility: feedback.visibility, createdAt: feedback.createdAt };
  });
}

export async function assignEvaluation(prisma: PrismaClient, actor: HubOperationalActor, input: { cycleId: string; evaluatorMemberId: string; evaluatedMemberId: string; type: "SELF" | "MANAGER" | "PEER" }) {
  return serializable(prisma, async (tx) => {
    if (!hasHubPermission(actor.role, "people:cycles-manage")) throw new HubApiError("Acesso negado.", 403);
    const cycle = await tx.hubPeopleCycle.findFirst({ where: { id: input.cycleId, organizationId: actor.organizationId, status: { in: ["DRAFT", "ACTIVE"] } } });
    if (!cycle) throw new HubApiError("Ciclo nao encontrado.", 404);
    await managedMember(tx, actor, input.evaluatorMemberId, true); await managedMember(tx, actor, input.evaluatedMemberId, true);
    const evaluation = await tx.hubEvaluation.create({ data: { organizationId: actor.organizationId, ...input } });
    await createHubNotifications(tx, [{ organizationId: actor.organizationId, recipientMemberId: input.evaluatorMemberId, actorMemberId: actor.id, type: "EVALUATION_ASSIGNED", title: "Avaliacao atribuida", body: "Uma avaliacao aguarda seu preenchimento.", href: "/hub/avaliacoes", entityType: "EVALUATION", entityId: evaluation.id, idempotencyKey: `evaluation:${evaluation.id}:assigned` }]);
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "EVALUATION_ASSIGNED", entity: "HubEvaluation", entityId: evaluation.id, metadata: { type: input.type } });
    return evaluation;
  });
}

export async function createRecognition(prisma: PrismaClient, actor: HubOperationalActor, input: { recipientMemberId: string; title: string; description: string; visibility: "PRIVATE" | "ORGANIZATION" }) {
  if (!input.title.trim() || !input.description.trim()) throw new HubApiError("Titulo e descricao sao obrigatorios.", 400);
  return serializable(prisma, async (tx) => {
    const recipient = await tx.hubMember.findFirst({ where: { id: input.recipientMemberId, organizationId: actor.organizationId, status: "ACTIVE" }, select: { id: true, organizationId: true } });
    if (!recipient) throw new HubApiError("Membro nao encontrado.", 404);
    if (!hasHubPermission(actor.role, "people:access")) throw new HubApiError("Acesso negado.", 403);
    const recognition = await tx.hubRecognition.create({ data: { organizationId: actor.organizationId, recipientMemberId: recipient.id, givenById: actor.id, title: input.title.trim(), description: input.description.trim(), visibility: input.visibility } });
    await createHubNotifications(tx, [{ organizationId: actor.organizationId, recipientMemberId: recipient.id, actorMemberId: actor.id, type: "RECOGNITION_RECEIVED", title: "Voce recebeu um reconhecimento", body: "Um novo reconhecimento foi registrado para voce.", href: "/hub/pessoas", entityType: "RECOGNITION", entityId: recognition.id, idempotencyKey: `recognition:${recognition.id}:received` }]);
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "RECOGNITION_CREATED", entity: "HubRecognition", entityId: recognition.id, metadata: { recipientMemberId: recipient.id, visibility: input.visibility } });
    return recognition;
  });
}

export async function createParticipationRecord(prisma: PrismaClient, actor: HubOperationalActor, input: { memberId: string; date: Date; type: string; source: string }) {
  if (!input.type.trim() || !input.source.trim()) throw new HubApiError("Tipo e fonte sao obrigatorios.", 400);
  return serializable(prisma, async (tx) => {
    await managedMember(tx, actor, input.memberId);
    const record = await tx.hubParticipationRecord.create({ data: { organizationId: actor.organizationId, memberId: input.memberId, date: input.date, type: input.type.trim(), source: input.source.trim(), recordedById: actor.id } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "EXTERNAL_PARTICIPATION_RECORDED", entity: "HubParticipationRecord", entityId: record.id, metadata: { memberId: input.memberId, type: input.type.trim() } });
    return record;
  });
}

export async function createRecruitmentProcess(prisma: PrismaClient, actor: HubOperationalActor, input: { title: string; description?: string | null; stages: string[] }) {
  if (!input.title.trim() || !input.stages.length || input.stages.some((stage) => !stage.trim())) throw new HubApiError("Processo e etapas sao obrigatorios.", 400);
  return serializable(prisma, async (tx) => {
    if (!hubOperationalPolicy.canAccessRecruitment(actor, { organizationId: actor.organizationId })) throw new HubApiError("Acesso negado.", 403);
    const process = await tx.hubRecruitmentProcess.create({ data: { organizationId: actor.organizationId, title: input.title.trim(), description: input.description?.trim() || null, status: "OPEN", createdById: actor.id } });
    await tx.hubRecruitmentStage.createMany({ data: input.stages.map((name, order) => ({ organizationId: actor.organizationId, processId: process.id, name: name.trim(), order: order + 1 })) });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "RECRUITMENT_PROCESS_CREATED", entity: "HubRecruitmentProcess", entityId: process.id, metadata: { stageCount: input.stages.length } });
    return process;
  });
}

export async function setRecruitmentProcessStatus(prisma: PrismaClient, actor: HubOperationalActor, processId: string, status: "OPEN" | "CLOSED" | "ARCHIVED") {
  return serializable(prisma, async (tx) => {
    const process = await tx.hubRecruitmentProcess.findFirst({ where: { id: processId, organizationId: actor.organizationId } });
    if (!process) throw new HubApiError("Processo nao encontrado.", 404);
    if (!hubOperationalPolicy.canAccessRecruitment(actor, process)) throw new HubApiError("Acesso negado.", 403);
    if (process.status === "ARCHIVED") throw new HubApiError("Processos arquivados sao somente leitura.", 409);
    const updated = await tx.hubRecruitmentProcess.update({ where: { id: process.id }, data: { status } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: `RECRUITMENT_PROCESS_${status}`, entity: "HubRecruitmentProcess", entityId: process.id });
    return updated;
  });
}

export async function createCandidate(prisma: PrismaClient, actor: HubOperationalActor, input: { processId: string; name: string; email: string; phone?: string | null; notes?: string | null }) {
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!input.name.trim() || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new HubApiError("Nome e e-mail validos sao obrigatorios.", 400);
  return serializable(prisma, async (tx) => {
    if (!hubOperationalPolicy.canAccessRecruitment(actor, { organizationId: actor.organizationId })) throw new HubApiError("Acesso negado.", 403);
    const process = await tx.hubRecruitmentProcess.findFirst({ where: { id: input.processId, organizationId: actor.organizationId, status: "OPEN" } });
    if (!process) throw new HubApiError("Processo nao encontrado.", 404);
    const firstStage = await tx.hubRecruitmentStage.findFirst({ where: { processId: process.id, organizationId: actor.organizationId }, orderBy: { order: "asc" } });
    const candidate = await tx.hubCandidate.create({ data: { organizationId: actor.organizationId, processId: process.id, currentStageId: firstStage?.id || null, name: input.name.trim(), email: normalizedEmail, normalizedEmail, phone: input.phone?.trim() || null, notes: input.notes?.trim() || null } });
    if (firstStage) await tx.hubCandidateStageEvent.create({ data: { organizationId: actor.organizationId, candidateId: candidate.id, toStageId: firstStage.id, movedById: actor.id, idempotencyKey: `candidate:${candidate.id}:initial-stage`, requestHash: requestHash({ candidateId: candidate.id, toStageId: firstStage.id }) } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "CANDIDATE_CREATED", entity: "HubCandidate", entityId: candidate.id, metadata: { processId: process.id } });
    return { id: candidate.id, processId: candidate.processId, currentStageId: candidate.currentStageId, name: candidate.name, status: candidate.status, version: candidate.version };
  });
}

export async function evaluateCandidate(prisma: PrismaClient, actor: HubOperationalActor, candidateId: string, input: { score: number; comments?: string | null }) {
  if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) throw new HubApiError("A nota deve estar entre 1 e 5.", 400);
  return serializable(prisma, async (tx) => {
    const candidate = await tx.hubCandidate.findFirst({ where: { id: candidateId, organizationId: actor.organizationId }, select: { id: true, organizationId: true, status: true, processId: true } });
    if (!candidate) throw new HubApiError("Candidato nao encontrado.", 404);
    if (!hubOperationalPolicy.canAccessRecruitment(actor, candidate)) throw new HubApiError("Acesso negado.", 403);
    if (candidate.status !== "ACTIVE" || !await tx.hubRecruitmentProcess.count({ where: { id: candidate.processId, organizationId: actor.organizationId, status: "OPEN" } })) throw new HubApiError("O candidato nao esta disponivel para avaliacao.", 409);
    const evaluation = await tx.hubCandidateEvaluation.upsert({ where: { candidateId_evaluatorId: { candidateId, evaluatorId: actor.id } }, create: { organizationId: actor.organizationId, candidateId, evaluatorId: actor.id, score: input.score, comments: input.comments?.trim() || null }, update: { score: input.score, comments: input.comments?.trim() || null } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "CANDIDATE_EVALUATED", entity: "HubCandidateEvaluation", entityId: evaluation.id, metadata: { score: input.score } });
    return { id: evaluation.id, candidateId, score: evaluation.score, updatedAt: evaluation.updatedAt };
  });
}

export async function rejectCandidate(prisma: PrismaClient, actor: HubOperationalActor, candidateId: string, input: { expectedVersion: number; reason: string }) {
  if (!input.reason.trim() || input.reason.trim().length > 240) throw new HubApiError("Informe um motivo interno conciso.", 400);
  return serializable(prisma, async (tx) => {
    if (!hubOperationalPolicy.canAccessRecruitment(actor, { organizationId: actor.organizationId })) throw new HubApiError("Acesso negado.", 403);
    const changed = await tx.hubCandidate.updateMany({ where: { id: candidateId, organizationId: actor.organizationId, version: input.expectedVersion, status: "ACTIVE" }, data: { status: "REJECTED", rejectionReason: input.reason.trim(), version: { increment: 1 } } });
    if (!changed.count) { if (!await tx.hubCandidate.count({ where: { id: candidateId, organizationId: actor.organizationId } })) throw new HubApiError("Candidato nao encontrado.", 404); throw new HubApiError("O candidato ja foi alterado.", 409); }
    const candidate = await tx.hubCandidate.findUniqueOrThrow({ where: { id: candidateId } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "CANDIDATE_REJECTED", entity: "HubCandidate", entityId: candidate.id, metadata: { reasonLength: input.reason.trim().length } });
    return { id: candidate.id, status: candidate.status, version: candidate.version };
  });
}

export async function setCandidateStatus(prisma: PrismaClient, actor: HubOperationalActor, candidateId: string, input: { expectedVersion: number; status: "ACTIVE" | "APPROVED" | "WITHDRAWN" }) {
  return serializable(prisma, async (tx) => {
    if (!hubOperationalPolicy.canAccessRecruitment(actor, { organizationId: actor.organizationId })) throw new HubApiError("Acesso negado.", 403);
    const changed = await tx.hubCandidate.updateMany({ where: { id: candidateId, organizationId: actor.organizationId, version: input.expectedVersion, status: "ACTIVE" }, data: { status: input.status, version: { increment: 1 } } });
    if (!changed.count) { if (!await tx.hubCandidate.count({ where: { id: candidateId, organizationId: actor.organizationId } })) throw new HubApiError("Candidato nao encontrado.", 404); throw new HubApiError("O candidato ja foi alterado.", 409); }
    const candidate = await tx.hubCandidate.findUniqueOrThrow({ where: { id: candidateId } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: `CANDIDATE_${input.status}`, entity: "HubCandidate", entityId: candidate.id });
    return { id: candidate.id, status: candidate.status, version: candidate.version };
  });
}

export async function hireCandidate(prisma: PrismaClient, actor: HubOperationalActor, candidateId: string, input: { expectedVersion: number; confirm: boolean; role?: "MEMBER" | "VIEWER"; directorateId?: string | null }) {
  if (!input.confirm) throw new HubApiError("Confirme explicitamente a contratacao.", 400);
  return serializable(prisma, async (tx) => {
    if (!hubOperationalPolicy.canAccessRecruitment(actor, { organizationId: actor.organizationId })) throw new HubApiError("Acesso negado.", 403);
    const candidate = await tx.hubCandidate.findFirst({ where: { id: candidateId, organizationId: actor.organizationId } });
    if (!candidate) throw new HubApiError("Candidato nao encontrado.", 404);
    if (candidate.version !== input.expectedVersion || !["ACTIVE", "APPROVED"].includes(candidate.status)) throw new HubApiError("O candidato ja foi alterado.", 409);
    if (input.directorateId && !await tx.hubDirectorate.count({ where: { id: input.directorateId, organizationId: actor.organizationId, isActive: true } })) throw new HubApiError("Diretoria nao encontrada.", 404);
    if (await tx.hubMember.count({ where: { organizationId: actor.organizationId, normalizedEmail: candidate.normalizedEmail } })) throw new HubApiError("Ja existe um membro com este e-mail.", 409);
    const invitedPasswordHash = `!invited:${crypto.randomUUID()}`;
    const account = await tx.hubAccount.upsert({ where: { normalizedEmail: candidate.normalizedEmail }, update: {}, create: { email: candidate.email, normalizedEmail: candidate.normalizedEmail, passwordHash: invitedPasswordHash, mustChangePassword: true } });
    const member = await tx.hubMember.create({ data: { organizationId: actor.organizationId, accountId: account.id, name: candidate.name, email: candidate.email, normalizedEmail: candidate.normalizedEmail, passwordHash: account.passwordHash, role: input.role || "MEMBER", status: "INVITED", directorateId: input.directorateId || null, mustChangePassword: account.mustChangePassword } });
    await tx.hubWalletAccount.create({ data: { memberId: member.id } });
    await tx.hubMemberLifecycleEvent.create({ data: { organizationId: actor.organizationId, memberId: member.id, type: "JOINED", recordedById: actor.id, metadata: { source: "RECRUITMENT", candidateId: candidate.id } } });
    const changed = await tx.hubCandidate.updateMany({ where: { id: candidate.id, version: input.expectedVersion }, data: { status: "HIRED", hiredMemberId: member.id, version: { increment: 1 } } });
    if (!changed.count) throw new HubApiError("O candidato ja foi alterado.", 409);
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "CANDIDATE_HIRED", entity: "HubCandidate", entityId: candidate.id, metadata: { memberId: member.id, role: member.role } });
    return { candidateId: candidate.id, member: { id: member.id, name: member.name, role: member.role, status: member.status } };
  });
}
