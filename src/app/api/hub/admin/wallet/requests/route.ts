import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { calculateAvailableBalance } from "@/lib/hub/wallet";

export const GET = withHubApi(async () => {
  const session = await requireHubPermission("requests:review");
  const requests = await prisma.hubWalletRequest.findMany({
    where: { member: { organizationId: session.organizationId } },
    include: {
      member: { select: { id: true, name: true, email: true, directorate: { select: { name: true } } } },
      account: { select: { balanceCents: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  const pendingByAccount = new Map<string, number>();
  for (const item of requests) if (item.status === "PENDING") pendingByAccount.set(item.accountId, (pendingByAccount.get(item.accountId) || 0) + item.amountCents);
  return hubJson({ requests: requests.map((item) => ({ ...item, availableBalanceCents: calculateAvailableBalance(item.account.balanceCents, pendingByAccount.get(item.accountId) || 0) })) });
});
