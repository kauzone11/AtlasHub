import type { Prisma } from "@prisma/client";

export const hubMemberSafeSelect = {
  id: true,
  organizationId: true,
  accountId: true,
  email: true,
  name: true,
  organizationPosition: true,
  memberCategory: true,
  role: true,
  status: true,
  directorateId: true,
  directorate: { select: { id: true, name: true, slug: true } },
  mustChangePassword: true,
  lastLoginAt: true,
  avatarUrl: true,
  createdAt: true,
  updatedAt: true,
  walletAccount: { select: { id: true, balanceCents: true } },
} satisfies Prisma.HubMemberSelect;

type SafeMemberPayload = Prisma.HubMemberGetPayload<{
  select: typeof hubMemberSafeSelect;
}>;

export function serializeHubMember(member: SafeMemberPayload) {
  return {
    ...member,
    lastLoginAt: member.lastLoginAt?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
  };
}
