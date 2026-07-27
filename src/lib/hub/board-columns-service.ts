import type { Prisma, PrismaClient } from "@prisma/client";
import { HubApiError } from "@/lib/hub/api";
import { writeHubAudit } from "@/lib/hub/audit";
import { assertBoardManagement, type HubActor } from "@/lib/hub/collaboration-policy";
import { prismaErrorCode, serializationConflict } from "@/lib/hub/collaboration-idempotency";
import { text } from "@/lib/hub/collaboration-validation";
import { createHubNotifications } from "@/lib/hub/notifications";

type Body = Record<string, unknown> | null;

async function reconcileDoneColumn(
  tx: Prisma.TransactionClient,
  actor: HubActor,
  boardId: string,
  previousDoneColumnId: string | null,
  nextDoneColumnId: string,
) {
  if (previousDoneColumnId === nextDoneColumnId)
    return { completed: 0, reopened: 0, notifications: 0, skippedInactive: 0 };
  const [toComplete, toReopen] = await Promise.all([
    tx.hubTask.findMany({
      where: { boardId, columnId: nextDoneColumnId, archivedAt: null, completedAt: null },
      select: { id: true, title: true, version: true, createdById: true, assignees: { select: { memberId: true } } },
    }),
    previousDoneColumnId ? tx.hubTask.findMany({
      where: { boardId, columnId: previousDoneColumnId, archivedAt: null, completedAt: { not: null } },
      select: { id: true, title: true, version: true, createdById: true, assignees: { select: { memberId: true } } },
    }) : [],
  ]);
  const changedAt = new Date();
  if (toComplete.length) await tx.hubTask.updateMany({
    where: { id: { in: toComplete.map((task) => task.id) }, archivedAt: null, completedAt: null },
    data: { completedAt: changedAt, version: { increment: 1 } },
  });
  if (toReopen.length) await tx.hubTask.updateMany({
    where: { id: { in: toReopen.map((task) => task.id) }, archivedAt: null, completedAt: { not: null } },
    data: { completedAt: null, version: { increment: 1 } },
  });
  const notificationInputs = [...toComplete.map((task) => ({ task, completed: true })), ...toReopen.map((task) => ({ task, completed: false }))]
    .flatMap(({ task, completed }) => [...new Set([task.createdById, ...task.assignees.map((item) => item.memberId)])]
      .filter((recipientMemberId) => recipientMemberId !== actor.memberId)
      .map((recipientMemberId) => ({
        organizationId: actor.organizationId,
        recipientMemberId,
        actorMemberId: actor.memberId,
        type: completed ? "TASK_COMPLETED" as const : "TASK_UPDATED" as const,
        title: completed ? "Tarefa concluida" : "Tarefa reaberta",
        body: task.title,
        href: `/hub/tarefas/${task.id}`,
        entityType: "TASK",
        entityId: task.id,
        idempotencyKey: `task:${task.id}:done-column:v${task.version + 1}:${completed ? "completed" : "reopened"}:${recipientMemberId}`,
      })));
  const notificationResult = await createHubNotifications(tx, notificationInputs);
  return {
    completed: toComplete.length,
    reopened: toReopen.length,
    notifications: notificationResult.created,
    skippedInactive: notificationResult.skippedInactive,
  };
}

