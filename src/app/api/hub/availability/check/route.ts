import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { checkAvailability } from "@/lib/hub/availability";
import { stringIds, validTimezone } from "@/lib/hub/collaboration-validation";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { parseMeetingLocalRange } from "@/lib/hub/timezone";
export const POST = withHubApi(async (request) => {
  const session = await requireHubPermission("meetings:create");
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const timezone = validTimezone(body?.timezone, session.organization.timezone);
  const range = parseMeetingLocalRange({
    startLocal: body?.startLocal,
    endLocal: body?.endLocal,
    timezone,
  });
  const conflicts = await checkAvailability(prisma, {
    organizationId: session.organizationId,
    requesterId: session.memberId,
    participantIds: stringIds(body?.participantIds),
    ...range,
    timezone,
  });
  return hubJson({ available: conflicts.length === 0, conflicts });
});
