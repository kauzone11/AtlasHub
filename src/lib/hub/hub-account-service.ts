import { Prisma, type PrismaClient } from "@prisma/client";
import { normalizeHubEmail } from "@/lib/hub/member-management";
import { verifyHubPassword } from "@/lib/hub/auth";

const DUMMY_PASSWORD_HASH = "$2b$12$q1xkHGsZg5jtj5m4zzG0J.kbRWwL9r2/SRF5hZE8IEjpfBKYNQNzO";
const INVALID_LOGIN = "E-mail ou senha invalidos.";

export class HubAccountServiceError extends Error {
  constructor(message: string, readonly status: 400 | 401 | 403 | 404 | 409) {
    super(message);
    this.name = "HubAccountServiceError";
  }
}

const membershipSelect = {
  id: true,
  organizationId: true,
  accountId: true,
  email: true,
  name: true,
  role: true,
  status: true,
  directorateId: true,
  mustChangePassword: true,
  sessionVersion: true,
  isPrimary: true,
  organization: { select: { id: true, name: true, hubName: true, slug: true, isActive: true } },
} satisfies Prisma.HubMemberSelect;

export type EligibleHubMembership = Prisma.HubMemberGetPayload<{ select: typeof membershipSelect }>;

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

export async function authenticateHubAccount(prisma: PrismaClient, emailInput: string, password: string) {
  const normalizedEmail = normalizeHubEmail(emailInput);
  const account = normalizedEmail
    ? await prisma.hubAccount.findUnique({
        where: { normalizedEmail },
        include: { memberships: { select: membershipSelect, orderBy: { createdAt: "asc" } } },
      })
    : null;
  const passwordValid = await verifyHubPassword(password, account?.passwordHash || DUMMY_PASSWORD_HASH);
  if (!account || !passwordValid || account.status !== "ACTIVE") throw new HubAccountServiceError(INVALID_LOGIN, 401);

  const memberships = account.memberships.filter((membership) => membership.status === "ACTIVE" && membership.organization.isActive);
  if (!memberships.length) throw new HubAccountServiceError("Nao ha acesso ativo a um Hub para esta conta.", 403);

  const selected = memberships.find((membership) => membership.organizationId === account.lastOrganizationId)
    || memberships.find((membership) => membership.isPrimary)
    || (memberships.length === 1 ? memberships[0] : null);
  return { account, memberships, selected };
}

export async function listEligibleHubMemberships(prisma: PrismaClient, accountId: string) {
  return prisma.hubMember.findMany({
    where: { accountId, status: "ACTIVE", organization: { isActive: true } },
    select: membershipSelect,
    orderBy: [{ isPrimary: "desc" }, { organization: { name: "asc" } }],
  });
}

export async function selectHubOrganization(prisma: PrismaClient, accountId: string, organizationId: string) {
  return serializable(prisma, async (tx) => {
    const account = await tx.hubAccount.findUnique({ where: { id: accountId }, select: { status: true, sessionVersion: true, mustChangePassword: true } });
    if (!account || account.status !== "ACTIVE") throw new HubAccountServiceError("Sessao de conta invalida.", 401);
    const membership = await tx.hubMember.findFirst({
      where: { accountId, organizationId, status: "ACTIVE", organization: { isActive: true } },
      select: membershipSelect,
    });
    if (!membership) throw new HubAccountServiceError("Organizacao indisponivel para esta conta.", 403);
    await tx.hubAccount.update({ where: { id: accountId }, data: { lastOrganizationId: organizationId } });
    await tx.hubMember.update({ where: { id: membership.id }, data: { lastLoginAt: new Date() } });
    return { account, membership };
  });
}

export function hubSessionInput(account: { id: string; sessionVersion: number; mustChangePassword: boolean }, membership: EligibleHubMembership) {
  return {
    accountId: account.id,
    accountSessionVersion: account.sessionVersion,
    memberId: membership.id,
    organizationId: membership.organizationId,
    organizationSlug: membership.organization.slug,
    email: membership.email,
    role: membership.role,
    directorateId: membership.directorateId,
    mustChangePassword: account.mustChangePassword,
    sessionVersion: membership.sessionVersion,
  };
}
