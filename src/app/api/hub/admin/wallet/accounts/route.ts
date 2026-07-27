import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { hubMemberSafeSelect, serializeHubMember } from "@/lib/hub/members";
import { summarizeHubWallet } from "@/lib/hub/wallet";

export const GET = withHubApi(async () => {
  const session = await requireHubPermission("wallet:manage");
  const members = await prisma.hubMember.findMany({ where: { organizationId: session.organizationId, status: { not: "DELETED" } }, select: hubMemberSafeSelect, orderBy: { name: "asc" } });
  await prisma.$transaction(members.filter((member) => !member.walletAccount).map((member) => prisma.hubWalletAccount.create({ data: { memberId: member.id } })));
  const accounts = await prisma.hubWalletAccount.findMany({
    where: { member: { organizationId: session.organizationId, status: { not: "DELETED" } } },
    include: { member: { select: hubMemberSafeSelect }, transactions: { orderBy: { createdAt: "desc" } }, requests: { orderBy: { createdAt: "desc" } } },
    orderBy: { member: { name: "asc" } },
  });
  return hubJson({ accounts: accounts.map((account) => ({ id: account.id, memberId: account.memberId, member: serializeHubMember(account.member), ...summarizeHubWallet(account), transactions: account.transactions.slice(0, 5), requests: account.requests.slice(0, 5), latestActivityAt: account.transactions[0]?.createdAt || null })) });
});
