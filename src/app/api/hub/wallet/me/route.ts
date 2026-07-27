import { prisma } from "@/lib/prisma";
import { requireHubMember } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { summarizeHubWallet } from "@/lib/hub/wallet";
import { hasHubPermission } from "@/lib/hub/permissions";

function monthLabel(value: Date) {
  return value.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase();
}

export const GET = withHubApi(async () => {
  const session = await requireHubMember();
  const [account, rule, participations] = await Promise.all([
    prisma.hubWalletAccount.findUnique({
      where: { memberId: session.memberId },
      include: {
        transactions: { orderBy: { createdAt: "desc" } },
        requests: { orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.hubFinancialRule.findUnique({ where: { organizationId: session.organizationId } }),
    prisma.hubProjectParticipant.findMany({
      where: { memberId: session.memberId, project: { organizationId: session.organizationId, status: "APPROVED" } },
      select: { amountCents: true, projectId: true, project: { select: { competenceDate: true } } },
    }),
  ]);

  const transactions = account?.transactions || [];
  const requests = account?.requests || [];
  const summary = summarizeHubWallet({ balanceCents: account?.balanceCents || 0, transactions, requests });
  const monthly = new Map<string, { label: string; totalCents: number; timestamp: number }>();
  for (const participation of participations) {
    const date = participation.project.competenceDate;
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    const current = monthly.get(key);
    monthly.set(key, { label: current?.label || monthLabel(date), totalCents: (current?.totalCents || 0) + participation.amountCents, timestamp: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) });
  }

  return hubJson({
    ...summary,
    memberSharePct: rule?.memberSharePct ?? 35,
    performanceTotalCents: participations.reduce((sum, item) => sum + item.amountCents, 0),
    monthlyPerformance: Array.from(monthly.values()).sort((a, b) => a.timestamp - b.timestamp).slice(-8),
    transactions: transactions.slice(0, 10),
    requests: requests.slice(0, 10),
    canCreateRequest: hasHubPermission(session.role, "request:create"),
  });
});
