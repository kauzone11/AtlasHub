import { prisma } from "@/lib/prisma";
import { requireHubMember, requireHubPermission } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { initiativeCapabilities, reviewCapabilities, riskCapabilities, strategicDirectorateScope, strategyCapabilities } from "@/lib/hub/strategy-growth-policy";
import { createKeyResult, createStrategicIndicator, createStrategicInitiative, createStrategicObjective, createStrategicReview, createStrategicRisk, createStrategyCycle } from "@/lib/hub/strategy-growth-service";

const actor = (session: Awaited<ReturnType<typeof requireHubMember>>) => ({ id: session.memberId, organizationId: session.organizationId, role: session.role, directorateId: session.directorateId });
const localDateKey = (date: Date, timezone: string) => { const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; };

export const GET = withHubApi(async () => {
  const session = await requireHubPermission("strategy:access");
  const currentActor = actor(session); const scope = strategicDirectorateScope(currentActor); const today = new Date(`${localDateKey(new Date(), session.organization.timezone)}T00:00:00.000Z`);
  const [cycles, objectives, initiatives, indicators, risks, reviews] = await Promise.all([
    prisma.hubStrategyCycle.findMany({ where: { organizationId: session.organizationId }, orderBy: [{ status: "asc" }, { startsAt: "desc" }], take: 50 }),
    prisma.hubStrategicObjective.findMany({ where: { organizationId: session.organizationId, ...scope }, include: { keyResults: { include: { histories: { orderBy: { createdAt: "desc" }, take: 1 } } } }, orderBy: [{ priority: "desc" }, { dueAt: "asc" }], take: 200 }),
    prisma.hubStrategicInitiative.findMany({ where: { organizationId: session.organizationId, ...scope }, orderBy: { dueAt: "asc" }, take: 200 }),
    prisma.hubStrategicIndicator.findMany({ where: { organizationId: session.organizationId, isActive: true, ...scope }, include: { measurements: { orderBy: { measuredAt: "desc" }, take: 12 } }, orderBy: { name: "asc" }, take: 200 }),
    prisma.hubStrategicRisk.findMany({ where: { organizationId: session.organizationId, ...scope }, include: { histories: { orderBy: { createdAt: "desc" }, take: 3 } }, orderBy: [{ score: "desc" }, { reviewDate: "asc" }], take: 200 }),
    prisma.hubStrategicReview.findMany({ where: { organizationId: session.organizationId }, orderBy: { reviewDate: "desc" }, take: 100 }),
  ]);
  return hubJson({
    cycles, objectives: objectives.map((item) => ({ ...item, capabilities: strategyCapabilities(currentActor, item) })), initiatives: initiatives.map((item) => ({ ...item, capabilities: initiativeCapabilities(currentActor, item) })), indicators: indicators.map((item) => ({ ...item, capabilities: initiativeCapabilities(currentActor, item) })), risks: risks.map((item) => ({ ...item, capabilities: riskCapabilities(currentActor, item) })), reviews: reviews.map((item) => ({ ...item, capabilities: reviewCapabilities(currentActor, item) })),
    dashboard: { activeCycle: cycles.find((item) => item.status === "ACTIVE") || null, objectiveProgress: objectives.length ? Math.round(objectives.reduce((sum, item) => sum + item.progress, 0) / objectives.length) : 0, keyResultsAtRisk: objectives.flatMap((item) => item.keyResults).filter((item) => item.status === "AT_RISK").length, overdueInitiatives: initiatives.filter((item) => item.dueAt && item.dueAt < today && !["COMPLETED", "CANCELLED"].includes(item.status)).length, highScoreRisks: risks.filter((item) => item.score >= 15).length, upcomingReviews: reviews.filter((item) => item.status === "DRAFT" && item.reviewDate >= today).slice(0, 5) },
    capabilities: { canManage: session.permissions.includes("strategy:manage"), canReview: session.permissions.includes("strategy:review"), canReadSensitive: session.permissions.includes("strategy:read-sensitive") },
  });
});

export const POST = withHubApi(async (request) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = String(body?.action || "");
  const session = await requireHubMember();
  const currentActor = actor(session); const input = (body?.input || {}) as Record<string, unknown>;
  const result = action === "cycle" ? await createStrategyCycle(prisma, currentActor, input)
    : action === "objective" ? await createStrategicObjective(prisma, currentActor, input)
      : action === "key-result" ? await createKeyResult(prisma, currentActor, input)
        : action === "initiative" ? await createStrategicInitiative(prisma, currentActor, input)
          : action === "indicator" ? await createStrategicIndicator(prisma, currentActor, input)
            : action === "risk" ? await createStrategicRisk(prisma, currentActor, input)
              : action === "review" ? await createStrategicReview(prisma, currentActor, input)
                : null;
  if (!result) return hubJson({ error: "Acao estrategica invalida." }, { status: 400 });
  return hubJson(result, { status: 201 });
});
