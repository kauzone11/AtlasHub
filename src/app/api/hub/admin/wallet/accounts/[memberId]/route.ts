import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { hubMemberSafeSelect, serializeHubMember } from "@/lib/hub/members";
import { summarizeHubWallet } from "@/lib/hub/wallet";

type Context = { params: Promise<{ memberId: string }> };

export const GET = withHubApi<Context>(async (_request, context) => {
  const session = await requireHubPermission("wallet:manage");
  const { memberId } = await context.params;
  const member = await prisma.hubMember.findFirst({ where: { id: memberId, organizationId: session.organizationId, status: { not: "DELETED" } }, select: hubMemberSafeSelect });
  if (!member) throw new HubApiError("Membro não encontrado.", 404);
  const account = await prisma.hubWalletAccount.upsert({ where: { memberId }, update: {}, create: { memberId }, include: { transactions: { orderBy: { createdAt: "desc" } }, requests: { orderBy: { createdAt: "desc" } } } });
  return hubJson({ account: { id: account.id, memberId, ...summarizeHubWallet(account) }, member: serializeHubMember(member), transactions: account.transactions, requests: account.requests });
});
