import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { writeHubAudit } from "@/lib/hub/audit";
import { allocateCents } from "@/lib/hub/wallet";
import { assertActiveProjectMembers, parseProjectInput, payApprovedProject } from "@/lib/hub/projects";

const projectInclude = {
  responsibleMember: { select: { id: true, name: true, email: true, avatarUrl: true, directorate: { select: { id: true, name: true, slug: true } } } },
  participants: { include: { member: { select: { id: true, name: true, email: true, avatarUrl: true, directorate: { select: { id: true, name: true, slug: true } } } } } },
} as const;

export const GET = withHubApi(async () => {
  const session = await requireHubPermission("projects:manage");
  const projects = await prisma.hubProject.findMany({ where: { organizationId: session.organizationId }, include: projectInclude, orderBy: { competenceDate: "desc" } });
  return hubJson({ projects: projects.map((project) => ({ ...project, participantCount: project.participants.length, participantTotalCents: project.participants.reduce((sum, item) => sum + item.amountCents, 0) })) });
});

export const POST = withHubApi(async (request: Request) => {
  const session = await requireHubPermission("projects:manage");
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) throw new HubApiError("Payload inválido.", 422);
  const input = parseProjectInput(body);
  if (input.idempotencyKey && await prisma.hubProject.count({ where: { organizationId: session.organizationId, idempotencyKey: input.idempotencyKey } })) throw new HubApiError("Este projeto já foi registrado.", 409);

  const projectId = await prisma.$transaction(async (tx) => {
    await assertActiveProjectMembers(tx, session.organizationId, input.participants);
    const grossAllocations = allocateCents(input.grossAmountCents, input.participants);
    const project = await tx.hubProject.create({
      data: {
        organizationId: session.organizationId,
        idempotencyKey: input.idempotencyKey,
        title: input.title,
        description: input.description,
        grossAmountCents: input.grossAmountCents,
        competenceDate: input.competenceDate,
        responsibleMemberId: input.responsibleMemberId,
        isCollaborative: input.isCollaborative,
        status: "DRAFT",
        createdById: session.memberId,
        participants: { create: grossAllocations },
      },
    });
    await writeHubAudit(tx, { organizationId: session.organizationId, memberId: session.memberId, action: "PROJECT_CREATED", entity: "PROJECT", entityId: project.id, metadata: { grossAmountCents: input.grossAmountCents, participantCount: input.participants.length } });
    if (input.status === "APPROVED") await payApprovedProject(tx, { projectId: project.id, organizationId: session.organizationId, actorId: session.memberId, grossAmountCents: input.grossAmountCents, participants: input.participants });
    return project.id;
  }, { isolationLevel: "Serializable" });

  const project = await prisma.hubProject.findUniqueOrThrow({ where: { id: projectId }, include: projectInclude });
  return hubJson({ project }, { status: 201 });
});
