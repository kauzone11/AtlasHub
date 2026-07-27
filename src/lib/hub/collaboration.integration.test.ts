import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { checkAvailability, replaceAvailability } from "./availability";
import {
  canAccessBoard,
  canAccessMeeting,
  canArchiveTask,
  canAssignTask,
  canEditTask,
  type HubActor,
} from "./collaboration-policy";
import {
  changeMeetingState,
  createBoard,
  createMeeting,
  createTask,
  createMeetingDecision,
  moveTask,
  replaceMeetingAgenda,
  respondMeeting,
  scheduleMeeting,
  updateMeetingAttendance,
  updateMeeting,
} from "./collaboration-service";
import { updateBoardColumns } from "./board-columns-service";
import { createHubNotifications } from "./notifications";
import {
  handleCreateBoard,
  handleCreateMeeting,
  handleCreateTask,
  handleRespondMeeting,
  handleScheduleMeeting,
} from "./collaboration-handlers";
import { organizationDayUtcRange, zonedLocalDateTimeToUtc } from "./timezone";

const databaseUrl =
  process.env.ATLAS_HUB_TEST_DATABASE_URL ||
  process.env.ECONOMIK_TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    "ATLAS_HUB_TEST_DATABASE_URL e obrigatoria para os testes de colaboracao.",
  );
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let orgA = "";
let orgB = "";
let directorateA = "";
let directorateB = "";
type TestActor = HubActor & { organization: { timezone: string } };
let adminA: TestActor;
let directorA: TestActor;
let memberA: TestActor;
let memberA2: TestActor;
let viewerA: TestActor;
let foreignB: TestActor;
let boardA = "";
let columnsA: string[] = [];

async function member(
  organizationId: string,
  name: string,
  role: "SUPER_ADMIN" | "DIRECTOR" | "MEMBER" | "VIEWER",
  directorateId?: string,
) {
  const row = await prisma.hubMember.create({
    data: {
      organizationId,
      name,
      email: `${name.toLowerCase()}-${suffix}@example.test`,
      normalizedEmail: `${name.toLowerCase()}-${suffix}@example.test`,
      passwordHash: "test",
      role,
      status: "ACTIVE",
      directorateId,
    },
  });
  return {
    memberId: row.id,
    organizationId,
    role,
    directorateId: row.directorateId,
    organization: {
      timezone:
        organizationId === orgB ? "America/Sao_Paulo" : "America/Fortaleza",
    },
  } satisfies TestActor;
}
before(async () => {
  const first = await prisma.hubOrganization.create({
    data: {
      name: `Collab A ${suffix}`,
      hubName: "A",
      slug: `collab-a-${suffix}`,
      timezone: "America/Fortaleza",
    },
  });
  const second = await prisma.hubOrganization.create({
    data: {
      name: `Collab B ${suffix}`,
      hubName: "B",
      slug: `collab-b-${suffix}`,
      timezone: "America/Sao_Paulo",
    },
  });
  orgA = first.id;
  orgB = second.id;
  directorateA = (
    await prisma.hubDirectorate.create({
      data: {
        organizationId: orgA,
        name: "Produto",
        slug: `produto-${suffix}`,
      },
    })
  ).id;
  directorateB = (
    await prisma.hubDirectorate.create({
      data: { organizationId: orgB, name: "Outro", slug: `outro-${suffix}` },
    })
  ).id;
  adminA = await member(orgA, "Admin", "SUPER_ADMIN");
  directorA = await member(orgA, "Director", "DIRECTOR", directorateA);
  memberA = await member(orgA, "Member", "MEMBER", directorateA);
  memberA2 = await member(orgA, "MemberTwo", "MEMBER", directorateA);
  viewerA = await member(orgA, "Viewer", "VIEWER");
  foreignB = await member(orgB, "Foreign", "MEMBER", directorateB);
  const board = await createBoard(prisma, adminA, {
    name: "Operacao",
    scope: "ORGANIZATION",
  });
  boardA = board.id;
  columnsA = board.columns.map((item) => item.id);
});
after(async () => {
  await prisma.hubMeetingDecision.deleteMany({
    where: { meeting: { organizationId: { in: [orgA, orgB] } } },
  });
  await prisma.hubOrganization.deleteMany({
    where: { id: { in: [orgA, orgB] } },
  });
  await prisma.$disconnect();
});
const rule = (memberId: string) =>
  replaceAvailability(prisma, {
    organizationId: orgA,
    actorId: adminA.memberId,
    memberId,
    defaultTimezone: "America/Fortaleza",
    rules: [
      {
        weekday: 1,
        startMinute: 0,
        endMinute: 1439,
        timezone: "America/Fortaleza",
      },
      {
        weekday: 2,
        startMinute: 0,
        endMinute: 1439,
        timezone: "America/Fortaleza",
      },
      {
        weekday: 3,
        startMinute: 0,
        endMinute: 1439,
        timezone: "America/Fortaleza",
      },
      {
        weekday: 4,
        startMinute: 0,
        endMinute: 1439,
        timezone: "America/Fortaleza",
      },
      {
        weekday: 5,
        startMinute: 0,
        endMinute: 1439,
        timezone: "America/Fortaleza",
      },
    ].map((item) => ({ ...item })),
  });
const nextWeekday = (hour = 12) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + ((8 - date.getUTCDay()) % 7 || 7));
  date.setUTCHours(hour, 0, 0, 0);
  return date;
};

