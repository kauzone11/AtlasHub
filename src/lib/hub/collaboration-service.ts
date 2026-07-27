import type {
  HubMeetingStatus,
  HubTaskPriority,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { HubApiError } from "@/lib/hub/api";
import { writeHubAudit } from "@/lib/hub/audit";
import { checkAvailability } from "@/lib/hub/availability";
import {
  assertBoardAccess,
  assertMeetingAccess,
  assertMeetingManagement,
  assertTaskEdit,
  type HubActor,
} from "@/lib/hub/collaboration-policy";
import { createHubNotifications } from "@/lib/hub/notifications";
import { text } from "@/lib/hub/collaboration-validation";
import {
  assertMatchingRequestHash,
  prismaErrorCode,
  requestHash,
  serializationConflict,
} from "@/lib/hub/collaboration-idempotency";

const meetingSelect = {
  id: true,
  organizationId: true,
  title: true,
  description: true,
  status: true,
  startAt: true,
  endAt: true,
  timezone: true,
  location: true,
  meetingUrl: true,
  directorateId: true,
  organizationWide: true,
  version: true,
  createdById: true,
  cancelledAt: true,
  cancelReason: true,
  completedAt: true,
  minutes: true,
  createdAt: true,
  updatedAt: true,
  participants: {
    select: {
      memberId: true,
      responseStatus: true,
      respondedAt: true,
      attendanceStatus: true,
      member: { select: { id: true, name: true, avatarUrl: true } },
    },
  },
  directorates: {
    select: { directorate: { select: { id: true, name: true } } },
  },
  externalGuests: {
    select: { id: true, name: true, email: true },
  },
  agendaItems: {
    orderBy: { order: "asc" as const },
    select: {
      id: true,
      title: true,
      description: true,
      order: true,
      estimatedMinutes: true,
      presenterMemberId: true,
      presenter: { select: { id: true, name: true } },
    },
  },
  decisions: {
    orderBy: { decidedAt: "desc" as const },
    select: {
      id: true,
      title: true,
      description: true,
      decidedAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  },
  sourceTasks: {
    select: { id: true, title: true, boardId: true, completedAt: true },
  },
} satisfies Prisma.HubMeetingSelect;

type MeetingMutationMode = "access" | "manage";

async function claimMeetingMutation(
  tx: Prisma.TransactionClient,
  actor: HubActor,
  meetingId: string,
  allowedStatuses:
    | HubMeetingStatus[]
    | ((meeting: { status: HubMeetingStatus }) => HubMeetingStatus[]),
  mode: MeetingMutationMode = "manage",
  invalidStateMessage?: string,
) {
  const meeting = await tx.hubMeeting.findFirst({
    where: { id: meetingId, organizationId: actor.organizationId },
    select: {
      id: true,
      organizationId: true,
      directorateId: true,
      createdById: true,
      title: true,
      description: true,
      status: true,
      startAt: true,
      endAt: true,
      timezone: true,
      location: true,
      meetingUrl: true,
      minutes: true,
      updatedAt: true,
      participants: { select: { memberId: true } },
    },
  });
  if (!meeting) throw new HubApiError("Reuniao nao encontrada.", 404);
  if (mode === "manage") assertMeetingManagement(actor, meeting);
  else assertMeetingAccess(actor, meeting);
  const claimed = await tx.hubMeeting.updateMany({
    where: {
      id: meeting.id,
      organizationId: actor.organizationId,
      status: {
        in:
          typeof allowedStatuses === "function"
            ? allowedStatuses(meeting)
            : allowedStatuses,
      },
    },
    data: { updatedAt: new Date() },
  });
  if (!claimed.count)
    throw new HubApiError(
      invalidStateMessage ||
        (["COMPLETED", "CANCELLED"].includes(meeting.status)
          ? "Reunioes finalizadas sao somente leitura."
          : "O estado atual da reuniao nao permite esta alteracao."),
      409,
    );
  return meeting;
}

export async function createMeeting(
  client: PrismaClient,
  actor: HubActor,
  input: {
    title: string;
    description?: string | null;
    status: HubMeetingStatus;
    startAt: Date;
    endAt: Date;
    timezone: string;
    location?: string | null;
    meetingUrl?: string | null;
    directorateId?: string | null;
    directorateIds?: string[];
    organizationWide?: boolean;
    participantIds: string[];
    externalGuests?: Array<{ name: string; email?: string | null }>;
    idempotencyKey: string;
    confirmConflicts?: boolean;
    overrideReason?: string | null;
  },
) {
  const payloadHash = requestHash({
    title: input.title,
    description: input.description || null,
    status: input.status,
    startAt: input.startAt.toISOString(),
    endAt: input.endAt.toISOString(),
    timezone: input.timezone,
    location: input.location || null,
    meetingUrl: input.meetingUrl || null,
    directorateId: input.directorateId || null,
    directorateIds: [...new Set(input.directorateIds || [])].sort(),
    organizationWide: input.organizationWide === true,
    participantIds: [...new Set(input.participantIds)].sort(),
    externalGuests: (input.externalGuests || []).map((guest) => ({ name: guest.name.trim(), email: guest.email?.trim().toLowerCase() || null })).sort((a, b) => `${a.email}:${a.name}`.localeCompare(`${b.email}:${b.name}`)),
  });
  const run = () =>
    client.$transaction(
      async (tx) => {
        const existing = await tx.hubMeeting.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId: actor.organizationId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          select: { ...meetingSelect, requestHash: true },
        });
        if (existing) {
          assertMatchingRequestHash(existing.requestHash, payloadHash);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { requestHash: _requestHash, ...meeting } = existing;
          return { meeting, conflicts: [], idempotent: true };
        }
      const selectedDirectorateIds = [...new Set([...(input.directorateIds || []), ...(input.directorateId ? [input.directorateId] : [])])];
      if (
        selectedDirectorateIds.length &&
        (await tx.hubDirectorate.count({
          where: {
            id: { in: selectedDirectorateIds },
            organizationId: actor.organizationId,
            isActive: true,
          },
        })) !== selectedDirectorateIds.length
      )
        throw new HubApiError("Diretoria nao encontrada.", 404);
      const directorateMembers = input.organizationWide
        ? await tx.hubMember.findMany({ where: { organizationId: actor.organizationId, status: "ACTIVE" }, select: { id: true } })
        : selectedDirectorateIds.length
        ? await tx.hubMember.findMany({ where: { organizationId: actor.organizationId, status: "ACTIVE", directorateId: { in: selectedDirectorateIds } }, select: { id: true } })
        : [];
      const invitedMemberIds = [...new Set([actor.memberId, ...input.participantIds, ...directorateMembers.map((member) => member.id)])];
      if (!input.organizationWide && !selectedDirectorateIds.length && !input.participantIds.length && !(input.externalGuests || []).length)
        throw new HubApiError("Selecione ao menos uma audiência para a reunião.", 422);
      const activeMembers = await tx.hubMember.findMany({
        where: {
          id: { in: invitedMemberIds },
          organizationId: actor.organizationId,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (activeMembers.length !== invitedMemberIds.length)
        throw new HubApiError("Participante invalido.", 422);
      const conflicts =
        input.status === "SCHEDULED"
          ? await checkAvailability(tx, {
              organizationId: actor.organizationId,
              requesterId: actor.memberId,
              participantIds: invitedMemberIds,
              startAt: input.startAt,
              endAt: input.endAt,
              timezone: input.timezone,
            })
          : [];
      if (
        conflicts.length &&
        (!input.confirmConflicts || !input.overrideReason?.trim())
      )
        throw new HubApiError("Ha conflitos de disponibilidade.", 409, {
          code: "MEETING_CONFLICT",
          conflicts,
        });
      const meeting = await tx.hubMeeting.create({
        data: {
          organizationId: actor.organizationId,
          createdById: actor.memberId,
          title: input.title,
          description: input.description,
          status: input.status,
          startAt: input.startAt,
          endAt: input.endAt,
          timezone: input.timezone,
          location: input.location,
          meetingUrl: input.meetingUrl,
          directorateId: input.directorateId,
          organizationWide: input.organizationWide === true,
          directorates: selectedDirectorateIds.length ? { create: selectedDirectorateIds.map((directorateId) => ({ directorateId })) } : undefined,
          externalGuests: input.externalGuests?.length ? { create: input.externalGuests.map((guest) => ({ name: guest.name.trim(), email: guest.email?.trim().toLowerCase() || null })) } : undefined,
          idempotencyKey: input.idempotencyKey,
          requestHash: payloadHash,
          participants: {
            create: activeMembers.map((member) => ({
              memberId: member.id,
              responseStatus:
                member.id === actor.memberId ? "ACCEPTED" : "PENDING",
              respondedAt: member.id === actor.memberId ? new Date() : null,
            })),
          },
        },
        select: meetingSelect,
      });
      await writeHubAudit(tx, {
        organizationId: actor.organizationId,
        memberId: actor.memberId,
        action: "MEETING_CREATED",
        entity: "MEETING",
        entityId: meeting.id,
        metadata: {
          status: meeting.status,
          participantCount: activeMembers.length,
        },
      });
      if (conflicts.length)
        await writeHubAudit(tx, {
          organizationId: actor.organizationId,
          memberId: actor.memberId,
          action: "MEETING_CONFLICT_OVERRIDDEN",
          entity: "MEETING",
          entityId: meeting.id,
          metadata: {
            reason: input.overrideReason!.trim().slice(0, 240),
            conflictCount: conflicts.length,
          },
        });
      if (input.status === "SCHEDULED")
        await createHubNotifications(
          tx,
          activeMembers
            .filter((member) => member.id !== actor.memberId)
            .map((member) => ({
            organizationId: actor.organizationId,
            recipientMemberId: member.id,
            actorMemberId: actor.memberId,
            type: "MEETING_INVITED",
            title: "Convite para reuniao",
            body: meeting.title,
            href: `/hub/reunioes/${meeting.id}`,
            entityType: "MEETING",
            entityId: meeting.id,
            idempotencyKey: `meeting:${meeting.id}:invited:${member.id}`,
            })),
        );
      return { meeting, conflicts, idempotent: false };
      },
      { isolationLevel: "Serializable" },
    );
  try {
    return await run();
  } catch (error) {
    if (prismaErrorCode(error) === "P2034") {
      try {
        return await run();
      } catch (retryError) {
        if (prismaErrorCode(retryError) === "P2034")
          throw serializationConflict();
        throw retryError;
      }
    }
    if (prismaErrorCode(error) === "P2002") {
      const existing = await client.hubMeeting.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: actor.organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        select: { ...meetingSelect, requestHash: true },
      });
      if (existing) {
        assertMatchingRequestHash(existing.requestHash, payloadHash);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { requestHash: _requestHash, ...meeting } = existing;
        return { meeting, conflicts: [], idempotent: true };
      }
    }
    throw error;
  }
}

export async function respondMeeting(
  client: PrismaClient,
  actor: HubActor,
  meetingId: string,
  status: "ACCEPTED" | "DECLINED" | "TENTATIVE",
  eventId: string,
  invitationVersion?: number,
  declineReason?: string | null,
) {
  if (actor.role === "VIEWER")
    throw new HubApiError("Perfil de visualizacao e somente leitura.", 403);
  const run = () => client.$transaction(
    async (tx) => {
      const priorEvent = await tx.hubMeetingResponseEvent.findUnique({
        where: {
          organizationId_eventId: {
            organizationId: actor.organizationId,
            eventId,
          },
        },
        select: { meetingId: true, memberId: true, status: true },
      });
      if (priorEvent) {
        if (
          priorEvent.meetingId !== meetingId ||
          priorEvent.memberId !== actor.memberId ||
          priorEvent.status !== status
        )
          throw new HubApiError(
            "O evento de resposta ja foi usado com dados diferentes.",
            409,
          );
        return { status, idempotent: true };
      }
      const meeting = await claimMeetingMutation(
        tx,
        actor,
        meetingId,
        ["SCHEDULED"],
        "access",
      );
      const updated = await tx.hubMeetingParticipant.updateMany({
        where: { meetingId, memberId: actor.memberId, ...(invitationVersion !== undefined ? { invitationVersion } : {}) },
        data: { responseStatus: status, respondedAt: new Date(), declineReason: status === "DECLINED" ? declineReason?.trim() || null : null, invitationVersion: { increment: 1 } },
      });
      if (!updated.count) {
        const invitation = await tx.hubMeetingParticipant.findUnique({ where: { meetingId_memberId: { meetingId, memberId: actor.memberId } }, select: { id: true } });
        if (invitation && invitationVersion !== undefined) throw new HubApiError("Este convite foi atualizado. Recarregue antes de responder.", 409);
        throw new HubApiError("Convite nao encontrado.", 404);
      }
      await tx.hubNotification.updateMany({ where: { organizationId: actor.organizationId, recipientMemberId: actor.memberId, entityType: "MEETING", entityId: meetingId, readAt: null }, data: { readAt: new Date(), version: { increment: 1 } } });
      await tx.hubMeetingResponseEvent.create({
        data: {
          organizationId: actor.organizationId,
          meetingId,
          memberId: actor.memberId,
          eventId,
          status,
        },
      });
      if (meeting.createdById !== actor.memberId)
        await createHubNotifications(tx, [
          {
            organizationId: actor.organizationId,
            recipientMemberId: meeting.createdById,
            actorMemberId: actor.memberId,
            type: "MEETING_RESPONSE",
            title: "Resposta a reuniao",
            body: status,
            href: `/hub/reunioes/${meeting.id}`,
            entityType: "MEETING",
            entityId: meeting.id,
            idempotencyKey: `meeting-response:${eventId}:${meeting.createdById}`,
          },
        ]);
      return { status, idempotent: false };
    },
    { isolationLevel: "Serializable" },
  );
  try {
    return await run();
  } catch (error) {
    if (prismaErrorCode(error) === "P2002") {
      const priorEvent = await client.hubMeetingResponseEvent.findUnique({
        where: {
          organizationId_eventId: {
            organizationId: actor.organizationId,
            eventId,
          },
        },
        select: { meetingId: true, memberId: true, status: true },
      });
      if (
        priorEvent?.meetingId === meetingId &&
        priorEvent.memberId === actor.memberId &&
        priorEvent.status === status
      )
        return { status, idempotent: true };
      throw new HubApiError(
        "O evento de resposta ja foi usado com dados diferentes.",
        409,
      );
    }
    if (prismaErrorCode(error) === "P2034") throw serializationConflict();
    throw error;
  }
}

export async function changeMeetingState(
  client: PrismaClient,
  actor: HubActor,
  meetingId: string,
  action: "cancel" | "complete",
  reason?: string | null,
  attendance?: Array<{
    memberId: string;
    status: "ATTENDED" | "ABSENT";
  }>,
) {
  const run = () => client.$transaction(
    async (tx) => {
      const meeting = await claimMeetingMutation(
        tx,
        actor,
        meetingId,
        action === "complete" ? ["SCHEDULED"] : ["DRAFT", "SCHEDULED"],
      );
      if (action === "complete" && attendance?.length) {
        for (const row of attendance) {
          const changed = await tx.hubMeetingParticipant.updateMany({
            where: { meetingId, memberId: row.memberId },
            data: { attendanceStatus: row.status },
          });
          if (!changed.count)
            throw new HubApiError("Participante nao encontrado.", 404);
        }
      }
      if (
        action === "complete" &&
        (await tx.hubMeetingParticipant.count({
          where: { meetingId, attendanceStatus: null },
        }))
      )
        throw new HubApiError(
          "Registre a presenca de todos os participantes antes de concluir.",
          422,
        );
      const status = action === "cancel" ? "CANCELLED" : "COMPLETED";
      const updated = await tx.hubMeeting.update({
        where: { id: meeting.id },
        data:
          action === "cancel"
            ? {
                status,
                cancelledAt: new Date(),
                cancelledById: actor.memberId,
                cancelReason: reason,
              }
            : { status, completedAt: new Date() },
        select: meetingSelect,
      });
      await writeHubAudit(tx, {
        organizationId: actor.organizationId,
        memberId: actor.memberId,
        action: action === "cancel" ? "MEETING_CANCELLED" : "MEETING_COMPLETED",
        entity: "MEETING",
        entityId: meeting.id,
        metadata:
          action === "cancel" ? { reason: reason?.slice(0, 240) } : undefined,
      });
      if (meeting.status === "SCHEDULED")
        await createHubNotifications(
          tx,
          meeting.participants
            .filter((item) => item.memberId !== actor.memberId)
            .map((item) => ({
            organizationId: actor.organizationId,
            recipientMemberId: item.memberId,
            actorMemberId: actor.memberId,
            type:
              action === "cancel" ? "MEETING_CANCELLED" : "MEETING_COMPLETED",
            title:
              action === "cancel" ? "Reuniao cancelada" : "Reuniao concluida",
            body: meeting.title,
            href: `/hub/reunioes/${meeting.id}`,
            entityType: "MEETING",
            entityId: meeting.id,
            idempotencyKey: `meeting:${meeting.id}:${status.toLowerCase()}:${item.memberId}`,
            })),
        );
      return updated;
    },
    { isolationLevel: "Serializable" },
  );
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (prismaErrorCode(error) === "P2034" && attempt < 2) continue;
      if (prismaErrorCode(error) === "P2034") throw serializationConflict();
      throw error;
    }
  }
  throw serializationConflict();
}

