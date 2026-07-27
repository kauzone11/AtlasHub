import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { writeHubAudit } from "@/lib/hub/audit";
import { hasHubPermission } from "@/lib/hub/permissions";
import { organizationDate } from "@/lib/hub/timezone";
import {
  prismaErrorCode,
  serializationConflict,
} from "@/lib/hub/collaboration-idempotency";

export const POST = withHubApi(async (request) => {
  const session = await requireHubPermission("availability:manage-own");
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const memberId =
    typeof body?.memberId === "string" ? body.memberId : session.memberId;
  if (
    memberId !== session.memberId &&
    !hasHubPermission(session.role, "meetings:manage-all")
  )
    throw new HubApiError("Acao nao permitida.", 403);
  const dateText = typeof body?.date === "string" ? body.date : "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateText)
    ? new Date(`${dateText}T00:00:00.000Z`)
    : new Date(Number.NaN);
  const type =
    body?.type === "AVAILABLE" || body?.type === "UNAVAILABLE"
      ? body.type
      : null;
  const startMinute =
    body?.startMinute === null || body?.startMinute === undefined
      ? null
      : Number(body.startMinute);
  const endMinute =
    body?.endMinute === null || body?.endMinute === undefined
      ? null
      : Number(body.endMinute);
  if (
    !type ||
    Number.isNaN(date.getTime()) ||
    dateText < organizationDate(new Date(), session.organization.timezone)
  )
    throw new HubApiError("Excecao futura invalida.", 422);
  if (
    (startMinute === null) !== (endMinute === null) ||
    (startMinute !== null &&
      (!Number.isInteger(startMinute) ||
        !Number.isInteger(endMinute) ||
        startMinute < 0 ||
        endMinute! > 1440 ||
        endMinute! <= startMinute))
  )
    throw new HubApiError("Intervalo da excecao invalido.", 422);
  try {
    const exception = await prisma.$transaction(async (tx) => {
      const member = await tx.hubMember.count({
        where: {
          id: memberId,
          organizationId: session.organizationId,
          status: "ACTIVE",
        },
      });
      if (!member) throw new HubApiError("Membro ativo nao encontrado.", 404);
      const duplicate = await tx.hubAvailabilityException.count({
        where: {
          organizationId: session.organizationId,
          memberId,
          date,
          type,
          startMinute,
          endMinute,
        },
      });
      if (duplicate)
        throw new HubApiError("Esta excecao ja existe.", 409);
      const created = await tx.hubAvailabilityException.create({
      data: {
        organizationId: session.organizationId,
        memberId,
        date,
        type,
        startMinute,
        endMinute,
        reason:
          typeof body?.reason === "string"
            ? body.reason.trim().slice(0, 240) || null
            : null,
      },
      select: {
        id: true,
        date: true,
        type: true,
        startMinute: true,
        endMinute: true,
        reason: true,
      },
    });
      await writeHubAudit(tx, {
      organizationId: session.organizationId,
      memberId: session.memberId,
      action: "AVAILABILITY_EXCEPTION_CREATED",
      entity: "AVAILABILITY_EXCEPTION",
      entityId: created.id,
      metadata: { type, date: dateText },
    });
      return created;
    }, { isolationLevel: "Serializable" });
    return hubJson({ exception }, { status: 201 });
  } catch (error) {
    if (prismaErrorCode(error) === "P2002")
      throw new HubApiError("Esta excecao ja existe.", 409);
    if (prismaErrorCode(error) === "P2034") throw serializationConflict();
    throw error;
  }
});
