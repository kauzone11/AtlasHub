import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { handleScheduleMeeting } from "@/lib/hub/collaboration-handlers";

type Context = { params: Promise<{ id: string }> };

export const POST = withHubApi<Context>(async (request, context) => {
  const session = await requireHubPermission("collaboration:access");
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  return hubJson(
    await handleScheduleMeeting(prisma, session, id, body),
  );
});