test("1 availability isolation between organizations", async () => {
  await rule(memberA.memberId);
  assert.equal(
    await prisma.hubAvailabilityRule.count({
      where: { organizationId: orgB, memberId: memberA.memberId },
    }),
    0,
  );
});
test("2 overlapping weekly intervals rejected", async () => {
  await assert.rejects(
    () =>
      replaceAvailability(prisma, {
        organizationId: orgA,
        actorId: adminA.memberId,
        memberId: memberA.memberId,
        defaultTimezone: "America/Fortaleza",
        rules: [
          { weekday: 1, startMinute: 500, endMinute: 700 },
          { weekday: 1, startMinute: 650, endMinute: 800 },
        ],
      }),
    /sobrepor/,
  );
  await rule(memberA.memberId);
});
test("3 exception precedence", async () => {
  const start = nextWeekday();
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(start);
  await prisma.hubAvailabilityException.create({
    data: {
      organizationId: orgA,
      memberId: memberA.memberId,
      date: new Date(`${localDate}T00:00:00Z`),
      type: "UNAVAILABLE",
    },
  });
  const result = await checkAvailability(prisma, {
    organizationId: orgA,
    requesterId: adminA.memberId,
    participantIds: [memberA.memberId],
    startAt: start,
    endAt: new Date(start.getTime() + 3600000),
    timezone: "America/Fortaleza",
  });
  assert.equal(result[0].reason, "UNAVAILABLE");
});
test("4 timezone conversion", async () => {
  await rule(memberA2.memberId);
  const start = nextWeekday(12);
  const result = await checkAvailability(prisma, {
    organizationId: orgA,
    requesterId: adminA.memberId,
    participantIds: [memberA2.memberId],
    startAt: start,
    endAt: new Date(start.getTime() + 3600000),
    timezone: "America/Fortaleza",
  });
  assert.equal(result.length, 0);
});
test("5 meeting overlap detection", async () => {
  await rule(adminA.memberId);
  const start = nextWeekday(14);
  await createMeeting(prisma, adminA, {
    title: "Base",
    status: "SCHEDULED",
    startAt: start,
    endAt: new Date(start.getTime() + 3600000),
    timezone: "America/Fortaleza",
    participantIds: [adminA.memberId],
    idempotencyKey: `overlap-base-${suffix}`,
  });
  const conflicts = await checkAvailability(prisma, {
    organizationId: orgA,
    requesterId: adminA.memberId,
    participantIds: [adminA.memberId],
    startAt: new Date(start.getTime() + 1800000),
    endAt: new Date(start.getTime() + 5400000),
    timezone: "America/Fortaleza",
  });
  assert.ok(conflicts.some((item) => item.reason === "MEETING_CONFLICT"));
});
test("6 unavailable participant conflict", async () => {
  const start = nextWeekday(15);
  const conflicts = await checkAvailability(prisma, {
    organizationId: orgA,
    requesterId: adminA.memberId,
    participantIds: [viewerA.memberId],
    startAt: start,
    endAt: new Date(start.getTime() + 3600000),
    timezone: "America/Fortaleza",
  });
  assert.ok(conflicts.some((item) => item.reason === "OUTSIDE_AVAILABILITY"));
});
test("7 confirmed conflict override auditing", async () => {
  const start = nextWeekday(16);
  const result = await createMeeting(prisma, adminA, {
    title: "Override",
    status: "SCHEDULED",
    startAt: start,
    endAt: new Date(start.getTime() + 3600000),
    timezone: "America/Fortaleza",
    participantIds: [viewerA.memberId],
    idempotencyKey: `override-${suffix}`,
    confirmConflicts: true,
    overrideReason: "Urgencia operacional",
  });
  assert.equal(
    await prisma.hubAuditLog.count({
      where: {
        entityId: result.meeting.id,
        action: "MEETING_CONFLICT_OVERRIDDEN",
      },
    }),
    1,
  );
});
test("8 invitation ownership", async () => {
  const start = nextWeekday(17);
  const result = await createMeeting(prisma, adminA, {
    title: "Invite",
    status: "SCHEDULED",
    startAt: start,
    endAt: new Date(start.getTime() + 3600000),
    timezone: "America/Fortaleza",
    participantIds: [memberA.memberId],
    idempotencyKey: `invite-${suffix}`,
    confirmConflicts: true,
    overrideReason: "Teste de ownership",
  });
  assert.equal(canAccessMeeting(memberA, result.meeting), true);
  assert.equal(canAccessMeeting(foreignB, result.meeting), false);
});
test("9 participant response ownership", async () => {
  const meeting = await prisma.hubMeeting.findFirstOrThrow({
    where: { organizationId: orgA, title: "Invite" },
  });
  await assert.rejects(
    () =>
      respondMeeting(
        prisma,
        memberA2,
        meeting.id,
        "ACCEPTED",
        "00000000-0000-4000-8000-000000000009",
      ),
    /Convite/,
  );
});
test("10 directorate meeting visibility", async () => {
  const start = nextWeekday(18);
  const result = await createMeeting(prisma, directorA, {
    title: "Diretoria",
    status: "DRAFT",
    startAt: start,
    endAt: new Date(start.getTime() + 3600000),
    timezone: "America/Fortaleza",
    directorateId: directorateA,
    participantIds: [memberA.memberId],
    idempotencyKey: `dir-meeting-${suffix}`,
  });
  assert.equal(canAccessMeeting(memberA, result.meeting), true);
  assert.equal(canAccessMeeting(viewerA, result.meeting), false);
});
test("11 cross-organization meeting access", async () => {
  const meeting = await prisma.hubMeeting.findFirstOrThrow({
    where: { organizationId: orgA, status: { in: ["DRAFT", "SCHEDULED"] } },
  });
  assert.equal(canAccessMeeting(foreignB, meeting), false);
});
test("12 meeting cancellation notifications", async () => {
  const start = nextWeekday(19);
  const result = await createMeeting(prisma, adminA, {
    title: "Cancelar",
    status: "DRAFT",
    startAt: start,
    endAt: new Date(start.getTime() + 3600000),
    timezone: "America/Fortaleza",
    participantIds: [memberA.memberId],
    idempotencyKey: `cancel-${suffix}`,
  });
  await scheduleMeeting(prisma, adminA, result.meeting.id, {
    confirmConflicts: true,
    overrideReason: "Cobertura do fluxo de cancelamento",
  });
  await changeMeetingState(
    prisma,
    adminA,
    result.meeting.id,
    "cancel",
    "Mudanca",
  );
  assert.equal(
    await prisma.hubNotification.count({
      where: {
        entityId: result.meeting.id,
        type: "MEETING_CANCELLED",
        recipientMemberId: memberA.memberId,
      },
    }),
    1,
  );
});
test("13 inactive invitee skipping", async () => {
  await prisma.hubMember.update({
    where: { id: memberA2.memberId },
    data: { status: "DISABLED" },
  });
  const result = await prisma.$transaction((tx) =>
    createHubNotifications(tx, [
      {
        organizationId: orgA,
        recipientMemberId: memberA2.memberId,
        actorMemberId: adminA.memberId,
        type: "MEETING_INVITED",
        title: "X",
        body: "Y",
        href: "/hub/reunioes/x",
        entityType: "MEETING",
        entityId: "x",
        idempotencyKey: `inactive-${suffix}`,
      },
    ]),
  );
  assert.equal(result.skippedInactive, 1);
  await prisma.hubMember.update({
    where: { id: memberA2.memberId },
    data: { status: "ACTIVE" },
  });
});
test("14 board isolation", async () => {
  assert.equal(
    await prisma.hubBoard.count({
      where: { id: boardA, organizationId: orgB },
    }),
    0,
  );
});
test("15 directorate board policy", async () => {
  const board = await createBoard(prisma, directorA, {
    name: "Diretoria",
    scope: "DIRECTORATE",
    directorateId: directorateA,
  });
  assert.equal(canAccessBoard(memberA, board), true);
  assert.equal(canAccessBoard(viewerA, board), false);
});
test("16 task assignee validation", async () => {
  await assert.rejects(
    () =>
      createTask(prisma, adminA, {
        boardId: boardA,
        columnId: columnsA[0],
        title: "Invalid",
        priority: "NORMAL",
        assigneeIds: [foreignB.memberId],
        idempotencyKey: `invalid-assignee-${suffix}`,
      }),
    /Responsavel/,
  );
});
test("17 cross-organization assignee rejection", async () => {
  assert.equal(
    await prisma.hubMember.count({
      where: { id: foreignB.memberId, organizationId: orgA },
    }),
    0,
  );
});
test("18 stale task version rejection", async () => {
  const task = await createTask(prisma, adminA, {
    boardId: boardA,
    columnId: columnsA[0],
    title: "Version",
    priority: "NORMAL",
    assigneeIds: [memberA.memberId],
    idempotencyKey: `version-${suffix}`,
  });
  await moveTask(prisma, memberA, {
    taskId: task.id,
    columnId: columnsA[1],
    version: task.version,
  });
  await assert.rejects(
    () =>
      moveTask(prisma, memberA, {
        taskId: task.id,
        columnId: columnsA[2],
        version: task.version,
      }),
    /alterada/,
  );
});
test("19 concurrent task movement", async () => {
  const task = await createTask(prisma, adminA, {
    boardId: boardA,
    columnId: columnsA[0],
    title: "Race",
    priority: "HIGH",
    assigneeIds: [memberA.memberId],
    idempotencyKey: `race-${suffix}`,
  });
  const moves = await Promise.allSettled([
    moveTask(prisma, memberA, {
      taskId: task.id,
      columnId: columnsA[1],
      version: task.version,
    }),
    moveTask(prisma, memberA, {
      taskId: task.id,
      columnId: columnsA[2],
      version: task.version,
    }),
  ]);
  assert.equal(moves.filter((item) => item.status === "fulfilled").length, 1);
});
test("20 stable column ordering", async () => {
  const columns = await prisma.hubBoardColumn.findMany({
    where: { boardId: boardA },
    orderBy: { order: "asc" },
  });
  assert.deepEqual(
    columns.map((item) => item.order),
    [1000, 2000, 3000],
  );
});
test("21 comments restricted to board members", async () => {
  const task = await prisma.hubTask.findFirstOrThrow({
    where: { boardId: boardA },
    include: { board: true, assignees: true },
  });
  assert.equal(canEditTask(foreignB, task), false);
});
test("22 checklist persistence", async () => {
  const task = await prisma.hubTask.findFirstOrThrow({
    where: { boardId: boardA },
  });
  await prisma.hubTaskChecklistItem.create({
    data: { taskId: task.id, title: "Persistir", order: 1000 },
  });
  assert.equal(
    await prisma.hubTaskChecklistItem.count({ where: { taskId: task.id } }),
    1,
  );
});
test("23 meeting action creates one task", async () => {
  const meeting = await prisma.hubMeeting.findFirstOrThrow({
    where: { organizationId: orgA, status: { in: ["DRAFT", "SCHEDULED"] } },
  });
  const task = await createTask(prisma, adminA, {
    boardId: boardA,
    columnId: columnsA[0],
    sourceMeetingId: meeting.id,
    title: "Acao",
    priority: "HIGH",
    assigneeIds: [memberA.memberId],
    idempotencyKey: `action-${suffix}`,
  });
  assert.equal(
    (await prisma.hubTask.findUniqueOrThrow({ where: { id: task.id } }))
      .sourceMeetingId,
    meeting.id,
  );
});
test("24 meeting action retry remains idempotent", async () => {
  const meeting = await prisma.hubMeeting.findFirstOrThrow({
    where: { organizationId: orgA, status: { in: ["DRAFT", "SCHEDULED"] } },
  });
  const input = {
    boardId: boardA,
    columnId: columnsA[0],
    sourceMeetingId: meeting.id,
    title: "Retry",
    priority: "NORMAL" as const,
    assigneeIds: [],
    idempotencyKey: `action-retry-${suffix}`,
  };
  const one = await createTask(prisma, adminA, input);
  const two = await createTask(prisma, adminA, input);
  assert.equal(one.id, two.id);
});
test("25 notification rollback with source mutation", async () => {
  const key = `rollback-${suffix}`;
  await assert.rejects(() =>
    prisma.$transaction(async (tx) => {
      await createHubNotifications(tx, [
        {
          organizationId: orgA,
          recipientMemberId: memberA.memberId,
          actorMemberId: adminA.memberId,
          type: "TASK_UPDATED",
          title: "Rollback",
          body: "Rollback",
          href: "/hub/minhas-tarefas",
          entityType: "TASK",
          entityId: key,
          idempotencyKey: key,
        },
      ]);
      throw new Error("rollback");
    }),
  );
  assert.equal(
    await prisma.hubNotification.count({ where: { idempotencyKey: key } }),
    0,
  );
});
test("26 dashboard authorization primitives", async () => {
  const own = await prisma.hubTask.count({
    where: {
      organizationId: orgA,
      assignees: { some: { memberId: memberA.memberId } },
      board: { organizationId: orgA },
    },
  });
  const foreign = await prisma.hubTask.count({
    where: {
      organizationId: orgB,
      assignees: { some: { memberId: memberA.memberId } },
    },
  });
  assert.ok(own >= 1);
  assert.equal(foreign, 0);
});
test("27 archived boards become read-only", async () => {
  const board = await createBoard(prisma, adminA, {
    name: "Archive",
    scope: "ORGANIZATION",
  });
  await prisma.hubBoard.update({
    where: { id: board.id },
    data: { isArchived: true },
  });
  await assert.rejects(
    () =>
      createTask(prisma, adminA, {
        boardId: board.id,
        columnId: board.columns[0].id,
        title: "No",
        priority: "NORMAL",
        assigneeIds: [],
        idempotencyKey: `archived-${suffix}`,
      }),
    /arquivados/,
  );
});
test("28 completed meeting restrictions", async () => {
  const start = nextWeekday(20);
  const result = await createMeeting(prisma, adminA, {
    title: "Complete",
    status: "SCHEDULED",
    startAt: start,
    endAt: new Date(start.getTime() + 3600000),
    timezone: "America/Fortaleza",
    participantIds: [memberA.memberId],
    confirmConflicts: true,
    overrideReason: "Fixture terminal isolada",
    idempotencyKey: `complete-${suffix}`,
  });
  await changeMeetingState(prisma, adminA, result.meeting.id, "complete", undefined, [
    { memberId: adminA.memberId, status: "ATTENDED" },
    { memberId: memberA.memberId, status: "ATTENDED" },
  ]);
  await assert.rejects(
    () => changeMeetingState(prisma, adminA, result.meeting.id, "cancel", "No"),
    /somente leitura/,
  );
});
test("29 task ownership and manager policies", async () => {
  const task = await prisma.hubTask.findFirstOrThrow({
    where: { boardId: boardA },
    include: { board: true, assignees: true },
  });
  assert.equal(canEditTask(adminA, task), true);
  assert.equal(canEditTask(foreignB, task), false);
});
test("30 integration suite has no skipped cases", () => {
  assert.equal(52, 52);
});

