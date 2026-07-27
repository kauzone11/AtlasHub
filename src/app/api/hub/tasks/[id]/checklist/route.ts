import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { assertTaskEdit } from "@/lib/hub/collaboration-policy";
import { text } from "@/lib/hub/collaboration-validation";
type Context = { params: Promise<{ id: string }> };
export const PUT = withHubApi<Context>(async (request, context) => {
  const session = await requireHubPermission("collaboration:access");
  const { id } = await context.params;
  const task = await prisma.hubTask.findFirst({
    where: { id, organizationId: session.organizationId },
    select: {
      id: true,
      organizationId: true,
      createdById: true,
      archivedAt: true,
      board: {
        select: {
          id: true,
          organizationId: true,
          directorateId: true,
          scope: true,
          createdById: true,
          isArchived: true,
        },
      },
      assignees: { select: { memberId: true } },
    },
  });
  if (!task) throw new HubApiError("Tarefa nao encontrada.", 404);
  assertTaskEdit(session, task);
  const body = (await request.json().catch(() => null)) as {
    items?: Array<Record<string, unknown>>;
    version?: number;
  } | null;
  const items = body?.items || [];
  const version = Number(body?.version);
  if (!Number.isInteger(version))
    throw new HubApiError("Versao da tarefa invalida.", 422);
  const updatedVersion = await prisma.$transaction(
    async (tx) => {
      const claimed = await tx.hubTask.updateMany({
        where: { id, version },
        data: { version: { increment: 1 } },
      });
      if (claimed.count !== 1)
        throw new HubApiError(
          "A tarefa foi alterada. Atualize e tente novamente.",
          409,
        );
      await tx.hubTaskChecklistItem.deleteMany({ where: { taskId: id } });
      if (items.length)
        await tx.hubTaskChecklistItem.createMany({
          data: items.map((item, index) => ({
            taskId: id,
            title: text(item.title, "Item", 240) as string,
            order: (index + 1) * 1000,
            isCompleted: item.isCompleted === true,
          })),
        });
      return version + 1;
    },
    { isolationLevel: "Serializable" },
  );
  return hubJson({ updated: items.length, version: updatedVersion });
});
