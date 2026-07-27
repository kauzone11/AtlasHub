import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { moveDirectorateMember } from "@/lib/hub/directorate-service";
type Context = { params: Promise<{ id: string }> };
export const PATCH = withHubApi<Context>(async (request, context) => {
  const session = await requireHubPermission("member:access"); const { id } = await context.params; const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.memberId !== "string") throw new HubApiError("Membro obrigatório.", 400);
  const target = typeof body.targetDirectorateId === "string" ? body.targetDirectorateId : null;
  await moveDirectorateMember(prisma, session, id, body.memberId, target); return hubJson({ moved: true });
});