const boardSelect = {
  id: true,
  organizationId: true,
  name: true,
  description: true,
  scope: true,
  directorateId: true,
  isArchived: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  columns: {
    where: { isArchived: false },
    orderBy: { order: "asc" as const },
    select: {
      id: true,
      name: true,
      order: true,
      isDoneColumn: true,
      tasks: {
        where: { archivedAt: null },
        orderBy: { position: "asc" as const },
        select: {
          id: true,
          organizationId: true,
          title: true,
          priority: true,
          dueAt: true,
          position: true,
          version: true,
          completedAt: true,
          createdById: true,
          assignees: {
            select: {
              member: { select: { id: true, name: true, avatarUrl: true } },
            },
          },
          _count: { select: { comments: true, checklistItems: true } },
        },
      },
    },
  },
} satisfies Prisma.HubBoardSelect;

export async function createBoard(
  client: PrismaClient,
  actor: HubActor,
  input: {
    name: string;
    description?: string | null;
    scope: "ORGANIZATION" | "DIRECTORATE";
    directorateId?: string | null;
  },
) {
  return client.$transaction(
    async (tx) => {
      if (
        input.scope === "DIRECTORATE" &&
        (!input.directorateId ||
          !(await tx.hubDirectorate.count({
            where: {
              id: input.directorateId,
              organizationId: actor.organizationId,
              isActive: true,
            },
          })))
      )
        throw new HubApiError("Diretoria invalida.", 422);
      const board = await tx.hubBoard.create({
        data: {
          organizationId: actor.organizationId,
          createdById: actor.memberId,
          name: input.name,
          description: input.description,
          scope: input.scope,
          directorateId:
            input.scope === "DIRECTORATE" ? input.directorateId : null,
          columns: {
            create: [
              { name: "A fazer", order: 1000 },
              { name: "Em andamento", order: 2000 },
              { name: "Concluido", order: 3000, isDoneColumn: true },
            ],
          },
        },
        select: boardSelect,
      });
      await writeHubAudit(tx, {
        organizationId: actor.organizationId,
        memberId: actor.memberId,
        action: "BOARD_CREATED",
        entity: "BOARD",
        entityId: board.id,
        metadata: { scope: board.scope, directorateId: board.directorateId },
      });
      return board;
    },
    { isolationLevel: "Serializable" },
  );
}