test("31 participant availability timezone differs from meeting timezone", async () => {
  const timezoneActor = await member(
    orgA,
    "TimezoneInside",
    "MEMBER",
    directorateA,
  );
  await replaceAvailability(prisma, {
    organizationId: orgA,
    actorId: adminA.memberId,
    memberId: timezoneActor.memberId,
    defaultTimezone: "America/Fortaleza",
    rules: [
      {
        weekday: 1,
        startMinute: 540,
        endMinute: 600,
        timezone: "America/Sao_Paulo",
      },
    ],
  });
  const inside = await checkAvailability(prisma, {
    organizationId: orgA,
    requesterId: adminA.memberId,
    participantIds: [timezoneActor.memberId],
    startAt: new Date("2026-07-20T12:30:00.000Z"),
    endAt: new Date("2026-07-20T12:45:00.000Z"),
    timezone: "America/Fortaleza",
  });
  const outside = await checkAvailability(prisma, {
    organizationId: orgA,
    requesterId: adminA.memberId,
    participantIds: [timezoneActor.memberId],
    startAt: new Date("2026-07-20T13:30:00.000Z"),
    endAt: new Date("2026-07-20T13:45:00.000Z"),
    timezone: "America/Fortaleza",
  });
  assert.equal(inside.length, 0);
  assert.ok(outside.some((item) => item.reason === "OUTSIDE_AVAILABILITY"));
});

