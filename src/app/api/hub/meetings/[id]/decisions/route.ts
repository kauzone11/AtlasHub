import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { createMeetingDecision } from "@/lib/hub/collaboration-service";

type Context = { params: Promise<{ id: string }> };

export const POST = withHubApi<Context>(async (request, context) => {
  const session = await requireHubPermission("collaboration:access");
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const decision = await createMeetingDecision(prisma, session, id, body);
  return hubJson({ decision }, { status: 201 });
});
