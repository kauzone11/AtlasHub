import { prisma } from "@/lib/prisma";
import { requireHubMember, requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { safeCents } from "@/lib/hub/wallet";
import { cancelHubMemberWalletRequest, createHubMemberWalletRequest } from "@/lib/hub/wallet-operations";

export const GET = withHubApi(async () => {
  const session = await requireHubMember();
  const requests = await prisma.hubWalletRequest.findMany({ where: { memberId: session.memberId, member: { organizationId: session.organizationId } }, orderBy: { createdAt: "desc" } });
  return hubJson({ requests });
});

export const POST = withHubApi(async (request: Request) => {
  const session = await requireHubPermission("request:create");
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const amountCents = safeCents(body?.amountCents);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim().slice(0, 100) : "";
  if (!amountCents || amountCents <= 0) throw new HubApiError("Informe um valor maior que zero.", 422);
  if (reason.length < 5 || reason.length > 500) throw new HubApiError("A justificativa deve ter entre 5 e 500 caracteres.", 422);
  if (!idempotencyKey) throw new HubApiError("Não foi possível identificar esta solicitação. Recarregue e tente novamente.", 422);
  const created = await prisma.$transaction((tx) => createHubMemberWalletRequest(tx, { organizationId: session.organizationId, memberId: session.memberId, amountCents, reason, idempotencyKey: `member:${session.organizationId}:${session.memberId}:${idempotencyKey}` }), { isolationLevel: "Serializable" });
  return hubJson({ request: created }, { status: 201 });
});

export const PATCH = withHubApi(async (request: Request) => {
  const session = await requireHubMember();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id || body?.action !== "cancel") throw new HubApiError("Operação inválida.", 422);
  const cancelled = await prisma.$transaction((tx) => cancelHubMemberWalletRequest(tx, { organizationId: session.organizationId, memberId: session.memberId, requestId: id }), { isolationLevel: "Serializable" });
  return hubJson({ request: cancelled });
});
