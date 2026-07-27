import { getHubAccountSession, getHubOrganizationContext } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { acceptHubInvitation, previewHubInvitation } from "@/lib/hub/settings-service";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ token: string }> };

export const GET = withHubApi<Context>(async (_request, routeContext) => {
  const { token } = await routeContext.params;
  if (!token || token.length < 40) throw new HubApiError("Convite inválido.", 404);
  return hubJson(await previewHubInvitation(prisma, token));
});

export const POST = withHubApi<Context>(async (request, routeContext) => {
  const { token } = await routeContext.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) throw new HubApiError("Payload inválido.", 422);
  const [accountSession, memberSession] = await Promise.all([getHubAccountSession(), getHubOrganizationContext()]);
  const authenticatedAccountId = accountSession?.accountId || memberSession?.accountId || null;
  return hubJson(await acceptHubInvitation(prisma, token, { fullName: body.fullName, password: body.password, passwordConfirmation: body.passwordConfirmation, authenticatedAccountId }));
});
