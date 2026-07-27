import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { organizationDate } from "@/lib/hub/timezone";

export const GET = withHubApi(async () => {
  const session = await requireHubPermission("availability:read-organization");
  const members = await prisma.hubMember.findMany({
    where: { organizationId: session.organizationId, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      directorate: { select: { id: true, name: true } },
      availabilityRules: {
        where: { isActive: true },
        orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
        select: {
          weekday: true,
          startMinute: true,
          endMinute: true,
          timezone: true,
        },
      },
      availabilityExceptions: {
        where: {
          date: {
            gte: new Date(
              `${organizationDate(new Date(), session.organization.timezone)}T00:00:00.000Z`,
            ),
          },
        },
        orderBy: { date: "asc" },
        take: 10,
        select: { date: true, type: true, startMinute: true, endMinute: true },
      },
    },
  });
  return hubJson({ members });
});
