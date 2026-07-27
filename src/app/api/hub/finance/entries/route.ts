import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { handleCreateFinancialEntry } from "@/lib/hub/operations-handlers";

export const GET = withHubApi(async (request) => {
  const session = await requireHubPermission("finance:access");
  const query = new URL(request.url).searchParams;
  const status = query.get("status"); const direction = query.get("direction"); const categoryId = query.get("categoryId"); const costCenterId = query.get("costCenterId");
  const entries = await prisma.hubFinancialEntry.findMany({ where: { organizationId: session.organizationId, ...(status ? { status: status as never } : {}), ...(direction ? { direction: direction as never } : {}), ...(categoryId ? { categoryId } : {}), ...(costCenterId ? { costCenterId } : {}) }, orderBy: [{ competenceDate: "desc" }, { id: "desc" }], take: 200, select: { id: true, direction: true, status: true, description: true, totalCents: true, currency: true, issueDate: true, competenceDate: true, categoryId: true, costCenterId: true, counterpartyId: true } });
  return hubJson({ entries });
});
export const POST = withHubApi(async (request) => { const session = await requireHubPermission("finance:create"); const result = await handleCreateFinancialEntry(prisma, session, await request.json().catch(() => null)); return hubJson(result, { status: 201 }); });
