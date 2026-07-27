import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { safeCents } from "@/lib/hub/wallet";
import { createHubManualTransaction } from "@/lib/hub/wallet-operations";

type Context = { params: Promise<{ memberId: string }> };

export const POST = withHubApi<Context>(async (request, context) => {
  const session = await requireHubPermission("wallet:manage");
  const { memberId } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const direction = body?.direction === "DEBIT" || body?.type === "DEBIT" ? "DEBIT" : body?.direction === "CREDIT" || body?.type === "CREDIT" ? "CREDIT" : null;
  const amountCents = safeCents(body?.amountCents);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : typeof body?.description === "string" ? body.description.trim() : "";
  const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim().slice(0, 100) : "";
  if (!direction) throw new HubApiError("Escolha crédito ou débito.", 422);
  if (!amountCents || amountCents <= 0) throw new HubApiError("Informe um valor maior que zero.", 422);
  if (reason.length < 5 || reason.length > 500) throw new HubApiError("A justificativa deve ter entre 5 e 500 caracteres.", 422);
  if (!idempotencyKey) throw new HubApiError("Identificador da operação ausente.", 422);
  const result = await prisma.$transaction((tx) => createHubManualTransaction(tx, { organizationId: session.organizationId, actorId: session.memberId, memberId, direction, amountCents, reason, idempotencyKey }), { isolationLevel: "Serializable" });
  return hubJson(result, { status: 201 });
});
