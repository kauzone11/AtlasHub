import { Prisma, type HubOrganizationType, type PrismaClient } from "@prisma/client";
import { hashHubPassword } from "@/lib/hub/auth";
import { normalizeHubEmail } from "@/lib/hub/member-management";
import { isSupportedHubCurrency, isSupportedHubLocale, isSupportedHubTimezone } from "@/lib/hub/organization";
import { validateHubPassword } from "@/lib/hub/security";

export class HubOrganizationAdminError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message);
    this.name = "HubOrganizationAdminError";
  }
}
const ORGANIZATION_TYPES: HubOrganizationType[] = ["JUNIOR_ENTERPRISE", "ASSOCIATION", "FOUNDATION", "COMPANY", "PUBLIC_ORGANIZATION", "OTHER"];

async function serializable<T>(prisma: PrismaClient, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  throw new Error("Transacao serializavel indisponivel.");
}

const organizationInclude = {
  responsibleMember: { select: { id: true, name: true, email: true, phone: true, position: true, accountId: true, account: { select: { mustChangePassword: true, status: true } } } },
  _count: { select: { members: { where: { status: "ACTIVE" } } } },
  workspaceLink: { select: { atlasOrganizationId: true } },
} satisfies Prisma.HubOrganizationInclude;

type OrganizationRecord = Prisma.HubOrganizationGetPayload<{ include: typeof organizationInclude }>;

export function serializeWorkspaceHub(organization: OrganizationRecord, lastActivity: Date | null = null) {
  return {
    id: organization.id,
    version: organization.version,
    name: organization.name,
    publicName: organization.publicName,
    legalName: organization.legalName,
    document: organization.document,
    institutionalEmail: organization.institutionalEmail,
    phone: organization.phone,
    website: organization.website,
    city: organization.city,
    state: organization.state,
    country: organization.country,
    timezone: organization.timezone,
    locale: organization.locale,
    currency: organization.currency,
    type: organization.type,
    isActive: organization.isActive,
    status: organization.isActive ? "ATIVO" : "INATIVO",
    activeMembers: organization._count.members,
    createdAt: organization.createdAt.toISOString(),
    updatedAt: organization.updatedAt.toISOString(),
    lastActivityAt: lastActivity?.toISOString() || null,
    loginAccessStatus: organization.isActive ? "Acesso liberado para membros ativos" : "Login bloqueado",
    responsible: organization.responsibleMember ? {
      memberId: organization.responsibleMember.id,
      accountId: organization.responsibleMember.accountId,
      name: organization.responsibleMember.name,
      email: organization.responsibleMember.email,
      phone: organization.responsibleMember.phone,
      position: organization.responsibleMember.position,
      mustChangePassword: organization.responsibleMember.account?.mustChangePassword ?? true,
    } : null,
  };
}

export async function listWorkspaceHubs(prisma: PrismaClient) {
  const [organizations, activities] = await Promise.all([
    prisma.hubOrganization.findMany({ include: organizationInclude, orderBy: { createdAt: "desc" } }),
    prisma.hubMember.groupBy({ by: ["organizationId"], _max: { lastLoginAt: true } }),
  ]);
  const activityMap = new Map(activities.map((activity) => [activity.organizationId, activity._max.lastLoginAt]));
  return organizations.map((organization) => serializeWorkspaceHub(organization, activityMap.get(organization.id) || null));
}

type UpdateInput = {
  version: number;
  name?: string;
  publicName?: string | null;
  legalName?: string | null;
  document?: string | null;
  institutionalEmail?: string | null;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string;
  timezone?: string;
  locale?: string;
  currency?: string;
  type?: HubOrganizationType;
  isActive?: boolean;
};

const cleanNullable = (value: string | null | undefined) => value === undefined ? undefined : value?.trim() || null;

