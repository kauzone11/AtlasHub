import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { rejectHubWalletRequest } from "@/lib/hub/wallet-operations";

type Context = { params: Promise<{ id: string }> };

export const POST = withHubApi<Context>(async (request, context) => {
  const session = await requireHubPermission("requests:review");
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote.trim() : "";
  if (reviewNote.length > 500) throw new HubApiError("A observação deve ter no máximo 500 caracteres.", 422);
  const rejected = await prisma.$transaction((tx) => rejectHubWalletRequest(tx, { requestId: id, organizationId: session.organizationId, actorId: session.memberId, reviewNote }), { isolationLevel: "Serializable" });
  return hubJson({ request: rejected });
});
