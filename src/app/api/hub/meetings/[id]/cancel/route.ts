import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { changeMeetingState } from "@/lib/hub/collaboration-service";
import { text } from "@/lib/hub/collaboration-validation";
type Context = { params: Promise<{ id: string }> };
export const POST = withHubApi<Context>(async (request, context) => {
  const session = await requireHubPermission("collaboration:access");
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    reason?: unknown;
  } | null;
  return hubJson({
    meeting: await changeMeetingState(
      prisma,
      session,
      id,
      "cancel",
      text(body?.reason, "Motivo", 240),
    ),
  });
});