export async function updateWorkspaceHub(prisma: PrismaClient, organizationId: string, input: UpdateInput, actorUserId: string) {
  return serializable(prisma, async (tx) => {
    const current = await tx.hubOrganization.findUnique({ where: { id: organizationId }, include: organizationInclude });
    if (!current) throw new HubOrganizationAdminError("Hub nao encontrado.", 404);
    if (!Number.isInteger(input.version) || current.version !== input.version) throw new HubOrganizationAdminError("O Hub foi alterado por outra pessoa. Recarregue e tente novamente.", 409);
    const data: Prisma.HubOrganizationUpdateManyMutationInput = { version: { increment: 1 } };
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length < 2 || name.length > 120) throw new HubOrganizationAdminError("Nome invalido.", 400);
      data.name = name;
    }
    for (const key of ["publicName", "legalName", "document", "institutionalEmail", "phone", "website", "city", "state"] as const) {
      if (input[key] !== undefined) data[key] = cleanNullable(input[key]);
    }
    if (input.country !== undefined) data.country = input.country.trim().toUpperCase() || "BR";
    if (input.locale !== undefined) {
      if (!isSupportedHubLocale(input.locale)) throw new HubOrganizationAdminError("Locale invalido.", 400);
      data.locale = input.locale.trim();
    }
    if (input.currency !== undefined) {
      const currency = input.currency.trim().toUpperCase();
      if (!isSupportedHubCurrency(currency)) throw new HubOrganizationAdminError("Moeda invalida.", 400);
      if (currency !== current.currency) {
        const [walletTransactions, financialEntries] = await Promise.all([
          tx.hubWalletTransaction.count({ where: { account: { member: { organizationId } } } }),
          tx.hubFinancialEntry.count({ where: { organizationId } }),
        ]);
        if (walletTransactions + financialEntries > 0) throw new HubOrganizationAdminError("A moeda nao pode ser alterada depois de registros financeiros.", 409);
      }
      data.currency = currency;
    }
    if (input.timezone !== undefined) {
      const timezone = input.timezone.trim();
      if (!isSupportedHubTimezone(timezone)) throw new HubOrganizationAdminError("Timezone invalido.", 400);
      if (timezone !== current.timezone) {
        const [meetings, entries] = await Promise.all([tx.hubMeeting.count({ where: { organizationId } }), tx.hubFinancialEntry.count({ where: { organizationId } })]);
        if (meetings + entries > 0) throw new HubOrganizationAdminError("O timezone nao pode ser alterado depois de reunioes ou registros financeiros.", 409);
      }
      data.timezone = timezone;
    }
    if (input.type !== undefined) {
      if (!ORGANIZATION_TYPES.includes(input.type)) throw new HubOrganizationAdminError("Tipo de organizacao invalido.", 400);
      data.type = input.type;
    }
    if (input.isActive !== undefined) data.isActive = input.isActive;
    const claimed = await tx.hubOrganization.updateMany({ where: { id: organizationId, version: input.version }, data });
    if (claimed.count !== 1) throw new HubOrganizationAdminError("O Hub foi alterado por outra pessoa. Recarregue e tente novamente.", 409);
    if (input.isActive !== undefined && input.isActive !== current.isActive) {
      await tx.hubMember.updateMany({ where: { organizationId }, data: { sessionVersion: { increment: 1 } } });
    }
    const updated = await tx.hubOrganization.findUniqueOrThrow({ where: { id: organizationId }, include: organizationInclude });
    await tx.workspaceHubAudit.create({ data: {
      action: input.isActive === false ? "HUB_DEACTIVATED" : input.isActive === true && !current.isActive ? "HUB_REACTIVATED" : "HUB_UPDATED",
      hubOrganizationId: organizationId, organizationName: updated.name,
      responsibleAccountId: updated.responsibleMember?.accountId, actorUserId,
      safeMetadata: { beforeVersion: current.version, afterVersion: updated.version, isActive: updated.isActive, changedFields: Object.keys(input).filter((key) => key !== "version") },
    } });
    return serializeWorkspaceHub(updated);
  });
}

type ResponsibleInput = {
  version: number;
  name: string;
  email: string;
  phone?: string | null;
  position?: string | null;
  initialPassword?: string;
  responsibleAccountMode?: "LINK_EXISTING_ACCOUNT" | "RESET_EXISTING_ACCOUNT_PASSWORD";
  confirmPasswordReset?: boolean;
  keepFormerActive: boolean;
};

