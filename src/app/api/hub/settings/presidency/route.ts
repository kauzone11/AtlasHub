import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { requireHubSettingsAccess } from "@/lib/hub/settings-access";
import { transferHubPresidency } from "@/lib/hub/settings-service";
import { prisma } from "@/lib/prisma";

export const POST = withHubApi(async (request) => {
  const context = await requireHubSettingsAccess();
  const body = await request.json().catch(() => null) as { memberId?: unknown; confirmPresidentTransfer?: unknown } | null;
  if (typeof body?.memberId !== "string" || body.confirmPresidentTransfer !== true) throw new HubApiError("Confirme explicitamente a transferência da Presidência.", 422);
  return hubJson({ member: await transferHubPresidency(prisma, { organizationId: context.organizationId, memberId: context.memberId }, body.memberId) });
});
