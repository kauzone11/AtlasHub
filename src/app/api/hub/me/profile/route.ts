import { prisma } from "@/lib/prisma";
import { requireHubMember } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";

const profileSelect = {
  id: true, email: true, name: true, role: true, status: true, avatarUrl: true,
  directorateId: true, directorate: { select: { id: true, name: true, slug: true } },
  mustChangePassword: true, lastLoginAt: true, createdAt: true,
} as const;

export const GET = withHubApi(async () => {
  const session = await requireHubMember();
  const member = await prisma.hubMember.findFirst({ where: { id: session.memberId, organizationId: session.organizationId }, select: profileSelect });
  if (!member) throw new HubApiError("Membro não encontrado.", 404);
  return hubJson({ member });
});

export const PATCH = withHubApi(async (request: Request) => {
  const session = await requireHubMember();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 120) throw new HubApiError("O nome deve ter entre 2 e 120 caracteres.", 422);
  const member = await prisma.hubMember.update({ where: { id: session.memberId }, data: { name }, select: profileSelect });
  return hubJson({ member });
});
