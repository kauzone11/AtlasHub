import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { getProject, updateProject } from "@/lib/hub/project-service";
type Context = { params: Promise<{ id: string }> };
const ids = (value: unknown) => Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : undefined;
const date = (value: unknown) => value === null ? null : typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : undefined;
export const GET = withHubApi<Context>(async (_request, context) => { const session = await requireHubPermission("member:access"); const { id } = await context.params; return hubJson({ project: await getProject(prisma, session, id) }); });
export const PATCH = withHubApi<Context>(async (request, context) => {
  const session = await requireHubPermission("member:access"); const { id } = await context.params; const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !Number.isInteger(Number(body.version))) throw new HubApiError("Versão obrigatória.", 400);
  const action = body.action === "archive" || body.action === "reopen" || body.action === "cancel" ? body.action : undefined;
  const project = await updateProject(prisma, session, id, { version: Number(body.version), action, name: typeof body.name === "string" ? body.name : undefined, client: typeof body.client === "string" || body.client === null ? body.client : undefined, description: typeof body.description === "string" || body.description === null ? body.description : undefined, primaryDirectorateId: typeof body.primaryDirectorateId === "string" ? body.primaryDirectorateId : undefined, directorateIds: ids(body.directorateIds), managerId: typeof body.managerId === "string" || body.managerId === null ? body.managerId : undefined, teamMemberIds: ids(body.teamMemberIds), status: typeof body.status === "string" ? body.status : undefined, startDate: date(body.startDate), deadline: date(body.deadline), progress: Number.isInteger(Number(body.progress)) ? Number(body.progress) : undefined, nextDelivery: typeof body.nextDelivery === "string" || body.nextDelivery === null ? body.nextDelivery : undefined });
  return hubJson({ project });
});
