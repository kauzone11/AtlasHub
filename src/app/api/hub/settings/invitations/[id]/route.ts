import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { requireHubSettingsAccess } from "@/lib/hub/settings-access";
import { regenerateHubInvitation, revokeHubInvitation } from "@/lib/hub/settings-service";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export const DELETE = withHubApi<Context>(async (_request, routeContext) => {
  const context = await requireHubSettingsAccess();
  const { id } = await routeContext.params;
  return hubJson(await revokeHubInvitation(prisma, { organizationId: context.organizationId, memberId: context.memberId }, id));
});

export const POST = withHubApi<Context>(async (request, routeContext) => {
  const context = await requireHubSettingsAccess();
  const { id } = await routeContext.params;
  const body = await request.json().catch(() => null) as { action?: unknown } | null;
  if (body?.action !== "regenerate") throw new HubApiError("Ação inválida.", 422);
  return hubJson(await regenerateHubInvitation(prisma, { organizationId: context.organizationId, memberId: context.memberId }, id), { status: 201 });
});
