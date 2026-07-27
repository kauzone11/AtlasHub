import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { updateMeetingAudience } from "@/lib/hub/meeting-service";

type Context = { params: Promise<{ id: string }> };
const ids = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string")
    : [];

export const PUT = withHubApi<Context>(async (request, context) => {
  const session = await requireHubPermission("collaboration:access");
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || !Number.isInteger(body.version))
    throw new HubApiError("Versão obrigatória.", 400);
  const guests = Array.isArray(body.externalGuests)
    ? body.externalGuests
        .map((value) =>
          value && typeof value === "object"
            ? (value as Record<string, unknown>)
            : {},
        )
        .filter((guest) => typeof guest.name === "string")
        .map((guest) => ({
          name: String(guest.name),
          email: typeof guest.email === "string" ? guest.email : null,
        }))
    : [];
  return hubJson({
    meeting: await updateMeetingAudience(prisma, session, id, {
    version: Number(body.version),
      organizationWide: body.organizationWide === true,
      directorateIds: ids(body.directorateIds),
      participantIds: ids(body.participantIds),
      externalGuests: guests,
    }),
  });
});
