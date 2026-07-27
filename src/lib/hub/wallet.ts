import { prisma } from "@/lib/prisma";
import type { HubWalletTransactionType } from "@prisma/client";

export function walletDelta(type: HubWalletTransactionType, amountCents: number): number {
  if (type === "CREDIT") return Math.abs(amountCents);
  if (type === "DEBIT") return -Math.abs(amountCents);
  return amountCents;
}

export function safeCents(value: unknown) {
  const cents = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function calculateAvailableBalance(balanceCents: number, pendingCents: number) {
  return Math.max(0, balanceCents - Math.max(0, pendingCents));
}

export function summarizeHubWallet(input: {
  balanceCents: number;
  transactions: Array<{ type: HubWalletTransactionType; amountCents: number; status: string }>;
  requests: Array<{ amountCents: number; status: string }>;
}) {
  let totalCreditsCents = 0;
  let totalDebitsCents = 0;
  for (const transaction of input.transactions) {
    if (transaction.status !== "COMPLETED") continue;
    if (transaction.type === "CREDIT") totalCreditsCents += Math.abs(transaction.amountCents);
    if (transaction.type === "DEBIT") totalDebitsCents += Math.abs(transaction.amountCents);
    if (transaction.type === "ADJUSTMENT") {
      if (transaction.amountCents >= 0) totalCreditsCents += transaction.amountCents;
      else totalDebitsCents += Math.abs(transaction.amountCents);
    }
  }
  const pendingCents = input.requests.reduce((sum, request) => request.status === "PENDING" ? sum + request.amountCents : sum, 0);
  return {
    balanceCents: input.balanceCents,
    currentBalanceCents: input.balanceCents,
    pendingCents,
    availableBalanceCents: calculateAvailableBalance(input.balanceCents, pendingCents),
    totalCreditsCents,
    totalDebitsCents,
  };
}

export function allocateCents(totalCents: number, shares: Array<{ memberId: string; percentage: number }>) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) throw new Error("Valor financeiro inválido.");
  if (shares.length === 0) throw new Error("Informe ao menos uma participação.");
  const precise = shares.map((share) => {
    const basisPoints = Math.round(share.percentage * 100);
    return {
      ...share,
      basisPoints,
      floor: Math.floor((totalCents * basisPoints) / 10_000),
      remainder: (totalCents * basisPoints) % 10_000,
    };
  });
  let missing = totalCents - precise.reduce((sum, share) => sum + share.floor, 0);
  const order = [...precise].sort((a, b) => b.remainder - a.remainder || a.memberId.localeCompare(b.memberId));
  const bonus = new Map<string, number>();
  for (let index = 0; missing > 0; index = (index + 1) % order.length, missing -= 1) {
    bonus.set(order[index].memberId, (bonus.get(order[index].memberId) || 0) + 1);
  }
  return precise.map((share) => ({
    memberId: share.memberId,
    percentage: share.percentage,
    amountCents: share.floor + (bonus.get(share.memberId) || 0),
  }));
}

export async function getOrCreateHubWalletAccount(memberId: string) {
  return prisma.hubWalletAccount.upsert({
    where: { memberId },
    update: {},
    create: { memberId, balanceCents: 0 },
  });
}
