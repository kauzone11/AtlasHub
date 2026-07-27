import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import {
  assertMeetingAccess,
  meetingCapabilities,
} from "@/lib/hub/collaboration-policy";
import {
  meetingSelect,
  updateMeeting,
} from "@/lib/hub/collaboration-service";
import {
  safeHttpsUrl,
  stringIds,
  text,
  validTimezone,
} from "@/lib/hub/collaboration-validation";
import { parseMeetingLocalRange } from "@/lib/hub/timezone";

type Context = { params: Promise<{ id: string }> };

export const GET = withHubApi<Context>(async (_request, context) => {
  const session = await requireHubPermission("collaboration:access");
  const { id } = await context.params;
  const meeting = await prisma.hubMeeting.findFirst({
    where: { id, organizationId: session.organizationId },
    select: meetingSelect,
  });
  if (!meeting) throw new HubApiError("Reuniao nao encontrada.", 404);
  assertMeetingAccess(session, meeting);
  const capabilities = meetingCapabilities(session, meeting);
  return hubJson({
    meeting: { ...meeting, externalGuests: meeting.externalGuests.map((guest) => ({ id: guest.id, name: guest.name, ...(capabilities.canEdit ? { email: guest.email } : {}) })) },
    capabilities,
  });
});

export const PATCH = withHubApi<Context>(async (request, context) => {
  const session = await requireHubPermission("collaboration:access");
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) throw new HubApiError("Dados invalidos.", 422);
  const hasLocalRange =
    body.startLocal !== undefined || body.endLocal !== undefined;
  if (
    hasLocalRange &&
    (typeof body.startLocal !== "string" ||
      typeof body.endLocal !== "string" ||
      typeof body.timezone !== "string")
  )
    throw new HubApiError("Informe inicio e fim locais.", 422);
  const timezone =
    body.timezone === undefined
      ? undefined
      : validTimezone(body.timezone, session.organization.timezone);
  const range = hasLocalRange
    ? parseMeetingLocalRange({
        startLocal: body.startLocal,
        endLocal: body.endLocal,
        timezone: timezone!,
      })
    : {};
  const result = await updateMeeting(prisma, session, id, {
    title:
      body.title === undefined
        ? undefined
        : (text(body.title, "Titulo", 160) as string),
    description:
      body.description === undefined
        ? undefined
        : text(body.description, "Descricao", 4000, false),
    minutes:
      body.minutes === undefined
        ? undefined
        : text(body.minutes, "Ata", 20000, false),
    correctionReason:
      body.correctionReason === undefined
        ? undefined
        : text(body.correctionReason, "Motivo", 240, false),
    ...range,
    timezone,
    location:
      body.location === undefined
        ? undefined
        : text(body.location, "Local", 240, false),
    meetingUrl:
      body.meetingUrl === undefined ? undefined : safeHttpsUrl(body.meetingUrl),
    participantIds:
      body.participantIds === undefined
        ? undefined
        : stringIds(body.participantIds),
    confirmConflicts:
      body.confirmConflicts === undefined
        ? undefined
        : body.confirmConflicts === true,
    overrideReason:
      body.overrideReason === undefined
        ? undefined
        : text(
            body.overrideReason,
            "Motivo da confirmacao",
            240,
            false,
          ),
  });
  return hubJson({
    ...result,
    capabilities: meetingCapabilities(session, result.meeting),
  });
});
