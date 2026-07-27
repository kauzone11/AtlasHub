import { prisma } from "@/lib/prisma";
import { requireHubSettingsAccess } from "@/lib/hub/settings-access";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { writeHubAudit } from "@/lib/hub/audit";

type Context = { params: Promise<{ id: string }> };
function normalizeSlug(value: string) { return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

export const GET = withHubApi<Context>(async (_request, context) => {
  const session = await requireHubSettingsAccess();
  const { id } = await context.params;
  const directorate = await prisma.hubDirectorate.findFirst({ where: { id, organizationId: session.organizationId }, include: { _count: { select: { members: true } } } });
  if (!directorate) throw new HubApiError("Diretoria não encontrada.", 404);
  return hubJson({ directorate });
});

export const PATCH = withHubApi<Context>(async (request, context) => {
  const session = await requireHubSettingsAccess();
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) throw new HubApiError("Payload inválido.", 422);
  const current = await prisma.hubDirectorate.findFirst({ where: { id, organizationId: session.organizationId }, include: { _count: { select: { members: true } } } });
  if (!current) throw new HubApiError("Diretoria não encontrada.", 404);
  const data: { name?: string; slug?: string; order?: number; isActive?: boolean } = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new HubApiError("Nome obrigatório.", 422);
    data.name = name;
  }
  if (body.slug !== undefined) {
    const slug = normalizeSlug(String(body.slug));
    if (!slug) throw new HubApiError("Identificador inválido.", 422);
    if (await prisma.hubDirectorate.count({ where: { organizationId: session.organizationId, slug, id: { not: id } } })) throw new HubApiError("Identificador já cadastrado.", 409);
    data.slug = slug;
  }
  if (body.order !== undefined) {
    const order = Number(body.order);
    if (!Number.isSafeInteger(order)) throw new HubApiError("Ordem inválida.", 422);
    data.order = order;
  }
  if (body.isActive !== undefined) {
    if (body.isActive === false && current._count.members > 0 && body.confirmActiveMembers !== true) throw new HubApiError("Confirme a inativação da diretoria com membros vinculados.", 409);
    data.isActive = Boolean(body.isActive);
  }
  const directorate = await prisma.$transaction(async (tx) => {
    const updated = await tx.hubDirectorate.update({ where: { id }, data, include: { _count: { select: { members: true } } } });
    await writeHubAudit(tx, { organizationId: session.organizationId, memberId: session.memberId, action: "DIRECTORATE_UPDATED", entity: "DIRECTORATE", entityId: id, metadata: { before: { name: current.name, order: current.order, isActive: current.isActive }, after: { name: updated.name, order: updated.order, isActive: updated.isActive } } });
    return updated;
  });
  return hubJson({ directorate });
});
