import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { canCreateBoardInScope } from "@/lib/hub/collaboration-policy";
import { boardCapabilities } from "@/lib/hub/collaboration-policy";
import { handleCreateBoard } from "@/lib/hub/collaboration-handlers";
import { hasHubPermission } from "@/lib/hub/permissions";
export const GET = withHubApi(async (request) => {
  const session = await requireHubPermission("collaboration:access");
  const archived = new URL(request.url).searchParams.get("archived") === "true";
  if (
    archived &&
    !hasHubPermission(session.role, "boards:manage-all") &&
    session.role !== "DIRECTOR"
  )
    throw new HubApiError("Acao nao permitida.", 403);
  const access = hasHubPermission(session.role, "boards:manage-all")
    ? {}
    : {
        OR: [
          { scope: "ORGANIZATION" as const },
          ...(session.directorateId
            ? [
                {
                  scope: "DIRECTORATE" as const,
                  directorateId: session.directorateId,
                },
              ]
            : []),
        ],
      };
  const boards = await prisma.hubBoard.findMany({
    where: {
      organizationId: session.organizationId,
      isArchived: archived,
      ...access,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      name: true,
      description: true,
      organizationId: true,
      directorateId: true,
      createdById: true,
      scope: true,
      isArchived: true,
      directorate: { select: { id: true, name: true } },
      _count: { select: { tasks: true, columns: true } },
      createdAt: true,
      updatedAt: true,
    },
  });
  const directorates = await prisma.hubDirectorate.findMany({
    where: {
      organizationId: session.organizationId,
      isActive: true,
      ...(hasHubPermission(session.role, "boards:manage-all")
        ? {}
        : { id: session.directorateId || "" }),
    },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  return hubJson({
    boards: boards.map((board) => ({
      ...board,
      capabilities: boardCapabilities(session, board),
    })),
    creation: {
      canCreateOrganization: canCreateBoardInScope(
        session,
        "ORGANIZATION",
        null,
      ),
      directorates: directorates.filter((item) =>
        canCreateBoardInScope(session, "DIRECTORATE", item.id),
      ),
      canViewArchived:
        hasHubPermission(session.role, "boards:manage-all") ||
        session.role === "DIRECTOR",
    },
  });
});
export const POST = withHubApi(async (request) => {
  const session = await requireHubPermission("boards:create");
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const board = await handleCreateBoard(prisma, session, body);
  return hubJson({ board }, { status: 201 });
});
