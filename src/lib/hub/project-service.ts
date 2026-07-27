import crypto from "crypto";
import type { HubRole, Prisma, PrismaClient } from "@prisma/client";
import { HubApiError } from "@/lib/hub/api";
import { writeHubAudit } from "@/lib/hub/audit";
import { hasHubPermission } from "@/lib/hub/permissions";
import { hubCoreTransaction } from "@/lib/hub/core-transaction";

type Actor = { organizationId: string; memberId: string; role: HubRole; directorateId?: string | null };
const ACTIVE = ["DRAFT", "PLANNED", "ACTIVE", "APPROVED", "ON_HOLD"];

function canManage(actor: Actor, directorateIds: string[] = []) {
  return hasHubPermission(actor.role, "projects:manage") || (actor.role === "DIRECTOR" && Boolean(actor.directorateId) && directorateIds.includes(actor.directorateId!));
}

async function scopedRelations(tx: Prisma.TransactionClient, actor: Actor, input: { primaryDirectorateId: string; directorateIds?: string[]; managerId?: string | null; teamMemberIds?: string[] }) {
  const directorateIds = [...new Set([input.primaryDirectorateId, ...(input.directorateIds || [])])];
  const foundDirectorates = await tx.hubDirectorate.count({ where: { id: { in: directorateIds }, organizationId: actor.organizationId, archivedAt: null } });
  if (foundDirectorates !== directorateIds.length) throw new HubApiError("Diretoria não encontrada.", 404);
  const memberIds = [...new Set([...(input.teamMemberIds || []), ...(input.managerId ? [input.managerId] : [])])];
  if (memberIds.length) {
    const foundMembers = await tx.hubMember.count({ where: { id: { in: memberIds }, organizationId: actor.organizationId, status: "ACTIVE" } });
    if (foundMembers !== memberIds.length) throw new HubApiError("Membro não encontrado.", 404);
  }
  return { directorateIds, memberIds };
}

const include = {
  primaryDirectorate: { select: { id: true, name: true, icon: true } },
  manager: { select: { id: true, name: true, avatarUrl: true } },
  directorates: { select: { directorate: { select: { id: true, name: true } } } },
  teamMembers: { select: { member: { select: { id: true, name: true, email: true, avatarUrl: true, directorate: { select: { id: true, name: true } } } } } },
  milestones: { orderBy: { dueAt: "asc" as const } },
  tasks: { where: { archivedAt: null }, select: { id: true, title: true, status: true, priority: true, dueAt: true, completedAt: true } },
  calendarEvents: { where: { archivedAt: null }, select: { id: true, title: true, startAt: true, endAt: true, type: true } },
  financialEntries: { where: { status: { not: "CANCELLED" as const } }, select: { id: true, description: true, direction: true, status: true, totalCents: true, competenceDate: true } },
} satisfies Prisma.HubProjectInclude;

export async function listProjects(client: PrismaClient, actor: Actor, filters: { archived?: boolean; status?: string; directorateId?: string } = {}) {
  const items = await client.hubProject.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(filters.archived ? { archivedAt: { not: null } } : { archivedAt: null }),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.directorateId ? { OR: [{ primaryDirectorateId: filters.directorateId }, { directorates: { some: { directorateId: filters.directorateId } } }] } : {}),
    },
    include: { primaryDirectorate: true, manager: { select: { id: true, name: true } }, directorates: { select: { directorate: { select: { id: true, name: true } } } }, teamMembers: { select: { memberId: true } }, _count: { select: { tasks: { where: { archivedAt: null, completedAt: null } }, milestones: { where: { completedAt: null } } } } },
    orderBy: [{ archivedAt: "asc" }, { deadline: "asc" }, { updatedAt: "desc" }],
  });
  return items.map((item) => ({ ...item, directorates: item.directorates.map((link) => link.directorate), teamCount: item.teamMembers.length, pendingTasks: item._count.tasks, pendingMilestones: item._count.milestones, capabilities: { canManage: canManage(actor, [item.primaryDirectorateId || "", ...item.directorates.map((link) => link.directorate.id)]) } }));
}

export async function getProject(client: PrismaClient, actor: Actor, id: string) {
  const project = await client.hubProject.findFirst({ where: { id, organizationId: actor.organizationId }, include });
  if (!project) throw new HubApiError("Projeto não encontrado.", 404);
  const meetings = await client.hubMeeting.findMany({ where: { organizationId: actor.organizationId, directorates: { some: { directorateId: { in: [project.primaryDirectorateId || "", ...project.directorates.map((link) => link.directorate.id)] } } }, startAt: { gte: project.startDate || undefined } }, select: { id: true, title: true, startAt: true, endAt: true, status: true }, orderBy: { startAt: "desc" }, take: 30 });
  const directorates = project.directorates.map((link) => link.directorate);
  return { ...project, directorates, team: project.teamMembers.map((link) => link.member), meetings, capabilities: { canManage: canManage(actor, [project.primaryDirectorateId || "", ...directorates.map((item) => item.id)]) } };
}

export type ProjectInput = { name: string; client?: string | null; description?: string | null; primaryDirectorateId: string; directorateIds?: string[]; managerId?: string | null; teamMemberIds?: string[]; status?: string; startDate?: Date | null; deadline?: Date | null; progress?: number; nextDelivery?: string | null };

