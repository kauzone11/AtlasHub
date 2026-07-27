import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { deleteDirectorate, getDirectorate, updateDirectorate } from "@/lib/hub/directorate-service";
type Context = { params: Promise<{ id: string }> };

export const GET = withHubApi<Context>(async (_request, context) => {
  const session = await requireHubPermission("member:access"); const { id } = await context.params;
  return hubJson({ directorate: await getDirectorate(prisma, session, id) });
});
export const PATCH = withHubApi<Context>(async (request, context) => {
  const session = await requireHubPermission("member:access"); const { id } = await context.params; const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !Number.isInteger(Number(body.version))) throw new HubApiError("Versão obrigatória.", 400);
  const action = body.action === "archive" || body.action === "restore" ? body.action : undefined;
  return hubJson({ directorate: await updateDirectorate(prisma, session, id, { version: Number(body.version), name: typeof body.name === "string" ? body.name : undefined, description: typeof body.description === "string" || body.description === null ? body.description : undefined, icon: typeof body.icon === "string" || body.icon === null ? body.icon : undefined, directorId: typeof body.directorId === "string" || body.directorId === null ? body.directorId : undefined, action }) });
});
export const DELETE = withHubApi<Context>(async (request, context) => {
  const session = await requireHubPermission("directorates:manage"); const { id } = await context.params; const version = Number(new URL(request.url).searchParams.get("version"));
  if (!Number.isInteger(version)) throw new HubApiError("Versão obrigatória.", 400);
  await deleteDirectorate(prisma, session, id, version); return hubJson({ deleted: true });
});
