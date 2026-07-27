import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { searchHubRecords } from "@/lib/hub/search-service";
export const GET = withHubApi(async (request) => { const session = await requireHubPermission("member:access"); const query = new URL(request.url).searchParams.get("q") || ""; return hubJson({ results: await searchHubRecords(prisma, session, query) }); });
