import type { HubRole, PrismaClient } from "@prisma/client";

type Actor = { organizationId: string; memberId: string; role: HubRole };

export async function searchHubRecords(client: PrismaClient, actor: Actor, rawQuery: string) {
  const query = rawQuery.trim().slice(0, 120);
  if (query.length < 2) return [];
  const contains = { contains: query, mode: "insensitive" as const };
  const [directorates, members, projects, tasks, meetings, events] = await Promise.all([
    client.hubDirectorate.findMany({ where: { organizationId: actor.organizationId, OR: [{ name: contains }, { description: contains }] }, select: { id: true, name: true, description: true, archivedAt: true }, take: 8 }),
    client.hubMember.findMany({ where: { organizationId: actor.organizationId, status: { not: "DELETED" }, OR: [{ name: contains }, { email: contains }, { position: contains }] }, select: { id: true, name: true, email: true, directorate: { select: { id: true, name: true } } }, take: 8 }),
    client.hubProject.findMany({ where: { organizationId: actor.organizationId, OR: [{ title: contains }, { client: contains }, { description: contains }] }, select: { id: true, title: true, client: true, status: true }, take: 8 }),
    client.hubTask.findMany({ where: { organizationId: actor.organizationId, OR: [{ title: contains }, { description: contains }] }, select: { id: true, title: true, status: true, project: { select: { title: true } } }, take: 8 }),
    client.hubMeeting.findMany({ where: { organizationId: actor.organizationId, OR: [{ title: contains }, { description: contains }, { location: contains }] }, select: { id: true, title: true, startAt: true, status: true }, take: 8 }),
    client.hubCalendarEvent.findMany({ where: { organizationId: actor.organizationId, archivedAt: null, type: "MANUAL", OR: [{ title: contains }, { description: contains }, { location: contains }] }, select: { id: true, title: true, startAt: true }, take: 8 }),
  ]);
  return [
    ...directorates.map((item) => ({ type: "DIRECTORATE", id: item.id, title: item.name, subtitle: item.description || (item.archivedAt ? "Arquivada" : "Diretoria"), href: `/hub/diretorias/${item.id}` })),
    ...members.map((item) => ({ type: "MEMBER", id: item.id, title: item.name, subtitle: item.directorate?.name || item.email, href: item.directorate ? `/hub/diretorias/${item.directorate.id}?membro=${item.id}` : "/hub/diretorias" })),
    ...projects.map((item) => ({ type: "PROJECT", id: item.id, title: item.title, subtitle: item.client || item.status, href: `/hub/projetos/${item.id}` })),
    ...tasks.map((item) => ({ type: "TASK", id: item.id, title: item.title, subtitle: item.project?.title || item.status, href: `/hub/tarefas/${item.id}` })),
    ...meetings.map((item) => ({ type: "MEETING", id: item.id, title: item.title, subtitle: item.startAt.toISOString(), href: `/hub/reunioes/${item.id}` })),
    ...events.map((item) => ({ type: "EVENT", id: item.id, title: item.title, subtitle: item.startAt.toISOString(), href: `/hub/agenda?evento=${item.id}` })),
  ].slice(0, 40);
}