export async function createProject(client: PrismaClient, actor: Actor, input: ProjectInput, idempotencyKey: string = crypto.randomUUID()) {
  const name = input.name.trim();
  if (name.length < 2) throw new HubApiError("Informe um nome válido.", 400);
  if (!Number.isInteger(input.progress ?? 0) || (input.progress ?? 0) < 0 || (input.progress ?? 0) > 100) throw new HubApiError("Progresso inválido.", 400);
  return hubCoreTransaction(client, async (tx) => {
    const relations = await scopedRelations(tx, actor, input);
    if (!canManage(actor, relations.directorateIds)) throw new HubApiError("Ação não permitida.", 403);
    const existing = await tx.hubProject.findUnique({ where: { idempotencyKey } });
    if (existing) return getProject(tx as unknown as PrismaClient, actor, existing.id);
    const project = await tx.hubProject.create({ data: {
      organizationId: actor.organizationId, idempotencyKey, title: name, client: input.client?.trim() || null, description: input.description?.trim() || null,
      primaryDirectorateId: input.primaryDirectorateId, managerId: input.managerId || null, responsibleMemberId: input.managerId || null,
      status: input.status || "ACTIVE", startDate: input.startDate, deadline: input.deadline, progress: input.progress || 0, nextDelivery: input.nextDelivery?.trim() || null, createdById: actor.memberId,
      directorates: { create: relations.directorateIds.map((directorateId) => ({ directorateId })) },
      teamMembers: { create: [...new Set(input.teamMemberIds || [])].map((memberId) => ({ memberId })) },
    } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.memberId, action: "PROJECT_CREATED", entity: "PROJECT", entityId: project.id, metadata: { name, directorates: relations.directorateIds.length, team: input.teamMemberIds?.length || 0 } });
    return getProject(tx as unknown as PrismaClient, actor, project.id);
  });
}

export async function updateProject(client: PrismaClient, actor: Actor, id: string, input: Partial<ProjectInput> & { version: number; action?: "archive" | "reopen" | "cancel" }) {
  return hubCoreTransaction(client, async (tx) => {
    const current = await tx.hubProject.findFirst({ where: { id, organizationId: actor.organizationId }, include: { directorates: true } });
    if (!current) throw new HubApiError("Projeto não encontrado.", 404);
    const currentDirectorates = [current.primaryDirectorateId || "", ...current.directorates.map((link) => link.directorateId)];
    if (!canManage(actor, currentDirectorates)) throw new HubApiError("Ação não permitida.", 403);
    const primaryDirectorateId = input.primaryDirectorateId || current.primaryDirectorateId;
    if (!primaryDirectorateId) throw new HubApiError("Informe a diretoria principal.", 400);
    const relations = await scopedRelations(tx, actor, { primaryDirectorateId, directorateIds: input.directorateIds ?? current.directorates.map((link) => link.directorateId), managerId: input.managerId, teamMemberIds: input.teamMemberIds });
    const updated = await tx.hubProject.updateMany({ where: { id, organizationId: actor.organizationId, version: input.version }, data: {
      ...(input.name?.trim() ? { title: input.name.trim() } : {}), ...(input.client !== undefined ? { client: input.client?.trim() || null } : {}), ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      primaryDirectorateId, ...(input.managerId !== undefined ? { managerId: input.managerId || null, responsibleMemberId: input.managerId || null } : {}), ...(input.status ? { status: input.status } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}), ...(input.deadline !== undefined ? { deadline: input.deadline } : {}), ...(input.progress !== undefined ? { progress: input.progress } : {}), ...(input.nextDelivery !== undefined ? { nextDelivery: input.nextDelivery?.trim() || null } : {}),
      ...(input.action === "archive" ? { archivedAt: new Date() } : {}), ...(input.action === "reopen" ? { archivedAt: null, status: "ACTIVE", cancelledAt: null, cancelledReason: null } : {}), ...(input.action === "cancel" ? { status: "CANCELLED", cancelledAt: new Date() } : {}), version: { increment: 1 },
    } });
    if (!updated.count) throw new HubApiError("O projeto foi alterado por outra pessoa. Atualize a página.", 409);
    if (input.directorateIds || input.primaryDirectorateId) {
      await tx.hubProjectDirectorate.deleteMany({ where: { projectId: id } });
      await tx.hubProjectDirectorate.createMany({ data: relations.directorateIds.map((directorateId) => ({ projectId: id, directorateId })) });
    }
    if (input.teamMemberIds) {
      await tx.hubProjectTeamMember.deleteMany({ where: { projectId: id } });
      if (input.teamMemberIds.length) await tx.hubProjectTeamMember.createMany({ data: [...new Set(input.teamMemberIds)].map((memberId) => ({ projectId: id, memberId })) });
    }
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.memberId, action: input.action ? `PROJECT_${input.action.toUpperCase()}` : "PROJECT_UPDATED", entity: "PROJECT", entityId: id });
    return getProject(tx as unknown as PrismaClient, actor, id);
  });
}

export function activeProjectStatuses() { return ACTIVE; }
