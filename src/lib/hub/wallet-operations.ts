import type { HubWalletTransactionType, Prisma } from "@prisma/client";
import { HubApiError } from "./api";
import { writeHubAudit } from "./audit";
import { calculateAvailableBalance } from "./wallet";
import { createHubNotifications, notifyHubPermissionRecipients } from "./notifications";

export async function approveHubWalletRequest(tx: Prisma.TransactionClient, input: {
  requestId: string; organizationId: string; actorId: string; reviewNote?: string;
}) {
  const walletRequest = await tx.hubWalletRequest.findFirst({
    where: { id: input.requestId, member: { organizationId: input.organizationId } },
  });
  if (!walletRequest) throw new HubApiError("Solicitação não encontrada.", 404);
  const claimed = await tx.hubWalletRequest.updateMany({
    where: { id: input.requestId, status: "PENDING" },
    data: { status: "APPROVED", reviewedById: input.actorId, reviewedAt: new Date(), reviewNote: input.reviewNote || null },
  });
  if (claimed.count !== 1) throw new HubApiError("A solicitação já foi revisada.", 409);
  const debited = await tx.hubWalletAccount.updateMany({
    where: { id: walletRequest.accountId, balanceCents: { gte: walletRequest.amountCents } },
    data: { balanceCents: { decrement: walletRequest.amountCents } },
  });
  if (debited.count !== 1) throw new HubApiError("Saldo insuficiente para aprovar esta solicitação.", 409);
  const transaction = await tx.hubWalletTransaction.create({
    data: {
      accountId: walletRequest.accountId,
      type: "DEBIT",
      amountCents: walletRequest.amountCents,
      description: walletRequest.reason || "Solicitação aprovada",
      status: "COMPLETED",
      sourceType: "REQUEST_APPROVAL",
      sourceId: input.requestId,
      sourceNote: input.reviewNote || null,
      idempotencyKey: `request:${input.requestId}:approval`,
      createdById: input.actorId,
    },
  });
  await writeHubAudit(tx, { organizationId: input.organizationId, memberId: input.actorId, action: "REQUEST_APPROVED", entity: "WALLET_REQUEST", entityId: input.requestId, metadata: { amountCents: walletRequest.amountCents, reviewNote: input.reviewNote || null } });
  await createHubNotifications(tx, [{ organizationId: input.organizationId, recipientMemberId: walletRequest.memberId, actorMemberId: input.actorId, type: "WALLET_REQUEST_APPROVED", title: "Solicitação aprovada", body: "Sua solicitação financeira foi aprovada.", href: "/hub/carteira/extrato", entityType: "WALLET_REQUEST", entityId: input.requestId, idempotencyKey: `notification:request:${input.requestId}:approved` }]);
  return { request: await tx.hubWalletRequest.findUniqueOrThrow({ where: { id: input.requestId } }), transaction };
}

export async function rejectHubWalletRequest(tx: Prisma.TransactionClient, input: {
  requestId: string; organizationId: string; actorId: string; reviewNote?: string;
}) {
  const walletRequest = await tx.hubWalletRequest.findFirst({ where: { id: input.requestId, member: { organizationId: input.organizationId } } });
  if (!walletRequest) throw new HubApiError("Solicitação não encontrada.", 404);
  const claimed = await tx.hubWalletRequest.updateMany({
    where: { id: input.requestId, status: "PENDING" },
    data: { status: "REJECTED", reviewedById: input.actorId, reviewedAt: new Date(), reviewNote: input.reviewNote || null },
  });
  if (claimed.count !== 1) throw new HubApiError("A solicitação já foi revisada.", 409);
  await writeHubAudit(tx, { organizationId: input.organizationId, memberId: input.actorId, action: "REQUEST_REJECTED", entity: "WALLET_REQUEST", entityId: input.requestId, metadata: { amountCents: walletRequest.amountCents, reviewNote: input.reviewNote || null } });
  await createHubNotifications(tx, [{ organizationId: input.organizationId, recipientMemberId: walletRequest.memberId, actorMemberId: input.actorId, type: "WALLET_REQUEST_REJECTED", title: "Solicitação recusada", body: "Sua solicitação financeira foi recusada.", href: "/hub/carteira/solicitar", entityType: "WALLET_REQUEST", entityId: input.requestId, idempotencyKey: `notification:request:${input.requestId}:rejected` }]);
  return tx.hubWalletRequest.findUniqueOrThrow({ where: { id: input.requestId } });
}

