import type { HubRole, Prisma, PrismaClient } from "@prisma/client";

type Actor = { organizationId: string; memberId: string; role: HubRole; directorateId?: string | null; timezone: string };
type Scope = "organization" | "directorate";

export async function getCoreDashboard(client: PrismaClient, actor: Actor, requestedScope: Scope) {
  const scope: Scope = requestedScope === "directorate" && actor.directorateId ? "directorate" : "organization";
  const directorateId = scope === "directorate" ? actor.directorateId! : null;
  const now = new Date();
  const projectWhere: Prisma.HubProjectWhereInput = { organizationId: actor.organizationId, archivedAt: null, status: { in: ["DRAFT", "PLANNED", "ACTIVE", "APPROVED", "ON_HOLD"] }, ...(directorateId ? { OR: [{ primaryDirectorateId: directorateId }, { directorates: { some: { directorateId } } }] } : {}) };
  const taskWhere: Prisma.HubTaskWhereInput = { organizationId: actor.organizationId, archivedAt: null, completedAt: null, ...(directorateId ? { OR: [{ directorateId }, { assignees: { some: { member: { directorateId } } } }] } : {}) };
  const meetingWhere: Prisma.HubMeetingWhereInput = { organizationId: actor.organizationId, status: "SCHEDULED", startAt: { gte: now }, ...(directorateId ? { OR: [{ directorateId }, { directorates: { some: { directorateId } } }, { participants: { some: { member: { directorateId } } } }] } : {}) };
  const [activeProjects, pendingTasks, nextMeeting, projects, tasks, directorates, notifications] = await Promise.all([
    client.hubProject.count({ where: projectWhere }), client.hubTask.count({ where: taskWhere }),
    client.hubMeeting.findFirst({
      where: meetingWhere,
      select: {
        id: true,
        title: true,
        startAt: true,
        endAt: true,
        location: true,
        participants: {
          select: { member: { select: { id: true, name: true, avatarUrl: true } } },
          orderBy: { createdAt: "asc" },
          take: 4,
        },
      },
      orderBy: { startAt: "asc" },
    }),
    client.hubProject.findMany({ where: { ...projectWhere, deadline: { gte: now } }, select: { id: true, title: true, deadline: true, primaryDirectorate: { select: { id: true, name: true } } }, orderBy: { deadline: "asc" }, take: 8 }),
    client.hubTask.findMany({ where: { ...taskWhere, dueAt: { gte: now } }, select: { id: true, title: true, dueAt: true, priority: true, directorate: { select: { id: true, name: true } } }, orderBy: { dueAt: "asc" }, take: 8 }),
    client.hubDirectorate.findMany({
      where: { organizationId: actor.organizationId, archivedAt: null },
      select: {
        id: true, name: true, icon: true,
        _count: { select: { members: { where: { status: "ACTIVE" } }, primaryProjects: { where: { archivedAt: null } }, tasks: { where: { archivedAt: null, completedAt: null } } } },
      },
      orderBy: { order: "asc" },
    }),
    client.hubNotification.findMany({ where: { organizationId: actor.organizationId, recipientMemberId: actor.memberId, readAt: null, archivedAt: null, dismissedAt: null, deletedAt: null }, select: { id: true, title: true, body: true, href: true, type: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const upcomingDeadlines = [...projects.map((item) => ({ type: "PROJECT" as const, id: item.id, title: item.title, at: item.deadline!, href: `/hub/projetos/${item.id}`, directorate: item.primaryDirectorate })), ...tasks.map((item) => ({ type: "TASK" as const, id: item.id, title: item.title, at: item.dueAt!, href: `/hub/tarefas/${item.id}`, directorate: item.directorate }))].sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 10);
  return { scope, timezone: actor.timezone, summary: { activeProjects, pendingTasks, upcomingDeadlines: upcomingDeadlines.length }, nextMeeting, upcomingDeadlines, directorates: directorates.map((item) => ({ id: item.id, name: item.name, icon: item.icon, memberCount: item._count.members, activeProjects: item._count.primaryProjects, pendingTasks: item._count.tasks })), notifications };
}