export async function createTask(
  client: PrismaClient,
  actor: HubActor,
  input: {
    boardId: string;
    columnId: string;
    sourceMeetingId?: string | null;
    title: string;
    description?: string | null;
    priority: HubTaskPriority;
    dueAt?: Date | null;
    assigneeIds: string[];
    idempotencyKey: string;
  },
) {
  if (actor.role === "VIEWER")
    throw new HubApiError("Perfil de visualizacao e somente leitura.", 403);
  const payloadHash = requestHash({
    boardId: input.boardId,
    columnId: input.columnId,
    sourceMeetingId: input.sourceMeetingId || null,
    title: input.title,
    description: input.description || null,
    priority: input.priority,
    dueAt: input.dueAt?.toISOString() || null,
    assigneeIds: [...new Set(input.assigneeIds)].sort(),
  });
  const run = () =>
    client.$transaction(
      async (tx) => {
        const existing = await tx.hubTask.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId: actor.organizationId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          select: { id: true, version: true, requestHash: true },
        });
        if (existing) {
          assertMatchingRequestHash(existing.requestHash, payloadHash);
          return { id: existing.id, version: existing.version };
        }
      const board = await tx.hubBoard.findFirst({
        where: { id: input.boardId, organizationId: actor.organizationId },
        select: {
          id: true,
          organizationId: true,
          directorateId: true,
          scope: true,
          createdById: true,
          isArchived: true,
          columns: {
            where: { id: input.columnId, isArchived: false },
            select: { id: true, isDoneColumn: true },
          },
        },
      });
      if (!board) throw new HubApiError("Quadro nao encontrado.", 404);
      assertBoardAccess(actor, board);
      if (board.isArchived)
        throw new HubApiError("Quadros arquivados sao somente leitura.", 409);
      if (!board.columns.length) throw new HubApiError("Coluna invalida.", 422);
      if (input.sourceMeetingId) {
        await claimMeetingMutation(
          tx,
          actor,
          input.sourceMeetingId,
          ["DRAFT", "SCHEDULED"],
          "access",
        );
      }
      const assignees = await tx.hubMember.findMany({
        where: {
          id: { in: [...new Set(input.assigneeIds)] },
          organizationId: actor.organizationId,
          status: "ACTIVE",
          ...(board.scope === "DIRECTORATE"
            ? { directorateId: board.directorateId }
            : {}),
        },
        select: { id: true },
      });
      if (assignees.length !== new Set(input.assigneeIds).size)
        throw new HubApiError("Responsavel sem acesso ao quadro.", 422);
      const aggregate = await tx.hubTask.aggregate({
        where: {
          boardId: board.id,
          columnId: input.columnId,
          archivedAt: null,
        },
        _max: { position: true },
      });
      const task = await tx.hubTask.create({
        data: {
          organizationId: actor.organizationId,
          boardId: board.id,
          columnId: input.columnId,
          sourceMeetingId: input.sourceMeetingId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          dueAt: input.dueAt,
          position: (aggregate._max.position || 0) + 1000,
          createdById: actor.memberId,
          completedAt: board.columns[0].isDoneColumn ? new Date() : null,
          idempotencyKey: input.idempotencyKey,
          requestHash: payloadHash,
          assignees: {
            create: assignees.map((member) => ({ memberId: member.id })),
          },
        },
        select: { id: true, version: true, title: true },
      });
      await writeHubAudit(tx, {
        organizationId: actor.organizationId,
        memberId: actor.memberId,
        action: "TASK_CREATED",
        entity: "TASK",
        entityId: task.id,
        metadata: {
          boardId: board.id,
          assigneeCount: assignees.length,
          sourceMeetingId: input.sourceMeetingId || null,
        },
      });
      await createHubNotifications(
        tx,
        assignees
          .filter((item) => item.id !== actor.memberId)
          .map((item) => ({
            organizationId: actor.organizationId,
            recipientMemberId: item.id,
            actorMemberId: actor.memberId,
            type: "TASK_ASSIGNED",
            title: "Nova tarefa atribuida",
            body: task.title,
            href: `/hub/quadros/${board.id}?task=${task.id}`,
            entityType: "TASK",
            entityId: task.id,
            idempotencyKey: `task:${task.id}:assigned:${item.id}`,
          })),
      );
      return task;
      },
      { isolationLevel: "Serializable" },
    );
  try {
    return await run();
  } catch (error) {
    if (prismaErrorCode(error) === "P2034") {
      try {
        return await run();
      } catch (retryError) {
        if (prismaErrorCode(retryError) === "P2034")
          throw serializationConflict();
        throw retryError;
      }
    }
    if (prismaErrorCode(error) === "P2002") {
      const existing = await client.hubTask.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: actor.organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        select: { id: true, version: true, requestHash: true },
      });
      if (existing) {
        assertMatchingRequestHash(existing.requestHash, payloadHash);
        return { id: existing.id, version: existing.version };
      }
    }
    throw error;
  }
}

