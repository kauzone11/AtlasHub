import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { normalizeSearch } from "@/lib/hub/operations-validation";
import { writeHubAudit } from "@/lib/hub/audit";
import type { Prisma } from "@prisma/client";

type Body = Record<string, unknown>;
function requiredName(body: Body) { const name = typeof body.name === "string" ? body.name.trim() : ""; if (!name) throw new HubApiError("Nome obrigatorio.", 400); return name; }

export const GET = withHubApi(async () => {
  const session = await requireHubPermission("finance:access");
  const [categories, costCenters, counterparties, periods] = await Promise.all([
    prisma.hubFinancialCategory.findMany({ where: { organizationId: session.organizationId }, orderBy: { name: "asc" } }),
    prisma.hubCostCenter.findMany({ where: { organizationId: session.organizationId }, orderBy: { name: "asc" } }),
    prisma.hubCounterparty.findMany({ where: { organizationId: session.organizationId }, orderBy: { name: "asc" }, select: { id: true, type: true, name: true, document: true, email: true, phone: true, notes: true, isActive: true } }),
    prisma.hubFinancialPeriod.findMany({ where: { organizationId: session.organizationId }, orderBy: [{ year: "desc" }, { month: "desc" }] }),
  ]);
  return hubJson({ categories, costCenters, counterparties, periods });
});

async function assertCategoryParent(client: Prisma.TransactionClient, organizationId: string, categoryId: string | null, parentId: string | null) {
  if (!parentId) return;
  if (parentId === categoryId) throw new HubApiError("Uma categoria nao pode ser pai de si mesma.", 409);
  const categories = await client.hubFinancialCategory.findMany({ where: { organizationId }, select: { id: true, parentId: true } });
  const parentById = new Map(categories.map((item) => [item.id, item.parentId]));
  if (!parentById.has(parentId)) throw new HubApiError("Categoria pai nao encontrada.", 404);
  let cursor: string | null = parentId; const visited = new Set<string>();
  while (cursor) { if (cursor === categoryId) throw new HubApiError("A hierarquia de categorias formaria um ciclo.", 409); if (visited.has(cursor)) throw new HubApiError("A hierarquia existente contem um ciclo.", 409); visited.add(cursor); cursor = parentById.get(cursor) || null; }
}

export const POST = withHubApi(async (request) => {
  const session = await requireHubPermission("finance:manage"); const body = await request.json().catch(() => null) as Body | null;
  if (!body || typeof body.kind !== "string") throw new HubApiError("Dados invalidos.", 400); const name = requiredName(body);
  const created = await prisma.$transaction(async (tx) => {
    if (body.kind === "category") { const parentId = typeof body.parentId === "string" ? body.parentId : null; await assertCategoryParent(tx, session.organizationId, null, parentId); const item = await tx.hubFinancialCategory.create({ data: { organizationId: session.organizationId, name, normalizedName: normalizeSearch(name), type: String(body.type || "BOTH") as never, parentId } }); await writeHubAudit(tx, { organizationId: session.organizationId, memberId: session.memberId, action: "FINANCIAL_CATEGORY_CREATED", entity: "HubFinancialCategory", entityId: item.id, metadata: { name, type: item.type, parentId } }); return item; }
    if (body.kind === "costCenter") { const directorateId = typeof body.directorateId === "string" ? body.directorateId : null; if (directorateId && !await tx.hubDirectorate.count({ where: { id: directorateId, organizationId: session.organizationId, isActive: true } })) throw new HubApiError("Diretoria nao encontrada.", 404); const code = String(body.code || "").trim(); if (!code) throw new HubApiError("Codigo obrigatorio.", 400); const item = await tx.hubCostCenter.create({ data: { organizationId: session.organizationId, directorateId, name, normalizedName: normalizeSearch(name), code, normalizedCode: normalizeSearch(code) } }); await writeHubAudit(tx, { organizationId: session.organizationId, memberId: session.memberId, action: "COST_CENTER_CREATED", entity: "HubCostCenter", entityId: item.id, metadata: { name, code, directorateId } }); return item; }
    if (body.kind === "counterparty") { const item = await tx.hubCounterparty.create({ data: { organizationId: session.organizationId, name, normalizedName: normalizeSearch(name), type: String(body.type || "OTHER") as never, document: typeof body.document === "string" ? body.document.trim() : null, normalizedDocument: typeof body.document === "string" ? body.document.replace(/\D/g, "") : null, email: typeof body.email === "string" ? body.email.trim() : null, normalizedEmail: typeof body.email === "string" ? body.email.trim().toLowerCase() : null, phone: typeof body.phone === "string" ? body.phone.trim() : null, notes: typeof body.notes === "string" ? body.notes.trim() : null } }); await writeHubAudit(tx, { organizationId: session.organizationId, memberId: session.memberId, action: "COUNTERPARTY_CREATED", entity: "HubCounterparty", entityId: item.id, metadata: { name, type: item.type } }); return item; }
    throw new HubApiError("Tipo de configuracao invalido.", 400);
  }, { isolationLevel: "Serializable" });
  return hubJson(created, { status: 201 });
});

