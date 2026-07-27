import crypto from "crypto";
import type { HubRole, PrismaClient } from "@prisma/client";
import { HubApiError } from "@/lib/hub/api";
import { writeHubAudit } from "@/lib/hub/audit";
import { hasHubPermission } from "@/lib/hub/permissions";
import { hubCoreTransaction } from "@/lib/hub/core-transaction";
import { createHubNotifications } from "@/lib/hub/notifications";

type Actor = {
  organizationId: string;
  memberId: string;
  role: HubRole;
  directorateId?: string | null;
};

function canManage(
  actor: Actor,
  meeting: {
    createdById: string;
    directorates: Array<{ directorateId: string }>;
  },
) {
  return (
    hasHubPermission(actor.role, "meetings:manage-all") ||
    meeting.createdById === actor.memberId ||
    (actor.role === "DIRECTOR" &&
      meeting.directorates.some(
        (item) => item.directorateId === actor.directorateId,
      ))
  );
}

export async function getCoreMeeting(
  client: PrismaClient,
  actor: Actor,
  id: string,
) {
  const meeting = await client.hubMeeting.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: {
      directorates: {
        include: { directorate: { select: { id: true, name: true } } },
      },
      externalGuests: true,
      participants: {
        include: {
          member: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      },
      agendaItems: { orderBy: { order: "asc" } },
      decisions: { orderBy: { decidedAt: "desc" } },
      sourceTasks: {
        select: {
          id: true,
          title: true,
          status: true,
          completedAt: true,
          dueAt: true,
        },
      },
    },
  });
  if (!meeting) throw new HubApiError("Reunião não encontrada.", 404);
  const isParticipant = meeting.participants.some(
    (item) => item.memberId === actor.memberId,
  );
  const manageable = canManage(actor, meeting);
  if (
    !manageable &&
    !isParticipant &&
    !meeting.directorates.some(
      (item) => item.directorateId === actor.directorateId,
    )
  )
    throw new HubApiError("Reunião não encontrada.", 404);
  return {
    ...meeting,
    directorates: meeting.directorates.map((link) => link.directorate),
    externalGuests: meeting.externalGuests.map((guest) => ({
      id: guest.id,
      name: guest.name,
      ...(manageable ? { email: guest.email } : {}),
    })),
    capabilities: {
      canManage: manageable,
      canRespond: isParticipant && meeting.status === "SCHEDULED",
    },
  };
}

export async function updateMeetingAudience(
  client: PrismaClient,
  actor: Actor,
  id: string,
  input: {
    version: number;
    organizationWide: boolean;
    directorateIds: string[];
    participantIds: string[];
    externalGuests: Array<{ name: string; email?: string | null }>;
  },
) {
  return hubCoreTransaction(client, async (tx) => {
    const meeting = await tx.hubMeeting.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: { directorates: true, participants: true },
    });
    if (!meeting) throw new HubApiError("Reunião não encontrada.", 404);
    if (!canManage(actor, meeting))
      throw new HubApiError("Ação não permitida.", 403);
    if (["COMPLETED", "CANCELLED"].includes(meeting.status))
      throw new HubApiError("Reuniões encerradas são somente leitura.", 409);
    if (!Number.isInteger(input.version) || meeting.version !== input.version)
      throw new HubApiError(
        "A reunião foi alterada. Recarregue a página antes de salvar.",
        409,
      );
    const directorateIds = [...new Set(input.directorateIds)];
    const participantIds = [...new Set(input.participantIds)];
    if (
      (await tx.hubDirectorate.count({
        where: {
          id: { in: directorateIds },
          organizationId: actor.organizationId,
          archivedAt: null,
        },
      })) !== directorateIds.length
    )
      throw new HubApiError("Diretoria não encontrada.", 404);
    if (
      (await tx.hubMember.count({
        where: {
          id: { in: participantIds },
          organizationId: actor.organizationId,
          status: "ACTIVE",
        },
      })) !== participantIds.length
    )
      throw new HubApiError("Participante não encontrado.", 404);
    if (
      !input.organizationWide &&
      !directorateIds.length &&
      !participantIds.length &&
      !input.externalGuests.length
    )
      throw new HubApiError(
        "Selecione ao menos uma audiência para a reunião.",
        422,
      );
    const directorateMembers = input.organizationWide
      ? await tx.hubMember.findMany({
          where: { organizationId: actor.organizationId, status: "ACTIVE" },
          select: { id: true },
        })
      : directorateIds.length
        ? await tx.hubMember.findMany({
            where: {
              organizationId: actor.organizationId,
              status: "ACTIVE",
              directorateId: { in: directorateIds },
            },
            select: { id: true },
          })
        : [];
    const finalIds = [
      ...new Set([
        actor.memberId,
        ...participantIds,
        ...directorateMembers.map((member) => member.id),
      ]),
    ];
    await tx.hubMeetingDirectorate.deleteMany({
      where: { meetingId: id, directorateId: { notIn: directorateIds } },
    });
    await tx.hubMeetingDirectorate.createMany({
      data: directorateIds.map((directorateId) => ({
        meetingId: id,
        directorateId,
      })),
      skipDuplicates: true,
    });
    await tx.hubMeetingParticipant.deleteMany({
      where: { meetingId: id, memberId: { notIn: finalIds } },
    });
    const currentIds = new Set(
      meeting.participants.map((item) => item.memberId),
    );
    const added = finalIds.filter((memberId) => !currentIds.has(memberId));
    if (added.length)
      await tx.hubMeetingParticipant.createMany({
        data: added.map((memberId) => ({
          meetingId: id,
          memberId,
          responseStatus: memberId === actor.memberId ? "ACCEPTED" : "PENDING",
          respondedAt: memberId === actor.memberId ? new Date() : null,
        })),
        skipDuplicates: true,
      });
    await tx.hubMeetingExternalGuest.deleteMany({ where: { meetingId: id } });
    if (input.externalGuests.length)
      await tx.hubMeetingExternalGuest.createMany({
        data: input.externalGuests.map((guest) => ({
          meetingId: id,
          name: guest.name.trim(),
          email: guest.email?.trim().toLowerCase() || null,
        })),
      });
    await tx.hubMeeting.update({
      where: { id },
      data: {
        updatedAt: new Date(),
        directorateId: directorateIds[0] || null,
        organizationWide: input.organizationWide,
        version: { increment: 1 },
      },
    });
    if (meeting.status === "SCHEDULED" && added.length)
      await createHubNotifications(
        tx,
        added
          .filter((memberId) => memberId !== actor.memberId)
          .map((recipientMemberId) => ({
            organizationId: actor.organizationId,
            recipientMemberId,
            actorMemberId: actor.memberId,
            type: "MEETING_INVITED" as const,
            title: "Convite para reuniao",
            body: meeting.title,
            href: `/hub/reunioes/${id}`,
            entityType: "MEETING",
            entityId: id,
            idempotencyKey: `meeting:${id}:invited:v${input.version + 1}:${recipientMemberId}`,
          })),
      );
    await writeHubAudit(tx, {
      organizationId: actor.organizationId,
      memberId: actor.memberId,
      action: "MEETING_AUDIENCE_UPDATED",
      entity: "MEETING",
      entityId: id,
      metadata: {
        directorates: directorateIds.length,
        participants: participantIds.length,
        externalGuests: input.externalGuests.length,
      },
    });
    return getCoreMeeting(tx as unknown as PrismaClient, actor, id);
  });
}

