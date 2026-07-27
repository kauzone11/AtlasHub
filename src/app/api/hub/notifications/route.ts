import { prisma } from "@/lib/prisma";
import { requireHubMember } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";

const PAGE_SIZE = 20;

function parseTake(value: string | null) {
  if (value === null) return PAGE_SIZE;
  if (!/^\d+$/.test(value)) throw new HubApiError("Tamanho de página inválido.", 400);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 50) throw new HubApiError("Tamanho de página deve estar entre 1 e 50.", 400);
  return parsed;
}

export const GET = withHubApi(async (request: Request) => {
  const session = await requireHubMember();
  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") === "all" ? "all" : "unread";
  const cursor = url.searchParams.get("cursor") || undefined;
  const take = parseTake(url.searchParams.get("take"));
  const where = { organizationId: session.organizationId, recipientMemberId: session.memberId, archivedAt: null, ...(filter === "unread" ? { readAt: null } : {}) };
  if (cursor) {
    const validCursor = await prisma.hubNotification.count({ where: { id: cursor, organizationId: session.organizationId, recipientMemberId: session.memberId } });
    if (validCursor !== 1) throw new HubApiError("Cursor de notificações inválido.", 400);
  }
  const notifications = await prisma.hubNotification.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: take + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, type: true, title: true, body: true, href: true, readAt: true, createdAt: true, actorMember: { select: { name: true } } },
  });
  const hasMore = notifications.length > take;
  const items = hasMore ? notifications.slice(0, take) : notifications;
  return hubJson({ notifications: items, nextCursor: hasMore ? items.at(-1)?.id || null : null });
});