export async function updateBoardColumns(
  client: PrismaClient,
  actor: HubActor,
  boardId: string,
  body: Body,
) {
  const action = body?.action;
  const run = () => client.$transaction(async (tx) => {
    const board = await tx.hubBoard.findFirst({
      where: { id: boardId, organizationId: actor.organizationId },
      select: { id: true, organizationId: true, directorateId: true, scope: true, createdById: true, isArchived: true },
    });
    if (!board) throw new HubApiError("Quadro nao encontrado.", 404);
    assertBoardManagement(actor, board);
    let reconciliation = { completed: 0, reopened: 0, notifications: 0, skippedInactive: 0 };
    if (action === "add") {
      const max = (await tx.hubBoardColumn.aggregate({ where: { boardId }, _max: { order: true } }))._max.order || 0;
      await tx.hubBoardColumn.create({ data: { boardId, name: text(body?.name, "Nome", 80) as string, order: max + 1000 } });
    } else if (action === "rename") {
      const result = await tx.hubBoardColumn.updateMany({ where: { id: String(body?.columnId), boardId, isArchived: false }, data: { name: text(body?.name, "Nome", 80) as string } });
      if (result.count !== 1) throw new HubApiError("Coluna nao encontrada.", 404);
    } else if (action === "done") {
      const columnId = String(body?.columnId);
      const [target, previous] = await Promise.all([
        tx.hubBoardColumn.findFirst({ where: { id: columnId, boardId, isArchived: false }, select: { id: true } }),
        tx.hubBoardColumn.findFirst({ where: { boardId, isArchived: false, isDoneColumn: true }, select: { id: true } }),
      ]);
      if (!target) throw new HubApiError("Coluna nao encontrada.", 404);
      await tx.hubBoardColumn.updateMany({ where: { boardId }, data: { isDoneColumn: false } });
      const claimed = await tx.hubBoardColumn.updateMany({ where: { id: columnId, boardId, isArchived: false }, data: { isDoneColumn: true } });
      if (claimed.count !== 1) throw new HubApiError("Alteracao concorrente da coluna de conclusao.", 409);
      reconciliation = await reconcileDoneColumn(tx, actor, boardId, previous?.id || null, columnId);
    } else if (action === "archive") {
      const columnId = String(body?.columnId);
      const column = await tx.hubBoardColumn.findFirst({ where: { id: columnId, boardId, isArchived: false }, select: { id: true, isDoneColumn: true } });
      if (!column) throw new HubApiError("Coluna nao encontrada.", 404);
      if (await tx.hubBoardColumn.count({ where: { boardId, isArchived: false } }) <= 1)
        throw new HubApiError("O quadro deve manter uma coluna ativa.", 409);
      if (await tx.hubTask.count({ where: { boardId, columnId, archivedAt: null } }))
        throw new HubApiError("Mova as tarefas ativas antes de arquivar a coluna.", 409);
      if (column.isDoneColumn) {
        const replacement = String(body?.replacementDoneColumnId || "");
        if (!replacement || replacement === columnId || !(await tx.hubBoardColumn.count({ where: { id: replacement, boardId, isArchived: false } })))
          throw new HubApiError("Escolha outra coluna de conclusao antes de arquivar esta coluna.", 409);
        await tx.hubBoardColumn.updateMany({ where: { boardId }, data: { isDoneColumn: false } });
        const claimed = await tx.hubBoardColumn.updateMany({ where: { id: replacement, boardId, isArchived: false }, data: { isDoneColumn: true } });
        if (claimed.count !== 1) throw new HubApiError("Alteracao concorrente da coluna de conclusao.", 409);
        reconciliation = await reconcileDoneColumn(tx, actor, boardId, columnId, replacement);
      }
      const archived = await tx.hubBoardColumn.updateMany({ where: { id: columnId, boardId, isArchived: false }, data: { isArchived: true, isDoneColumn: false } });
      if (archived.count !== 1) throw new HubApiError("Coluna nao encontrada.", 404);
    } else if (action === "reorder" && Array.isArray(body?.columnIds)) {
      const ids = body.columnIds.map(String);
      const active = await tx.hubBoardColumn.findMany({ where: { boardId, isArchived: false }, orderBy: { order: "asc" }, select: { id: true } });
      const activeIds = active.map((item) => item.id);
      if (ids.length !== activeIds.length || new Set(ids).size !== ids.length || activeIds.some((id) => !ids.includes(id)))
        throw new HubApiError("Informe cada coluna ativa exatamente uma vez.", 422);
      await tx.hubBoardColumn.updateMany({ where: { boardId, isArchived: false }, data: { order: { increment: 1_000_000_000 } } });
      for (const [index, columnId] of ids.entries()) {
        const changed = await tx.hubBoardColumn.updateMany({ where: { id: columnId, boardId, isArchived: false }, data: { order: (index + 1) * 1000 } });
        if (changed.count !== 1) throw new HubApiError("Ordenacao concorrente invalida.", 409);
      }
    } else throw new HubApiError("Acao invalida.", 422);
    await writeHubAudit(tx, {
      organizationId: actor.organizationId,
      memberId: actor.memberId,
      action: "BOARD_COLUMNS_RESTRUCTURED",
      entity: "BOARD",
      entityId: boardId,
      metadata: { action: String(action), ...reconciliation },
    });
    const columns = await tx.hubBoardColumn.findMany({
      where: { boardId, isArchived: false },
      orderBy: [{ order: "asc" }, { id: "asc" }],
      select: { id: true, name: true, order: true, isDoneColumn: true },
    });
    if (columns.filter((column) => column.isDoneColumn).length !== 1)
      throw new HubApiError("O quadro deve manter exatamente uma coluna de conclusao.", 409);
    return { columns, reconciliation };
  }, { isolationLevel: "Serializable" });
  try { return await run(); } catch (error) {
    if (prismaErrorCode(error) === "P2034") throw serializationConflict();
    throw error;
  }
}
