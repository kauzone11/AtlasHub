import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { PrismaClient, type HubRole } from "@prisma/client";
import { createDirectorate, deleteDirectorate, getDirectorate, listDirectorates, moveDirectorateMember, updateDirectorate, type HubCoreActor } from "./directorate-service";
import { createProject, getProject, listProjects, updateProject } from "./project-service";
import { createCoreTask, getCoreTask, listCoreTasks, updateCoreTask } from "./task-service";
import { getCalendar, createCalendarEvent } from "./calendar-service";
import { getCoreDashboard } from "./dashboard-service";
import { getCoreMeeting, updateMeetingAudience } from "./meeting-service";
import { createAvailabilityPoll, createMeetingFromAvailability, getAvailabilityPoll, saveAvailabilitySelection } from "./availability-service";
import { applyNotificationAction, listCoreNotifications, respondMeetingFromNotification } from "./notification-action-service";
import { createCoreFinancialEntry, getCoreFinances } from "./finance-service";
import { searchHubRecords } from "./search-service";
import { listWorkspaceHubs } from "./hub-organization-admin-service";
import { HubApiError } from "./api";

const databaseUrl = process.env.ATLAS_HUB_TEST_DATABASE_URL || process.env.ECONOMIK_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("ATLAS_HUB_TEST_DATABASE_URL é obrigatória para os testes do núcleo simplificado.");
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
type Actor = HubCoreActor & { timezone: string; currency: string };

