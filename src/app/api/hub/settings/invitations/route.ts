import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { requireHubSettingsAccess } from "@/lib/hub/settings-access";
import { createHubInvitation } from "@/lib/hub/settings-service";
import { prisma } from "@/lib/prisma";

export const POST = withHubApi(async (request: Request) => {
  const context = await requireHubSettingsAccess();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) throw new HubApiError("Payload inválido.", 422);
  const result = await createHubInvitation(prisma, { organizationId: context.organizationId, memberId: context.memberId }, {
    email: body.email, organizationPosition: body.organizationPosition,
    memberCategory: body.memberCategory, directorateId: body.directorateId,
    appointAsDirector: body.appointAsDirector, confirmPresidentTransfer: body.confirmPresidentTransfer,
  });
  return hubJson(result, { status: 201 });
});
