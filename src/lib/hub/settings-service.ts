import type { HubMemberCategory, HubOrganizationPosition, Prisma, PrismaClient } from "@prisma/client";
import { hashHubPassword } from "@/lib/hub/auth";
import { HubApiError } from "@/lib/hub/api";
import { writeHubAudit } from "@/lib/hub/audit";
import { hubCanonicalApplicationUrl, mayExposeHubInvitationLink, sendHubInvitationEmail } from "@/lib/hub/invitation-email";
import { generateHubInvitationToken, hashHubInvitationToken, hubInvitationExpiresAt } from "@/lib/hub/invitation-token";
import { normalizeHubEmail } from "@/lib/hub/member-management";
import { validateHubPassword } from "@/lib/hub/security";

export const HUB_ORGANIZATION_POSITIONS: readonly HubOrganizationPosition[] = ["PRESIDENT", "COUNSELOR", "MEMBER"];
export const HUB_MEMBER_CATEGORIES: readonly HubMemberCategory[] = ["MEMBER", "TRAINEE", "ALUMNI"];

type Client = PrismaClient | Prisma.TransactionClient;
type SettingsActor = { organizationId: string; memberId: string };
type InvitationDraft = {
  email: unknown;
  organizationPosition: unknown;
  memberCategory: unknown;
  directorateId?: unknown;
  appointAsDirector?: unknown;
  confirmPresidentTransfer?: unknown;
};

function parsePosition(value: unknown) {
  if (typeof value !== "string" || !HUB_ORGANIZATION_POSITIONS.includes(value as HubOrganizationPosition)) throw new HubApiError("Posição organizacional inválida.", 422);
  return value as HubOrganizationPosition;
}

function parseCategory(value: unknown) {
  if (typeof value !== "string" || !HUB_MEMBER_CATEGORIES.includes(value as HubMemberCategory)) throw new HubApiError("Categoria de membro inválida.", 422);
  return value as HubMemberCategory;
}

function parseInvitationDraft(input: InvitationDraft) {
  const normalizedEmail = typeof input.email === "string" ? normalizeHubEmail(input.email) : "";
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || normalizedEmail.length > 254) throw new HubApiError("Informe um e-mail válido.", 422);
  const organizationPosition = parsePosition(input.organizationPosition);
  const memberCategory = parseCategory(input.memberCategory);
  const directorateId = typeof input.directorateId === "string" && input.directorateId ? input.directorateId : null;
  const appointAsDirector = input.appointAsDirector === true;
  if (organizationPosition === "PRESIDENT" && input.confirmPresidentTransfer !== true) throw new HubApiError("Confirme explicitamente a transferência da Presidência.", 422);
  if (appointAsDirector && (!directorateId || organizationPosition !== "MEMBER")) throw new HubApiError("A liderança exige Diretoria e posição de Membro.", 422);
  return { normalizedEmail, organizationPosition, memberCategory, directorateId, appointAsDirector };
}

