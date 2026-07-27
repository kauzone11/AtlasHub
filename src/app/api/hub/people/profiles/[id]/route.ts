import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { getMemberProfile } from "@/lib/hub/operations-service";
import { handleUpdateManagedProfile } from "@/lib/hub/operations-handlers";

export const GET = withHubApi(async (_request, context: { params: Promise<{ id: string }> }) => { const session = await requireHubPermission("people:access"); const { id } = await context.params; return hubJson(await getMemberProfile(prisma, { id: session.memberId, organizationId: session.organizationId, role: session.role, directorateId: session.directorateId ?? null }, id)); });
export const PATCH = withHubApi(async (request, context: { params: Promise<{ id: string }> }) => { const session = await requireHubPermission("people:manage"); const { id } = await context.params; return hubJson(await handleUpdateManagedProfile(prisma, session, id, await request.json().catch(() => null))); });
