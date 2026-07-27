import type { HubMember, Prisma } from "@prisma/client";

type HubMemberClient = Pick<Prisma.TransactionClient, "hubMember" | "hubAccount">;

export async function ensureBackfilledHubMember(client: HubMemberClient, input: {
  organizationId: string;
  email: string;
  name: string;
  directorateId?: string | null;
  lastLoginAt?: Date | null;
  avatarUrl?: string | null;
  createPasswordHash: () => Promise<string>;
}): Promise<{ member: HubMember; created: boolean; status: "PASSWORD_RESET_REQUIRED" | "EXISTING_ACCOUNT_PRESERVED" }> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existing = await client.hubMember.findUnique({
    where: { organizationId_normalizedEmail: { organizationId: input.organizationId, normalizedEmail } },
  });
  if (existing) return { member: existing, created: false, status: "EXISTING_ACCOUNT_PRESERVED" };

  const passwordHash = await input.createPasswordHash();
  const account = await client.hubAccount.upsert({
    where: { normalizedEmail },
    create: { email: normalizedEmail, normalizedEmail, passwordHash, mustChangePassword: true },
    update: {},
  });
  const member = await client.hubMember.create({
    data: {
      organizationId: input.organizationId,
      email: normalizedEmail,
      normalizedEmail,
      name: input.name,
      accountId: account.id,
      passwordHash: account.passwordHash,
      role: "MEMBER",
      status: "ACTIVE",
      mustChangePassword: true,
      directorateId: input.directorateId ?? null,
      lastLoginAt: input.lastLoginAt ?? null,
      avatarUrl: input.avatarUrl ?? null,
    },
  });
  return { member, created: true, status: "PASSWORD_RESET_REQUIRED" };
}
