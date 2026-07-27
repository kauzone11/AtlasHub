import crypto from "crypto";
import type { HubRole, Prisma, PrismaClient } from "@prisma/client";
import { HubApiError } from "@/lib/hub/api";
import { writeHubAudit } from "@/lib/hub/audit";
import { hasHubPermission } from "@/lib/hub/permissions";
import { hubCoreTransaction } from "@/lib/hub/core-transaction";

type Actor = { organizationId: string; memberId: string; role: HubRole; directorateId?: string | null };
export type TaskFilter = "mine" | "directorate" | "all" | "overdue" | "week" | "completed" | "archived";
const STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as const;

function assertMutable(actor: Actor) {
  if (actor.role === "VIEWER") throw new HubApiError("Ação não permitida.", 403);
}

async function assertRelations(tx: Prisma.TransactionClient, actor: Actor, input: { directorateId?: string | null; projectId?: string | null; assigneeId?: string | null }) {
  if (input.directorateId && !(await tx.hubDirectorate.count({ where: { id: input.directorateId, organizationId: actor.organizationId, archivedAt: null } }))) throw new HubApiError("Diretoria não encontrada.", 404);
  if (input.projectId && !(await tx.hubProject.count({ where: { id: input.projectId, organizationId: actor.organizationId, archivedAt: null } }))) throw new HubApiError("Projeto não encontrado.", 404);
  if (input.assigneeId && !(await tx.hubMember.count({ where: { id: input.assigneeId, organizationId: actor.organizationId, status: "ACTIVE" } }))) throw new HubApiError("Responsável não encontrado.", 404);
}

async function ensureCoreBoard(tx: Prisma.TransactionClient, actor: Actor, directorateId: string | null) {
  const existing = await tx.hubBoard.findFirst({ where: { organizationId: actor.organizationId, directorateId, isArchived: false, name: "Tarefas" }, include: { columns: { where: { isArchived: false }, orderBy: { order: "asc" } } } });
  if (existing?.columns.length) return existing;
  return tx.hubBoard.create({ data: { organizationId: actor.organizationId, directorateId, name: "Tarefas", description: "Quadro interno do módulo simplificado de tarefas", scope: directorateId ? "DIRECTORATE" : "ORGANIZATION", createdById: actor.memberId, columns: { create: [
    { name: "A fazer", order: 0 }, { name: "Em andamento", order: 1 }, { name: "Bloqueadas", order: 2 }, { name: "Concluídas", order: 3, isDoneColumn: true },
  ] } }, include: { columns: { orderBy: { order: "asc" } } } });
}

function taskSelect() {
  return {
    id: true, title: true, description: true, status: true, priority: true, dueAt: true, completedAt: true, archivedAt: true, version: true, createdAt: true, updatedAt: true,
    directorate: { select: { id: true, name: true } }, project: { select: { id: true, title: true } },
    assignees: { select: { member: { select: { id: true, name: true, avatarUrl: true } } } },
    board: { select: { id: true, name: true } }, column: { select: { id: true, name: true, isDoneColumn: true } }, sourceMeeting: { select: { id: true, title: true } },
  } satisfies Prisma.HubTaskSelect;
}

export async function listCoreTasks(client: PrismaClient, actor: Actor, input: { filter?: TaskFilter; projectId?: string; directorateId?: string; query?: string } = {}) {
  const now = new Date();
  const week = new Date(now); week.setUTCDate(week.getUTCDate() + 7);
  const filter = input.filter || "mine";
  const where: Prisma.HubTaskWhereInput = {
    organizationId: actor.organizationId,
    ...(filter === "archived" ? { archivedAt: { not: null } } : { archivedAt: null }),
    ...(filter === "mine" ? { assignees: { some: { memberId: actor.memberId } } } : {}),
    ...(filter === "directorate" ? { directorateId: actor.directorateId || "__none__" } : {}),
    ...(filter === "overdue" ? { completedAt: null, dueAt: { lt: now } } : {}),
    ...(filter === "week" ? { completedAt: null, dueAt: { gte: now, lte: week } } : {}),
    ...(filter === "completed" ? { completedAt: { not: null } } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.directorateId ? { directorateId: input.directorateId } : {}),
    ...(input.query?.trim() ? { OR: [{ title: { contains: input.query.trim(), mode: "insensitive" } }, { description: { contains: input.query.trim(), mode: "insensitive" } }] } : {}),
  };
  const tasks = await client.hubTask.findMany({ where, select: taskSelect(), orderBy: [{ completedAt: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }, { position: "asc" }], take: 500 });
  return { tasks: tasks.map((task) => ({ ...task, responsible: task.assignees[0]?.member || null })), board: STATUSES.map((status) => ({ status, tasks: tasks.filter((task) => task.status === status) })) };
}

export async function getCoreTask(client: PrismaClient, actor: Actor, id: string) {
  const task = await client.hubTask.findFirst({ where: { id, organizationId: actor.organizationId }, select: taskSelect() });
  if (!task) throw new HubApiError("Tarefa não encontrada.", 404);
  return { ...task, responsible: task.assignees[0]?.member || null, capabilities: { canEdit: actor.role !== "VIEWER" && (hasHubPermission(actor.role, "tasks:manage-all") || task.assignees.some((item) => item.member.id === actor.memberId) || actor.directorateId === task.directorate?.id) } };
}

