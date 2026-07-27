import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { getCoreDashboard } from "@/lib/hub/dashboard-service";
import { HUB_DASHBOARD_SCOPE_COOKIE, resolveHubDashboardScope } from "@/lib/hub/dashboard-context";
export const GET = withHubApi(async () => { const session = await requireHubPermission("member:access"); const saved = (await cookies()).get(HUB_DASHBOARD_SCOPE_COOKIE)?.value; const resolved = await resolveHubDashboardScope(prisma, session.memberId, saved); const dashboard = await getCoreDashboard(prisma, { ...session, directorateId: resolved.directorateId, timezone: session.organization.timezone }, resolved.scope); return hubJson(dashboard); });
