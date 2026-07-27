import type { Prisma } from "@prisma/client";
import { normalizeHubEmail } from "@/lib/hub/member-management";
import { isValidHubOrganizationSlug, normalizeHubOrganizationSlug } from "@/lib/hub/organization";

type HubLoginClient = Pick<Prisma.TransactionClient, "hubOrganization" | "hubMember">;

export async function resolveHubLoginMember(client: HubLoginClient, input: { organizationSlug: string; email: string }) {
  const organizationSlug = normalizeHubOrganizationSlug(input.organizationSlug);
  const normalizedEmail = normalizeHubEmail(input.email);
  if (!isValidHubOrganizationSlug(organizationSlug) || !normalizedEmail) return null;
  const organization = await client.hubOrganization.findUnique({
    where: { slug: organizationSlug },
    select: { id: true, slug: true, isActive: true },
  });
  if (!organization?.isActive) return null;
  return client.hubMember.findUnique({
    where: { organizationId_normalizedEmail: { organizationId: organization.id, normalizedEmail } },
    include: { organization: { select: { isActive: true, slug: true } } },
  });
}
