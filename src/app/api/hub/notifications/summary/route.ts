import { prisma } from "@/lib/prisma";
import { requireHubMember } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";

export const GET = withHubApi(async () => {
  const session = await requireHubMember();
  const where = { organizationId: session.organizationId, recipientMemberId: session.memberId, readAt: null, archivedAt: null, dismissedAt: null, deletedAt: null };
  const [unreadCount, notifications] = await Promise.all([
    prisma.hubNotification.count({ where }),
    prisma.hubNotification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 3, select: { id: true, title: true, href: true, createdAt: true } }),
  ]);
  return hubJson({ unreadCount, notifications });
});
