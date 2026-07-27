import { prisma } from "@/lib/prisma";
import { requireHubMember } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";

export const POST = withHubApi(async () => {
  const session = await requireHubMember();
  const result = await prisma.hubNotification.updateMany({ where: { organizationId: session.organizationId, recipientMemberId: session.memberId, archivedAt: null, readAt: null }, data: { readAt: new Date() } });
  return hubJson({ updated: result.count, unreadCount: 0 });
});
