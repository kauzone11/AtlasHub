import { prisma } from "@/lib/prisma";
import { createHubSession, destroyHubAccountSession, getHubAccountSession } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { HubAccountServiceError, hubSessionInput, listEligibleHubMemberships, selectHubOrganization } from "@/lib/hub/hub-account-service";

export const GET = withHubApi(async () => {
  const accountSession = await getHubAccountSession();
  if (!accountSession) throw new HubApiError("Nao autenticado.", 401);
  const memberships = await listEligibleHubMemberships(prisma, accountSession.accountId);
  return hubJson({
    organizations: memberships.map((membership) => ({
      name: membership.organization.name,
      hubName: membership.organization.hubName,
      organizationKey: membership.organizationId,
    })),
    mustChangePassword: accountSession.mustChangePassword,
  });
});

export const POST = withHubApi(async (request: Request) => {
  const accountSession = await getHubAccountSession();
  if (!accountSession) throw new HubApiError("Nao autenticado.", 401);
  const body = await request.json().catch(() => null) as { organizationKey?: unknown } | null;
  if (typeof body?.organizationKey !== "string" || !body.organizationKey) throw new HubApiError("Organizacao invalida.", 422);
  try {
    const selected = await selectHubOrganization(prisma, accountSession.accountId, body.organizationKey);
    await destroyHubAccountSession();
    await createHubSession(hubSessionInput({ id: accountSession.accountId, ...selected.account }, selected.membership));
    return hubJson({ success: true, mustChangePassword: selected.account.mustChangePassword });
  } catch (error) {
    if (error instanceof HubAccountServiceError) throw new HubApiError(error.message, error.status);
    throw error;
  }
});
