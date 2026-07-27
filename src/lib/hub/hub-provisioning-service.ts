import crypto from "crypto";
import { Prisma, type HubOrganizationType, type PrismaClient } from "@prisma/client";
import { hashHubPassword } from "@/lib/hub/auth";
import { normalizeHubEmail } from "@/lib/hub/member-management";
import { DEFAULT_HUB_CURRENCY, DEFAULT_HUB_LOCALE, DEFAULT_HUB_TIMEZONE, isSupportedHubCurrency, isSupportedHubLocale, isSupportedHubTimezone, isValidHubOrganizationSlug, normalizeHubOrganizationSlug } from "@/lib/hub/organization";
import { STANDARD_HUB_DIRECTORATES } from "@/lib/hub/provisioning";
import { validateHubPassword } from "@/lib/hub/security";

export type WorkspaceHubProvisioningInput = {
  name: string;
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
  responsibleName: string;
  responsibleEmail: string;
  responsiblePhone?: string | null;
  responsiblePosition?: string | null;
  initialPassword: string;
  responsibleAccountMode?: "LINK_EXISTING_ACCOUNT" | "RESET_EXISTING_ACCOUNT_PASSWORD";
  confirmPasswordReset?: boolean;
  idempotencyKey: string;
  actorUserId: string;
};

export class HubProvisioningError extends Error {
  constructor(message: string, readonly status: 400 | 409) {
    super(message);
    this.name = "HubProvisioningError";
  }
}

const TYPES: HubOrganizationType[] = ["JUNIOR_ENTERPRISE", "ASSOCIATION", "FOUNDATION", "COMPANY", "PUBLIC_ORGANIZATION", "OTHER"];
const clean = (value: string | null | undefined) => value?.trim() || null;
const slugify = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function requestHash(input: WorkspaceHubProvisioningInput) {
  const passwordDigest = crypto.createHash("sha256").update(input.initialPassword).digest("hex");
  return crypto.createHash("sha256").update(JSON.stringify({ ...input, initialPassword: passwordDigest })).digest("hex");
}

function validate(input: WorkspaceHubProvisioningInput) {
  const name = input.name.trim();
  const responsibleName = input.responsibleName.trim();
  const responsibleEmail = normalizeHubEmail(input.responsibleEmail);
  const slug = normalizeHubOrganizationSlug(slugify(input.publicName || name));
  const timezone = input.timezone?.trim() || DEFAULT_HUB_TIMEZONE;
  const locale = input.locale?.trim() || DEFAULT_HUB_LOCALE;
  const currency = input.currency?.trim().toUpperCase() || DEFAULT_HUB_CURRENCY;
  const type = input.type || "JUNIOR_ENTERPRISE";
  const responsibleAccountMode = input.responsibleAccountMode;
  if (name.length < 2 || name.length > 120 || !isValidHubOrganizationSlug(slug)) throw new HubProvisioningError("Nome da organizacao invalido.", 400);
  if (responsibleName.length < 2 || responsibleName.length > 120) throw new HubProvisioningError("Nome do responsavel invalido.", 400);
  if (!/^\S+@\S+\.\S+$/.test(responsibleEmail)) throw new HubProvisioningError("E-mail do responsavel invalido.", 400);
  if (!isSupportedHubTimezone(timezone)) throw new HubProvisioningError("Timezone IANA invalido.", 400);
  if (!isSupportedHubLocale(locale)) throw new HubProvisioningError("Locale invalido.", 400);
  if (!isSupportedHubCurrency(currency)) throw new HubProvisioningError("Moeda invalida.", 400);
  if (!TYPES.includes(type)) throw new HubProvisioningError("Tipo de organizacao invalido.", 400);
  if (responsibleAccountMode !== undefined && responsibleAccountMode !== "LINK_EXISTING_ACCOUNT" && responsibleAccountMode !== "RESET_EXISTING_ACCOUNT_PASSWORD") throw new HubProvisioningError("Modo de conta do responsavel invalido.", 400);
  if (!input.idempotencyKey || input.idempotencyKey.length > 128) throw new HubProvisioningError("Chave de idempotencia invalida.", 400);
  return { ...input, name, responsibleName, responsibleEmail, slug, timezone, locale, currency, type };
}

function directorateSlug(value: string) {
  return slugify(value);
}