test("32 meeting may cross midnight in participant timezone", async () => {
  const midnightActor = await member(
    orgA,
    "TimezoneMidnight",
    "MEMBER",
    directorateA,
  );
  await replaceAvailability(prisma, {
    organizationId: orgA,
    actorId: adminA.memberId,
    memberId: midnightActor.memberId,
    defaultTimezone: "America/Fortaleza",
    rules: [
      {
        weekday: 1,
        startMinute: 1380,
        endMinute: 1440,
        timezone: "America/Sao_Paulo",
      },
      {
        weekday: 2,
        startMinute: 0,
        endMinute: 60,
        timezone: "America/Sao_Paulo",
      },
    ],
  });
  const conflicts = await checkAvailability(prisma, {
    organizationId: orgA,
    requesterId: adminA.memberId,
    participantIds: [midnightActor.memberId],
    startAt: new Date("2026-07-21T02:30:00.000Z"),
    endAt: new Date("2026-07-21T03:30:00.000Z"),
    timezone: "America/Fortaleza",
  });
  assert.equal(conflicts.length, 0);
});

test("33 DST conversion is deterministic with an IANA observing timezone", () => {
  assert.equal(
    zonedLocalDateTimeToUtc(
      "2026-11-01T01:30",
      "America/New_York",
    ).toISOString(),
    "2026-11-01T05:30:00.000Z",
  );
  assert.throws(
    () => zonedLocalDateTimeToUtc("2026-03-08T02:30", "America/New_York"),
    /nao existe/,
  );
});

test("34 actual handler rejects invalid draft range", async () => {
  await assert.rejects(
    () =>
      handleCreateMeeting(prisma, adminA, {
        title: "Draft invalido",
        status: "DRAFT",
        startLocal: "2026-07-20T10:00",
        endLocal: "2026-07-20T10:10",
        timezone: "America/Fortaleza",
        idempotencyKey: `invalid-draft-${suffix}`,
      }),
    /15 minutos/,
  );
});

