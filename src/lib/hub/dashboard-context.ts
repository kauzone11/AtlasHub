import type { Prisma, PrismaClient } from "@prisma/client";

export const HUB_DASHBOARD_SCOPE_COOKIE = "atlas_hub_dashboard_scope";

export const hubDashboardScopeCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 180,
};

export const legacyHubDashboardScopeCookie = {
  ...hubDashboardScopeCookie,
  path: "/hub",
  maxAge: 0,
};

export async function resolveHubDashboardScope(client: PrismaClient | Prisma.TransactionClient, memberId: string, preference: string | undefined) {
  const member = await client.hubMember.findUnique({ where: { id: memberId }, select: { organizationId: true, directorateId: true, directorate: { select: { id: true, name: true, isActive: true, archivedAt: true } } } });
  const activeDirectorate = member?.directorate && member.directorate.isActive && !member.directorate.archivedAt ? member.directorate : null;
  const explicitPreference = preference === "organization" || preference === "directorate" ? preference : null;
  const scope = explicitPreference === "organization" ? "organization" : activeDirectorate ? "directorate" : "organization";
  return { scope: scope as "organization" | "directorate", preference: explicitPreference, directorateId: activeDirectorate?.id ?? null, directorateName: activeDirectorate?.name ?? null, hasDirectorate: Boolean(activeDirectorate), organizationId: member?.organizationId ?? null };
}