export async function createMeetingActionItems(
  client: PrismaClient,
  actor: Actor,
  meetingId: string,
  items: Array<{
    title: string;
    description?: string | null;
    responsibleMemberId?: string | null;
    directorateId?: string | null;
    projectId?: string | null;
    dueAt?: Date | null;
  }>,
) {
  if (!items.length) return [];
  return hubCoreTransaction(client, async (tx) => {
    const meeting = await tx.hubMeeting.findFirst({
      where: { id: meetingId, organizationId: actor.organizationId },
      include: { directorates: true },
    });
    if (!meeting) throw new HubApiError("Reunião não encontrada.", 404);
    if (!canManage(actor, meeting))
      throw new HubApiError("Ação não permitida.", 403);
    const directorateId =
      items[0].directorateId ||
      meeting.directorates[0]?.directorateId ||
      meeting.directorateId ||
      null;
    let board = await tx.hubBoard.findFirst({
      where: {
        organizationId: actor.organizationId,
        directorateId,
        isArchived: false,
        name: "Tarefas",
      },
      include: {
        columns: { where: { isArchived: false }, orderBy: { order: "asc" } },
      },
    });
    if (!board)
      board = await tx.hubBoard.create({
        data: {
          organizationId: actor.organizationId,
          directorateId,
          name: "Tarefas",
          scope: directorateId ? "DIRECTORATE" : "ORGANIZATION",
          createdById: actor.memberId,
          columns: {
            create: [
              { name: "A fazer", order: 0 },
              { name: "Em andamento", order: 1 },
              { name: "Bloqueadas", order: 2 },
              { name: "Concluídas", order: 3, isDoneColumn: true },
            ],
          },
        },
        include: { columns: { orderBy: { order: "asc" } } },
      });
    const column = board.columns[0];
    const max =
      (
        await tx.hubTask.aggregate({
          where: { columnId: column.id },
          _max: { position: true },
        })
      )._max.position || 0;
    const created = [];
    for (const [index, item] of items.entries()) {
      if (item.title.trim().length < 2)
        throw new HubApiError("Título da ação inválido.", 400);
      const task = await tx.hubTask.create({
        data: {
          organizationId: actor.organizationId,
          boardId: board.id,
          columnId: column.id,
          sourceMeetingId: meetingId,
          directorateId: item.directorateId || directorateId,
          projectId: item.projectId || null,
          title: item.title.trim(),
          description: item.description?.trim() || null,
          status: "TODO",
          priority: "NORMAL",
          dueAt: item.dueAt || null,
          position: max + index + 1,
          createdById: actor.memberId,
          idempotencyKey: `meeting-action:${meetingId}:${crypto.randomUUID()}`,
          assignees: item.responsibleMemberId
            ? { create: { memberId: item.responsibleMemberId } }
            : undefined,
        },
      });
      created.push(task);
    }
    await writeHubAudit(tx, {
      organizationId: actor.organizationId,
      memberId: actor.memberId,
      action: "MEETING_ACTION_ITEMS_CREATED",
      entity: "MEETING",
      entityId: meetingId,
      metadata: { count: created.length },
    });
    return created;
  });
}
