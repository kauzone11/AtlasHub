import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { createProject, listProjects } from "@/lib/hub/project-service";
const ids = (value: unknown) => Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null;

export const GET = withHubApi(async (request) => { const session = await requireHubPermission("member:access"); const query = new URL(request.url).searchParams; return hubJson({ projects: await listProjects(prisma, session, { archived: query.get("archived") === "true", status: query.get("status") || undefined, directorateId: query.get("directorateId") || undefined }) }); });
export const POST = withHubApi(async (request) => {
  const session = await requireHubPermission("member:access"); const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.name !== "string" || typeof body.primaryDirectorateId !== "string") throw new HubApiError("Dados inválidos.", 400);
  const project = await createProject(prisma, session, { name: body.name, client: typeof body.client === "string" ? body.client : null, description: typeof body.description === "string" ? body.description : null, primaryDirectorateId: body.primaryDirectorateId, directorateIds: ids(body.directorateIds), managerId: typeof body.managerId === "string" ? body.managerId : null, teamMemberIds: ids(body.teamMemberIds), status: typeof body.status === "string" ? body.status : undefined, startDate: date(body.startDate), deadline: date(body.deadline), progress: Number.isInteger(Number(body.progress)) ? Number(body.progress) : 0, nextDelivery: typeof body.nextDelivery === "string" ? body.nextDelivery : null }, request.headers.get("idempotency-key") || undefined);
  return hubJson({ project }, { status: 201 });
});