export async function transferHubResponsibility(prisma: PrismaClient, organizationId: string, input: ResponsibleInput, actorUserId: string) {
  const email = normalizeHubEmail(input.email);
  const name = input.name.trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || name.length < 2) throw new HubOrganizationAdminError("Dados do responsavel invalidos.", 400);
  return serializable(prisma, async (tx) => {
    const organization = await tx.hubOrganization.findUnique({ where: { id: organizationId }, include: { responsibleMember: true } });
    if (!organization) throw new HubOrganizationAdminError("Hub nao encontrado.", 404);
    if (organization.version !== input.version) throw new HubOrganizationAdminError("O Hub foi alterado por outra pessoa. Recarregue e tente novamente.", 409);
    let account = await tx.hubAccount.findUnique({ where: { normalizedEmail: email } });
    if (account && !input.responsibleAccountMode) throw new HubOrganizationAdminError("Este e-mail ja possui uma conta Hub. Vincule a conta existente ou confirme a redefinicao da senha.", 409);
    if (account && input.responsibleAccountMode === "LINK_EXISTING_ACCOUNT" && input.initialPassword?.trim()) throw new HubOrganizationAdminError("Remova a senha temporaria ao vincular uma conta Hub existente.", 409);
    if (!account) {
      const policyError = validateHubPassword(input.initialPassword || "");
      if (policyError) throw new HubOrganizationAdminError(policyError, 400);
      account = await tx.hubAccount.create({ data: { email, normalizedEmail: email, passwordHash: await hashHubPassword(input.initialPassword!), mustChangePassword: true } });
    }
    if (account.status !== "ACTIVE") throw new HubOrganizationAdminError("A conta global informada esta desativada.", 409);
    if (input.responsibleAccountMode === "RESET_EXISTING_ACCOUNT_PASSWORD") {
      if (input.confirmPasswordReset !== true) throw new HubOrganizationAdminError("Confirme explicitamente a redefinicao da senha.", 400);
      const policyError = validateHubPassword(input.initialPassword || "");
      if (policyError) throw new HubOrganizationAdminError(policyError, 400);
      const passwordHash = await hashHubPassword(input.initialPassword!);
      await tx.hubAccount.update({ where: { id: account.id }, data: { passwordHash, mustChangePassword: true, sessionVersion: { increment: 1 } } });
      await tx.hubMember.updateMany({ where: { accountId: account.id }, data: { passwordHash, mustChangePassword: true, sessionVersion: { increment: 1 } } });
      account = await tx.hubAccount.findUniqueOrThrow({ where: { id: account.id } });
    }
    let next = await tx.hubMember.findFirst({ where: { organizationId, accountId: account.id } });
    if (next) {
      next = await tx.hubMember.update({ where: { id: next.id }, data: { name, email, normalizedEmail: email, phone: cleanNullable(input.phone), position: cleanNullable(input.position), passwordHash: account.passwordHash, mustChangePassword: account.mustChangePassword, role: "SUPER_ADMIN", status: "ACTIVE", sessionVersion: { increment: 1 } } });
    } else {
      next = await tx.hubMember.create({ data: { organizationId, accountId: account.id, name, email, normalizedEmail: email, phone: cleanNullable(input.phone), position: cleanNullable(input.position), passwordHash: account.passwordHash, mustChangePassword: account.mustChangePassword, role: "SUPER_ADMIN", status: "ACTIVE" } });
      await tx.hubWalletAccount.create({ data: { memberId: next.id } });
    }
    const former = organization.responsibleMember;
    if (former && former.id !== next.id) {
      await tx.hubMember.update({ where: { id: former.id }, data: input.keepFormerActive
        ? { role: "ADMIN", sessionVersion: { increment: 1 } }
        : { status: "DISABLED", sessionVersion: { increment: 1 } } });
    }
    await tx.hubOrganization.updateMany({ where: { id: organizationId, version: input.version }, data: { responsibleMemberId: next.id, version: { increment: 1 } } });
    const superAdmins = await tx.hubMember.count({ where: { organizationId, role: "SUPER_ADMIN", status: "ACTIVE" } });
    if (superAdmins < 1) throw new HubOrganizationAdminError("O Hub precisa manter ao menos um SUPER_ADMIN ativo.", 409);
    await tx.workspaceHubAudit.create({ data: { action: "HUB_RESPONSIBILITY_TRANSFERRED", hubOrganizationId: organizationId, organizationName: organization.name, responsibleAccountId: account.id, actorUserId, safeMetadata: { formerMemberId: former?.id || null, responsibleMemberId: next.id, formerKeptActive: input.keepFormerActive } } });
    return { responsibleMemberId: next.id, accountId: account.id };
  });
}

export async function resetHubResponsiblePassword(prisma: PrismaClient, organizationId: string, input: { newPassword?: string; confirmPasswordReset?: boolean }, actorUserId: string) {
  if (input.confirmPasswordReset !== true) throw new HubOrganizationAdminError("Confirme explicitamente a invalidacao de todas as sessoes do Hub.", 400);
  const policyError = validateHubPassword(input.newPassword || "");
  if (policyError) throw new HubOrganizationAdminError(policyError, 400);
  return serializable(prisma, async (tx) => {
    const organization = await tx.hubOrganization.findUnique({ where: { id: organizationId }, include: { responsibleMember: { select: { id: true, accountId: true, name: true, email: true } } } });
    if (!organization) throw new HubOrganizationAdminError("Hub nao encontrado.", 404);
    const accountId = organization.responsibleMember?.accountId;
    if (!accountId) throw new HubOrganizationAdminError("O Hub nao possui uma conta global de responsavel.", 409);
    const passwordHash = await hashHubPassword(input.newPassword!);
    await tx.hubAccount.update({ where: { id: accountId }, data: { passwordHash, mustChangePassword: true, sessionVersion: { increment: 1 } } });
    await tx.hubMember.updateMany({ where: { accountId }, data: { passwordHash, mustChangePassword: true, sessionVersion: { increment: 1 } } });
    await tx.workspaceHubAudit.create({ data: { action: "HUB_RESPONSIBLE_PASSWORD_RESET", hubOrganizationId: organizationId, organizationName: organization.name, responsibleAccountId: accountId, actorUserId, safeMetadata: { responsibleMemberId: organization.responsibleMember!.id, invalidatedAccountSessions: true, invalidatedMembershipSessions: true } } });
    return { responsibleMemberId: organization.responsibleMember!.id, accountId };
  });
}
