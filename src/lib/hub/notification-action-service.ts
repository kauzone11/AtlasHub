import crypto from "crypto";
import type { HubRole, PrismaClient } from "@prisma/client";
import { HubApiError } from "@/lib/hub/api";
import { writeHubAudit } from "@/lib/hub/audit";
import { hubCoreTransaction } from "@/lib/hub/core-transaction";

type Actor = { organizationId: string; memberId: string; role: HubRole };
type Filter = "all" | "unread" | "archived";
type Action = "read" | "unread" | "archive" | "restore" | "dismiss" | "delete";

export async function listCoreNotifications(client: PrismaClient, actor: Actor, filter: Filter = "all") {
  const notifications = await client.hubNotification.findMany({ where: { organizationId: actor.organizationId, recipientMemberId: actor.memberId, deletedAt: null, dismissedAt: null, ...(filter === "archived" ? { archivedAt: { not: null } } : { archivedAt: null }), ...(filter === "unread" ? { readAt: null } : {}) }, orderBy: { createdAt: "desc" }, take: 200 });
  const meetingIds = notifications.filter((item) => item.entityType === "MEETING").map((item) => item.entityId);
  const invitations = meetingIds.length ? await client.hubMeetingParticipant.findMany({ where: { meetingId: { in: meetingIds }, memberId: actor.memberId }, select: { meetingId: true, invitationVersion: true, responseStatus: true } }) : [];
  return { notifications: notifications.map((item) => ({ ...item, invitation: invitations.find((invitation) => invitation.meetingId === item.entityId) || null })), counts: { unread: await client.hubNotification.count({ where: { organizationId: actor.organizationId, recipientMemberId: actor.memberId, readAt: null, archivedAt: null, dismissedAt: null, deletedAt: null } }), archived: await client.hubNotification.count({ where: { organizationId: actor.organizationId, recipientMemberId: actor.memberId, archivedAt: { not: null }, deletedAt: null } }) } };
}

export async function applyNotificationAction(client: PrismaClient, actor: Actor, id: string, action: Action, version: number) {
  return hubCoreTransaction(client, async (tx) => {
    const notification = await tx.hubNotification.findFirst({ where: { id, organizationId: actor.organizationId, recipientMemberId: actor.memberId } });
    if (!notification) throw new HubApiError("Notificação não encontrada.", 404);
    const now = new Date();
    const data = action === "read" ? { readAt: now } : action === "unread" ? { readAt: null } : action === "archive" ? { archivedAt: now } : action === "restore" ? { archivedAt: null, dismissedAt: null, deletedAt: null } : action === "dismiss" ? { dismissedAt: now } : { deletedAt: now };
    const updated = await tx.hubNotification.updateMany({ where: { id, organizationId: actor.organizationId, recipientMemberId: actor.memberId, version }, data: { ...data, version: { increment: 1 } } });
    if (!updated.count) throw new HubApiError("A notificação foi alterada. Atualize e tente novamente.", 409);
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.memberId, action: `NOTIFICATION_${action.toUpperCase()}`, entity: "NOTIFICATION", entityId: id });
    return tx.hubNotification.findUniqueOrThrow({ where: { id } });
  });
}

export async function clearReadNotifications(client: PrismaClient, actor: Actor) {
  return hubCoreTransaction(client, async (tx) => {
    const result = await tx.hubNotification.updateMany({ where: { organizationId: actor.organizationId, recipientMemberId: actor.memberId, readAt: { not: null }, archivedAt: null, dismissedAt: null, deletedAt: null }, data: { archivedAt: new Date(), version: { increment: 1 } } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.memberId, action: "NOTIFICATIONS_READ_CLEARED", entity: "NOTIFICATION", metadata: { count: result.count } });
    return result.count;
  });
}

export async function undoRecentNotificationRemoval(client: PrismaClient, actor: Actor, id: string) {
  return hubCoreTransaction(client, async (tx) => {
    const cutoff = new Date(Date.now() - 5 * 60_000);
    const restored = await tx.hubNotification.updateMany({ where: { id, organizationId: actor.organizationId, recipientMemberId: actor.memberId, OR: [{ dismissedAt: { gte: cutoff } }, { deletedAt: { gte: cutoff } }, { archivedAt: { gte: cutoff } }] }, data: { dismissedAt: null, deletedAt: null, archivedAt: null, version: { increment: 1 } } });
    if (!restored.count) throw new HubApiError("O prazo para desfazer terminou.", 409);
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.memberId, action: "NOTIFICATION_REMOVAL_UNDONE", entity: "NOTIFICATION", entityId: id });
    return tx.hubNotification.findUniqueOrThrow({ where: { id } });
  });
}

export async function respondMeetingFromNotification(client: PrismaClient, actor: Actor, notificationId: string, input: { status: "ACCEPTED" | "DECLINED"; invitationVersion: number; declineReason?: string | null }) {
  return hubCoreTransaction(client, async (tx) => {
    const notification = await tx.hubNotification.findFirst({ where: { id: notificationId, organizationId: actor.organizationId, recipientMemberId: actor.memberId, entityType: "MEETING", deletedAt: null } });
    if (!notification) throw new HubApiError("Convite não encontrado.", 404);
    const meeting = await tx.hubMeeting.findFirst({ where: { id: notification.entityId, organizationId: actor.organizationId, status: "SCHEDULED" }, select: { id: true, createdById: true, title: true } });
    if (!meeting) throw new HubApiError("Reunião não encontrada.", 404);
    const updated = await tx.hubMeetingParticipant.updateMany({ where: { meetingId: meeting.id, memberId: actor.memberId, invitationVersion: input.invitationVersion }, data: { responseStatus: input.status, respondedAt: new Date(), declineReason: input.status === "DECLINED" ? input.declineReason?.trim() || null : null, invitationVersion: { increment: 1 } } });
    if (!updated.count) throw new HubApiError("Este convite foi atualizado. Recarregue antes de responder.", 409);
    await tx.hubMeetingResponseEvent.create({ data: { organizationId: actor.organizationId, meetingId: meeting.id, memberId: actor.memberId, eventId: crypto.randomUUID(), status: input.status } });
    await tx.hubNotification.update({ where: { id: notification.id }, data: { readAt: new Date(), archivedAt: new Date(), version: { increment: 1 } } });
    if (meeting.createdById !== actor.memberId) await tx.hubNotification.create({ data: { organizationId: actor.organizationId, recipientMemberId: meeting.createdById, actorMemberId: actor.memberId, type: "MEETING_RESPONSE", title: "Resposta ao convite", body: `${input.status === "ACCEPTED" ? "Convite aceito" : "Convite recusado"}: ${meeting.title}`, href: `/hub/reunioes/${meeting.id}`, entityType: "MEETING", entityId: meeting.id, idempotencyKey: `meeting-response:${notification.id}:${input.invitationVersion}` } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.memberId, action: input.status === "ACCEPTED" ? "MEETING_INVITATION_ACCEPTED" : "MEETING_INVITATION_DECLINED", entity: "MEETING", entityId: meeting.id, metadata: input.declineReason ? { reason: input.declineReason.slice(0, 120) } : undefined });
    return { meetingId: meeting.id, status: input.status };
  });
}
