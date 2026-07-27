import { prisma } from "@/lib/prisma";
import { createHubAccountSession, createHubSession, destroyHubAccountSession, destroyHubSession } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import {
  authenticateHubAccount,
  HubAccountServiceError,
  hubSessionInput,
  selectHubOrganization,
} from "@/lib/hub/hub-account-service";

export const POST = withHubApi(async (request: Request) => {
  const body = await request.json().catch(() => null) as { email?: unknown; password?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) throw new HubApiError("Informe e-mail e senha.", 422);

  try {
    const resolution = await authenticateHubAccount(prisma, email, password);
    if (!resolution.selected) {
      await destroyHubSession();
      await createHubAccountSession({
        accountId: resolution.account.id,
        sessionVersion: resolution.account.sessionVersion,
        mustChangePassword: resolution.account.mustChangePassword,
      });
      return hubJson({ success: true, requiresOrganizationSelection: true });
    }

    const selected = await selectHubOrganization(prisma, resolution.account.id, resolution.selected.organizationId);
    await destroyHubAccountSession();
    await createHubSession(hubSessionInput({ id: resolution.account.id, ...selected.account }, selected.membership));
    return hubJson({
      success: true,
      mustChangePassword: selected.account.mustChangePassword,
      requiresOrganizationSelection: false,
    });
  } catch (error) {
    if (error instanceof HubAccountServiceError) throw new HubApiError(error.message, error.status);
    throw error;
  }
});
