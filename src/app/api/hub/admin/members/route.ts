import type { HubRole, HubMemberStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashHubPassword } from "@/lib/hub/auth";
import { requireHubSettingsAccess } from "@/lib/hub/settings-access";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { assertCanAssignHubRole } from "@/lib/hub/permissions";
import { generateHubTemporaryPassword } from "@/lib/hub/security";
import { hubMemberSafeSelect, serializeHubMember } from "@/lib/hub/members";
import { writeHubAudit } from "@/lib/hub/audit";
import { normalizeHubEmail } from "@/lib/hub/member-management";
import { createHubNotifications } from "@/lib/hub/notifications";

const ROLES: HubRole[] = ["SUPER_ADMIN", "ADMIN", "FINANCE", "DIRECTOR", "MEMBER", "VIEWER"];
const STATUSES: HubMemberStatus[] = ["INVITED", "ACTIVE", "DISABLED"];

export const GET = withHubApi(async () => {
  const session = await requireHubSettingsAccess();
  const members = await prisma.hubMember.findMany({
    where: { organizationId: session.organizationId, status: { not: "DELETED" } },
    select: hubMemberSafeSelect,
    orderBy: { name: "asc" },
  });
  return hubJson({
    members: members.map(serializeHubMember),
    actor: { id: session.memberId, role: session.role },
  });
});

export const POST = withHubApi(async (request: Request) => {
  const session = await requireHubSettingsAccess();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) throw new HubApiError("Payload inválido.", 422);
  const email = typeof body.email === "string" ? normalizeHubEmail(body.email) : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const role = (typeof body.role === "string" ? body.role : "MEMBER") as HubRole;
  const status = (typeof body.status === "string" ? body.status : "ACTIVE") as HubMemberStatus;
  const directorateId = typeof body.directorateId === "string" && body.directorateId ? body.directorateId : null;
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new HubApiError("Informe nome e e-mail válidos.", 422);
  if (!ROLES.includes(role)) throw new HubApiError("Papel inválido.", 422);
  assertCanAssignHubRole(session.role, role);
  if (!STATUSES.includes(status)) throw new HubApiError("Status inválido.", 422);

  if (directorateId) {
    const valid = await prisma.hubDirectorate.count({ where: { id: directorateId, organizationId: session.organizationId, isActive: true } });
    if (!valid) throw new HubApiError("Diretoria não encontrada nesta organização.", 404);
  }
  if (await prisma.hubMember.count({ where: { organizationId: session.organizationId, normalizedEmail: email } })) {
    throw new HubApiError("E-mail já cadastrado.", 409);
  }

  const temporaryPassword = generateHubTemporaryPassword();
  const passwordHash = await hashHubPassword(temporaryPassword);
  const result = await prisma.$transaction(async (tx) => {
    const existingAccount = await tx.hubAccount.findUnique({ where: { normalizedEmail: email } });
    const account = existingAccount || await tx.hubAccount.create({ data: { email, normalizedEmail: email, passwordHash, mustChangePassword: true } });
    const created = await tx.hubMember.create({
      data: { organizationId: session.organizationId, accountId: account.id, email, normalizedEmail: email, name, role, status, directorateId, passwordHash: account.passwordHash, mustChangePassword: account.mustChangePassword },
      select: hubMemberSafeSelect,
    });
    await tx.hubWalletAccount.create({ data: { memberId: created.id } });
    await tx.hubMemberLifecycleEvent.create({ data: { organizationId: session.organizationId, memberId: created.id, type: "JOINED", recordedById: session.memberId, metadata: { role, status, directorateId } } });
    const audit = await writeHubAudit(tx, { organizationId: session.organizationId, memberId: session.memberId, action: "MEMBER_CREATED", entity: "MEMBER", entityId: created.id, metadata: { role, status, directorateId } });
    if (status === "ACTIVE") await createHubNotifications(tx, [{ organizationId: session.organizationId, recipientMemberId: created.id, actorMemberId: session.memberId, type: "WELCOME", title: "Bem-vindo ao Atlas Hub", body: "Sua conta está pronta para acessar o Hub.", href: "/hub", entityType: "MEMBER", entityId: created.id, idempotencyKey: `notification:audit:${audit.id}:welcome` }]);
    return { member: created, createdAccount: !existingAccount };
  });

  return hubJson({ member: serializeHubMember(result.member), temporaryPassword: result.createdAccount ? temporaryPassword : null }, { status: 201 });
});