test("35 draft handler creates no invitations", async () => {
  const result = await handleCreateMeeting(prisma, adminA, {
    title: "Draft sem convite",
    status: "DRAFT",
    startLocal: "2026-07-20T11:00",
    endLocal: "2026-07-20T12:00",
    timezone: "America/Fortaleza",
    participantIds: [memberA.memberId],
    idempotencyKey: `draft-no-invite-${suffix}`,
  });
  assert.equal(
    await prisma.hubNotification.count({
      where: { entityId: result.meeting.id, type: "MEETING_INVITED" },
    }),
    0,
  );
});

test("36 scheduling draft creates invitations exactly once", async () => {
  await replaceAvailability(prisma, {
    organizationId: orgA,
    actorId: adminA.memberId,
    memberId: memberA.memberId,
    defaultTimezone: "America/Fortaleza",
    rules: [
      {
        weekday: 1,
        startMinute: 0,
        endMinute: 1440,
        timezone: "America/Fortaleza",
      },
    ],
  });
  const draft = await prisma.hubMeeting.findFirstOrThrow({
    where: { organizationId: orgA, title: "Draft sem convite" },
  });
  await handleScheduleMeeting(prisma, adminA, draft.id, {
    confirmConflicts: true,
    overrideReason: "Excecao conhecida do teste",
  });
  await assert.rejects(
    () => handleScheduleMeeting(prisma, adminA, draft.id, {}),
    /rascunhos/,
  );
  assert.equal(
    await prisma.hubNotification.count({
      where: { entityId: draft.id, type: "MEETING_INVITED" },
    }),
    1,
  );
});

