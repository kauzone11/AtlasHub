import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { handleCreateMeeting } from "@/lib/hub/collaboration-handlers";
import { hasHubPermission } from "@/lib/hub/permissions";
import {
  addCivilDays,
  organizationDate,
  organizationDayUtcRange,
} from "@/lib/hub/timezone";
export const GET = withHubApi(async (request) => {
  const session = await requireHubPermission("collaboration:access");
  const query = new URL(request.url).searchParams;
  const now = new Date();
  const status = query.get("status");
  const cursor = query.get("cursor");
  const mode = query.get("filter");
  const directorateId = query.get("directorate");
  const view = query.get("view");
  const selectedDate = query.get("date") ||
    organizationDate(now, session.organization.timezone);
  const weekday = new Date(`${selectedDate}T12:00:00.000Z`).getUTCDay();
  const periodStartDate =
    view === "week"
      ? addCivilDays(selectedDate, -((weekday + 6) % 7))
      : selectedDate;
  const periodEndDate = addCivilDays(
    periodStartDate,
    view === "week" ? 7 : view === "list" ? 30 : 1,
  );
  const period =
    view === "day" || view === "week" || view === "list"
      ? {
          startAt: organizationDayUtcRange(
            periodStartDate,
            session.organization.timezone,
          ).startAt,
          endAt: organizationDayUtcRange(
            periodEndDate,
            session.organization.timezone,
          ).startAt,
        }
      : null;
  const access = hasHubPermission(session.role, "meetings:manage-all")
    ? {}
    : {
        OR: [
          { directorateId: null },
          { createdById: session.memberId },
          { participants: { some: { memberId: session.memberId } } },
          ...(session.directorateId
            ? [{ directorateId: session.directorateId }]
            : []),
        ],
      };
  const meetings = await prisma.hubMeeting.findMany({
    where: {
      organizationId: session.organizationId,
      ...access,
      ...(mode === "upcoming"
        ? { startAt: { gte: now } }
        : mode === "past"
          ? { startAt: { lt: now } }
          : mode === "mine"
            ? { participants: { some: { memberId: session.memberId } } }
            : {}),
      ...(directorateId ? { directorateId } : {}),
      ...(period
        ? { startAt: { lt: period.endAt }, endAt: { gt: period.startAt } }
        : {}),
      ...(status &&
      ["DRAFT", "SCHEDULED", "CANCELLED", "COMPLETED"].includes(status)
        ? { status: status as never }
        : {}),
    },
    orderBy: [{ startAt: mode === "past" ? "desc" : "asc" }, { id: "asc" }],
    take: 31,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      title: true,
      status: true,
      startAt: true,
      endAt: true,
      timezone: true,
      location: true,
      directorate: { select: { id: true, name: true } },
      participants: {
        select: {
          memberId: true,
          responseStatus: true,
          member: { select: { id: true, name: true } },
        },
      },
    },
  });
  const page = meetings.slice(0, 30);
  return hubJson({
    meetings: page,
    capabilities: {
      canCreateMeeting: hasHubPermission(session.role, "meetings:create"),
    },
    nextCursor: meetings.length > 30 ? page.at(-1)?.id : null,
    period: period
      ? { startDate: periodStartDate, endDateExclusive: periodEndDate }
      : null,
    timezone: session.organization.timezone,
  });
});
export const POST = withHubApi(async (request) => {
  const session = await requireHubPermission("meetings:create");
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const result = await handleCreateMeeting(prisma, session, body);
  return hubJson(result, { status: result.idempotent ? 200 : 201 });
});
