import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import {
  assertBoardAccess,
  assertBoardManagement,
  boardCapabilities,
  taskCapabilities,
} from "@/lib/hub/collaboration-policy";
import { boardSelect } from "@/lib/hub/collaboration-service";
import { text } from "@/lib/hub/collaboration-validation";
import { writeHubAudit } from "@/lib/hub/audit";
type Context = { params: Promise<{ id: string }> };
export const GET = withHubApi<Context>(async (_request, context) => {
  const session = await requireHubPermission("collaboration:access");
  const { id } = await context.params;
  const board = await prisma.hubBoard.findFirst({
    where: { id, organizationId: session.organizationId },
    select: boardSelect,
  });
  if (!board) throw new HubApiError("Quadro nao encontrado.", 404);
  assertBoardAccess(session, board);
  return hubJson({
    board: {
      ...board,
      columns: board.columns.map((column) => ({
        ...column,
        tasks: column.tasks.map((task) => ({
          ...task,
          capabilities: taskCapabilities(session, {
            ...task,
            board,
            assignees: task.assignees.map((item) => ({
              memberId: item.member.id,
            })),
          }),
        })),
      })),
    },
    capabilities: boardCapabilities(session, board),
  });
});
export const PATCH = withHubApi<Context>(async (request, context) => {
  const session = await requireHubPermission("collaboration:access");
  const { id } = await context.params;
  const board = await prisma.hubBoard.findFirst({
    where: { id, organizationId: session.organizationId },
    select: {
      id: true,
      organizationId: true,
      directorateId: true,
      scope: true,
      createdById: true,
      isArchived: true,
    },
  });
  if (!board) throw new HubApiError("Quadro nao encontrado.", 404);
  assertBoardManagement(session, board);
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const archive = body?.isArchived === true;
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.hubBoard.update({
      where: { id },
      data: {
        name:
          body?.name === undefined ? undefined : text(body.name, "Nome", 120),
        description:
          body?.description === undefined
            ? undefined
            : text(body.description, "Descricao", 2000, false),
        isArchived: archive || undefined,
      },
      select: boardSelect,
    });
    await writeHubAudit(tx, {
      organizationId: session.organizationId,
      memberId: session.memberId,
      action: archive ? "BOARD_ARCHIVED" : "BOARD_UPDATED",
      entity: "BOARD",
      entityId: id,
    });
    return result;
  });
  return hubJson({
    board: updated,
    capabilities: boardCapabilities(session, updated),
  });
});
