import type { HubWalletTransactionStatus, HubWalletTransactionType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireHubMember } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";

const TYPES: HubWalletTransactionType[] = ["CREDIT", "DEBIT", "ADJUSTMENT"];
const STATUSES: HubWalletTransactionStatus[] = ["PENDING", "COMPLETED", "CANCELLED"];

export const GET = withHubApi(async (request: Request) => {
  const session = await requireHubMember();
  const params = new URL(request.url).searchParams;
  const limit = Math.min(50, Math.max(10, Number(params.get("limit")) || 25));
  const type = params.get("type") as HubWalletTransactionType | null;
  const status = params.get("status") as HubWalletTransactionStatus | null;
  if (type && !TYPES.includes(type)) throw new HubApiError("Tipo inválido.", 422);
  if (status && !STATUSES.includes(status)) throw new HubApiError("Status inválido.", 422);
  const createdAt: Prisma.DateTimeFilter = {};
  const from = params.get("from");
  const to = params.get("to");
  if (from) {
    const date = new Date(`${from}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new HubApiError("Data inicial inválida.", 422);
    createdAt.gte = date;
  }
  if (to) {
    const date = new Date(`${to}T23:59:59.999Z`);
    if (Number.isNaN(date.getTime())) throw new HubApiError("Data final inválida.", 422);
    createdAt.lte = date;
  }
  const account = await prisma.hubWalletAccount.findUnique({ where: { memberId: session.memberId }, select: { id: true } });
  if (!account) return hubJson({ transactions: [], nextCursor: null });
  const search = params.get("search")?.trim();
  const cursor = params.get("cursor");
  const transactions = await prisma.hubWalletTransaction.findMany({
    where: { accountId: account.id, type: type || undefined, status: status || undefined, createdAt: Object.keys(createdAt).length ? createdAt : undefined, description: search ? { contains: search, mode: "insensitive" } : undefined },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    cursor: cursor ? { id: cursor } : undefined,
    skip: cursor ? 1 : 0,
  });
  const hasMore = transactions.length > limit;
  const page = hasMore ? transactions.slice(0, limit) : transactions;
  return hubJson({ transactions: page, nextCursor: hasMore ? page.at(-1)?.id : null });
});
