import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { requireHubSettingsAccess } from "@/lib/hub/settings-access";
import { updateHubMemberClassification } from "@/lib/hub/settings-service";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export const PATCH = withHubApi<Context>(async (request, routeContext) => {
  const context = await requireHubSettingsAccess();
  const { id } = await routeContext.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) throw new HubApiError("Payload inválido.", 422);
  const member = await updateHubMemberClassification(
    prisma,
    { organizationId: context.organizationId, memberId: context.memberId },
    id,
    { organizationPosition: body.organizationPosition, memberCategory: body.memberCategory },
  );
  return hubJson({ member });
});
