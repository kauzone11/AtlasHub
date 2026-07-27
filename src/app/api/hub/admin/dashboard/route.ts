import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { HUB_ROLE_PERMISSIONS, hasHubPermission } from "@/lib/hub/permissions";

const FINANCIAL_ACTIONS = ["FINANCIAL_RULE_UPDATED", "PROJECT_CREATED", "PROJECT_APPROVED", "PROJECT_CANCELLED", "WALLET_ADJUSTED", "WALLET_TRANSACTION_REVERSED", "REQUEST_CREATED", "REQUEST_APPROVED", "REQUEST_REJECTED", "REQUEST_CANCELLED"];

export const GET = withHubApi(async () => {
  const session = await requireHubPermission("admin:access");
  const fullAudit = hasHubPermission(session.role, "audit:read-full");
  const startOfYear = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const [activeMembers, activeDirectorates, approvedProjects, walletBalance, pending, recentProjects, recentTransactions, recentAudit] = await Promise.all([
    prisma.hubMember.count({ where: { organizationId: session.organizationId, status: "ACTIVE" } }),
    prisma.hubDirectorate.count({ where: { organizationId: session.organizationId, isActive: true } }),
    prisma.hubProject.findMany({ where: { organizationId: session.organizationId, status: "APPROVED", competenceDate: { gte: startOfYear } }, select: { id: true, grossAmountCents: true, approvedMemberPoolCents: true } }),
    prisma.hubWalletAccount.aggregate({ where: { member: { organizationId: session.organizationId } }, _sum: { balanceCents: true } }),
    prisma.hubWalletRequest.aggregate({ where: { member: { organizationId: session.organizationId }, status: "PENDING" }, _sum: { amountCents: true }, _count: true }),
    prisma.hubProject.findMany({ where: { organizationId: session.organizationId, status: "APPROVED" }, select: { id: true, title: true, grossAmountCents: true, competenceDate: true, approvedAt: true }, orderBy: { approvedAt: "desc" }, take: 5 }),
    prisma.hubWalletTransaction.findMany({ where: { account: { member: { organizationId: session.organizationId } }, status: "COMPLETED" }, select: { id: true, type: true, amountCents: true, description: true, createdAt: true, account: { select: { member: { select: { name: true } } } } }, orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.hubAuditLog.findMany({ where: { organizationId: session.organizationId, action: fullAudit ? undefined : { in: FINANCIAL_ACTIONS } }, select: { id: true, action: true, entity: true, entityId: true, createdAt: true, member: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  return hubJson({
    summary: {
      activeMembers,
      activeDirectorates,
      approvedRevenueCents: approvedProjects.reduce((sum, item) => sum + item.grossAmountCents, 0),
      memberAllocationCents: approvedProjects.reduce((sum, item) => sum + (item.approvedMemberPoolCents || 0), 0),
      walletBalancesCents: walletBalance._sum.balanceCents || 0,
      pendingRequestCount: pending._count,
      pendingRequestCents: pending._sum.amountCents || 0,
      projectCount: approvedProjects.length,
    },
    recentProjects,
    recentTransactions,
    recentAudit,
    permissions: HUB_ROLE_PERMISSIONS[session.role],
  });
});
