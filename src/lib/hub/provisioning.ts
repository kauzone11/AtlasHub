import { Prisma, type PrismaClient } from "@prisma/client";
import { hashHubPassword } from "@/lib/hub/auth";
import { normalizeHubEmail } from "@/lib/hub/member-management";
import {
  DEFAULT_HUB_CURRENCY,
  DEFAULT_HUB_LOCALE,
  isValidHubOrganizationSlug,
  normalizeHubOrganizationSlug,
} from "@/lib/hub/organization";
import { validateHubPassword } from "@/lib/hub/security";

export const STANDARD_HUB_DIRECTORATES = [
  "Presidência",
  "Administrativo-Financeiro",
  "Projetos",
  "Comercial",
  "Marketing",
  "Gestão de Pessoas",
  "Conselho",
] as const;

export type HubOrganizationProvisioningInput = {
  name: string;
  hubName: string;
  slug: string;
  timezone: string;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
};

type ProvisioningClient = Pick<PrismaClient, "$transaction">;

function slugifyDirectorate(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function validateInput(input: HubOrganizationProvisioningInput) {
  const name = input.name.trim();
  const hubName = input.hubName.trim();
  const slug = normalizeHubOrganizationSlug(input.slug);
  const adminEmail = normalizeHubEmail(input.adminEmail);
  const adminName = input.adminName.trim();
  if (name.length < 2 || name.length > 120) throw new Error("Nome da organização inválido.");
  if (hubName.length < 2 || hubName.length > 120) throw new Error("Nome do Hub inválido.");
  if (!isValidHubOrganizationSlug(slug)) throw new Error("Slug da organização inválido.");
  if (!adminEmail || !/^\S+@\S+\.\S+$/.test(adminEmail)) throw new Error("E-mail do administrador inválido.");
  if (adminName.length < 2 || adminName.length > 120) throw new Error("Nome do administrador inválido.");
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: input.timezone }).format();
  } catch {
    throw new Error("Timezone IANA inválido.");
  }
  const passwordError = validateHubPassword(input.adminPassword);
  if (passwordError) throw new Error(passwordError);
  return { ...input, name, hubName, slug, adminEmail, adminName };
}

export async function provisionHubOrganization(client: ProvisioningClient, rawInput: HubOrganizationProvisioningInput) {
  const input = validateInput(rawInput);
  const passwordHash = await hashHubPassword(input.adminPassword);
  try {
    return await client.$transaction(async (tx: Prisma.TransactionClient) => {
      const duplicate = await tx.hubOrganization.findUnique({ where: { slug: input.slug }, select: { id: true } });
      if (duplicate) throw new Error("Já existe uma organização com este slug.");

      const organization = await tx.hubOrganization.create({
        data: {
          name: input.name,
          hubName: input.hubName,
          slug: input.slug,
          timezone: input.timezone,
          locale: DEFAULT_HUB_LOCALE,
          currency: DEFAULT_HUB_CURRENCY,
        },
      });
      await tx.hubDirectorate.createMany({
        data: STANDARD_HUB_DIRECTORATES.map((name, order) => ({
          organizationId: organization.id,
          name,
          slug: slugifyDirectorate(name),
          order,
        })),
      });
      await tx.hubFinancialRule.create({
        data: { organizationId: organization.id, organizationSharePct: 50, atlasSharePct: 15, memberSharePct: 35 },
      });
      const existingAccount = await tx.hubAccount.findUnique({ where: { normalizedEmail: input.adminEmail } });
      const account = existingAccount || await tx.hubAccount.create({
        data: { email: input.adminEmail, normalizedEmail: input.adminEmail, passwordHash, mustChangePassword: true },
      });
      const activeMembershipCount = await tx.hubMember.count({ where: { accountId: account.id, status: "ACTIVE" } });
      const admin = await tx.hubMember.create({
        data: {
          organizationId: organization.id,
          accountId: account.id,
          email: input.adminEmail,
          normalizedEmail: input.adminEmail,
          name: input.adminName,
          passwordHash: account.passwordHash,
          role: "SUPER_ADMIN",
          status: "ACTIVE",
          mustChangePassword: true,
          isPrimary: activeMembershipCount === 0,
        },
      });
      await tx.hubOrganization.update({ where: { id: organization.id }, data: { responsibleMemberId: admin.id } });
      await tx.hubWalletAccount.create({ data: { memberId: admin.id } });
      return { organizationId: organization.id, organizationSlug: organization.slug, adminMemberId: admin.id };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("Já existe uma organização com este slug. Escolha outro código e tente novamente.");
    }
    throw error;
  }
}
