import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { writeHubAudit } from "@/lib/hub/audit";
import { getOrCreateHubFinancialRule, validateHubFinancialRule } from "@/lib/hub/financial-rules";

export const GET = withHubApi(async () => {
  const session = await requireHubPermission("admin:access");
  const rule = await getOrCreateHubFinancialRule(session.organizationId);
  return hubJson({ rule });
});

export const PATCH = withHubApi(async (request: Request) => {
  const session = await requireHubPermission("financial-rules:manage");
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const input = {
    organizationSharePct: Number(body?.organizationSharePct),
    atlasSharePct: Number(body?.atlasSharePct),
    memberSharePct: Number(body?.memberSharePct),
  };
  const validationError = validateHubFinancialRule(input);
  if (validationError) throw new HubApiError(validationError, 422);
  const before = await getOrCreateHubFinancialRule(session.organizationId);
  const rule = await prisma.$transaction(async (tx) => {
    const updated = await tx.hubFinancialRule.update({ where: { organizationId: session.organizationId }, data: input });
    await writeHubAudit(tx, { organizationId: session.organizationId, memberId: session.memberId, action: "FINANCIAL_RULE_UPDATED", entity: "FINANCIAL_RULE", entityId: updated.id, metadata: { before: { organizationSharePct: before.organizationSharePct, atlasSharePct: before.atlasSharePct, memberSharePct: before.memberSharePct }, after: input } });
    return updated;
  });
  return hubJson({ rule });
});
