import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireHubMember } from "@/lib/hub/auth";
import { HubAccessError } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { hasHubPermission } from "@/lib/hub/permissions";

const FINANCIAL_ACTIONS = ["FINANCIAL_RULE_UPDATED", "PROJECT_CREATED", "PROJECT_APPROVED", "PROJECT_CANCELLED", "WALLET_ADJUSTED", "WALLET_TRANSACTION_REVERSED", "REQUEST_CREATED", "REQUEST_APPROVED", "REQUEST_REJECTED", "REQUEST_CANCELLED"];

export const GET = withHubApi(async (request: Request) => {
  const session = await requireHubMember();
  const canReadFull = hasHubPermission(session.role, "audit:read-full");
  const canReadFinancial = hasHubPermission(session.role, "audit:read-financial");
  if (!canReadFull && !canReadFinancial) throw new HubAccessError("Acesso negado.", 403);
  const params = new URL(request.url).searchParams;
  const limit = Math.min(50, Math.max(10, Number(params.get("limit")) || 25));
  const createdAt: Prisma.DateTimeFilter = {};
  if (params.get("from")) {
    const date = new Date(`${params.get("from")}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new HubApiError("Data inicial inválida.", 422);
    createdAt.gte = date;
  }
  if (params.get("to")) {
    const date = new Date(`${params.get("to")}T23:59:59.999Z`);
    if (Number.isNaN(date.getTime())) throw new HubApiError("Data final inválida.", 422);
    createdAt.lte = date;
  }
  const cursor = params.get("cursor");
  const search = params.get("search")?.trim();
  const action = params.get("action")?.trim();
  const entity = params.get("entity")?.trim();
  const memberId = params.get("memberId")?.trim();
  if (!canReadFull && action && !FINANCIAL_ACTIONS.includes(action)) {
    throw new HubAccessError("Acesso negado.", 403);
  }
  const logs = await prisma.hubAuditLog.findMany({
    where: {
      organizationId: session.organizationId,
      action: action || (!canReadFull ? { in: FINANCIAL_ACTIONS } : undefined),
      entity: entity || undefined,
      memberId: memberId || undefined,
      createdAt: Object.keys(createdAt).length ? createdAt : undefined,
      OR: search ? [{ action: { contains: search, mode: "insensitive" } }, { entity: { contains: search, mode: "insensitive" } }, { member: { name: { contains: search, mode: "insensitive" } } }] : undefined,
    },
    include: { member: { select: { id: true, name: true, email: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    cursor: cursor ? { id: cursor } : undefined,
    skip: cursor ? 1 : 0,
  });
  const hasMore = logs.length > limit;
  const page = hasMore ? logs.slice(0, limit) : logs;
  return hubJson({ logs: page, nextCursor: hasMore ? page.at(-1)?.id : null, scope: canReadFull ? "FULL" : "FINANCIAL" });
});
