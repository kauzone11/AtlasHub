import { cookies } from "next/headers";
import { requireHubMember } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { HUB_DASHBOARD_SCOPE_COOKIE, hubDashboardScopeCookie, legacyHubDashboardScopeCookie, resolveHubDashboardScope } from "@/lib/hub/dashboard-context";
import { prisma } from "@/lib/prisma";

export const GET = withHubApi(async () => {
  const session = await requireHubMember();
  const value = (await cookies()).get(HUB_DASHBOARD_SCOPE_COOKIE)?.value;
  return hubJson(await resolveHubDashboardScope(prisma, session.memberId, value));
});

export const PUT = withHubApi(async (request) => {
  const session = await requireHubMember();
  const body = await request.json().catch(() => null) as { scope?: unknown } | null;
  if (body?.scope !== "organization" && body?.scope !== "directorate") throw new HubApiError("Contexto inválido.", 422);
  const resolved = await resolveHubDashboardScope(prisma, session.memberId, body.scope);
  if (body.scope === "directorate" && !resolved.hasDirectorate) throw new HubApiError("Você ainda não possui uma diretoria ativa.", 409);
  const store = await cookies();
  store.set(HUB_DASHBOARD_SCOPE_COOKIE, "", legacyHubDashboardScopeCookie);
  store.set(HUB_DASHBOARD_SCOPE_COOKIE, body.scope, hubDashboardScopeCookie);
  return hubJson({ ...resolved, scope: body.scope, preference: body.scope });
});
