import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { replaceMeetingAgenda } from "@/lib/hub/collaboration-service";

type Context = { params: Promise<{ id: string }> };

export const PUT = withHubApi<Context>(async (request, context) => {
  const session = await requireHubPermission("collaboration:access");
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    items?: Array<Record<string, unknown>>;
  } | null;
  return hubJson(await replaceMeetingAgenda(prisma, session, id, body?.items || []));
});
