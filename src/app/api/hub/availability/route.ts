import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { replaceAvailability } from "@/lib/hub/availability";
import { hasHubPermission } from "@/lib/hub/permissions";
import { organizationDate } from "@/lib/hub/timezone";

export const GET = withHubApi(async (request) => {
  const session = await requireHubPermission("collaboration:access");
  const requested =
    new URL(request.url).searchParams.get("memberId") || session.memberId;
  if (
    requested !== session.memberId &&
    !hasHubPermission(session.role, "availability:read-organization")
  )
    throw new HubApiError("Acao nao permitida.", 403);
  const member = await prisma.hubMember.findFirst({
    where: {
      id: requested,
      organizationId: session.organizationId,
      status: "ACTIVE",
    },
    select: { id: true, name: true },
  });
  if (!member) throw new HubApiError("Membro nao encontrado.", 404);
  const [rules, exceptions] = await Promise.all([
    prisma.hubAvailabilityRule.findMany({
      where: { organizationId: session.organizationId, memberId: requested },
      orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
      select: {
        id: true,
        weekday: true,
        startMinute: true,
        endMinute: true,
        timezone: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.hubAvailabilityException.findMany({
      where: {
        organizationId: session.organizationId,
        memberId: requested,
        date: {
          gte: new Date(
            `${organizationDate(new Date(), session.organization.timezone)}T00:00:00.000Z`,
          ),
        },
      },
      orderBy: [{ date: "asc" }, { startMinute: "asc" }],
      select: {
        id: true,
        date: true,
        type: true,
        startMinute: true,
        endMinute: true,
        reason: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);
  return hubJson({
    member,
    timezone: session.organization.timezone,
    rules,
    exceptions,
  });
});

export const PUT = withHubApi(async (request) => {
  const session = await requireHubPermission("availability:manage-own");
  const body = (await request.json().catch(() => null)) as {
    memberId?: string;
    rules?: unknown[];
  } | null;
  const memberId = body?.memberId || session.memberId;
  if (
    memberId !== session.memberId &&
    !hasHubPermission(session.role, "meetings:manage-all")
  )
    throw new HubApiError("Acao nao permitida.", 403);
  if (!Array.isArray(body?.rules))
    throw new HubApiError("Informe os intervalos semanais.", 422);
  const rules = await replaceAvailability(prisma, {
    organizationId: session.organizationId,
    actorId: session.memberId,
    memberId,
    rules: body.rules as never[],
    defaultTimezone: session.organization.timezone,
  });
  return hubJson({ rules });
});
