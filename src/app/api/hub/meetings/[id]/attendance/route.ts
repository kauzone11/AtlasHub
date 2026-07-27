import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { updateMeetingAttendance } from "@/lib/hub/collaboration-service";

type Context = { params: Promise<{ id: string }> };

export const PUT = withHubApi<Context>(async (request, context) => {
  const session = await requireHubPermission("collaboration:access");
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    attendance?: Array<{ memberId: string; status: string }>;
  } | null;
  return hubJson(await updateMeetingAttendance(prisma, session, id, body?.attendance || []));
});
