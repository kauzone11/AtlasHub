import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { createDirectorate, listDirectorates } from "@/lib/hub/directorate-service";

export const GET = withHubApi(async (request) => {
  const session = await requireHubPermission("member:access");
  const includeArchived = new URL(request.url).searchParams.get("archived") === "true";
  return hubJson({ directorates: await listDirectorates(prisma, session, includeArchived) });
});

export const POST = withHubApi(async (request) => {
  const session = await requireHubPermission("directorates:manage");
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.name !== "string") throw new HubApiError("Dados inválidos.", 400);
  const directorate = await createDirectorate(prisma, session, { name: body.name, description: typeof body.description === "string" ? body.description : null, icon: typeof body.icon === "string" ? body.icon : null, directorId: typeof body.directorId === "string" ? body.directorId : null, memberIds: Array.isArray(body.memberIds) ? body.memberIds.filter((id): id is string => typeof id === "string") : [] });
  return hubJson({ directorate }, { status: 201 });
});