export async function scheduleMeeting(
  client: PrismaClient,
  actor: HubActor,
  meetingId: string,
  input: { confirmConflicts?: boolean; overrideReason?: string | null },
) {
  try {
    return await client.$transaction(
      async (tx) => {
        const meeting = await claimMeetingMutation(
          tx,
          actor,
          meetingId,
          ["DRAFT"],
          "manage",
          "Somente rascunhos podem ser agendados.",
        );
        const participantIds = meeting.participants.map((item) => item.memberId);
        const activeCount = await tx.hubMember.count({
          where: {
            id: { in: participantIds },
            organizationId: actor.organizationId,
            status: "ACTIVE",
          },
        });
        if (activeCount !== participantIds.length)
          throw new HubApiError("Participante invalido.", 422);
        const conflicts = await checkAvailability(tx, {
          organizationId: actor.organizationId,
          requesterId: actor.memberId,
          participantIds,
          startAt: meeting.startAt,
          endAt: meeting.endAt,
          timezone: meeting.timezone,
          excludeMeetingId: meeting.id,
        });
        if (
          conflicts.length &&
          (!input.confirmConflicts || !input.overrideReason?.trim())
        )
          throw new HubApiError("Ha conflitos de disponibilidade.", 409, {
            code: "MEETING_CONFLICT",
            conflicts,
          });
        const updated = await tx.hubMeeting.update({
          where: { id: meeting.id },
          data: { status: "SCHEDULED" },
          select: meetingSelect,
        });
        await writeHubAudit(tx, {
          organizationId: actor.organizationId,
          memberId: actor.memberId,
          action: "MEETING_SCHEDULED",
          entity: "MEETING",
          entityId: meeting.id,
        });
        if (conflicts.length)
          await writeHubAudit(tx, {
            organizationId: actor.organizationId,
            memberId: actor.memberId,
            action: "MEETING_CONFLICT_OVERRIDDEN",
            entity: "MEETING",
            entityId: meeting.id,
            metadata: {
              reason: input.overrideReason!.trim().slice(0, 240),
              conflictCount: conflicts.length,
            },
          });
        await createHubNotifications(
          tx,
          participantIds
            .filter((memberId) => memberId !== actor.memberId)
            .map((recipientMemberId) => ({
              organizationId: actor.organizationId,
              recipientMemberId,
              actorMemberId: actor.memberId,
              type: "MEETING_INVITED",
              title: "Convite para reuniao",
              body: meeting.title,
              href: `/hub/reunioes/${meeting.id}`,
              entityType: "MEETING",
              entityId: meeting.id,
              idempotencyKey: `meeting:${meeting.id}:invited:${recipientMemberId}`,
            })),
        );
        return { meeting: updated, conflicts };
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (prismaErrorCode(error) === "P2034") throw serializationConflict();
    throw error;
  }
}

export async function updateMeeting(
  client: PrismaClient,
  actor: HubActor,
  meetingId: string,
  input: {
    title?: string;
    description?: string | null;
    minutes?: string | null;
    correctionReason?: string | null;
    startAt?: Date;
    endAt?: Date;
    timezone?: string;
    location?: string | null;
    meetingUrl?: string | null;
    participantIds?: string[];
    confirmConflicts?: boolean;
    overrideReason?: string | null;
  },
) {
  try {
    return await client.$transaction(
      async (tx) => {
        const correctionOnly =
          input.minutes !== undefined &&
          Object.entries(input).every(
            ([key, value]) =>
              value === undefined ||
              key === "minutes" ||
              key === "correctionReason",
          );
        const current = await claimMeetingMutation(
          tx,
          actor,
          meetingId,
          (meeting) =>
            meeting.status === "COMPLETED" && correctionOnly
              ? ["COMPLETED"]
              : ["DRAFT", "SCHEDULED"],
        );
        const correctingMinutes =
          current.status === "COMPLETED" &&
          correctionOnly;
        if (correctingMinutes && !input.correctionReason?.trim())
          throw new HubApiError("Motivo da correcao e obrigatorio.", 422);
        const startAt = input.startAt || current.startAt;
        const endAt = input.endAt || current.endAt;
        if (endAt <= startAt || endAt.getTime() - startAt.getTime() < 15 * 60_000)
          throw new HubApiError("A reuniao deve durar ao menos 15 minutos.", 422);
        const oldParticipantIds = current.participants.map((item) => item.memberId);
        const participantIds = input.participantIds || oldParticipantIds;
        if (!correctingMinutes) {
          const activeCount = await tx.hubMember.count({
            where: {
              id: { in: participantIds },
              organizationId: actor.organizationId,
              status: "ACTIVE",
            },
          });
          if (activeCount !== new Set(participantIds).size)
            throw new HubApiError("Participante invalido.", 422);
        }
        const scheduleChanged =
          startAt.getTime() !== current.startAt.getTime() ||
          endAt.getTime() !== current.endAt.getTime() ||
          input.timezone !== undefined ||
          input.participantIds !== undefined;
        const conflicts =
          scheduleChanged && current.status === "SCHEDULED"
            ? await checkAvailability(tx, {
                organizationId: actor.organizationId,
                requesterId: actor.memberId,
                participantIds,
                startAt,
                endAt,
                timezone: input.timezone || current.timezone,
                excludeMeetingId: current.id,
              })
            : [];
        if (
          conflicts.length &&
          (!input.confirmConflicts || !input.overrideReason?.trim())
        )
          throw new HubApiError("Ha conflitos de disponibilidade.", 409, {
            code: "MEETING_CONFLICT",
            conflicts,
          });
        const added = participantIds.filter(
          (memberId) => !oldParticipantIds.includes(memberId),
        );
        const removed = oldParticipantIds.filter(
          (memberId) => !participantIds.includes(memberId),
        );
        if (input.participantIds) {
          await tx.hubMeetingParticipant.deleteMany({
            where: { meetingId, memberId: { in: removed } },
          });
          await tx.hubMeetingParticipant.createMany({
            data: added.map((memberId) => ({ meetingId, memberId })),
            skipDuplicates: true,
          });
        }
        const updated = await tx.hubMeeting.update({
          where: { id: current.id },
          data: {
            title: input.title,
            description: input.description,
            minutes: input.minutes,
            startAt,
            endAt,
            timezone: input.timezone,
            location: input.location,
            meetingUrl: input.meetingUrl,
          },
          select: meetingSelect,
        });
        const materialChanged =
          scheduleChanged ||
          input.title !== undefined ||
          input.description !== undefined ||
          input.location !== undefined ||
          input.meetingUrl !== undefined;
        await writeHubAudit(tx, {
          organizationId: actor.organizationId,
          memberId: actor.memberId,
          action: correctingMinutes
            ? "MEETING_MINUTES_CORRECTED"
            : "MEETING_UPDATED",
          entity: "MEETING",
          entityId: current.id,
          metadata: correctingMinutes
            ? {
                reason: input.correctionReason!.trim().slice(0, 240),
                originalUpdatedAt: current.updatedAt.toISOString(),
                correctedAt: updated.updatedAt.toISOString(),
              }
            : { materialChanged, addedCount: added.length, removedCount: removed.length },
        });
        if (conflicts.length)
          await writeHubAudit(tx, {
            organizationId: actor.organizationId,
            memberId: actor.memberId,
            action: "MEETING_CONFLICT_OVERRIDDEN",
            entity: "MEETING",
            entityId: current.id,
            metadata: {
              reason: input.overrideReason!.trim().slice(0, 240),
              conflictCount: conflicts.length,
            },
          });
        if (current.status === "SCHEDULED" && !correctingMinutes) {
          await createHubNotifications(tx, [
            ...added
              .filter((memberId) => memberId !== actor.memberId)
              .map((recipientMemberId) => ({
                organizationId: actor.organizationId,
                recipientMemberId,
                actorMemberId: actor.memberId,
                type: "MEETING_INVITED" as const,
                title: "Convite para reuniao",
                body: updated.title,
                href: `/hub/reunioes/${meetingId}`,
                entityType: "MEETING",
                entityId: meetingId,
                idempotencyKey: `meeting:${meetingId}:invited:${updated.updatedAt.getTime()}:${recipientMemberId}`,
              })),
            ...removed
              .filter((memberId) => memberId !== actor.memberId)
              .map((recipientMemberId) => ({
                organizationId: actor.organizationId,
                recipientMemberId,
                actorMemberId: actor.memberId,
                type: "MEETING_PARTICIPANT_REMOVED" as const,
                title: "Participacao em reuniao removida",
                body: updated.title,
                href: "/hub/reunioes",
                entityType: "MEETING",
                entityId: meetingId,
                idempotencyKey: `meeting:${meetingId}:removed:${updated.updatedAt.getTime()}:${recipientMemberId}`,
              })),
            ...(materialChanged
              ? oldParticipantIds
                  .filter(
                    (memberId) =>
                      !removed.includes(memberId) &&
                      !added.includes(memberId) &&
                      memberId !== actor.memberId,
                  )
                  .map((recipientMemberId) => ({
                    organizationId: actor.organizationId,
                    recipientMemberId,
                    actorMemberId: actor.memberId,
                    type: "MEETING_UPDATED" as const,
                    title: "Reuniao atualizada",
                    body: updated.title,
                    href: `/hub/reunioes/${meetingId}`,
                    entityType: "MEETING",
                    entityId: meetingId,
                    idempotencyKey: `meeting:${meetingId}:updated:${updated.updatedAt.getTime()}:${recipientMemberId}`,
                  }))
              : []),
          ]);
        }
        return { meeting: updated, conflicts };
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (prismaErrorCode(error) === "P2034") throw serializationConflict();
    throw error;
  }
}

export async function replaceMeetingAgenda(
  client: PrismaClient,
  actor: HubActor,
  meetingId: string,
  items: Array<Record<string, unknown>>,
) {
  const run = () => client.$transaction(
    async (tx) => {
      await claimMeetingMutation(tx, actor, meetingId, ["SCHEDULED"]);
      const presenterIds = [...new Set(items
        .map((item) => item.presenterMemberId)
        .filter((value): value is string => typeof value === "string"))];
      if (items.some((item) => item.estimatedMinutes !== undefined &&
        (!Number.isInteger(Number(item.estimatedMinutes)) || Number(item.estimatedMinutes) < 1 || Number(item.estimatedMinutes) > 1440)))
        throw new HubApiError("Duracao estimada invalida.", 422);
      if (presenterIds.length !== await tx.hubMember.count({
        where: { id: { in: presenterIds }, organizationId: actor.organizationId, status: "ACTIVE" },
      })) throw new HubApiError("Apresentador invalido.", 422);
      await tx.hubMeetingAgendaItem.deleteMany({ where: { meetingId } });
      if (items.length) await tx.hubMeetingAgendaItem.createMany({
        data: items.map((item, order) => ({
          meetingId,
          title: text(item.title, "Titulo", 160) as string,
          description: text(item.description, "Descricao", 2000, false),
          order: (order + 1) * 1000,
          estimatedMinutes: Number.isInteger(Number(item.estimatedMinutes)) ? Number(item.estimatedMinutes) : null,
          presenterMemberId: typeof item.presenterMemberId === "string" ? item.presenterMemberId : null,
        })),
      });
      return { updated: items.length };
    },
    { isolationLevel: "Serializable" },
  );
  try { return await run(); } catch (error) {
    if (prismaErrorCode(error) === "P2034") throw serializationConflict();
    throw error;
  }
}

export async function updateMeetingAttendance(
  client: PrismaClient,
  actor: HubActor,
  meetingId: string,
  rows: Array<{ memberId: string; status: string }>,
) {
  if (rows.some((item) => !["ATTENDED", "ABSENT"].includes(item.status)))
    throw new HubApiError("Presenca invalida.", 422);
  const run = () => client.$transaction(async (tx) => {
    await claimMeetingMutation(tx, actor, meetingId, ["SCHEDULED"]);
    for (const item of rows) {
      const result = await tx.hubMeetingParticipant.updateMany({
        where: { meetingId, memberId: item.memberId },
        data: { attendanceStatus: item.status as "ATTENDED" | "ABSENT" },
      });
      if (!result.count) throw new HubApiError("Participante nao encontrado.", 404);
    }
    await writeHubAudit(tx, {
      organizationId: actor.organizationId,
      memberId: actor.memberId,
      action: "MEETING_ATTENDANCE_CHANGED",
      entity: "MEETING",
      entityId: meetingId,
      metadata: { count: rows.length },
    });
    return { updated: rows.length };
  }, { isolationLevel: "Serializable" });
  try { return await run(); } catch (error) {
    if (prismaErrorCode(error) === "P2034") throw serializationConflict();
    throw error;
  }
}

export async function createMeetingDecision(
  client: PrismaClient,
  actor: HubActor,
  meetingId: string,
  input: Record<string, unknown> | null,
) {
  const run = () => client.$transaction(async (tx) => {
    const meeting = await claimMeetingMutation(tx, actor, meetingId, ["SCHEDULED"]);
    const created = await tx.hubMeetingDecision.create({
      data: {
        meetingId,
        title: text(input?.title, "Titulo", 160) as string,
        description: text(input?.description, "Descricao", 4000, false),
        createdById: actor.memberId,
      },
      select: { id: true, title: true, description: true, decidedAt: true },
    });
    await writeHubAudit(tx, {
      organizationId: actor.organizationId,
      memberId: actor.memberId,
      action: "MEETING_DECISION_RECORDED",
      entity: "MEETING_DECISION",
      entityId: created.id,
      metadata: { meetingId },
    });
    await createHubNotifications(tx, meeting.participants
      .filter((item) => item.memberId !== actor.memberId)
      .map((item) => ({
        organizationId: actor.organizationId,
        recipientMemberId: item.memberId,
        actorMemberId: actor.memberId,
        type: "MEETING_DECISION_RECORDED" as const,
        title: "Nova decisao registrada",
        body: created.title,
        href: `/hub/reunioes/${meetingId}`,
        entityType: "MEETING_DECISION",
        entityId: created.id,
        idempotencyKey: `meeting:${meetingId}:decision:${created.id}:${item.memberId}`,
      })));
    return created;
  }, { isolationLevel: "Serializable" });
  try { return await run(); } catch (error) {
    if (prismaErrorCode(error) === "P2034") throw serializationConflict();
    throw error;
  }
}

export async function moveTask(
  client: PrismaClient,
  actor: HubActor,
  input: {
    taskId: string;
    columnId: string;
    beforeTaskId?: string | null;
    version: number;
  },
) {
  return client.$transaction(
    async (tx) => {
      const task = await tx.hubTask.findFirst({
        where: { id: input.taskId, organizationId: actor.organizationId },
        select: {
          id: true,
          organizationId: true,
          boardId: true,
          title: true,
          createdById: true,
          archivedAt: true,
          version: true,
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
      assertTaskEdit(actor, task);
      if (task.version !== input.version)
        throw new HubApiError(
          "A tarefa foi alterada. Atualize e tente novamente.",
          409,
        );
      const column = await tx.hubBoardColumn.findFirst({
        where: { id: input.columnId, boardId: task.boardId, isArchived: false },
        select: { id: true, isDoneColumn: true },
      });
      if (!column) throw new HubApiError("Coluna invalida.", 422);
      const target = input.beforeTaskId
        ? await tx.hubTask.findFirst({
            where: {
              id: input.beforeTaskId,
              boardId: task.boardId,
              columnId: column.id,
              archivedAt: null,
            },
            select: { position: true },
          })
        : null;
      if (target)
        await tx.hubTask.updateMany({
          where: {
            boardId: task.boardId,
            columnId: column.id,
            archivedAt: null,
            position: { gte: target.position },
          },
          data: { position: { increment: 1000 } },
        });
      const max = target
        ? target.position
        : ((
            await tx.hubTask.aggregate({
              where: {
                boardId: task.boardId,
                columnId: column.id,
                archivedAt: null,
              },
              _max: { position: true },
            })
          )._max.position || 0) + 1000;
      const claimed = await tx.hubTask.updateMany({
        where: { id: task.id, version: input.version },
        data: {
          columnId: column.id,
          position: max,
          version: { increment: 1 },
          completedAt: column.isDoneColumn ? new Date() : null,
        },
      });
      if (!claimed.count)
        throw new HubApiError(
          "A tarefa foi alterada. Atualize e tente novamente.",
          409,
        );
      await writeHubAudit(tx, {
        organizationId: actor.organizationId,
        memberId: actor.memberId,
        action: column.isDoneColumn ? "TASK_COMPLETED" : "TASK_MOVED",
        entity: "TASK",
        entityId: task.id,
        metadata: { columnId: column.id },
      });
      const recipients = [
        ...new Set([
          task.createdById,
          ...task.assignees.map((item) => item.memberId),
        ]),
      ].filter((memberId) => memberId !== actor.memberId);
      await createHubNotifications(
        tx,
        recipients.map((recipientMemberId) => ({
          organizationId: actor.organizationId,
          recipientMemberId,
          actorMemberId: actor.memberId,
          type: column.isDoneColumn ? "TASK_COMPLETED" : "TASK_UPDATED",
          title: column.isDoneColumn ? "Tarefa concluída" : "Tarefa movida",
          body: task.title,
          href: `/hub/tarefas/${task.id}`,
          entityType: "TASK",
          entityId: task.id,
          idempotencyKey: `task:${task.id}:move:v${input.version + 1}:${recipientMemberId}`,
        })),
      );
      return tx.hubTask.findUniqueOrThrow({
        where: { id: task.id },
        select: {
          id: true,
          columnId: true,
          position: true,
          version: true,
          completedAt: true,
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
}

export { meetingSelect, boardSelect };