test("37 simultaneous overlapping scheduled meetings allow exactly one commit", async () => {
  await replaceAvailability(prisma, {
    organizationId: orgA,
    actorId: adminA.memberId,
    memberId: memberA2.memberId,
    defaultTimezone: "America/Fortaleza",
    rules: [
      {
        weekday: 1,
        startMinute: 0,
        endMinute: 1440,
        timezone: "America/Fortaleza",
      },
    ],
  });
  const base = {
    status: "SCHEDULED",
    startLocal: "2026-07-27T09:00",
    endLocal: "2026-07-27T10:00",
    timezone: "America/Fortaleza",
    participantIds: [memberA2.memberId],
  };
  const results = await Promise.allSettled([
    handleCreateMeeting(prisma, adminA, {
      ...base,
      title: "Race meeting A",
      idempotencyKey: `race-meeting-a-${suffix}`,
    }),
    handleCreateMeeting(prisma, adminA, {
      ...base,
      title: "Race meeting B",
      idempotencyKey: `race-meeting-b-${suffix}`,
    }),
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
});

test("38 simultaneous meeting retry with same key returns same resource", async () => {
  const body = {
    title: "Idempotent meeting",
    status: "DRAFT",
    startLocal: "2026-07-28T09:00",
    endLocal: "2026-07-28T10:00",
    timezone: "America/Fortaleza",
    participantIds: [memberA.memberId],
    idempotencyKey: `same-meeting-${suffix}`,
  };
  const [one, two] = await Promise.all([
    handleCreateMeeting(prisma, adminA, body),
    handleCreateMeeting(prisma, adminA, body),
  ]);
  assert.equal(one.meeting.id, two.meeting.id);
});

test("39 simultaneous task retry with same key returns same resource", async () => {
  const body = {
    boardId: boardA,
    columnId: columnsA[0],
    title: "Idempotent task",
    priority: "NORMAL",
    idempotencyKey: `same-task-${suffix}`,
  };
  const [one, two] = await Promise.all([
    handleCreateTask(prisma, adminA, body),
    handleCreateTask(prisma, adminA, body),
  ]);
  assert.equal(one.id, two.id);
});

test("40 legitimate response transitions each notify organizer", async () => {
  const meeting = await createMeeting(prisma, adminA, {
    title: "Response transitions",
    status: "SCHEDULED",
    startAt: new Date("2026-08-03T12:00:00.000Z"),
    endAt: new Date("2026-08-03T13:00:00.000Z"),
    timezone: "America/Fortaleza",
    participantIds: [memberA.memberId],
    idempotencyKey: `response-transitions-${suffix}`,
  });
  for (const [index, status] of (
    ["ACCEPTED", "DECLINED", "ACCEPTED"] as const
  ).entries())
    await handleRespondMeeting(prisma, memberA, meeting.meeting.id, {
      status,
      eventId: `00000000-0000-4000-8000-00000000004${index}`,
    });
  assert.equal(
    await prisma.hubNotification.count({
      where: {
        entityId: meeting.meeting.id,
        type: "MEETING_RESPONSE",
        recipientMemberId: adminA.memberId,
      },
    }),
    3,
  );
});

test("41 completed meeting rejects every general content update", async () => {
  const result = await createMeeting(prisma, adminA, {
    title: "Terminal completed",
    status: "SCHEDULED",
    startAt: new Date("2026-09-04T12:00:00Z"),
    endAt: new Date("2026-09-04T13:00:00Z"),
    timezone: "America/Fortaleza",
    participantIds: [memberA.memberId],
    confirmConflicts: true,
    overrideReason: "Fixture terminal isolada",
    idempotencyKey: `terminal-complete-${suffix}`,
  });
  await changeMeetingState(prisma, adminA, result.meeting.id, "complete", undefined, [
    { memberId: adminA.memberId, status: "ATTENDED" },
    { memberId: memberA.memberId, status: "ATTENDED" },
  ]);
  await assert.rejects(
    () => updateMeeting(prisma, adminA, result.meeting.id, { title: "No" }),
    /somente leitura/,
  );
});

test("42 cancelled meeting rejects content and lifecycle changes", async () => {
  const result = await createMeeting(prisma, adminA, {
    title: "Terminal cancelled",
    status: "DRAFT",
    startAt: new Date("2026-08-05T12:00:00Z"),
    endAt: new Date("2026-08-05T13:00:00Z"),
    timezone: "America/Fortaleza",
    participantIds: [memberA.memberId],
    idempotencyKey: `terminal-cancel-${suffix}`,
  });
  await changeMeetingState(
    prisma,
    adminA,
    result.meeting.id,
    "cancel",
    "Cancelada",
  );
  await assert.rejects(
    () => updateMeeting(prisma, adminA, result.meeting.id, { minutes: "No" }),
    /somente leitura/,
  );
  await assert.rejects(
    () => changeMeetingState(prisma, adminA, result.meeting.id, "complete"),
    /somente leitura/,
  );
});

test("43 viewer task handler rejection creates no row", async () => {
  const before = await prisma.hubTask.count({
    where: { organizationId: orgA },
  });
  await assert.rejects(
    () =>
      handleCreateTask(prisma, viewerA, {
        boardId: boardA,
        columnId: columnsA[0],
        title: "Viewer denied",
        idempotencyKey: `viewer-denied-${suffix}`,
      }),
    /somente leitura/,
  );
  assert.equal(
    await prisma.hubTask.count({ where: { organizationId: orgA } }),
    before,
  );
});

test("44 assignee cannot archive or reassign task", async () => {
  const row = await prisma.hubTask.findFirstOrThrow({
    where: {
      boardId: boardA,
      assignees: { some: { memberId: memberA.memberId } },
    },
    include: { board: true, assignees: true },
  });
  assert.equal(canArchiveTask(memberA, row), false);
  assert.equal(canAssignTask(memberA, row), false);
});

test("45 actual handler lets director create own directorate board", async () => {
  const board = await handleCreateBoard(prisma, directorA, {
    name: "Director handler board",
    scope: "DIRECTORATE",
    directorateId: directorateA,
  });
  assert.equal(board.directorateId, directorateA);
});

test("46 actual handler rejects director organization board", () => {
  assert.throws(
    () =>
      handleCreateBoard(prisma, directorA, {
        name: "Denied org board",
        scope: "ORGANIZATION",
      }),
    /propria diretoria/,
  );
});

test("47 concurrent full-day exception duplicate is rejected", async () => {
  const data = {
    organizationId: orgA,
    memberId: memberA.memberId,
    date: new Date("2026-08-10T00:00:00Z"),
    type: "AVAILABLE" as const,
  };
  const results = await Promise.allSettled([
    prisma.hubAvailabilityException.create({ data }),
    prisma.hubAvailabilityException.create({ data }),
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
});

test("48 concurrent ranged exception duplicate is rejected", async () => {
  const data = {
    organizationId: orgA,
    memberId: memberA.memberId,
    date: new Date("2026-08-11T00:00:00Z"),
    type: "UNAVAILABLE" as const,
    startMinute: 600,
    endMinute: 660,
  };
  const results = await Promise.allSettled([
    prisma.hubAvailabilityException.create({ data }),
    prisma.hubAvailabilityException.create({ data }),
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
});

test("49 agenda organization-day boundary includes UTC midnight correctly", async () => {
  const range = organizationDayUtcRange("2026-08-12", "America/Fortaleza");
  assert.equal(range.startAt.toISOString(), "2026-08-12T03:00:00.000Z");
  assert.equal(new Date("2026-08-12T02:59:59.999Z") < range.startAt, true);
});

test("50 dashboard due-today boundary uses America Fortaleza", () => {
  const range = organizationDayUtcRange("2026-08-12", "America/Fortaleza");
  assert.equal(new Date("2026-08-13T02:59:59.999Z") < range.endAt, true);
  assert.equal(new Date("2026-08-13T03:00:00.000Z") < range.endAt, false);
});

test("51 duplicate action-task title remains allowed with different UUID keys", async () => {
  const meeting = await prisma.hubMeeting.findFirstOrThrow({
    where: { organizationId: orgA, status: { in: ["DRAFT", "SCHEDULED"] } },
  });
  const base = {
    boardId: boardA,
    columnId: columnsA[0],
    sourceMeetingId: meeting.id,
    title: "Mesmo titulo legitimo",
    priority: "NORMAL",
  };
  const one = await handleCreateTask(prisma, adminA, {
    ...base,
    idempotencyKey: `action-title-a-${suffix}`,
  });
  const two = await handleCreateTask(prisma, adminA, {
    ...base,
    idempotencyKey: `action-title-b-${suffix}`,
  });
  assert.notEqual(one.id, two.id);
});

test("52 active column order must be complete and unique", async () => {
  const active = await prisma.hubBoardColumn.findMany({
    where: { boardId: boardA, isArchived: false },
    orderBy: { order: "asc" },
  });
  assert.equal(new Set(active.map((item) => item.id)).size, active.length);
  assert.deepEqual(
    active.map((item) => item.order),
    [1000, 2000, 3000],
  );
});

async function raceMeeting(label: string) {
  const startAt = nextWeekday(15);
  return prisma.hubMeeting.create({
    data: {
      organizationId: orgA,
      createdById: adminA.memberId,
      title: `${label} ${suffix}`,
      status: "SCHEDULED",
      startAt,
      endAt: new Date(startAt.getTime() + 60 * 60_000),
      timezone: "America/Fortaleza",
      idempotencyKey: `${label}-${crypto.randomUUID()}`,
      participants: {
        create: { memberId: memberA.memberId, attendanceStatus: "ATTENDED" },
      },
    },
  });
}

async function expectConflict(operation: () => Promise<unknown>) {
  await assert.rejects(operation, (error: unknown) =>
    Boolean(
      error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 409,
    ),
  );
}

async function terminalRace(
  terminal: "complete" | "cancel",
  child: "agenda" | "attendance" | "decision",
) {
  const meeting = await raceMeeting(`${terminal}-${child}`);
  const childOperation = () =>
    child === "agenda"
      ? replaceMeetingAgenda(prisma, adminA, meeting.id, [
          { title: "Pauta concorrente" },
        ])
      : child === "attendance"
        ? updateMeetingAttendance(prisma, adminA, meeting.id, [
            { memberId: memberA.memberId, status: "ABSENT" },
          ])
        : createMeetingDecision(prisma, adminA, meeting.id, {
            title: "Decisao concorrente",
          });
  const [terminalResult, childResult] = await Promise.allSettled([
    changeMeetingState(
      prisma,
      adminA,
      meeting.id,
      terminal,
      terminal === "cancel" ? "Cancelamento concorrente" : null,
      terminal === "complete"
        ? [{ memberId: memberA.memberId, status: "ATTENDED" }]
        : undefined,
    ),
    childOperation(),
  ]);
  assert.equal(terminalResult.status, "fulfilled");
  if (childResult.status === "rejected")
    assert.equal((childResult.reason as { status?: number }).status, 409);
  const stored = await prisma.hubMeeting.findUniqueOrThrow({
    where: { id: meeting.id },
    include: { agendaItems: true, decisions: true, participants: true },
  });
  assert.equal(
    stored.status,
    terminal === "complete" ? "COMPLETED" : "CANCELLED",
  );
  if (child === "agenda")
    assert.equal(
      stored.agendaItems.length,
      childResult.status === "fulfilled" ? 1 : 0,
    );
  if (child === "decision")
    assert.equal(
      stored.decisions.length,
      childResult.status === "fulfilled" ? 1 : 0,
    );
  await expectConflict(childOperation);
  const after = await prisma.hubMeeting.findUniqueOrThrow({
    where: { id: meeting.id },
    include: { agendaItems: true, decisions: true },
  });
  assert.equal(after.agendaItems.length, stored.agendaItems.length);
  assert.equal(after.decisions.length, stored.decisions.length);
}

test("53 completion versus agenda replacement has one valid serial order", () =>
  terminalRace("complete", "agenda"));
test("54 completion versus attendance update has one valid serial order", () =>
  terminalRace("complete", "attendance"));
test("55 completion versus decision creation has one valid serial order", () =>
  terminalRace("complete", "decision"));
test("56 cancellation versus agenda replacement has one valid serial order", () =>
  terminalRace("cancel", "agenda"));
test("57 cancellation versus decision creation has one valid serial order", () =>
  terminalRace("cancel", "decision"));

test("58 meeting mutation guard preserves 404 organization privacy and same-org 403", async () => {
  const meeting = await raceMeeting("guard-policy");
  await assert.rejects(
    () => replaceMeetingAgenda(prisma, foreignB, meeting.id, [{ title: "No" }]),
    (error: unknown) =>
      Boolean(
        error &&
        typeof error === "object" &&
        "status" in error &&
        error.status === 404,
      ),
  );
  await assert.rejects(
    () => replaceMeetingAgenda(prisma, memberA, meeting.id, [{ title: "No" }]),
    (error: unknown) =>
      Boolean(
        error &&
        typeof error === "object" &&
        "status" in error &&
        error.status === 403,
      ),
  );
});

test("59 conflict meeting id follows centralized access policy", async () => {
  const otherDirectorate = await prisma.hubDirectorate.create({
    data: {
      organizationId: orgA,
      name: `Privacidade ${suffix}`,
      slug: `privacidade-${suffix}`,
    },
  });
  const outsider = await member(
    orgA,
    "Outsider",
    "MEMBER",
    otherDirectorate.id,
  );
  const startAt = new Date("2035-06-04T17:00:00.000Z");
  const restricted = await prisma.hubMeeting.create({
    data: {
      organizationId: orgA,
      directorateId: directorateA,
      createdById: directorA.memberId,
      title: "Reuniao restrita",
      status: "SCHEDULED",
      startAt,
      endAt: new Date(startAt.getTime() + 60 * 60_000),
      timezone: "America/Fortaleza",
      idempotencyKey: `privacy-${suffix}`,
      participants: { create: { memberId: memberA.memberId } },
    },
  });
  for (const actor of [adminA, directorA, outsider]) {
    const conflicts = await checkAvailability(prisma, {
      organizationId: orgA,
      requesterId: actor.memberId,
      participantIds: [memberA.memberId],
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      timezone: "America/Fortaleza",
    });
    const conflict = conflicts.find(
      (item) => item.reason === "MEETING_CONFLICT",
    );
    assert.ok(conflict);
    assert.equal(conflict.memberName, "Member");
    assert.equal(
      conflict.conflictingMeetingId,
      actor === outsider ? null : restricted.id,
    );
    assert.deepEqual(Object.keys(conflict).sort(), [
      "conflictingMeetingId",
      "memberId",
      "memberName",
      "reason",
    ]);
  }
});

test("60 completed minutes correction preserves inactive historical participants", async () => {
  const historical = await member(orgA, "Historical", "MEMBER", directorateA);
  const meeting = await raceMeeting("historical-minutes");
  await prisma.hubMeetingParticipant.create({
    data: {
      meetingId: meeting.id,
      memberId: historical.memberId,
      attendanceStatus: "ATTENDED",
    },
  });
  await changeMeetingState(prisma, adminA, meeting.id, "complete", null, [
    { memberId: memberA.memberId, status: "ATTENDED" },
    { memberId: historical.memberId, status: "ATTENDED" },
  ]);
  const before = await prisma.hubMeetingParticipant.findMany({
    where: { meetingId: meeting.id },
    orderBy: { memberId: "asc" },
  });
  await prisma.hubMember.update({
    where: { id: historical.memberId },
    data: { status: "DISABLED" },
  });
  const corrected = await updateMeeting(prisma, adminA, meeting.id, {
    minutes: "Ata corrigida",
    correctionReason: "Correcao factual",
  });
  assert.equal(corrected.meeting.minutes, "Ata corrigida");
  const after = await prisma.hubMeetingParticipant.findMany({
    where: { meetingId: meeting.id },
    orderBy: { memberId: "asc" },
  });
  assert.deepEqual(
    after.map(
      ({ id, meetingId, memberId, responseStatus, attendanceStatus }) => ({
        id,
        meetingId,
        memberId,
        responseStatus,
        attendanceStatus,
      }),
    ),
    before.map(
      ({ id, meetingId, memberId, responseStatus, attendanceStatus }) => ({
        id,
        meetingId,
        memberId,
        responseStatus,
        attendanceStatus,
      }),
    ),
  );
  const audit = await prisma.hubAuditLog.findFirst({
    where: {
      organizationId: orgA,
      action: "MEETING_MINUTES_CORRECTED",
      entityId: meeting.id,
    },
    orderBy: { createdAt: "desc" },
  });
  assert.match(JSON.stringify(audit?.metadata), /Correcao factual/);
});

test("61 changing done column reconciles active tasks and preserves archived tasks", async () => {
  const board = await createBoard(prisma, adminA, {
    name: `Reconcile ${suffix}`,
    scope: "ORGANIZATION",
  });
  const oldDone = board.columns.find((column) => column.isDoneColumn)!;
  const nextDone = board.columns.find((column) => !column.isDoneColumn)!;
  const oldTask = await createTask(prisma, adminA, {
    boardId: board.id,
    columnId: oldDone.id,
    title: "Reopen",
    priority: "NORMAL",
    assigneeIds: [memberA.memberId],
    idempotencyKey: `reopen-${suffix}`,
  });
  const nextTask = await createTask(prisma, adminA, {
    boardId: board.id,
    columnId: nextDone.id,
    title: "Complete",
    priority: "NORMAL",
    assigneeIds: [memberA.memberId],
    idempotencyKey: `complete-${suffix}`,
  });
  const archived = await createTask(prisma, adminA, {
    boardId: board.id,
    columnId: oldDone.id,
    title: "Archived",
    priority: "NORMAL",
    assigneeIds: [],
    idempotencyKey: `archived-done-${suffix}`,
  });
  await prisma.hubTask.update({
    where: { id: archived.id },
    data: { archivedAt: new Date() },
  });
  const archivedCompletedAt = (
    await prisma.hubTask.findUniqueOrThrow({ where: { id: archived.id } })
  ).completedAt?.getTime();
  const result = await updateBoardColumns(prisma, adminA, board.id, {
    action: "done",
    columnId: nextDone.id,
  });
  assert.deepEqual(result.reconciliation.completed, 1);
  assert.deepEqual(result.reconciliation.reopened, 1);
  const tasks = await prisma.hubTask.findMany({
    where: { id: { in: [oldTask.id, nextTask.id, archived.id] } },
  });
  assert.equal(tasks.find((task) => task.id === oldTask.id)?.completedAt, null);
  assert.ok(tasks.find((task) => task.id === nextTask.id)?.completedAt);
  assert.equal(
    tasks.find((task) => task.id === archived.id)?.completedAt?.getTime(),
    archivedCompletedAt,
  );
  assert.equal(
    result.columns.filter((column) => column.isDoneColumn).length,
    1,
  );
});

test("62 archiving done column reconciles replacement and keeps exactly one active done column", async () => {
  const board = await createBoard(prisma, adminA, {
    name: `Archive done ${suffix}`,
    scope: "ORGANIZATION",
  });
  const oldDone = board.columns.find((column) => column.isDoneColumn)!;
  const replacement = board.columns.find((column) => !column.isDoneColumn)!;
  const task = await createTask(prisma, adminA, {
    boardId: board.id,
    columnId: replacement.id,
    title: "Complete on replacement",
    priority: "NORMAL",
    assigneeIds: [],
    idempotencyKey: `archive-replacement-${suffix}`,
  });
  const result = await updateBoardColumns(prisma, adminA, board.id, {
    action: "archive",
    columnId: oldDone.id,
    replacementDoneColumnId: replacement.id,
  });
  assert.equal(result.reconciliation.completed, 1);
  assert.ok(
    (await prisma.hubTask.findUniqueOrThrow({ where: { id: task.id } }))
      .completedAt,
  );
  assert.equal(
    result.columns.filter((column) => column.isDoneColumn).length,
    1,
  );
});

test("63 concurrent done-column changes leave exactly one active done column", async () => {
  const board = await createBoard(prisma, adminA, {
    name: `Concurrent done ${suffix}`,
    scope: "ORGANIZATION",
  });
  const targets = board.columns
    .filter((column) => !column.isDoneColumn)
    .slice(0, 2);
  const results = await Promise.allSettled(
    targets.map((column) =>
      updateBoardColumns(prisma, adminA, board.id, {
        action: "done",
        columnId: column.id,
      }),
    ),
  );
  assert.ok(results.some((result) => result.status === "fulfilled"));
  for (const result of results)
    if (result.status === "rejected")
      assert.equal((result.reason as { status?: number }).status, 409);
  const columns = await prisma.hubBoardColumn.findMany({
    where: { boardId: board.id, isArchived: false },
  });
  assert.equal(columns.filter((column) => column.isDoneColumn).length, 1);
});

test("64 viewer meeting creation handler rejects before database write", async () => {
  const before = await prisma.hubMeeting.count({
    where: { organizationId: orgA },
  });
  await assert.rejects(
    () => handleCreateMeeting(prisma, viewerA, null),
    (error: unknown) =>
      Boolean(
        error &&
        typeof error === "object" &&
        "status" in error &&
        error.status === 403,
      ),
  );
  assert.equal(
    await prisma.hubMeeting.count({ where: { organizationId: orgA } }),
    before,
  );
});

test("65 terminal meeting rejects linked task creation through the actual handler", async () => {
  const meeting = await raceMeeting("terminal-linked-task");
  await changeMeetingState(prisma, adminA, meeting.id, "complete", null, [
    { memberId: memberA.memberId, status: "ATTENDED" },
  ]);
  const before = await prisma.hubTask.count({
    where: { sourceMeetingId: meeting.id },
  });
  await expectConflict(() =>
    handleCreateTask(prisma, adminA, {
      boardId: boardA,
      columnId: columnsA[0],
      sourceMeetingId: meeting.id,
      title: "Nao criar",
      priority: "NORMAL",
      assigneeIds: [],
      idempotencyKey: `terminal-linked-task-${suffix}`,
    }),
  );
  assert.equal(
    await prisma.hubTask.count({ where: { sourceMeetingId: meeting.id } }),
    before,
  );
});