async function expireStaleInvitations(client: Client, organizationId?: string) {
  await client.hubMemberInvitation.updateMany({
    where: { ...(organizationId ? { organizationId } : {}), status: "PENDING", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED", version: { increment: 1 } },
  });
}

async function requireScopedDirectorate(client: Client, organizationId: string, directorateId: string | null) {
  if (!directorateId) return null;
  const found = await client.hubDirectorate.findFirst({ where: { id: directorateId, organizationId, archivedAt: null, isActive: true }, select: { id: true } });
  if (!found) throw new HubApiError("Recurso não encontrado.", 404);
  return found;
}

function invitationView<T extends { expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null; createdAt: Date; updatedAt: Date }>(item: T) {
  return { ...item, expiresAt: item.expiresAt.toISOString(), acceptedAt: item.acceptedAt?.toISOString() ?? null, revokedAt: item.revokedAt?.toISOString() ?? null, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() };
}

function safeCreatedInvitation<T extends { tokenHash: string; expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null; createdAt: Date; updatedAt: Date }>(item: T) {
  const { tokenHash: storedTokenHash, ...safe } = item;
  void storedTokenHash;
  return invitationView(safe);
}

export async function getHubSettings(client: Client, organizationId: string) {
  await expireStaleInvitations(client, organizationId);
  const [organization, members, invitations, directorates, transactionCount] = await Promise.all([
    client.hubOrganization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, hubName: true, slug: true, logoUrl: true, timezone: true, locale: true, currency: true } }),
    client.hubMember.findMany({ where: { organizationId, status: { not: "DELETED" } }, select: { id: true, name: true, email: true, role: true, status: true, organizationPosition: true, memberCategory: true, directorateId: true, directorate: { select: { id: true, name: true } }, createdAt: true }, orderBy: [{ status: "asc" }, { name: "asc" }] }),
    client.hubMemberInvitation.findMany({ where: { organizationId }, select: { id: true, normalizedEmail: true, status: true, organizationPosition: true, memberCategory: true, directorateId: true, directorate: { select: { id: true, name: true } }, appointAsDirector: true, deliveryStatus: true, deliveryAttempts: true, lastDeliveryAt: true, lastDeliveryError: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true, updatedAt: true, existingInvitedMemberId: true, invitedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } }),
    client.hubDirectorate.findMany({ where: { organizationId, archivedAt: null }, select: { id: true, name: true, isActive: true, order: true, directorId: true, director: { select: { id: true, name: true, email: true } }, _count: { select: { members: true } } }, orderBy: [{ isActive: "desc" }, { order: "asc" }, { name: "asc" }] }),
    client.hubWalletTransaction.count({ where: { account: { member: { organizationId } } } }),
  ]);
  if (!organization) throw new HubApiError("Organização não encontrada.", 404);
  return {
    organization: { ...organization, currencyLocked: transactionCount > 0 },
    members: members.filter((member) => member.status !== "INVITED").map((member) => ({ ...member, createdAt: member.createdAt.toISOString() })),
    legacyInvitations: members.filter((member) => member.status === "INVITED").map((member) => ({ ...member, createdAt: member.createdAt.toISOString() })),
    invitations: invitations.map(invitationView),
    directorates,
    canCopyInvitationLink: mayExposeHubInvitationLink(),
  };
}

async function persistDelivery(client: PrismaClient, invitationId: string, result: Awaited<ReturnType<typeof sendHubInvitationEmail>>) {
  await client.hubMemberInvitation.update({
    where: { id: invitationId },
    data: { deliveryStatus: result.status, deliveryAttempts: { increment: 1 }, lastDeliveryAt: new Date(), lastDeliveryError: result.status === "FAILED" ? result.error : null, version: { increment: 1 } },
  });
}

async function deliverInvitation(client: PrismaClient, invitation: { id: string; normalizedEmail: string; expiresAt: Date; organization: { name: string }; invitedBy: { name: string } }, rawToken: string) {
  const invitationUrl = `${hubCanonicalApplicationUrl()}/hub/convite/${rawToken}`;
  const delivery = await sendHubInvitationEmail({ to: invitation.normalizedEmail, organizationName: invitation.organization.name, inviterName: invitation.invitedBy.name, expiresAt: invitation.expiresAt, invitationUrl });
  await persistDelivery(client, invitation.id, delivery);
  return { delivery, invitationUrl: mayExposeHubInvitationLink() ? invitationUrl : undefined };
}

