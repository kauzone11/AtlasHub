import { prisma } from "@/lib/prisma";
import { createHubSession, destroyHubSession, hashHubPassword, requireHubMember, verifyHubPassword } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { validateHubPassword } from "@/lib/hub/security";

export const POST = withHubApi(async (request: Request) => {
  const session = await requireHubMember({ allowPasswordChangeRequired: true });
  const body = await request.json().catch(() => null) as { currentPassword?: unknown; newPassword?: unknown } | null;
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  const policyError = validateHubPassword(newPassword);
  if (policyError) throw new HubApiError(policyError, 422);

  const member = await prisma.hubMember.findFirst({
    where: { id: session.memberId, organizationId: session.organizationId, accountId: session.accountId },
    include: { account: true },
  });
  if (!member?.account) throw new HubApiError("Membro nao encontrado.", 404);
  if (!(await verifyHubPassword(currentPassword, member.account.passwordHash))) throw new HubApiError("Senha atual invalida.", 422);
  if (await verifyHubPassword(newPassword, member.account.passwordHash)) throw new HubApiError("A nova senha deve ser diferente da senha atual.", 422);

  const passwordHash = await hashHubPassword(newPassword);
  const updated = await prisma.$transaction(async (tx) => {
    const account = await tx.hubAccount.update({
      where: { id: member.accountId! },
      data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } },
      select: { id: true, sessionVersion: true },
    });
    await tx.hubMember.updateMany({
      where: { accountId: account.id },
      data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } },
    });
    const current = await tx.hubMember.findUniqueOrThrow({
      where: { id: member.id },
      select: { email: true, role: true, directorateId: true, sessionVersion: true },
    });
    return { account, current };
  }, { isolationLevel: "Serializable" });

  await destroyHubSession();
  await createHubSession({
    accountId: updated.account.id,
    accountSessionVersion: updated.account.sessionVersion,
    memberId: member.id,
    organizationId: member.organizationId,
    organizationSlug: session.organizationSlug,
    email: updated.current.email,
    role: updated.current.role,
    directorateId: updated.current.directorateId,
    mustChangePassword: false,
    sessionVersion: updated.current.sessionVersion,
  });
  return hubJson({ success: true });
});
