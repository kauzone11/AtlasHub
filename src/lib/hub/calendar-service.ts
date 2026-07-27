import type { HubRole, PrismaClient } from "@prisma/client";
import { HubApiError } from "@/lib/hub/api";
import { writeHubAudit } from "@/lib/hub/audit";
import { hubCoreTransaction } from "@/lib/hub/core-transaction";

type Actor = { organizationId: string; memberId: string; role: HubRole; directorateId?: string | null; timezone: string };

export async function getCalendar(client: PrismaClient, actor: Actor, input: { from: Date; to: Date; directorateId?: string }) {
  if (!(input.from < input.to) || input.to.getTime() - input.from.getTime() > 1000 * 60 * 60 * 24 * 370) throw new HubApiError("Período inválido.", 400);
  const directorateId = input.directorateId || undefined;
  const [manual, meetings, tasks, projects, milestones] = await Promise.all([
    client.hubCalendarEvent.findMany({ where: { organizationId: actor.organizationId, archivedAt: null, startAt: { lt: input.to }, endAt: { gt: input.from }, ...(directorateId ? { directorateId } : {}) }, orderBy: { startAt: "asc" } }),
    client.hubMeeting.findMany({ where: { organizationId: actor.organizationId, status: { in: ["SCHEDULED", "DRAFT"] }, startAt: { lt: input.to }, endAt: { gt: input.from }, ...(directorateId ? { OR: [{ directorateId }, { directorates: { some: { directorateId } } }] } : {}) }, select: { id: true, title: true, description: true, startAt: true, endAt: true, timezone: true, location: true, status: true }, orderBy: { startAt: "asc" } }),
    client.hubTask.findMany({ where: { organizationId: actor.organizationId, archivedAt: null, dueAt: { gte: input.from, lt: input.to }, ...(directorateId ? { directorateId } : {}) }, select: { id: true, title: true, description: true, dueAt: true, completedAt: true, directorateId: true, projectId: true } }),
    client.hubProject.findMany({ where: { organizationId: actor.organizationId, archivedAt: null, deadline: { gte: input.from, lt: input.to }, ...(directorateId ? { OR: [{ primaryDirectorateId: directorateId }, { directorates: { some: { directorateId } } }] } : {}) }, select: { id: true, title: true, description: true, deadline: true, primaryDirectorateId: true } }),
    client.hubProjectMilestone.findMany({ where: { project: { organizationId: actor.organizationId, archivedAt: null, ...(directorateId ? { OR: [{ primaryDirectorateId: directorateId }, { directorates: { some: { directorateId } } }] } : {}) }, dueAt: { gte: input.from, lt: input.to } }, select: { id: true, title: true, description: true, dueAt: true, completedAt: true, projectId: true } }),
  ]);
  const dayEnd = (value: Date) => new Date(value.getTime() + 24 * 60 * 60 * 1000);
  const events = [
    ...manual.map((item) => ({ ...item, source: "MANUAL", href: null })),
    ...meetings.map((item) => ({ id: `meeting:${item.id}`, entityId: item.id, type: "MEETING", source: "MEETING", title: item.title, description: item.description, startAt: item.startAt, endAt: item.endAt, allDay: false, timezone: item.timezone, location: item.location, status: item.status, href: `/hub/reunioes/${item.id}` })),
    ...tasks.map((item) => ({ id: `task:${item.id}`, entityId: item.id, type: "TASK_DEADLINE", source: "TASK", title: item.title, description: item.description, startAt: item.dueAt!, endAt: item.dueAt!, allDay: false, timezone: actor.timezone, status: item.completedAt ? "DONE" : "PENDING", href: `/hub/tarefas/${item.id}` })),
    ...projects.map((item) => ({ id: `project:${item.id}`, entityId: item.id, type: "PROJECT_DEADLINE", source: "PROJECT", title: item.title, description: item.description, startAt: item.deadline!, endAt: dayEnd(item.deadline!), allDay: true, timezone: actor.timezone, href: `/hub/projetos/${item.id}` })),
    ...milestones.map((item) => ({ id: `milestone:${item.id}`, entityId: item.id, type: "MILESTONE", source: "MILESTONE", title: item.title, description: item.description, startAt: item.dueAt, endAt: dayEnd(item.dueAt), allDay: true, timezone: actor.timezone, status: item.completedAt ? "DONE" : "PENDING", href: `/hub/projetos/${item.projectId}` })),
  ].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return { timezone: actor.timezone, events };
}

