import { prisma } from "@/lib/prisma";
import { requireHubMember } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { handleGrowthMutation } from "@/lib/hub/strategy-growth-handlers";

export const POST = withHubApi(async (request) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null; const action = String(body?.action || ""); const id = String(body?.id || ""); const input = (body?.input || {}) as Record<string, unknown>;
  const session = await requireHubMember(); const actor = { id: session.memberId, organizationId: session.organizationId, role: session.role, directorateId: session.directorateId };
  const result = await handleGrowthMutation(prisma, actor, action, id, input);
  return result ? hubJson(result) : hubJson({ error: "Acao comercial invalida." }, { status: 400 });
});