async function createInvitationRecord(client: PrismaClient, actor: SettingsActor, draft: ReturnType<typeof parseInvitationDraft>, existingInvitedMemberId?: string | null) {
  const rawToken = generateHubInvitationToken();
  const tokenHash = hashHubInvitationToken(rawToken);
  try {
    const invitation = await client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "EconomikWorkspace" WHERE id = ${actor.organizationId} FOR UPDATE`;
      await expireStaleInvitations(tx, actor.organizationId);
      const organization = await tx.hubOrganization.findFirst({ where: { id: actor.organizationId, isActive: true }, select: { id: true, name: true } });
      const invitedBy = await tx.hubMember.findFirst({ where: { id: actor.memberId, organizationId: actor.organizationId, status: "ACTIVE" }, select: { id: true, name: true } });
      if (!organization || !invitedBy) throw new HubApiError("Recurso não encontrado.", 404);
      await requireScopedDirectorate(tx, actor.organizationId, draft.directorateId);
      const activeMembership = await tx.hubMember.count({ where: { organizationId: actor.organizationId, normalizedEmail: draft.normalizedEmail, status: "ACTIVE" } });
      if (activeMembership) throw new HubApiError("E-mail já possui participação ativa nesta organização.", 409);
      if (!existingInvitedMemberId && await tx.hubMember.count({ where: { organizationId: actor.organizationId, normalizedEmail: draft.normalizedEmail, status: "INVITED" } })) throw new HubApiError("Use 'Gerar novo convite seguro' para este convite legado.", 409);
      if (await tx.hubMemberInvitation.count({ where: { organizationId: actor.organizationId, normalizedEmail: draft.normalizedEmail, status: "PENDING" } })) throw new HubApiError("Já existe um convite pendente para este e-mail.", 409);
      if (draft.organizationPosition === "PRESIDENT" && await tx.hubMemberInvitation.count({ where: { organizationId: actor.organizationId, organizationPosition: "PRESIDENT", status: "PENDING" } })) throw new HubApiError("Já existe uma transferência de Presidência pendente.", 409);
      const created = await tx.hubMemberInvitation.create({ data: { organizationId: actor.organizationId, normalizedEmail: draft.normalizedEmail, tokenHash, organizationPosition: draft.organizationPosition, memberCategory: draft.memberCategory, directorateId: draft.directorateId, appointAsDirector: draft.appointAsDirector, invitedById: actor.memberId, existingInvitedMemberId: existingInvitedMemberId || null, expiresAt: hubInvitationExpiresAt() }, include: { organization: { select: { name: true } }, invitedBy: { select: { name: true } } } });
      await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.memberId, action: existingInvitedMemberId ? "LEGACY_INVITATION_SECURED" : "MEMBER_INVITATION_CREATED", entity: "HUB_MEMBER_INVITATION", entityId: created.id, metadata: { normalizedEmail: draft.normalizedEmail, organizationPosition: draft.organizationPosition, memberCategory: draft.memberCategory, directorateId: draft.directorateId, appointAsDirector: draft.appointAsDirector, expiresAt: created.expiresAt.toISOString() } });
      return created;
    }, { isolationLevel: "Serializable" });
    const delivery = await deliverInvitation(client, invitation, rawToken);
    return { invitation: safeCreatedInvitation(invitation), ...delivery };
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") throw new HubApiError("Já existe um convite pendente conflitante.", 409);
    throw error;
  }
}

export async function createHubInvitation(client: PrismaClient, actor: SettingsActor, input: InvitationDraft) {
  return createInvitationRecord(client, actor, parseInvitationDraft(input));
}

export async function regenerateLegacyHubInvitation(client: PrismaClient, actor: SettingsActor, legacyMemberId: string, input: { confirmPresidentTransfer?: unknown } = {}) {
  const legacy = await client.hubMember.findFirst({ where: { id: legacyMemberId, organizationId: actor.organizationId, status: "INVITED" }, select: { id: true, accountId: true, email: true, normalizedEmail: true, organizationPosition: true, memberCategory: true, directorateId: true } });
  if (!legacy) throw new HubApiError("Recurso não encontrado.", 404);
  if (!legacy.accountId) throw new HubApiError("Convite legado inconsistente.", 409);
  const sharedAccount = await client.hubMember.count({ where: { accountId: legacy.accountId, id: { not: legacy.id }, status: "ACTIVE" } });
  if (sharedAccount) await client.hubMember.update({ where: { id: legacy.id }, data: { sessionVersion: { increment: 1 } } });
  else {
    const invalidatedPasswordHash = await hashHubPassword(generateHubInvitationToken());
    await client.$transaction([
      client.hubAccount.update({ where: { id: legacy.accountId }, data: { passwordHash: invalidatedPasswordHash, mustChangePassword: true, sessionVersion: { increment: 1 } } }),
      client.hubMember.update({ where: { id: legacy.id }, data: { passwordHash: invalidatedPasswordHash, mustChangePassword: true, sessionVersion: { increment: 1 } } }),
    ]);
  }
  return createInvitationRecord(client, actor, parseInvitationDraft({ email: legacy.normalizedEmail || legacy.email, organizationPosition: legacy.organizationPosition, memberCategory: legacy.memberCategory, directorateId: legacy.directorateId, appointAsDirector: false, confirmPresidentTransfer: input.confirmPresidentTransfer }), legacy.id);
}

export async function revokeHubInvitation(client: PrismaClient, actor: SettingsActor, invitationId: string) {
  const updated = await client.hubMemberInvitation.updateMany({ where: { id: invitationId, organizationId: actor.organizationId, status: "PENDING", expiresAt: { gt: new Date() } }, data: { status: "REVOKED", revokedAt: new Date(), version: { increment: 1 } } });
  if (!updated.count) throw new HubApiError("Recurso não encontrado.", 404);
  await writeHubAudit(client, { organizationId: actor.organizationId, memberId: actor.memberId, action: "MEMBER_INVITATION_REVOKED", entity: "HUB_MEMBER_INVITATION", entityId: invitationId });
  return { success: true };
}

export async function regenerateHubInvitation(client: PrismaClient, actor: SettingsActor, invitationId: string) {
  const current = await client.hubMemberInvitation.findFirst({ where: { id: invitationId, organizationId: actor.organizationId }, select: { id: true, normalizedEmail: true, organizationPosition: true, memberCategory: true, directorateId: true, appointAsDirector: true, existingInvitedMemberId: true, status: true } });
  if (!current) throw new HubApiError("Recurso não encontrado.", 404);
  if (current.status === "ACCEPTED") throw new HubApiError("Convites aceitos não podem ser regenerados.", 409);
  await client.hubMemberInvitation.updateMany({ where: { id: current.id, status: "PENDING" }, data: { status: "REVOKED", revokedAt: new Date(), version: { increment: 1 } } });
  return createInvitationRecord(client, actor, parseInvitationDraft({ ...current, email: current.normalizedEmail, confirmPresidentTransfer: current.organizationPosition === "PRESIDENT" }), current.existingInvitedMemberId);
}

async function lockOrganization(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.$queryRaw`SELECT id FROM "EconomikWorkspace" WHERE id = ${organizationId} FOR UPDATE`;
}

async function assertSettingsAdministratorRemains(tx: Prisma.TransactionClient, organizationId: string, memberId: string) {
  const count = await tx.hubMember.count({ where: { organizationId, status: "ACTIVE", id: { not: memberId }, OR: [{ role: "SUPER_ADMIN" }, { organizationPosition: { in: ["PRESIDENT", "COUNSELOR"] } }] } });
  if (!count) throw new HubApiError("A organização deve manter ao menos um administrador de Ajustes.", 409);
}

export async function transferHubPresidencyInTransaction(tx: Prisma.TransactionClient, actor: SettingsActor, targetMemberId: string) {
  await lockOrganization(tx, actor.organizationId);
  const target = await tx.hubMember.findFirst({ where: { id: targetMemberId, organizationId: actor.organizationId, status: "ACTIVE" }, select: { id: true, organizationPosition: true, directorateId: true, sessionVersion: true } });
  if (!target) throw new HubApiError("Recurso não encontrado.", 404);
  const current = await tx.hubMember.findFirst({ where: { organizationId: actor.organizationId, status: "ACTIVE", organizationPosition: "PRESIDENT" }, select: { id: true, organizationPosition: true, sessionVersion: true } });
  if (current?.id === target.id) return target;
  await tx.hubDirectorate.updateMany({ where: { organizationId: actor.organizationId, directorId: target.id }, data: { directorId: null, version: { increment: 1 } } });
  if (current) await tx.hubMember.update({ where: { id: current.id }, data: { organizationPosition: "MEMBER", sessionVersion: { increment: 1 } } });
  const promoted = await tx.hubMember.update({ where: { id: target.id }, data: { organizationPosition: "PRESIDENT", sessionVersion: { increment: 1 } }, select: { id: true, organizationPosition: true, directorateId: true, sessionVersion: true } });
  await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.memberId, action: "HUB_PRESIDENCY_TRANSFERRED", entity: "MEMBER", entityId: target.id, metadata: { beforePresidentId: current?.id ?? null, afterPresidentId: target.id } });
  return promoted;
}

export async function transferHubPresidency(client: PrismaClient, actor: SettingsActor, targetMemberId: string) {
  return client.$transaction((tx) => transferHubPresidencyInTransaction(tx, actor, targetMemberId), { isolationLevel: "Serializable" });
}

export async function updateHubMemberClassification(client: PrismaClient, actor: SettingsActor, memberId: string, input: { organizationPosition: unknown; memberCategory: unknown }) {
  const organizationPosition = parsePosition(input.organizationPosition);
  const memberCategory = parseCategory(input.memberCategory);
  if (organizationPosition === "PRESIDENT") throw new HubApiError("Use a transferência explícita de Presidência.", 409);
  return client.$transaction(async (tx) => {
    await lockOrganization(tx, actor.organizationId);
    const current = await tx.hubMember.findFirst({ where: { id: memberId, organizationId: actor.organizationId, status: { not: "DELETED" } }, select: { id: true, role: true, status: true, organizationPosition: true, memberCategory: true } });
    if (!current) throw new HubApiError("Recurso não encontrado.", 404);
    if ((current.role === "SUPER_ADMIN" || ["PRESIDENT", "COUNSELOR"].includes(current.organizationPosition)) && current.status === "ACTIVE" && organizationPosition === "MEMBER") await assertSettingsAdministratorRemains(tx, actor.organizationId, current.id);
    const member = await tx.hubMember.update({ where: { id: current.id }, data: { organizationPosition, memberCategory, sessionVersion: { increment: 1 } }, select: { id: true, organizationPosition: true, memberCategory: true } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.memberId, action: "MEMBER_CLASSIFICATION_UPDATED", entity: "MEMBER", entityId: member.id, metadata: { before: { organizationPosition: current.organizationPosition, memberCategory: current.memberCategory }, after: { organizationPosition, memberCategory } } });
    return member;
  }, { isolationLevel: "Serializable" });
}

export async function updateHubDirectorateLeadership(client: PrismaClient, actor: SettingsActor, directorateId: string, directorId: unknown) {
  const nextDirectorId = typeof directorId === "string" && directorId ? directorId : null;
  return client.$transaction(async (tx) => {
    const directorate = await tx.hubDirectorate.findFirst({ where: { id: directorateId, organizationId: actor.organizationId, archivedAt: null }, select: { id: true, directorId: true } });
    if (!directorate) throw new HubApiError("Recurso não encontrado.", 404);
    if (nextDirectorId) {
      const member = await tx.hubMember.findUnique({ where: { id: nextDirectorId }, select: { id: true, organizationId: true, status: true, directorateId: true, organizationPosition: true } });
      if (!member || member.organizationId !== actor.organizationId) throw new HubApiError("Recurso não encontrado.", 404);
      if (member.status !== "ACTIVE" || member.directorateId !== directorate.id || member.organizationPosition !== "MEMBER") throw new HubApiError("A liderança deve ser um membro ativo da própria Diretoria, sem cargo de Presidente ou Conselheiro.", 422);
    }
    const updated = await tx.hubDirectorate.update({ where: { id: directorate.id }, data: { directorId: nextDirectorId, version: { increment: 1 } }, select: { id: true, directorId: true, director: { select: { id: true, name: true, email: true } } } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.memberId, action: "DIRECTORATE_LEADERSHIP_UPDATED", entity: "DIRECTORATE", entityId: directorate.id, metadata: { before: directorate.directorId, after: nextDirectorId } });
    return updated;
  }, { isolationLevel: "Serializable" });
}

export async function previewHubInvitation(client: PrismaClient, rawToken: string) {
  const tokenHash = hashHubInvitationToken(rawToken);
  const found = await client.hubMemberInvitation.findUnique({ where: { tokenHash }, include: { organization: { select: { name: true, isActive: true } }, directorate: { select: { name: true, isActive: true, archivedAt: true } } } });
  if (!found) throw new HubApiError("Convite inválido.", 404);
  if (found.status === "PENDING" && found.expiresAt <= new Date()) { await client.hubMemberInvitation.update({ where: { id: found.id }, data: { status: "EXPIRED", version: { increment: 1 } } }); throw new HubApiError("Este convite expirou.", 410); }
  if (found.status !== "PENDING") throw new HubApiError("Este convite não está mais disponível.", 410);
  if (!found.organization.isActive) throw new HubApiError("Este convite não está mais disponível.", 410);
  const existingAccount = await client.hubAccount.findUnique({ where: { normalizedEmail: found.normalizedEmail }, select: { id: true } });
  const requiresExistingAuthentication = Boolean(existingAccount && (!found.existingInvitedMemberId || await client.hubMember.count({ where: { accountId: existingAccount.id, id: { not: found.existingInvitedMemberId ?? undefined }, status: "ACTIVE" } })));
  return { email: found.normalizedEmail, organizationName: found.organization.name, organizationPosition: found.organizationPosition, memberCategory: found.memberCategory, directorateName: found.directorate?.name ?? null, appointAsDirector: found.appointAsDirector, expiresAt: found.expiresAt.toISOString(), existingAccount: requiresExistingAuthentication };
}

export async function acceptHubInvitation(client: PrismaClient, rawToken: string, input: { fullName: unknown; password: unknown; passwordConfirmation: unknown; authenticatedAccountId?: string | null }) {
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  if (fullName.length < 2 || fullName.length > 120) throw new HubApiError("Informe o nome completo.", 422);
  const password = typeof input.password === "string" ? input.password : "";
  if (password !== input.passwordConfirmation) throw new HubApiError("A confirmação da senha não confere.", 422);
  const passwordError = validateHubPassword(password);
  const tokenHash = hashHubInvitationToken(rawToken);
  return client.$transaction(async (tx) => {
    const invitation = await tx.hubMemberInvitation.findUnique({ where: { tokenHash }, include: { organization: { select: { isActive: true } }, existingInvitedMember: { select: { id: true, accountId: true, status: true } } } });
    if (!invitation) throw new HubApiError("Convite inválido.", 404);
    if (invitation.status !== "PENDING" || invitation.expiresAt <= new Date() || !invitation.organization.isActive) throw new HubApiError("Este convite não está mais disponível.", 410);
    const claim = await tx.hubMemberInvitation.updateMany({ where: { id: invitation.id, status: "PENDING", version: invitation.version, expiresAt: { gt: new Date() } }, data: { version: { increment: 1 } } });
    if (!claim.count) throw new HubApiError("Este convite já foi processado.", 410);
    await lockOrganization(tx, invitation.organizationId);
    const existingAccount = await tx.hubAccount.findUnique({ where: { normalizedEmail: invitation.normalizedEmail } });
    let account = existingAccount;
    let member;
    if (invitation.existingInvitedMember) {
      if (!invitation.existingInvitedMember.accountId) throw new HubApiError("Convite legado inconsistente.", 409);
      const sharedAccount = await tx.hubMember.count({ where: { accountId: invitation.existingInvitedMember.accountId, id: { not: invitation.existingInvitedMember.id }, status: "ACTIVE" } });
      if (sharedAccount) {
        if (input.authenticatedAccountId !== invitation.existingInvitedMember.accountId) throw new HubApiError("Entre na conta Hub correspondente ao e-mail convidado.", 401);
        account = await tx.hubAccount.findUniqueOrThrow({ where: { id: invitation.existingInvitedMember.accountId } });
        member = await tx.hubMember.update({ where: { id: invitation.existingInvitedMember.id }, data: { name: fullName, status: "ACTIVE", passwordHash: account.passwordHash, mustChangePassword: account.mustChangePassword, organizationPosition: "MEMBER", memberCategory: invitation.memberCategory, directorateId: invitation.directorateId, sessionVersion: { increment: 1 } } });
      } else {
        if (passwordError) throw new HubApiError(passwordError, 422);
        const passwordHash = await hashHubPassword(password);
        account = await tx.hubAccount.update({ where: { id: invitation.existingInvitedMember.accountId }, data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } } });
        member = await tx.hubMember.update({ where: { id: invitation.existingInvitedMember.id }, data: { name: fullName, status: "ACTIVE", passwordHash, mustChangePassword: false, organizationPosition: "MEMBER", memberCategory: invitation.memberCategory, directorateId: invitation.directorateId, sessionVersion: { increment: 1 } } });
      }
    } else if (existingAccount) {
      if (!input.authenticatedAccountId || input.authenticatedAccountId !== existingAccount.id) throw new HubApiError("Entre na conta Hub correspondente ao e-mail convidado.", 401);
      member = await tx.hubMember.create({ data: { organizationId: invitation.organizationId, accountId: existingAccount.id, name: fullName, email: invitation.normalizedEmail, normalizedEmail: invitation.normalizedEmail, passwordHash: existingAccount.passwordHash, mustChangePassword: existingAccount.mustChangePassword, role: "MEMBER", status: "ACTIVE", organizationPosition: "MEMBER", memberCategory: invitation.memberCategory, directorateId: invitation.directorateId } });
    } else {
      if (passwordError) throw new HubApiError(passwordError, 422);
      const passwordHash = await hashHubPassword(password);
      account = await tx.hubAccount.create({ data: { email: invitation.normalizedEmail, normalizedEmail: invitation.normalizedEmail, passwordHash, mustChangePassword: false } });
      member = await tx.hubMember.create({ data: { organizationId: invitation.organizationId, accountId: account.id, name: fullName, email: invitation.normalizedEmail, normalizedEmail: invitation.normalizedEmail, passwordHash, mustChangePassword: false, role: "MEMBER", status: "ACTIVE", organizationPosition: "MEMBER", memberCategory: invitation.memberCategory, directorateId: invitation.directorateId } });
    }
    await tx.hubWalletAccount.upsert({ where: { memberId: member.id }, create: { memberId: member.id }, update: {} });
    if (invitation.organizationPosition === "PRESIDENT") await transferHubPresidencyInTransaction(tx, { organizationId: invitation.organizationId, memberId: invitation.invitedById }, member.id);
    else if (invitation.organizationPosition === "COUNSELOR") member = await tx.hubMember.update({ where: { id: member.id }, data: { organizationPosition: "COUNSELOR", sessionVersion: { increment: 1 } } });
    if (invitation.appointAsDirector && invitation.directorateId) await tx.hubDirectorate.update({ where: { id: invitation.directorateId }, data: { directorId: member.id, version: { increment: 1 } } });
    await tx.hubMemberInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", acceptedAt: new Date(), version: { increment: 1 } } });
    await tx.hubMemberLifecycleEvent.create({ data: { organizationId: invitation.organizationId, memberId: member.id, type: "JOINED", recordedById: invitation.invitedById, metadata: { invitationId: invitation.id, organizationPosition: invitation.organizationPosition, memberCategory: invitation.memberCategory, directorateId: invitation.directorateId } } });
    await writeHubAudit(tx, { organizationId: invitation.organizationId, memberId: invitation.invitedById, action: "MEMBER_INVITATION_ACCEPTED", entity: "MEMBER", entityId: member.id, metadata: { invitationId: invitation.id, normalizedEmail: invitation.normalizedEmail } });
    return { memberId: member.id, accountId: account!.id, organizationId: invitation.organizationId };
  }, { isolationLevel: "Serializable" });
}
