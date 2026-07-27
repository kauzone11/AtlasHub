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

type Context = { params: Promise<{ id: string }> };

function assertOwner(
  session: Awaited<ReturnType<typeof requireHubPermission>>,
  memberId: string,
) {
  if (
    memberId !== session.memberId &&
    !hasHubPermission(session.role, "meetings:manage-all")
  )
    throw new HubApiError("Acao nao permitida.", 403);
}

export const PATCH = withHubApi<Context>(async (request, context) => {
  const session = await requireHubPermission("availability:manage-own");
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  try {
    const exception = await prisma.$transaction(
      async (tx) => {
        const current = await tx.hubAvailabilityException.findFirst({
          where: { id, organizationId: session.organizationId },
          select: {
            id: true,
            memberId: true,
            date: true,
            type: true,
            startMinute: true,
            endMinute: true,
          },
        });
        if (!current) throw new HubApiError("Excecao nao encontrada.", 404);
        assertOwner(session, current.memberId);
        if (
          current.date.toISOString().slice(0, 10) <
          organizationDate(new Date(), session.organization.timezone)
        )
          throw new HubApiError(
            "Excecoes historicas nao podem ser editadas.",
            409,
          );
        const startMinute =
          body?.startMinute === undefined
            ? current.startMinute
            : body.startMinute === null
              ? null
              : Number(body.startMinute);
        const endMinute =
          body?.endMinute === undefined
            ? current.endMinute
            : body.endMinute === null
              ? null
              : Number(body.endMinute);
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
        const type =
          body?.type === undefined
            ? current.type
            : body.type === "AVAILABLE" || body.type === "UNAVAILABLE"
              ? body.type
              : null;
        if (!type)
          throw new HubApiError("Tipo de excecao invalido.", 422);
        if (
          await tx.hubAvailabilityException.count({
            where: {
              id: { not: id },
              organizationId: session.organizationId,
              memberId: current.memberId,
              date: current.date,
              type,
              startMinute,
              endMinute,
            },
          })
        )
          throw new HubApiError("Esta excecao ja existe.", 409);
        const updated = await tx.hubAvailabilityException.update({
          where: { id },
          data: {
            type,
            startMinute,
            endMinute,
            reason:
              typeof body?.reason === "string"
                ? body.reason.trim().slice(0, 240) || null
                : undefined,
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
          action: "AVAILABILITY_EXCEPTION_UPDATED",
          entity: "AVAILABILITY_EXCEPTION",
          entityId: id,
        });
        return updated;
      },
      { isolationLevel: "Serializable" },
    );
    return hubJson({ exception });
  } catch (error) {
    if (prismaErrorCode(error) === "P2002")
      throw new HubApiError("Esta excecao ja existe.", 409);
    if (prismaErrorCode(error) === "P2034") throw serializationConflict();
    throw error;
  }
});

export const DELETE = withHubApi<Context>(async (_request, context) => {
  const session = await requireHubPermission("availability:manage-own");
  const { id } = await context.params;
  try {
    await prisma.$transaction(
      async (tx) => {
        const current = await tx.hubAvailabilityException.findFirst({
          where: { id, organizationId: session.organizationId },
          select: { id: true, memberId: true, date: true },
        });
        if (!current) throw new HubApiError("Excecao nao encontrada.", 404);
        assertOwner(session, current.memberId);
        if (
          current.date.toISOString().slice(0, 10) <
          organizationDate(new Date(), session.organization.timezone)
        )
          throw new HubApiError(
            "Excecoes historicas nao podem ser removidas.",
            409,
          );
        const deleted = await tx.hubAvailabilityException.deleteMany({
          where: { id, organizationId: session.organizationId },
        });
        if (deleted.count !== 1)
          throw new HubApiError("Excecao nao encontrada.", 404);
        await writeHubAudit(tx, {
          organizationId: session.organizationId,
          memberId: session.memberId,
          action: "AVAILABILITY_EXCEPTION_DELETED",
          entity: "AVAILABILITY_EXCEPTION",
          entityId: id,
        });
      },
      { isolationLevel: "Serializable" },
    );
    return hubJson({ deleted: true });
  } catch (error) {
    if (prismaErrorCode(error) === "P2034") throw serializationConflict();
    throw error;
  }
});