export const PATCH = withHubApi(async (request) => {
  const session = await requireHubPermission("finance:manage"); const body = await request.json().catch(() => null) as Body | null;
  if (!body || typeof body.kind !== "string" || typeof body.id !== "string") throw new HubApiError("Dados invalidos.", 400); const name = requiredName(body);
  const updated = await prisma.$transaction(async (tx) => {
    if (body.kind === "category") { const current = await tx.hubFinancialCategory.findFirst({ where: { id: body.id as string, organizationId: session.organizationId } }); if (!current) throw new HubApiError("Categoria nao encontrada.", 404); const parentId = typeof body.parentId === "string" ? body.parentId : null; await assertCategoryParent(tx, session.organizationId, current.id, parentId); const item = await tx.hubFinancialCategory.update({ where: { id: current.id }, data: { name, normalizedName: normalizeSearch(name), type: String(body.type || current.type) as never, parentId, isActive: body.isActive === undefined ? current.isActive : body.isActive === true } }); await writeHubAudit(tx, { organizationId: session.organizationId, memberId: session.memberId, action: "FINANCIAL_CATEGORY_UPDATED", entity: "HubFinancialCategory", entityId: item.id, metadata: { name, type: item.type, parentId, isActive: item.isActive } }); return item; }
    if (body.kind === "costCenter") { const current = await tx.hubCostCenter.findFirst({ where: { id: body.id as string, organizationId: session.organizationId } }); if (!current) throw new HubApiError("Centro de custo nao encontrado.", 404); const directorateId = typeof body.directorateId === "string" ? body.directorateId : null; if (directorateId && !await tx.hubDirectorate.count({ where: { id: directorateId, organizationId: session.organizationId, isActive: true } })) throw new HubApiError("Diretoria nao encontrada.", 404); const code = String(body.code || current.code).trim(); const item = await tx.hubCostCenter.update({ where: { id: current.id }, data: { name, normalizedName: normalizeSearch(name), code, normalizedCode: normalizeSearch(code), directorateId, isActive: body.isActive === undefined ? current.isActive : body.isActive === true } }); await writeHubAudit(tx, { organizationId: session.organizationId, memberId: session.memberId, action: "COST_CENTER_UPDATED", entity: "HubCostCenter", entityId: item.id, metadata: { name, code, directorateId, isActive: item.isActive } }); return item; }
    if (body.kind === "counterparty") { const current = await tx.hubCounterparty.findFirst({ where: { id: body.id as string, organizationId: session.organizationId } }); if (!current) throw new HubApiError("Contraparte nao encontrada.", 404); const item = await tx.hubCounterparty.update({ where: { id: current.id }, data: { name, normalizedName: normalizeSearch(name), type: String(body.type || current.type) as never, document: typeof body.document === "string" ? body.document.trim() : current.document, normalizedDocument: typeof body.document === "string" ? body.document.replace(/\D/g, "") : current.normalizedDocument, email: typeof body.email === "string" ? body.email.trim() : current.email, normalizedEmail: typeof body.email === "string" ? body.email.trim().toLowerCase() : current.normalizedEmail, phone: typeof body.phone === "string" ? body.phone.trim() : current.phone, notes: typeof body.notes === "string" ? body.notes.trim() : current.notes, isActive: body.isActive === undefined ? current.isActive : body.isActive === true } }); await writeHubAudit(tx, { organizationId: session.organizationId, memberId: session.memberId, action: "COUNTERPARTY_UPDATED", entity: "HubCounterparty", entityId: item.id, metadata: { name, type: item.type, isActive: item.isActive } }); return item; }
    throw new HubApiError("Tipo de configuracao invalido.", 400);
  }, { isolationLevel: "Serializable" });
  return hubJson(updated);
});