export async function provisionWorkspaceHub(prisma: PrismaClient, rawInput: WorkspaceHubProvisioningInput) {
  const input = validate(rawInput);
  const hash = requestHash(input);
  const previous = await prisma.workspaceHubMutation.findUnique({ where: { scope_idempotencyKey: { scope: "PROVISION", idempotencyKey: input.idempotencyKey } } });
  if (previous) {
    if (previous.requestHash !== hash) throw new HubProvisioningError("A chave de idempotencia ja foi usada com outros dados.", 409);
    return { ...(previous.resultJson as { organizationId: string; responsibleMemberId: string; accountId: string }), repeated: true };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        if (await tx.hubOrganization.findUnique({ where: { slug: input.slug }, select: { id: true } })) {
          throw new HubProvisioningError("Ja existe um Hub com este nome publico.", 409);
        }
        const accountExisting = await tx.hubAccount.findUnique({ where: { normalizedEmail: input.responsibleEmail } });
        if (accountExisting && !input.responsibleAccountMode) throw new HubProvisioningError("Este e-mail ja possui uma conta Hub. Vincule a conta existente ou confirme a redefinicao da senha.", 409);
        if (accountExisting && input.responsibleAccountMode === "LINK_EXISTING_ACCOUNT" && input.initialPassword.trim()) throw new HubProvisioningError("Remova a senha temporaria ao vincular uma conta Hub existente.", 409);
        const newPasswordError = validateHubPassword(input.initialPassword);
        if (!accountExisting && newPasswordError) throw new HubProvisioningError(newPasswordError, 400);
        if (accountExisting && input.responsibleAccountMode === "RESET_EXISTING_ACCOUNT_PASSWORD") {
          if (input.confirmPasswordReset !== true) throw new HubProvisioningError("Confirme explicitamente a redefinicao da senha.", 400);
          if (newPasswordError) throw new HubProvisioningError(newPasswordError, 400);
        }
        const account = accountExisting || await tx.hubAccount.create({
          data: {
            email: input.responsibleEmail,
            normalizedEmail: input.responsibleEmail,
            passwordHash: await hashHubPassword(input.initialPassword),
            mustChangePassword: true,
          },
        });
        if (account.status !== "ACTIVE") throw new HubProvisioningError("A conta global do responsavel esta desativada.", 409);
        if (accountExisting && input.responsibleAccountMode === "RESET_EXISTING_ACCOUNT_PASSWORD") {
          const passwordHash = await hashHubPassword(input.initialPassword);
          await tx.hubAccount.update({ where: { id: account.id }, data: { passwordHash, mustChangePassword: true, sessionVersion: { increment: 1 } } });
          await tx.hubMember.updateMany({ where: { accountId: account.id }, data: { passwordHash, mustChangePassword: true, sessionVersion: { increment: 1 } } });
        }
        const currentAccount = await tx.hubAccount.findUniqueOrThrow({ where: { id: account.id } });
        const activeMembershipCount = await tx.hubMember.count({ where: { accountId: account.id, status: "ACTIVE" } });
        const organization = await tx.hubOrganization.create({
          data: {
            name: input.name,
            hubName: `${input.publicName || input.name} Hub`,
            slug: input.slug,
            publicName: clean(input.publicName),
            legalName: clean(input.legalName),
            document: clean(input.document),
            institutionalEmail: clean(input.institutionalEmail),
            phone: clean(input.phone),
            website: clean(input.website),
            city: clean(input.city),
            state: clean(input.state),
            country: clean(input.country) || "BR",
            timezone: input.timezone,
            locale: input.locale,
            currency: input.currency,
            type: input.type,
            isActive: input.isActive !== false,
          },
        });
        await tx.hubDirectorate.createMany({ data: STANDARD_HUB_DIRECTORATES.map((name, order) => ({ organizationId: organization.id, name, slug: directorateSlug(name), order })) });
        await tx.hubFinancialRule.create({ data: { organizationId: organization.id, organizationSharePct: 50, atlasSharePct: 15, memberSharePct: 35 } });
        await tx.hubPipelineStage.createMany({ data: [
          { organizationId: organization.id, name: "Qualificacao", order: 1, probability: 20 },
          { organizationId: organization.id, name: "Proposta", order: 2, probability: 60 },
          { organizationId: organization.id, name: "Ganha", order: 3, probability: 100, isWon: true },
          { organizationId: organization.id, name: "Perdida", order: 4, probability: 0, isLost: true },
        ] });
        const member = await tx.hubMember.create({ data: {
          organizationId: organization.id,
          accountId: account.id,
          email: input.responsibleEmail,
          normalizedEmail: input.responsibleEmail,
          name: input.responsibleName,
          phone: clean(input.responsiblePhone),
          position: clean(input.responsiblePosition),
          passwordHash: currentAccount.passwordHash,
          role: "SUPER_ADMIN",
          status: "ACTIVE",
          mustChangePassword: currentAccount.mustChangePassword,
          isPrimary: activeMembershipCount === 0,
        } });
        await tx.hubOrganization.update({ where: { id: organization.id }, data: { responsibleMemberId: member.id } });
        await tx.hubWalletAccount.create({ data: { memberId: member.id } });
        await tx.workspaceHubLink.create({ data: { hubOrganizationId: organization.id, createdByUserId: input.actorUserId } });
        await tx.workspaceHubAudit.create({ data: {
          action: "HUB_PROVISIONED", hubOrganizationId: organization.id, organizationName: organization.name,
          responsibleAccountId: account.id, actorUserId: input.actorUserId,
          safeMetadata: { type: organization.type, isActive: organization.isActive, responsibleMemberId: member.id, responsibleAccountMode: input.responsibleAccountMode || "NEW_ACCOUNT" },
        } });
        const result = { organizationId: organization.id, responsibleMemberId: member.id, accountId: account.id, repeated: false };
        await tx.workspaceHubMutation.create({ data: { scope: "PROVISION", idempotencyKey: input.idempotencyKey, requestHash: hash, resultJson: result } });
        return result;
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error instanceof HubProvisioningError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const replay = await prisma.workspaceHubMutation.findUnique({ where: { scope_idempotencyKey: { scope: "PROVISION", idempotencyKey: input.idempotencyKey } } });
        if (replay?.requestHash === hash) return { ...(replay.resultJson as { organizationId: string; responsibleMemberId: string; accountId: string }), repeated: true };
        throw new HubProvisioningError("Hub, documento ou e-mail ja cadastrado.", 409);
      }
      throw error;
    }
  }
  throw new HubProvisioningError("Nao foi possivel concluir o provisionamento.", 409);
}
