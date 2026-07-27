import type { Prisma } from "@prisma/client";
import { HubApiError } from "@/lib/hub/api";
import { writeHubAudit } from "@/lib/hub/audit";
import { allocateCents } from "@/lib/hub/wallet";
import { createHubNotifications } from "@/lib/hub/notifications";

export type ProjectParticipantInput = { memberId: string; percentage: number };

export type ValidatedProjectInput = {
  title: string;
  description: string;
  grossAmountCents: number;
  competenceDate: Date;
  responsibleMemberId: string | null;
  isCollaborative: boolean;
  participants: ProjectParticipantInput[];
  status: "DRAFT" | "APPROVED";
  idempotencyKey: string | null;
};

export function parseProjectInput(body: Record<string, unknown>, fallback?: ValidatedProjectInput): ValidatedProjectInput {
  const title = body.title === undefined && fallback ? fallback.title : String(body.title || "").trim();
  const description = body.description === undefined && fallback ? fallback.description : String(body.description || "").trim();
  const grossAmountCents = body.grossAmountCents !== undefined
    ? Number(body.grossAmountCents)
    : body.grossAmount !== undefined ? Math.round(Number(body.grossAmount) * 100) : fallback?.grossAmountCents || 0;
  const competenceDate = body.competenceDate === undefined && fallback ? fallback.competenceDate : new Date(String(body.competenceDate || ""));
  const responsibleMemberId = body.responsibleMemberId === undefined && fallback ? fallback.responsibleMemberId : body.responsibleMemberId ? String(body.responsibleMemberId) : null;
  const isCollaborative = body.isCollaborative === undefined && fallback ? fallback.isCollaborative : Boolean(body.isCollaborative);
  const raw = body.participants === undefined && fallback ? fallback.participants : Array.isArray(body.participants) ? body.participants : [];
  const participants = isCollaborative
    ? raw.map((item) => ({ memberId: String((item as Record<string, unknown>).memberId || ""), percentage: Number((item as Record<string, unknown>).percentage) }))
    : responsibleMemberId ? [{ memberId: responsibleMemberId, percentage: 100 }] : [];
  const statusValue = body.status === undefined && fallback ? fallback.status : String(body.status || "DRAFT");
  const status = statusValue === "APPROVED" ? "APPROVED" : "DRAFT";
  const idempotencyKey = body.idempotencyKey === undefined && fallback ? fallback.idempotencyKey : typeof body.idempotencyKey === "string" && body.idempotencyKey.trim() ? body.idempotencyKey.trim().slice(0, 100) : null;

  if (title.length < 3 || title.length > 160) throw new HubApiError("O título deve ter entre 3 e 160 caracteres.", 422);
  if (description.length < 3 || description.length > 2_000) throw new HubApiError("A descrição deve ter entre 3 e 2.000 caracteres.", 422);
  if (!Number.isSafeInteger(grossAmountCents) || grossAmountCents <= 0) throw new HubApiError("O valor bruto deve ser maior que zero.", 422);
  if (Number.isNaN(competenceDate.getTime())) throw new HubApiError("Data de competência inválida.", 422);
  if (participants.length === 0) throw new HubApiError("Informe o membro responsável ou os participantes.", 422);
  if (new Set(participants.map((item) => item.memberId)).size !== participants.length || participants.some((item) => !item.memberId)) throw new HubApiError("Não repita participantes.", 422);
  if (participants.some((item) => !Number.isFinite(item.percentage) || item.percentage <= 0 || item.percentage > 100 || Math.round(item.percentage * 100) !== item.percentage * 100)) throw new HubApiError("Use percentuais positivos com até duas casas decimais.", 422);
  if (participants.reduce((sum, item) => sum + Math.round(item.percentage * 100), 0) !== 10_000) throw new HubApiError("As participações devem somar exatamente 100%.", 422);
  return { title, description, grossAmountCents, competenceDate, responsibleMemberId, isCollaborative, participants, status, idempotencyKey };
}

export async function assertActiveProjectMembers(tx: Prisma.TransactionClient, organizationId: string, participants: ProjectParticipantInput[]) {
  const ids = participants.map((item) => item.memberId);
  const count = await tx.hubMember.count({ where: { organizationId, id: { in: ids }, status: "ACTIVE" } });
  if (count !== ids.length) throw new HubApiError("Todos os participantes devem ser membros ativos desta organização.", 404);
}

async function resolveProjectNotificationRecipients(tx: Prisma.TransactionClient, projectId: string) {
  const project = await tx.hubProject.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      responsibleMemberId: true,
      participants: { select: { memberId: true } },
    },
  });
  const payoutAccounts = await tx.hubWalletTransaction.findMany({
    where: { sourceType: "PROJECT_PAYOUT", sourceId: projectId },
    select: { account: { select: { memberId: true } } },
  });
  return [...new Set([
    ...(project.responsibleMemberId ? [project.responsibleMemberId] : []),
    ...project.participants.map((participant) => participant.memberId),
    ...payoutAccounts.map((payout) => payout.account.memberId),
  ])];
}

