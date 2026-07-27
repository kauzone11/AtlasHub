import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { clearReadNotifications, listCoreNotifications } from "@/lib/hub/notification-action-service";
export const GET = withHubApi(async (request) => { const session = await requireHubPermission("member:access"); const filter = new URL(request.url).searchParams.get("filter"); return hubJson(await listCoreNotifications(prisma, session, filter === "unread" || filter === "archived" ? filter : "all")); });
export const DELETE = withHubApi(async (request) => { const session = await requireHubPermission("member:access"); if (new URL(request.url).searchParams.get("scope") !== "read") throw new HubApiError("Escopo inválido.", 400); return hubJson({ cleared: await clearReadNotifications(prisma, session) }); });
