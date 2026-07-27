import type { HubRole, HubMemberStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashHubPassword } from "@/lib/hub/auth";
import { requireHubSettingsAccess } from "@/lib/hub/settings-access";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { writeHubAudit } from "@/lib/hub/audit";
import { hubMemberSafeSelect, serializeHubMember } from "@/lib/hub/members";
import { assertCanAssignHubRole, assertCanManageHubMember } from "@/lib/hub/permissions";
import { generateHubTemporaryPassword } from "@/lib/hub/security";
import { assertOrganizationRetainsActiveSuperAdmin, assertOrganizationRetainsSettingsAdministrator, normalizeHubEmail } from "@/lib/hub/member-management";
import { createHubNotifications } from "@/lib/hub/notifications";

type Context = { params: Promise<{ id: string }> };
const ROLES: HubRole[] = ["SUPER_ADMIN", "ADMIN", "FINANCE", "DIRECTOR", "MEMBER", "VIEWER"];
const STATUSES: HubMemberStatus[] = ["INVITED", "ACTIVE", "DISABLED", "DELETED"];

async function findScopedMember(id: string, organizationId: string) {
  const member = await prisma.hubMember.findFirst({
    where: { id, organizationId, status: { not: "DELETED" } },
    select: hubMemberSafeSelect,
  });
  if (!member) throw new HubApiError("Membro não encontrado.", 404);
  return member;
}

export const GET = withHubApi<Context>(async (_request, context) => {
  const session = await requireHubSettingsAccess();
  const { id } = await context.params;
  return hubJson({ member: serializeHubMember(await findScopedMember(id, session.organizationId)) });
});