export async function createHubMemberWalletRequest(tx: Prisma.TransactionClient, input: {
  organizationId: string; memberId: string; amountCents: number; reason: string; idempotencyKey: string;
}) {
  const member = await tx.hubMember.findFirst({ where: { id: input.memberId, organizationId: input.organizationId, status: "ACTIVE" }, select: { id: true } });
  if (!member) throw new HubApiError("Membro não encontrado.", 404);
  const account = await tx.hubWalletAccount.upsert({ where: { memberId: input.memberId }, update: {}, create: { memberId: input.memberId } });
  const pending = await tx.hubWalletRequest.aggregate({ where: { accountId: account.id, status: "PENDING" }, _sum: { amountCents: true } });
  if (input.amountCents > calculateAvailableBalance(account.balanceCents, pending._sum.amountCents || 0)) throw new HubApiError("O valor solicitado supera o saldo disponível.", 409);
  const walletRequest = await tx.hubWalletRequest.create({ data: { accountId: account.id, memberId: input.memberId, amountCents: input.amountCents, reason: input.reason, idempotencyKey: input.idempotencyKey } });
  await writeHubAudit(tx, { organizationId: input.organizationId, memberId: input.memberId, action: "REQUEST_CREATED", entity: "WALLET_REQUEST", entityId: walletRequest.id, metadata: { amountCents: input.amountCents } });
  await notifyHubPermissionRecipients(tx, { organizationId: input.organizationId, actorMemberId: input.memberId, permission: "requests:review", excludeActor: true, type: "WALLET_REQUEST_CREATED", title: "Nova solicitação para revisar", body: "Uma solicitação financeira aguarda revisão.", href: "/hub/financas", entityType: "WALLET_REQUEST", entityId: walletRequest.id, idempotencyKey: `notification:request:${walletRequest.id}:review` });
  return walletRequest;
}

export async function cancelHubMemberWalletRequest(tx: Prisma.TransactionClient, input: { organizationId: string; memberId: string; requestId: string }) {
  const claimed = await tx.hubWalletRequest.updateMany({ where: { id: input.requestId, memberId: input.memberId, member: { organizationId: input.organizationId }, status: "PENDING" }, data: { status: "CANCELLED" } });
  if (claimed.count !== 1) throw new HubApiError("A solicitação não existe ou já foi revisada.", 409);
  await writeHubAudit(tx, { organizationId: input.organizationId, memberId: input.memberId, action: "REQUEST_CANCELLED", entity: "WALLET_REQUEST", entityId: input.requestId });
  return tx.hubWalletRequest.findUniqueOrThrow({ where: { id: input.requestId } });
}