export async function createCalendarEvent(client: PrismaClient, actor: Actor, input: { title: string; description?: string | null; startAt: Date; endAt: Date; allDay?: boolean; timezone?: string; location?: string | null; directorateId?: string | null; projectId?: string | null }) {
  if (actor.role === "VIEWER") throw new HubApiError("Ação não permitida.", 403);
  if (input.title.trim().length < 2 || !(input.startAt < input.endAt)) throw new HubApiError("Dados do evento inválidos.", 400);
  return hubCoreTransaction(client, async (tx) => {
    if (input.directorateId && !(await tx.hubDirectorate.count({ where: { id: input.directorateId, organizationId: actor.organizationId, archivedAt: null } }))) throw new HubApiError("Diretoria não encontrada.", 404);
    if (input.projectId && !(await tx.hubProject.count({ where: { id: input.projectId, organizationId: actor.organizationId, archivedAt: null } }))) throw new HubApiError("Projeto não encontrado.", 404);
    const event = await tx.hubCalendarEvent.create({ data: { organizationId: actor.organizationId, type: "MANUAL", title: input.title.trim(), description: input.description?.trim() || null, startAt: input.startAt, endAt: input.endAt, allDay: Boolean(input.allDay), timezone: input.timezone || actor.timezone, location: input.location?.trim() || null, directorateId: input.directorateId || null, projectId: input.projectId || null, createdById: actor.memberId } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.memberId, action: "CALENDAR_EVENT_CREATED", entity: "CALENDAR_EVENT", entityId: event.id });
    return event;
  });
}

export async function updateCalendarEvent(client: PrismaClient, actor: Actor, id: string, input: { version: number; title?: string; description?: string | null; startAt?: Date; endAt?: Date; allDay?: boolean; timezone?: string; location?: string | null; archive?: boolean }) {
  if (actor.role === "VIEWER") throw new HubApiError("Ação não permitida.", 403);
  return hubCoreTransaction(client, async (tx) => {
    const current = await tx.hubCalendarEvent.findFirst({ where: { id, organizationId: actor.organizationId, type: "MANUAL" } });
    if (!current) throw new HubApiError("Evento não encontrado.", 404);
    if (current.createdById !== actor.memberId && !["SUPER_ADMIN", "ADMIN"].includes(actor.role)) throw new HubApiError("Ação não permitida.", 403);
    const startAt = input.startAt || current.startAt; const endAt = input.endAt || current.endAt;
    if (!(startAt < endAt)) throw new HubApiError("Período inválido.", 400);
    const updated = await tx.hubCalendarEvent.updateMany({ where: { id, organizationId: actor.organizationId, version: input.version }, data: { ...(input.title?.trim() ? { title: input.title.trim() } : {}), ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}), startAt, endAt, ...(input.allDay !== undefined ? { allDay: input.allDay } : {}), ...(input.timezone ? { timezone: input.timezone } : {}), ...(input.location !== undefined ? { location: input.location?.trim() || null } : {}), ...(input.archive ? { archivedAt: new Date() } : {}), version: { increment: 1 } } });
    if (!updated.count) throw new HubApiError("O evento foi alterado por outra pessoa. Atualize a página.", 409);
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.memberId, action: input.archive ? "CALENDAR_EVENT_ARCHIVED" : "CALENDAR_EVENT_UPDATED", entity: "CALENDAR_EVENT", entityId: id });
    return tx.hubCalendarEvent.findUniqueOrThrow({ where: { id } });
  });
}
