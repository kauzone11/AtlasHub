import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { hasHubPermission } from "@/lib/hub/permissions";

export const GET = withHubApi(async () => {
  const session = await requireHubPermission("collaboration:access");
  const [members, directorates, boards, projects] = await Promise.all([
    prisma.hubMember.findMany({
      where: { organizationId: session.organizationId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, avatarUrl: true, directorateId: true },
    }),
    prisma.hubDirectorate.findMany({
      where: { organizationId: session.organizationId, isActive: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.hubBoard.findMany({
      where: {
        organizationId: session.organizationId,
        isArchived: false,
        ...(hasHubPermission(session.role, "boards:manage-all")
          ? {}
          : {
              OR: [
                { scope: "ORGANIZATION" },
                ...(session.directorateId
                  ? [
                      {
                        scope: "DIRECTORATE" as const,
                        directorateId: session.directorateId,
                      },
                    ]
                  : []),
              ],
            }),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        columns: {
          where: { isArchived: false },
          orderBy: { order: "asc" },
          select: { id: true, name: true },
        },
      },
    }),
    prisma.hubProject.findMany({
      where: { organizationId: session.organizationId, archivedAt: null },
      orderBy: { title: "asc" },
      select: { id: true, title: true, primaryDirectorateId: true },
    }),
  ]);
  return hubJson({
    members,
    directorates,
    boards,
    projects,
    memberId: session.memberId,
    role: session.role,
    directorateId: session.directorateId,
    permissions: session.permissions,
    capabilities: {
      canCreateMeeting: hasHubPermission(session.role, "meetings:create"),
    },
    timezone: session.organization.timezone,
  });
});