export async function createHubManualTransaction(tx: Prisma.TransactionClient, input: {
  organizationId: string; actorId: string; memberId: string; direction: Extract<HubWalletTransactionType, "CREDIT" | "DEBIT">; amountCents: number; reason: string; idempotencyKey: string;
}) {
  const member = await tx.hubMember.findFirst({ where: { id: input.memberId, organizationId: input.organizationId, status: { not: "DELETED" } }, select: { id: true } });
  if (!member) throw new HubApiError("Membro não encontrado.", 404);
  const account = await tx.hubWalletAccount.upsert({ where: { memberId: input.memberId }, update: {}, create: { memberId: input.memberId } });
  if (input.direction === "DEBIT") {
    const debited = await tx.hubWalletAccount.updateMany({ where: { id: account.id, balanceCents: { gte: input.amountCents } }, data: { balanceCents: { decrement: input.amountCents } } });
    if (debited.count !== 1) throw new HubApiError("Saldo insuficiente.", 409);
  } else {
    await tx.hubWalletAccount.update({ where: { id: account.id }, data: { balanceCents: { increment: input.amountCents } } });
  }
  const transaction = await tx.hubWalletTransaction.create({ data: { accountId: account.id, type: input.direction, amountCents: input.amountCents, description: input.reason, status: "COMPLETED", sourceType: "MANUAL_ADJUSTMENT", sourceNote: input.reason, idempotencyKey: `manual:${input.organizationId}:${input.idempotencyKey}`, createdById: input.actorId } });
  await writeHubAudit(tx, { organizationId: input.organizationId, memberId: input.actorId, action: "WALLET_ADJUSTED", entity: "WALLET_TRANSACTION", entityId: transaction.id, metadata: { memberId: input.memberId, direction: input.direction, amountCents: input.amountCents, reason: input.reason } });
  await createHubNotifications(tx, [{ organizationId: input.organizationId, recipientMemberId: input.memberId, actorMemberId: input.actorId, type: "WALLET_ADJUSTED", title: "Carteira ajustada", body: "Uma movimentação foi registrada na sua carteira.", href: "/hub/carteira/extrato", entityType: "WALLET_TRANSACTION", entityId: transaction.id, idempotencyKey: `notification:transaction:${transaction.id}:adjusted` }]);
  return { transaction, account: await tx.hubWalletAccount.findUniqueOrThrow({ where: { id: account.id } }) };
}

export async function reverseHubWalletTransaction(tx: Prisma.TransactionClient, input: {
  organizationId: string; actorId: string; transactionId: string; reason: string;
}) {
  const original = await tx.hubWalletTransaction.findFirst({ where: { id: input.transactionId, status: "COMPLETED", account: { member: { organizationId: input.organizationId } } } });
  if (!original) throw new HubApiError("Movimentação não encontrada.", 404);
  if (original.sourceType === "TRANSACTION_REVERSAL" || original.sourceType === "PROJECT_REVERSAL") throw new HubApiError("Um estorno não pode ser estornado novamente.", 409);
  const delta = original.type === "CREDIT" ? -Math.abs(original.amountCents) : original.type === "DEBIT" ? Math.abs(original.amountCents) : -original.amountCents;
  if (delta < 0) {
    const debited = await tx.hubWalletAccount.updateMany({ where: { id: original.accountId, balanceCents: { gte: Math.abs(delta) } }, data: { balanceCents: { decrement: Math.abs(delta) } } });
    if (debited.count !== 1) throw new HubApiError("Saldo insuficiente para estornar esta movimentação.", 409);
  } else await tx.hubWalletAccount.update({ where: { id: original.accountId }, data: { balanceCents: { increment: delta } } });
  const transaction = await tx.hubWalletTransaction.create({ data: { accountId: original.accountId, type: "ADJUSTMENT", amountCents: delta, description: "Reversão administrativa", status: "COMPLETED", sourceType: "TRANSACTION_REVERSAL", sourceId: original.id, sourceNote: input.reason, idempotencyKey: `transaction:${original.id}:reversal`, createdById: input.actorId } });
  await writeHubAudit(tx, { organizationId: input.organizationId, memberId: input.actorId, action: "WALLET_TRANSACTION_REVERSED", entity: "WALLET_TRANSACTION", entityId: original.id, metadata: { reversalId: transaction.id, reason: input.reason, amountCents: delta } });
  const affected = await tx.hubWalletAccount.findUniqueOrThrow({ where: { id: original.accountId }, select: { memberId: true } });
  await createHubNotifications(tx, [{ organizationId: input.organizationId, recipientMemberId: affected.memberId, actorMemberId: input.actorId, type: "WALLET_TRANSACTION_REVERSED", title: "Movimentação estornada", body: "Uma movimentação da sua carteira foi estornada.", href: "/hub/carteira/extrato", entityType: "WALLET_TRANSACTION", entityId: transaction.id, idempotencyKey: `notification:transaction:${original.id}:reversed` }]);
  return { transaction, account: await tx.hubWalletAccount.findUniqueOrThrow({ where: { id: original.accountId } }) };
}
