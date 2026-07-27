import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { reverseHubWalletTransaction } from "@/lib/hub/wallet-operations";

type Context = { params: Promise<{ id: string }> };

export const POST = withHubApi<Context>(async (request, context) => {
  const session = await requireHubPermission("wallet:manage");
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 5 || reason.length > 500) throw new HubApiError("Informe uma justificativa entre 5 e 500 caracteres.", 422);
  const result = await prisma.$transaction((tx) => reverseHubWalletTransaction(tx, { organizationId: session.organizationId, actorId: session.memberId, transactionId: id, reason }), { isolationLevel: "Serializable" });
  return hubJson(result, { status: 201 });
});
