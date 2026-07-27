import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { changeMeetingState } from "@/lib/hub/collaboration-service";
type Context = { params: Promise<{ id: string }> };
export const POST = withHubApi<Context>(async (request, context) => {
  const session = await requireHubPermission("collaboration:access");
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    attendance?: Array<{ memberId: string; status: string }>;
  } | null;
  const attendance = body?.attendance?.map((row) => {
    if (!row.memberId || !["ATTENDED", "ABSENT"].includes(row.status))
      throw new HubApiError("Presenca invalida.", 422);
    return row as { memberId: string; status: "ATTENDED" | "ABSENT" };
  });
  return hubJson({
    meeting: await changeMeetingState(
      prisma,
      session,
      id,
      "complete",
      null,
      attendance,
    ),
  });
});
