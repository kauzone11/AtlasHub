import { prisma } from "@/lib/prisma";
import { requireHubSettingsAccess } from "@/lib/hub/settings-access";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { writeHubAudit } from "@/lib/hub/audit";

function normalizeSlug(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const GET = withHubApi(async () => {
  const session = await requireHubSettingsAccess();
  const [directorates, participations] = await Promise.all([
    prisma.hubDirectorate.findMany({
      where: { organizationId: session.organizationId },
      include: { _count: { select: { members: true } } },
      orderBy: [{ isActive: "desc" }, { order: "asc" }, { name: "asc" }],
    }),
    prisma.hubProjectParticipant.findMany({
      where: { member: { organizationId: session.organizationId, directorateId: { not: null } } },
      select: { projectId: true, member: { select: { directorateId: true } } },
    }),
  ]);
  const projects = new Map<string, Set<string>>();
  for (const item of participations) if (item.member.directorateId) {
    const set = projects.get(item.member.directorateId) || new Set<string>();
    set.add(item.projectId);
    projects.set(item.member.directorateId, set);
  }
  return hubJson({ directorates: directorates.map((item) => ({ ...item, projectCount: projects.get(item.id)?.size || 0 })) });
});

export const POST = withHubApi(async (request: Request) => {
  const session = await requireHubSettingsAccess();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const slug = normalizeSlug(typeof body?.slug === "string" ? body.slug : name);
  const order = Number.isSafeInteger(Number(body?.order)) ? Number(body?.order) : 99;
  if (!name || !slug) throw new HubApiError("Informe um nome válido.", 422);
  if (await prisma.hubDirectorate.count({ where: { organizationId: session.organizationId, slug } })) throw new HubApiError("Já existe uma diretoria com esse identificador.", 409);
  const directorate = await prisma.$transaction(async (tx) => {
    const created = await tx.hubDirectorate.create({ data: { organizationId: session.organizationId, name, slug, order }, include: { _count: { select: { members: true } } } });
    await writeHubAudit(tx, { organizationId: session.organizationId, memberId: session.memberId, action: "DIRECTORATE_CREATED", entity: "DIRECTORATE", entityId: created.id, metadata: { name, order } });
    return created;
  });
  return hubJson({ directorate }, { status: 201 });
});
