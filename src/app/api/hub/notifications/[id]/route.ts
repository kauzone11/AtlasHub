import { prisma } from "@/lib/prisma";
import { requireHubMember } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";

type Context = { params: Promise<{ id: string }> };

export const PATCH = withHubApi<Context>(async (request, context) => {
  const session = await requireHubMember();
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { action?: string } | null;
  const action = body?.action;
  if (action !== "read" && action !== "unread" && action !== "archive") throw new HubApiError("Ação inválida.", 422);
  const data = action === "read" ? { readAt: new Date() } : action === "unread" ? { readAt: null } : { archivedAt: new Date() };
  const result = await prisma.hubNotification.updateMany({ where: { id, organizationId: session.organizationId, recipientMemberId: session.memberId }, data });
  if (result.count !== 1) throw new HubApiError("Notificação não encontrada.", 404);
  const unreadCount = await prisma.hubNotification.count({ where: { organizationId: session.organizationId, recipientMemberId: session.memberId, archivedAt: null, readAt: null } });
  return hubJson({ unreadCount });
});
