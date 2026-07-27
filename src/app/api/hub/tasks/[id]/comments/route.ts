import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { assertTaskCommenting } from "@/lib/hub/collaboration-policy";
import { text } from "@/lib/hub/collaboration-validation";
import { createHubNotifications } from "@/lib/hub/notifications";
type Context = { params: Promise<{ id: string }> };
export const POST = withHubApi<Context>(async (request, context) => {
  const session = await requireHubPermission("collaboration:access");
  const { id } = await context.params;
  const task = await prisma.hubTask.findFirst({
    where: { id, organizationId: session.organizationId },
    select: {
      id: true,
      organizationId: true,
      title: true,
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
  assertTaskCommenting(session, task);
  if (task.board.isArchived || task.archivedAt)
    throw new HubApiError("Tarefa somente leitura.", 409);
  const body = (await request.json().catch(() => null)) as {
    body?: unknown;
  } | null;
  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.hubTaskComment.create({
      data: {
        taskId: id,
        authorId: session.memberId,
        body: text(body?.body, "Comentario", 4000) as string,
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, name: true } },
      },
    });
    const recipients = [
      ...new Set([
        task.createdById,
        ...task.assignees.map((item) => item.memberId),
      ]),
    ].filter((memberId) => memberId !== session.memberId);
    await createHubNotifications(
      tx,
      recipients.map((recipientMemberId) => ({
        organizationId: session.organizationId,
        recipientMemberId,
        actorMemberId: session.memberId,
        type: "TASK_COMMENTED",
        title: "Novo comentario em tarefa",
        body: task.title,
        href: `/hub/quadros/${task.board.id}?task=${id}`,
        entityType: "TASK_COMMENT",
        entityId: created.id,
        idempotencyKey: `task:${id}:comment:${created.id}:${recipientMemberId}`,
      })),
    );
    return created;
  });
  return hubJson({ comment }, { status: 201 });
});