test("Atlas Hub simplificado funciona de ponta a ponta em PostgreSQL", async (suite) => {
  const org = await prisma.hubOrganization.create({ data: { name: `Core ${suffix}`, hubName: "Core", slug: `core-${suffix}`, timezone: "America/Fortaleza" } });
  const foreignOrg = await prisma.hubOrganization.create({ data: { name: `Foreign ${suffix}`, hubName: "Foreign", slug: `foreign-core-${suffix}` } });
  const dirA = await prisma.hubDirectorate.create({ data: { organizationId: org.id, name: "Projetos", slug: `projetos-${suffix}` } });
  const dirB = await prisma.hubDirectorate.create({ data: { organizationId: org.id, name: "Comercial", slug: `comercial-${suffix}` } });
  const dirC = await prisma.hubDirectorate.create({ data: { organizationId: org.id, name: "Presidência", slug: `presidencia-${suffix}` } });
  const foreignDir = await prisma.hubDirectorate.create({ data: { organizationId: foreignOrg.id, name: "Foreign", slug: `foreign-${suffix}` } });
  async function createMember(name: string, role: HubRole, directorateId?: string, organizationId = org.id) { return prisma.hubMember.create({ data: { organizationId, name, email: `${name}-${suffix}@test.local`, normalizedEmail: `${name}-${suffix}@test.local`, passwordHash: "test", status: "ACTIVE", role, directorateId } }); }
  const admin = await createMember("admin", "SUPER_ADMIN"); const director = await createMember("director", "DIRECTOR", dirA.id); const member = await createMember("member", "MEMBER", dirA.id); const extra = await createMember("extra", "MEMBER", dirB.id); const foreign = await createMember("foreign", "SUPER_ADMIN", foreignDir.id, foreignOrg.id);
  const actor: Actor = { organizationId: org.id, memberId: admin.id, role: "SUPER_ADMIN", directorateId: null, timezone: "America/Fortaleza", currency: "BRL" };
  const directorActor: Actor = { organizationId: org.id, memberId: director.id, role: "DIRECTOR", directorateId: dirA.id, timezone: "America/Fortaleza", currency: "BRL" };
  const memberActor: Actor = { organizationId: org.id, memberId: member.id, role: "MEMBER", directorateId: dirA.id, timezone: "America/Fortaleza", currency: "BRL" };
  let projectId = ""; let meetingId = "";
  try {
    await suite.test("navegação mantém exatamente os seis módulos e /hub", async () => { const shell = await readFile(path.join(process.cwd(), "src/components/hub/AtlasHubShell.tsx"), "utf8"); for (const route of ["/hub", "/hub/diretorias", "/hub/projetos", "/hub/tarefas", "/hub/agenda", "/hub/financas"]) assert.match(shell, new RegExp(route.replaceAll("/", "\\/"))); assert.equal((shell.match(/href: "\/hub/g) || []).length, 6); });

    await suite.test("CRUD de diretoria, concorrência, transferência e exclusão segura", async () => {
      const temporary = await createDirectorate(prisma, actor, { name: `Temporária ${suffix}`, description: "Pode ser removida" });
      await deleteDirectorate(prisma, actor, temporary.id, temporary.version);
      const created = await createDirectorate(prisma, actor, { name: `Operações ${suffix}`, description: "Descrição", icon: "⚙️", directorId: director.id, memberIds: [member.id] });
      assert.equal(created.director?.id, director.id); assert.equal(created.members.length, 2);
      const updated = await updateDirectorate(prisma, actor, created.id, { version: created.version, description: "Atualizada" }); assert.equal(updated.description, "Atualizada");
      await assert.rejects(() => updateDirectorate(prisma, actor, created.id, { version: created.version, description: "stale" }), (error: unknown) => error instanceof HubApiError && error.status === 409);
      await moveDirectorateMember(prisma, actor, created.id, member.id, dirA.id); assert.equal((await prisma.hubMember.findUniqueOrThrow({ where: { id: member.id } })).directorateId, dirA.id);
      await assert.rejects(() => deleteDirectorate(prisma, actor, created.id, updated.version), (error: unknown) => error instanceof HubApiError && error.status === 409);
      const current = await getDirectorate(prisma, actor, created.id); await updateDirectorate(prisma, actor, created.id, { version: current.version, action: "archive" }); assert.equal((await getDirectorate(prisma, actor, created.id)).archivedAt instanceof Date, true);
    });

    await suite.test("projeto persiste diretorias participantes, gerente e equipe", async () => {
      const project = await createProject(prisma, actor, { name: `Projeto ${suffix}`, client: "Cliente", description: "Entrega", primaryDirectorateId: dirA.id, directorateIds: [dirB.id, dirC.id], managerId: director.id, teamMemberIds: [member.id, extra.id], startDate: new Date("2026-07-01"), deadline: new Date("2026-08-01"), progress: 25, nextDelivery: "Diagnóstico" }, `project-${suffix}`);
      projectId = project.id; assert.equal(project.directorates.length, 3); assert.equal(project.team.length, 2); assert.equal(project.manager?.id, director.id);
      const updated = await updateProject(prisma, actor, project.id, { version: project.version, progress: 60, teamMemberIds: [member.id] }); assert.equal(updated.progress, 60); assert.equal(updated.team.length, 1);
      assert.equal((await listProjects(prisma, memberActor, { directorateId: dirB.id })).some((item) => item.id === project.id), true);
      await updateProject(prisma, actor, project.id, { version: updated.version, action: "archive" }); const reopened = await updateProject(prisma, actor, project.id, { version: updated.version + 1, action: "reopen" }); assert.equal(reopened.archivedAt, null);
    });

    await suite.test("tarefas mantêm consistência entre lista e quadro e seus vínculos", async () => {
      const task = await createCoreTask(prisma, actor, { title: `Tarefa ${suffix}`, description: "Executar", responsibleMemberId: member.id, directorateId: dirA.id, projectId, deadline: new Date(Date.now() + 86400000), priority: "HIGH" }, `task-${suffix}`);
      assert.equal(task.project?.id, projectId); assert.equal(task.directorate?.id, dirA.id);
      const moved = await updateCoreTask(prisma, memberActor, task.id, { version: task.version, status: "IN_PROGRESS" }); assert.equal(moved.status, "IN_PROGRESS"); assert.equal(moved.column.name, "Em andamento");
      const views = await listCoreTasks(prisma, memberActor, { filter: "mine" }); assert.equal(views.tasks.some((item) => item.id === task.id), true); assert.equal(views.board.find((column) => column.status === "IN_PROGRESS")?.tasks.some((item) => item.id === task.id), true);
      await updateCoreTask(prisma, memberActor, task.id, { version: moved.version, status: "DONE" }); assert.ok((await getCoreTask(prisma, memberActor, task.id)).completedAt);
    });

    await suite.test("calendário agrega evento, tarefa, projeto, marco e reunião", async () => {
      const from = new Date("2026-07-01T00:00:00Z"); const to = new Date("2026-09-01T00:00:00Z");
      await createCalendarEvent(prisma, actor, { title: `Evento ${suffix}`, startAt: new Date("2026-07-21T12:00:00Z"), endAt: new Date("2026-07-21T13:00:00Z"), directorateId: dirA.id });
      await prisma.hubProjectMilestone.create({ data: { projectId, title: "Marco", dueAt: new Date("2026-07-25") } });
      const meeting = await prisma.hubMeeting.create({ data: { organizationId: org.id, title: `Reunião ${suffix}`, status: "SCHEDULED", startAt: new Date("2026-07-22T12:00:00Z"), endAt: new Date("2026-07-22T13:00:00Z"), timezone: actor.timezone, createdById: admin.id, idempotencyKey: `meeting-${suffix}`, directorates: { create: [{ directorateId: dirA.id }, { directorateId: dirB.id }, { directorateId: dirC.id }] }, participants: { create: [{ memberId: admin.id, responseStatus: "ACCEPTED" }, { memberId: member.id }, { memberId: extra.id }] } } }); meetingId = meeting.id;
      const calendar = await getCalendar(prisma, actor, { from, to }); for (const source of ["MANUAL", "MEETING", "PROJECT", "MILESTONE"]) assert.ok(calendar.events.some((item) => item.source === source));
    });

    await suite.test("reunião aceita mais de duas diretorias, participante adicional e protege e-mail externo", async () => {
      const updated = await updateMeetingAudience(prisma, actor, meetingId, { version: 1, organizationWide: false, directorateIds: [dirA.id, dirB.id, dirC.id], participantIds: [admin.id, member.id, extra.id], externalGuests: [{ name: "Convidada", email: "guest@example.test" }] }); assert.equal(updated.directorates.length, 3); assert.equal(updated.participants.length, 3); assert.equal(updated.externalGuests[0].email, "guest@example.test");
      const privateView = await getCoreMeeting(prisma, memberActor, meetingId); assert.equal("email" in privateView.externalGuests[0], false);
    });

    await suite.test("convites aceitam, recusam e rejeitam versão obsoleta transacionalmente", async () => {
      const notificationA = await prisma.hubNotification.create({ data: { organizationId: org.id, recipientMemberId: member.id, type: "MEETING_INVITATION", title: "Convite", body: "Reunião", href: `/hub/reunioes/${meetingId}`, entityType: "MEETING", entityId: meetingId, idempotencyKey: `invite-a-${suffix}` } });
      await respondMeetingFromNotification(prisma, memberActor, notificationA.id, { status: "ACCEPTED", invitationVersion: 1 }); assert.equal((await prisma.hubMeetingParticipant.findUniqueOrThrow({ where: { meetingId_memberId: { meetingId, memberId: member.id } } })).responseStatus, "ACCEPTED");
      await assert.rejects(() => respondMeetingFromNotification(prisma, memberActor, notificationA.id, { status: "DECLINED", invitationVersion: 1 }), (error: unknown) => error instanceof HubApiError && error.status === 409);
      const extraActor: Actor = { ...memberActor, memberId: extra.id, directorateId: dirB.id }; const notificationB = await prisma.hubNotification.create({ data: { organizationId: org.id, recipientMemberId: extra.id, type: "MEETING_INVITATION", title: "Convite", body: "Reunião", href: `/hub/reunioes/${meetingId}`, entityType: "MEETING", entityId: meetingId, idempotencyKey: `invite-b-${suffix}` } });
      await respondMeetingFromNotification(prisma, extraActor, notificationB.id, { status: "DECLINED", invitationVersion: 1, declineReason: "Conflito" }); const declined = await prisma.hubMeetingParticipant.findUniqueOrThrow({ where: { meetingId_memberId: { meetingId, memberId: extra.id } } }); assert.equal(declined.responseStatus, "DECLINED"); assert.equal(declined.declineReason, "Conflito");
    });

    await suite.test("grade de disponibilidade calcula melhor horário e cria reunião", async () => {
      const poll = await createAvailabilityPoll(prisma, actor, { title: `Disponibilidade ${suffix}`, dates: [new Date("2026-07-28")], startMinute: 480, endMinute: 600, slotMinutes: 30, directorateIds: [dirA.id], participantIds: [member.id] });
      const first = (await getAvailabilityPoll(prisma, actor, poll.id)).slots[0].slotStart; await saveAvailabilitySelection(prisma, actor, poll.id, [first]); await saveAvailabilitySelection(prisma, memberActor, poll.id, [first]);
      const result = await getAvailabilityPoll(prisma, actor, poll.id); assert.equal(result.bestSlots[0].count, result.participants.length); assert.equal(result.bestSlots[0].fullAttendance, true);
      const created = await createMeetingFromAvailability(prisma, actor, poll.id, first); assert.equal(created.startAt.getTime(), first.getTime());
    });

    await suite.test("notificações arquivam, restauram e filtram estado persistido", async () => {
      const item = await prisma.hubNotification.create({ data: { organizationId: org.id, recipientMemberId: member.id, type: "TEST", title: "Aviso", body: "Teste", href: "/hub", entityType: "TEST", entityId: suffix, idempotencyKey: `notification-${suffix}` } });
      const archived = await applyNotificationAction(prisma, memberActor, item.id, "archive", item.version); assert.ok(archived.archivedAt); assert.ok((await listCoreNotifications(prisma, memberActor, "archived")).notifications.some((entry) => entry.id === item.id));
      const restored = await applyNotificationAction(prisma, memberActor, item.id, "restore", archived.version); assert.equal(restored.archivedAt, null);
    });

    await suite.test("financeiro calcula saldo organizacional e filtra diretoria/projeto", async () => {
      const entry = await createCoreFinancialEntry(prisma, actor, { direction: "RECEIVABLE", description: `Receita ${suffix}`, totalCents: 120000, competenceDate: new Date("2026-07-20"), dueDate: new Date("2026-07-20"), directorateId: dirA.id, projectId }, `finance-${suffix}`);
      await prisma.hubFinancialEntry.update({ where: { id: entry.id }, data: { status: "SETTLED" } }); const installment = await prisma.hubFinancialInstallment.findFirstOrThrow({ where: { entryId: entry.id } }); await prisma.hubFinancialSettlement.create({ data: { organizationId: org.id, entryId: entry.id, installmentId: installment.id, amountCents: entry.totalCents, settledAt: new Date("2026-07-20"), method: "PIX", createdById: admin.id, idempotencyKey: `settlement-${suffix}`, requestHash: suffix } });
      const orgFinance = await getCoreFinances(prisma, actor); assert.equal(orgFinance.balanceCents, 120000); assert.equal((await getCoreFinances(prisma, actor, { directorateId: dirA.id })).entries.some((item) => item.id === entry.id), true); assert.equal((await getCoreFinances(prisma, actor, { projectId })).entries.some((item) => item.id === entry.id), true);
      const dashboard = await getCoreDashboard(prisma, actor, "organization"); assert.equal("currentBalanceCents" in dashboard.summary, false); const dirDashboard = await getCoreDashboard(prisma, directorActor, "directorate"); assert.equal("entriesMonthCents" in dirDashboard.summary, false);
    });

    await suite.test("busca real respeita tenant e navega para detalhes", async () => {
      await prisma.hubProject.create({ data: { organizationId: foreignOrg.id, title: `Projeto estrangeiro ${suffix}`, primaryDirectorateId: foreignDir.id } }); const results = await searchHubRecords(prisma, actor, suffix); assert.ok(results.some((item) => item.href === `/hub/projetos/${projectId}`)); assert.equal(results.some((item) => item.title.includes("estrangeiro")), false);
    });

    await suite.test("isolamento de tenant retorna 404 em objetos estrangeiros", async () => { const foreignActor: Actor = { organizationId: foreignOrg.id, memberId: foreign.id, role: "SUPER_ADMIN", directorateId: foreignDir.id, timezone: "America/Sao_Paulo", currency: "BRL" }; await assert.rejects(() => getProject(prisma, foreignActor, projectId), (error: unknown) => error instanceof HubApiError && error.status === 404); await assert.rejects(() => getDirectorate(prisma, foreignActor, dirA.id), (error: unknown) => error instanceof HubApiError && error.status === 404); });

    await suite.test("administração geral do workspace continua listando organizações", async () => { const workspaces = await listWorkspaceHubs(prisma); assert.ok(workspaces.some((item) => item.id === org.id)); assert.ok((await listDirectorates(prisma, actor, true)).length >= 3); });
  } finally {
    await prisma.hubFinancialSettlement.deleteMany({ where: { organizationId: org.id } }); await prisma.hubFinancialInstallment.deleteMany({ where: { organizationId: org.id } }); await prisma.hubFinancialEntry.deleteMany({ where: { organizationId: org.id } }); await prisma.hubFinancialCategory.deleteMany({ where: { organizationId: org.id } });
    await prisma.hubOrganization.deleteMany({ where: { id: { in: [org.id, foreignOrg.id] } } }); await prisma.$disconnect();
  }
});
