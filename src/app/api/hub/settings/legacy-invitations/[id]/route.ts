import { hubJson, withHubApi } from "@/lib/hub/api";
import { requireHubSettingsAccess } from "@/lib/hub/settings-access";
import { regenerateLegacyHubInvitation } from "@/lib/hub/settings-service";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export const POST = withHubApi<Context>(async (request, routeContext) => {
  const context = await requireHubSettingsAccess();
  const { id } = await routeContext.params;
  const body = await request.json().catch(() => ({})) as { confirmPresidentTransfer?: unknown };
  return hubJson(await regenerateLegacyHubInvitation(prisma, { organizationId: context.organizationId, memberId: context.memberId }, id, body), { status: 201 });
});