export const PATCH = withHubApi<Context>(async (request, context) => {
  const session = await requireHubSettingsAccess();
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) throw new HubApiError("Payload inválido.", 422);

  const action = typeof body.action === "string" ? body.action : "update";
  const temporaryPassword = action === "resetPassword" ? generateHubTemporaryPassword() : null;
  const passwordHash = temporaryPassword ? await hashHubPassword(temporaryPassword) : null;

  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.hubMember.findFirst({
      where: { id, organizationId: session.organizationId },
      select: hubMemberSafeSelect,
    });
    if (!current) throw new HubApiError("Membro não encontrado.", 404);
    assertCanManageHubMember(session.role, current.role);

    if (action === "resetPassword") {
      if (!current.accountId) throw new HubApiError("Identidade global do membro nao encontrada.", 409);
      const account = await tx.hubAccount.update({ where: { id: current.accountId }, data: { passwordHash: passwordHash!, mustChangePassword: true, sessionVersion: { increment: 1 } } });
      await tx.hubMember.updateMany({ where: { accountId: account.id }, data: { passwordHash: passwordHash!, mustChangePassword: true, sessionVersion: { increment: 1 } } });
      const member = await tx.hubMember.update({
        where: { id },
        data: {},
        select: hubMemberSafeSelect,
      });
      await writeHubAudit(tx, { organizationId: session.organizationId, memberId: session.memberId, action: "MEMBER_PASSWORD_RESET", entity: "MEMBER", entityId: id });
      return member;
    }

    const data: Prisma.HubMemberUpdateInput = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new HubApiError("Nome obrigatório.", 422);
      data.name = name;
    }
    if (body.email !== undefined) {
      const email = normalizeHubEmail(String(body.email));
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new HubApiError("E-mail inválido.", 422);
      if (email !== current.email && await tx.hubMember.count({ where: { organizationId: session.organizationId, normalizedEmail: email } })) {
        throw new HubApiError("E-mail já cadastrado.", 409);
      }
      if (!current.accountId) throw new HubApiError("Identidade global do membro nao encontrada.", 409);
      if (email !== current.email) {
        const membershipCount = await tx.hubMember.count({ where: { accountId: current.accountId, status: { not: "DELETED" } } });
        if (membershipCount > 1) throw new HubApiError("O e-mail de uma conta com acesso a varios Hubs deve ser alterado pelo workspace geral.", 409);
        const duplicateAccount = await tx.hubAccount.findFirst({ where: { normalizedEmail: email, id: { not: current.accountId } } });
        if (duplicateAccount) throw new HubApiError("Ja existe uma identidade global com este e-mail.", 409);
        await tx.hubAccount.update({ where: { id: current.accountId }, data: { email, normalizedEmail: email, sessionVersion: { increment: 1 } } });
      }
      data.email = email;
      data.normalizedEmail = email;
    }

    const requestedRole = body.role === undefined ? current.role : String(body.role) as HubRole;
    if (!ROLES.includes(requestedRole)) throw new HubApiError("Papel inválido.", 422);
    assertCanAssignHubRole(session.role, requestedRole);

    let requestedStatus = body.status === undefined ? current.status : String(body.status) as HubMemberStatus;
    if (action === "delete") requestedStatus = "DELETED";
    if (action === "restore") requestedStatus = "ACTIVE";
    if (!STATUSES.includes(requestedStatus)) throw new HubApiError("Status inválido.", 422);
    if (current.status === "DELETED" && action !== "restore") throw new HubApiError("Membro não encontrado.", 404);
    if (current.status !== "DELETED" && action === "restore") throw new HubApiError("Operação inválida.", 409);
    if (id === session.memberId && requestedStatus !== "ACTIVE" && body.confirmSelfDisable !== true) {
      throw new HubApiError("Confirme explicitamente a desativação do seu próprio acesso.", 409);
    }

    await assertOrganizationRetainsActiveSuperAdmin(tx, {
      organizationId: session.organizationId,
      currentRole: current.role,
      currentStatus: current.status,
      nextRole: requestedRole,
      nextStatus: requestedStatus,
    });
    await assertOrganizationRetainsSettingsAdministrator(tx, { organizationId: session.organizationId, memberId: current.id, currentRole: current.role, currentStatus: current.status, currentPosition: current.organizationPosition, nextRole: requestedRole, nextStatus: requestedStatus });

    if (body.role !== undefined) data.role = requestedRole;
    if (body.status !== undefined || action === "delete" || action === "restore") data.status = requestedStatus;
    if (requestedStatus === "DELETED") data.normalizedEmail = null;
    if (action === "restore") data.normalizedEmail = normalizeHubEmail(current.email);
    if (requestedRole !== current.role || requestedStatus !== current.status) data.sessionVersion = { increment: 1 };

    if (body.directorateId !== undefined) {
      const directorateId = body.directorateId ? String(body.directorateId) : null;
      if (directorateId && !await tx.hubDirectorate.count({ where: { id: directorateId, organizationId: session.organizationId, isActive: true } })) {
        throw new HubApiError("Diretoria não encontrada nesta organização.", 404);
      }
      if (directorateId !== current.directorateId && await tx.hubDirectorate.count({ where: { organizationId: session.organizationId, directorId: current.id } })) {
        throw new HubApiError("Remova explicitamente a liderança antes de mover este membro.", 409);
      }
      data.directorate = directorateId ? { connect: { id: directorateId } } : { disconnect: true };
    }

    const member = await tx.hubMember.update({ where: { id }, data, select: hubMemberSafeSelect });
    if (member.role !== current.role) await tx.hubMemberLifecycleEvent.create({ data: { organizationId: session.organizationId, memberId: member.id, type: "ROLE_CHANGED", recordedById: session.memberId, metadata: { before: current.role, after: member.role } } });
    if (member.directorateId !== current.directorateId) await tx.hubMemberLifecycleEvent.create({ data: { organizationId: session.organizationId, memberId: member.id, type: "DIRECTORATE_CHANGED", recordedById: session.memberId, metadata: { before: current.directorateId, after: member.directorateId } } });
    if (member.status !== current.status) await tx.hubMemberLifecycleEvent.create({ data: { organizationId: session.organizationId, memberId: member.id, type: member.status === "ACTIVE" ? "REACTIVATED" : "OFFBOARDED", recordedById: session.memberId, metadata: { before: current.status, after: member.status } } });
    const audit = await writeHubAudit(tx, {
      organizationId: session.organizationId,
      memberId: session.memberId,
      action: action === "delete" ? "MEMBER_DELETED" : action === "restore" ? "MEMBER_RESTORED" : "MEMBER_UPDATED",
      entity: "MEMBER",
      entityId: id,
      metadata: {
        before: { role: current.role, status: current.status, directorateId: current.directorateId },
        after: { role: member.role, status: member.status, directorateId: member.directorateId },
      },
    });
    const changedAccess = member.role !== current.role || member.status !== current.status || member.directorateId !== current.directorateId;
    if (changedAccess && member.status === "ACTIVE" && action !== "delete") {
      await createHubNotifications(tx, [{ organizationId: session.organizationId, recipientMemberId: member.id, actorMemberId: session.memberId, type: "MEMBER_UPDATED", title: "Seu acesso foi atualizado", body: "Seu papel, status ou diretoria foi atualizado.", href: "/hub/minha-conta", entityType: "MEMBER", entityId: member.id, idempotencyKey: `notification:audit:${audit.id}:member-updated` }]);
    }
    return member;
  }, { isolationLevel: "Serializable" });

  if (temporaryPassword) return hubJson({ success: true, temporaryPassword });
  return hubJson({ member: serializeHubMember(updated) });
});