export type CoreTaskInput = { title: string; description?: string | null; responsibleMemberId?: string | null; directorateId?: string | null; projectId?: string | null; deadline?: Date | null; priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT"; status?: typeof STATUSES[number] };

export async function createCoreTask(client: PrismaClient, actor: Actor, input: CoreTaskInput, idempotencyKey: string = crypto.randomUUID()) {
  assertMutable(actor);
  if (input.title.trim().length < 2) throw new HubApiError("Informe um título válido.", 400);
  return hubCoreTransaction(client, async (tx) => {
    await assertRelations(tx, actor, { directorateId: input.directorateId, projectId: input.projectId, assigneeId: input.responsibleMemberId });
    const existing = await tx.hubTask.findUnique({ where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey } } });
    if (existing) return getCoreTask(tx as unknown as PrismaClient, actor, existing.id);
    const board = await ensureCoreBoard(tx, actor, input.directorateId || null);
    const status = input.status || "TODO";
    const column = board.columns[Math.max(0, STATUSES.indexOf(status))] || board.columns[0];
    const position = (await tx.hubTask.aggregate({ where: { columnId: column.id }, _max: { position: true } }))._max.position ?? -1;
    const task = await tx.hubTask.create({ data: { organizationId: actor.organizationId, boardId: board.id, columnId: column.id, directorateId: input.directorateId || null, projectId: input.projectId || null, title: input.title.trim(), description: input.description?.trim() || null, priority: input.priority || "NORMAL", status, dueAt: input.deadline || null, position: position + 1, createdById: actor.memberId, completedAt: status === "DONE" ? new Date() : null, idempotencyKey, assignees: input.responsibleMemberId ? { create: { memberId: input.responsibleMemberId } } : undefined } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.memberId, action: "TASK_CREATED", entity: "TASK", entityId: task.id, metadata: { projectId: input.projectId || null, directorateId: input.directorateId || null } });
    return getCoreTask(tx as unknown as PrismaClient, actor, task.id);
  });
}

export async function updateCoreTask(client: PrismaClient, actor: Actor, id: string, input: Partial<CoreTaskInput> & { version: number; archive?: boolean; restore?: boolean }) {
  assertMutable(actor);
  return hubCoreTransaction(client, async (tx) => {
    const current = await tx.hubTask.findFirst({ where: { id, organizationId: actor.organizationId }, include: { assignees: true, board: { include: { columns: { where: { isArchived: false }, orderBy: { order: "asc" } } } } } });
    if (!current) throw new HubApiError("Tarefa não encontrada.", 404);
    const canEdit = hasHubPermission(actor.role, "tasks:manage-all") || current.createdById === actor.memberId || current.assignees.some((item) => item.memberId === actor.memberId) || (actor.role === "DIRECTOR" && actor.directorateId === current.directorateId);
    if (!canEdit) throw new HubApiError("Ação não permitida.", 403);
    await assertRelations(tx, actor, { directorateId: input.directorateId, projectId: input.projectId, assigneeId: input.responsibleMemberId });
    const status = input.status || (current.status as typeof STATUSES[number]);
    if (!STATUSES.includes(status)) throw new HubApiError("Status inválido.", 400);
    let board = current.board;
    if (input.directorateId !== undefined && input.directorateId !== current.directorateId) board = await ensureCoreBoard(tx, actor, input.directorateId || null);
    const column = board.columns[Math.max(0, STATUSES.indexOf(status))] || board.columns[0];
    const claimed = await tx.hubTask.updateMany({ where: { id, organizationId: actor.organizationId, version: input.version }, data: {
      ...(input.title?.trim() ? { title: input.title.trim() } : {}), ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.directorateId !== undefined ? { directorateId: input.directorateId || null, boardId: board.id } : {}), ...(input.projectId !== undefined ? { projectId: input.projectId || null } : {}),
      ...(input.deadline !== undefined ? { dueAt: input.deadline } : {}), ...(input.priority ? { priority: input.priority } : {}), status, columnId: column.id,
      completedAt: status === "DONE" ? current.completedAt || new Date() : null, ...(input.archive ? { archivedAt: new Date() } : {}), ...(input.restore ? { archivedAt: null } : {}), version: { increment: 1 },
    } });
    if (!claimed.count) throw new HubApiError("A tarefa foi alterada por outra pessoa. Atualize a página.", 409);
    if (input.responsibleMemberId !== undefined) {
      await tx.hubTaskAssignee.deleteMany({ where: { taskId: id } });
      if (input.responsibleMemberId) await tx.hubTaskAssignee.create({ data: { taskId: id, memberId: input.responsibleMemberId } });
    }
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.memberId, action: input.archive ? "TASK_ARCHIVED" : input.restore ? "TASK_RESTORED" : "TASK_UPDATED", entity: "TASK", entityId: id });
    return getCoreTask(tx as unknown as PrismaClient, actor, id);
  });
}