export async function notifyHubProjectEvent(tx: Prisma.TransactionClient, input: {
  projectId: string;
  organizationId: string;
  actorId: string;
  eventId: string;
  type: "PROJECT_APPROVED" | "PROJECT_CANCELLED";
}) {
  const recipientIds = await resolveProjectNotificationRecipients(tx, input.projectId);
  const approved = input.type === "PROJECT_APPROVED";
  return createHubNotifications(tx, recipientIds.map((recipientMemberId) => ({
    organizationId: input.organizationId,
    recipientMemberId,
    actorMemberId: input.actorId,
    type: input.type,
    title: approved ? "Projeto aprovado" : "Projeto cancelado",
    body: approved ? "Você recebeu uma atualização de projeto aprovado." : "Um projeto do qual você participa foi cancelado.",
    href: "/hub/metricas",
    entityType: "PROJECT",
    entityId: input.projectId,
    idempotencyKey: `notification:project-event:${input.eventId}:${recipientMemberId}`,
  })));
}

export async function payApprovedProject(tx: Prisma.TransactionClient, input: {
  projectId: string;
  organizationId: string;
  actorId: string;
  grossAmountCents: number;
  participants: ProjectParticipantInput[];
}) {
  const rule = await tx.hubFinancialRule.upsert({
    where: { organizationId: input.organizationId },
    update: {},
    create: { organizationId: input.organizationId, organizationSharePct: 50, atlasSharePct: 15, memberSharePct: 35 },
  });
  const memberBasisPoints = Math.round(rule.memberSharePct * 100);
  const memberPoolCents = Math.round((input.grossAmountCents * memberBasisPoints) / 10_000);
  const payouts = allocateCents(memberPoolCents, input.participants);
  for (const payout of payouts) {
    const account = await tx.hubWalletAccount.upsert({ where: { memberId: payout.memberId }, update: {}, create: { memberId: payout.memberId } });
    await tx.hubWalletTransaction.create({
      data: {
        accountId: account.id,
        type: "CREDIT",
        amountCents: payout.amountCents,
        status: "COMPLETED",
        description: "Participação em projeto aprovado",
        sourceType: "PROJECT_PAYOUT",
        sourceId: input.projectId,
        idempotencyKey: `project:${input.projectId}:payout:${payout.memberId}`,
        createdById: input.actorId,
      },
    });
    await tx.hubWalletAccount.update({ where: { id: account.id }, data: { balanceCents: { increment: payout.amountCents } } });
  }
  await tx.hubProject.update({
    where: { id: input.projectId },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedMemberPoolCents: memberPoolCents,
      financialRuleSnapshot: { organizationSharePct: rule.organizationSharePct, atlasSharePct: rule.atlasSharePct, memberSharePct: rule.memberSharePct },
    },
  });
  const audit = await writeHubAudit(tx, { organizationId: input.organizationId, memberId: input.actorId, action: "PROJECT_APPROVED", entity: "PROJECT", entityId: input.projectId, metadata: { grossAmountCents: input.grossAmountCents, memberPoolCents, participantCount: payouts.length } });
  await notifyHubProjectEvent(tx, { projectId: input.projectId, organizationId: input.organizationId, actorId: input.actorId, eventId: audit.id, type: "PROJECT_APPROVED" });
  return { memberPoolCents };
}

export async function reverseApprovedProject(tx: Prisma.TransactionClient, input: { projectId: string; organizationId: string; actorId: string; reason: string }) {
  const claimed = await tx.hubProject.updateMany({ where: { id: input.projectId, organizationId: input.organizationId, status: "APPROVED" }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledReason: input.reason } });
  if (claimed.count !== 1) throw new HubApiError("O projeto já foi cancelado ou não está aprovado.", 409);
  const payouts = await tx.hubWalletTransaction.findMany({ where: { sourceType: "PROJECT_PAYOUT", sourceId: input.projectId, status: "COMPLETED", account: { member: { organizationId: input.organizationId } } } });
  for (const payout of payouts) {
    await tx.hubWalletTransaction.create({
      data: {
        accountId: payout.accountId,
        type: "ADJUSTMENT",
        amountCents: -Math.abs(payout.amountCents),
        status: "COMPLETED",
        description: "Estorno de projeto cancelado",
        sourceType: "PROJECT_REVERSAL",
        sourceId: input.projectId,
        sourceNote: input.reason,
        idempotencyKey: `project:${input.projectId}:reversal:${payout.accountId}`,
        createdById: input.actorId,
      },
    });
    await tx.hubWalletAccount.update({ where: { id: payout.accountId }, data: { balanceCents: { decrement: Math.abs(payout.amountCents) } } });
  }
  const audit = await writeHubAudit(tx, { organizationId: input.organizationId, memberId: input.actorId, action: "PROJECT_CANCELLED", entity: "PROJECT", entityId: input.projectId, metadata: { reason: input.reason, reversalCount: payouts.length } });
  await notifyHubProjectEvent(tx, { projectId: input.projectId, organizationId: input.organizationId, actorId: input.actorId, eventId: audit.id, type: "PROJECT_CANCELLED" });
}
