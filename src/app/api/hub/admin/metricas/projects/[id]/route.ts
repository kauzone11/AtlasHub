import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { writeHubAudit } from "@/lib/hub/audit";
import { allocateCents } from "@/lib/hub/wallet";
import { assertActiveProjectMembers, notifyHubProjectEvent, parseProjectInput, payApprovedProject, reverseApprovedProject } from "@/lib/hub/projects";

type Context = { params: Promise<{ id: string }> };
const projectInclude = {
  responsibleMember: { select: { id: true, name: true, email: true, avatarUrl: true, directorate: { select: { id: true, name: true, slug: true } } } },
  participants: { include: { member: { select: { id: true, name: true, email: true, avatarUrl: true, directorate: { select: { id: true, name: true, slug: true } } } } } },
} as const;

export const GET = withHubApi<Context>(async (_request, context) => {
  const session = await requireHubPermission("projects:manage");
  const { id } = await context.params;
  const project = await prisma.hubProject.findFirst({ where: { id, organizationId: session.organizationId }, include: projectInclude });
  if (!project) throw new HubApiError("Projeto não encontrado.", 404);
  return hubJson({ project });
});

export const PATCH = withHubApi<Context>(async (request, context) => {
  const session = await requireHubPermission("projects:manage");
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) throw new HubApiError("Payload inválido.", 422);
  const current = await prisma.hubProject.findFirst({ where: { id, organizationId: session.organizationId }, include: { participants: true } });
  if (!current) throw new HubApiError("Projeto não encontrado.", 404);

  if (body.action === "cancel" || body.status === "CANCELLED") {
    const reason = String(body.cancelledReason || "").trim();
    if (reason.length < 3 || reason.length > 500) throw new HubApiError("Informe uma justificativa de cancelamento.", 422);
    await prisma.$transaction(async (tx) => {
      if (current.status === "APPROVED") {
        await reverseApprovedProject(tx, { projectId: id, organizationId: session.organizationId, actorId: session.memberId, reason });
      } else if (current.status === "DRAFT") {
        const claimed = await tx.hubProject.updateMany({ where: { id, organizationId: session.organizationId, status: "DRAFT" }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledReason: reason } });
        if (claimed.count !== 1) throw new HubApiError("O projeto já foi alterado.", 409);
        const audit = await writeHubAudit(tx, { organizationId: session.organizationId, memberId: session.memberId, action: "PROJECT_CANCELLED", entity: "PROJECT", entityId: id, metadata: { reason, reversalCount: 0 } });
        await notifyHubProjectEvent(tx, { projectId: id, organizationId: session.organizationId, actorId: session.memberId, eventId: audit.id, type: "PROJECT_CANCELLED" });
      } else throw new HubApiError("O projeto já foi cancelado.", 409);
    }, { isolationLevel: "Serializable" });
  } else {
    if (current.status !== "DRAFT") throw new HubApiError("Projetos aprovados não podem ter valores históricos editados.", 409);
    const fallback = {
      title: current.title,
      description: current.description || "Sem descrição",
      grossAmountCents: current.grossAmountCents,
      competenceDate: current.competenceDate,
      responsibleMemberId: current.responsibleMemberId,
      isCollaborative: current.isCollaborative,
      participants: current.participants.map((item) => ({ memberId: item.memberId, percentage: item.percentage })),
      status: "DRAFT" as const,
      idempotencyKey: current.idempotencyKey,
    };
    const input = parseProjectInput(body, fallback);
    await prisma.$transaction(async (tx) => {
      await assertActiveProjectMembers(tx, session.organizationId, input.participants);
      const claimed = await tx.hubProject.updateMany({
        where: { id, organizationId: session.organizationId, status: "DRAFT" },
        data: { title: input.title, description: input.description, grossAmountCents: input.grossAmountCents, competenceDate: input.competenceDate, responsibleMemberId: input.responsibleMemberId, isCollaborative: input.isCollaborative },
      });
      if (claimed.count !== 1) throw new HubApiError("O projeto foi alterado por outra pessoa.", 409);
      await tx.hubProjectParticipant.deleteMany({ where: { projectId: id } });
      await tx.hubProjectParticipant.createMany({ data: allocateCents(input.grossAmountCents, input.participants).map((item) => ({ projectId: id, ...item })) });
      if (body.action === "approve" || body.status === "APPROVED") await payApprovedProject(tx, { projectId: id, organizationId: session.organizationId, actorId: session.memberId, grossAmountCents: input.grossAmountCents, participants: input.participants });
      else await writeHubAudit(tx, { organizationId: session.organizationId, memberId: session.memberId, action: "PROJECT_UPDATED", entity: "PROJECT", entityId: id });
    }, { isolationLevel: "Serializable" });
  }

  const project = await prisma.hubProject.findUniqueOrThrow({ where: { id }, include: projectInclude });
  return hubJson({ project });
});
