import { hubJson, withHubApi } from "@/lib/hub/api";
import { requireHubSettingsAccess } from "@/lib/hub/settings-access";
import { getHubSettings } from "@/lib/hub/settings-service";
import { prisma } from "@/lib/prisma";

export const GET = withHubApi(async () => {
  const context = await requireHubSettingsAccess();
  return hubJson(await getHubSettings(prisma, context.organizationId));
});
