import { prisma } from "@/lib/prisma";
import { requireHubMember } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { closeStrategicReview, recordIndicatorMeasurement, transitionStrategyCycle, updateKeyResultValue, updateStrategicInitiative, updateStrategicObjective, updateStrategicRisk } from "@/lib/hub/strategy-growth-service";

export const POST = withHubApi(async (request) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = String(body?.action || ""); const id = String(body?.id || ""); const input = (body?.input || {}) as Record<string, unknown>;
  const session = await requireHubMember(); const actor = { id: session.memberId, organizationId: session.organizationId, role: session.role, directorateId: session.directorateId };
  const result = action === "cycle-transition" ? await transitionStrategyCycle(prisma, actor, id, input)
    : action === "objective-update" ? await updateStrategicObjective(prisma, actor, id, input)
      : action === "key-result-value" ? await updateKeyResultValue(prisma, actor, id, input)
        : action === "initiative-update" ? await updateStrategicInitiative(prisma, actor, id, input)
        : action === "indicator-measurement" ? await recordIndicatorMeasurement(prisma, actor, id, input)
          : action === "risk-update" ? await updateStrategicRisk(prisma, actor, id, input)
            : action === "review-close" ? await closeStrategicReview(prisma, actor, id, Number(input.version)) : null;
  return result ? hubJson(result) : hubJson({ error: "Acao estrategica invalida." }, { status: 400 });
});
