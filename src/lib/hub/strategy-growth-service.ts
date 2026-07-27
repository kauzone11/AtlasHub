import { Prisma, PrismaClient, type HubKeyResultDirection, type HubOpportunityStatus, type HubStrategyCycleStatus } from "@prisma/client";
import { HubApiError } from "./api";
import { assertMatchingRequestHash, prismaErrorCode, requestHash, serializationConflict } from "./collaboration-idempotency";
import { writeHubAudit } from "./audit";
import { createHubNotifications, notifyHubPermissionRecipients } from "./notifications";
import { hubStrategyGrowthPolicy, type HubStrategicGrowthActor } from "./strategy-growth-policy";
import { hasHubPermission } from "./permissions";
import { requireActiveMember, requireBoard, requireContact, requireDirectorate, requireGrowthOrganization, requireInitiative, requireLead, requireMeeting, requireObjective, requireOpportunity, requireProject, requireReplacementActivity, requireStage, requireTask } from "./strategy-growth-guards";
import { boundedInteger, decimalNumber, enumValue, nonNegativeCents, optionalText, organizationDate, organizationDateTime, publicHttpsUrl, requiredText } from "./strategy-growth-validation";

type Tx = Prisma.TransactionClient;
const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;

export async function strategicGrowthTransaction<T>(prisma: PrismaClient, action: (tx: Tx) => Promise<T>) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try { return await prisma.$transaction(action, SERIALIZABLE); }
    catch (error) {
      if (!["P2034", "40001", "40P01"].includes(prismaErrorCode(error))) throw error;
      if (attempt === 5) throw serializationConflict();
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
  throw serializationConflict();
}

const OBJECTIVE_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const OBJECTIVE_STATUSES = ["DRAFT", "ACTIVE", "AT_RISK", "COMPLETED", "CANCELLED"] as const;
const KEY_RESULT_DIRECTIONS = ["INCREASE", "DECREASE", "MAINTAIN"] as const;
const INITIATIVE_STATUSES = ["PLANNED", "ACTIVE", "BLOCKED", "COMPLETED", "CANCELLED"] as const;
const INDICATOR_FREQUENCIES = ["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL", "MANUAL"] as const;
const RISK_STATUSES = ["OPEN", "MONITORING", "MITIGATED", "ACCEPTED", "CLOSED"] as const;
const GROWTH_ORGANIZATION_STATUSES = ["PROSPECT", "CUSTOMER", "PARTNER", "INACTIVE"] as const;
const LEAD_SOURCES = ["REFERRAL", "SOCIAL", "EVENT", "OUTBOUND", "INBOUND", "PARTNERSHIP", "OTHER"] as const;
const LEAD_STATUSES = ["NEW", "QUALIFYING", "QUALIFIED", "DISQUALIFIED", "CONVERTED"] as const;
const ACTIVITY_TYPES = ["NOTE", "CALL", "MEETING", "EMAIL", "TASK", "FOLLOW_UP"] as const;
const PARTNERSHIP_STATUSES = ["PROPOSED", "ACTIVE", "PAUSED", "ENDED", "CANCELLED"] as const;
const PARTNERSHIP_TRANSITIONS: Record<(typeof PARTNERSHIP_STATUSES)[number], Array<(typeof PARTNERSHIP_STATUSES)[number]>> = {
  PROPOSED: ["ACTIVE", "CANCELLED"], ACTIVE: ["PAUSED", "ENDED", "CANCELLED"], PAUSED: ["ACTIVE", "ENDED", "CANCELLED"], ENDED: [], CANCELLED: [],
};

function localDateKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function openCycle(tx: Tx, organizationId: string, cycleId: string) {
  const cycle = await tx.hubStrategyCycle.findFirst({ where: { id: cycleId, organizationId } });
  if (!cycle) throw new HubApiError("Ciclo estrategico nao encontrado.", 404);
  if (cycle.status === "ARCHIVED") throw new HubApiError("Ciclos arquivados sao imutaveis.", 409);
  return cycle;
}

export function keyResultProgress(direction: HubKeyResultDirection, start: number, target: number, current: number) {
  if (![start, target, current].every(Number.isFinite)) throw new HubApiError("Valores do resultado-chave sao invalidos.", 400);
  if (direction === "MAINTAIN") {
    const tolerance = Math.max(Math.abs(target) * 0.05, 0.000001);
    return Math.max(0, Math.min(100, 100 - (Math.abs(current - target) / tolerance) * 100));
  }
  const span = target - start;
  if (span === 0) return current === target ? 100 : 0;
  const raw = ((current - start) / span) * 100;
  return Math.max(0, Math.min(100, raw));
}

export function riskScore(probability: unknown, impact: unknown) {
  return boundedInteger(probability, "Probabilidade", 1, 5) * boundedInteger(impact, "Impacto", 1, 5);
}

export async function createStrategyCycle(prisma: PrismaClient, actor: HubStrategicGrowthActor, input: Record<string, unknown>) {
  if (!hasHubPermission(actor.role, "strategy:manage")) throw new HubApiError("Acesso negado.", 403);
  const name = requiredText(input.name, "Nome", 160);
  const startsAt = organizationDate(input.startsAt, "Data inicial");
  const endsAt = organizationDate(input.endsAt, "Data final");
  if (startsAt >= endsAt) throw new HubApiError("A data final deve ser posterior a inicial.", 400);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const cycle = await tx.hubStrategyCycle.create({ data: { organizationId: actor.organizationId, name, description: optionalText(input.description), startsAt, endsAt, createdById: actor.id } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "STRATEGY_CYCLE_CREATED", entity: "HubStrategyCycle", entityId: cycle.id });
    return cycle;
  });
}

const allowedCycleTransitions: Record<HubStrategyCycleStatus, HubStrategyCycleStatus[]> = {
  DRAFT: ["ACTIVE", "ARCHIVED"], ACTIVE: ["CLOSED"], CLOSED: ["ARCHIVED"], ARCHIVED: [],
};

export async function transitionStrategyCycle(prisma: PrismaClient, actor: HubStrategicGrowthActor, cycleId: string, input: Record<string, unknown>) {
  if (!hasHubPermission(actor.role, "strategy:manage")) throw new HubApiError("Acesso negado.", 403);
  const status = enumValue(input.status, "Status do ciclo", ["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"] as const) as HubStrategyCycleStatus;
  const version = boundedInteger(input.version, "Versao", 1, Number.MAX_SAFE_INTEGER);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const cycle = await openCycle(tx, actor.organizationId, cycleId);
    if (cycle.version !== version) throw serializationConflict();
    if (!allowedCycleTransitions[cycle.status].includes(status)) throw new HubApiError("Transicao de ciclo invalida.", 409);
    if (status === "ACTIVE" && !cycle.allowOverlap) {
      const overlap = await tx.hubStrategyCycle.findFirst({ where: { organizationId: actor.organizationId, id: { not: cycle.id }, status: "ACTIVE", startsAt: { lte: cycle.endsAt }, endsAt: { gte: cycle.startsAt } }, select: { id: true } });
      if (overlap) throw new HubApiError("Ja existe um ciclo ativo com datas sobrepostas.", 409, { code: "ACTIVE_CYCLE_OVERLAP" });
    }
    const updated = await tx.hubStrategyCycle.update({ where: { id: cycle.id }, data: { status, version: { increment: 1 }, closedAt: status === "CLOSED" ? new Date() : cycle.closedAt, archivedAt: status === "ARCHIVED" ? new Date() : cycle.archivedAt } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: `STRATEGY_CYCLE_${status}`, entity: "HubStrategyCycle", entityId: cycle.id, metadata: { from: cycle.status, to: status } });
    return updated;
  });
}

export async function createStrategicObjective(prisma: PrismaClient, actor: HubStrategicGrowthActor, input: Record<string, unknown>) {
  const priority = enumValue(input.priority ?? "MEDIUM", "Prioridade", OBJECTIVE_PRIORITIES);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const cycle = await openCycle(tx, actor.organizationId, requiredText(input.cycleId, "Ciclo", 64));
    if (cycle.status === "CLOSED") throw new HubApiError("Ciclos encerrados preservam o historico e nao recebem novos objetivos.", 409);
    const owner = await requireActiveMember(tx, actor.organizationId, typeof input.ownerMemberId === "string" ? input.ownerMemberId : null);
    const directorateId = typeof input.directorateId === "string" ? input.directorateId : owner?.directorateId || null;
    await requireDirectorate(tx, actor.organizationId, directorateId);
    const draft = { organizationId: actor.organizationId, directorateId, ownerMemberId: owner?.id || null };
    if (!hubStrategyGrowthPolicy.canManageObjective(actor, draft)) throw new HubApiError("Acesso negado.", 403);
    const objective = await tx.hubStrategicObjective.create({ data: {
      organizationId: actor.organizationId, cycleId: cycle.id, directorateId, title: requiredText(input.title, "Titulo", 200), description: optionalText(input.description),
      ownerMemberId: owner?.id || null, priority, progress: boundedInteger(input.progress ?? 0, "Progresso", 0, 100),
      startsAt: organizationDate(input.startsAt, "Inicio", true), dueAt: organizationDate(input.dueAt, "Prazo", true),
    } });
    if (objective.ownerMemberId && objective.ownerMemberId !== actor.id) await createHubNotifications(tx, [{ organizationId: actor.organizationId, recipientMemberId: objective.ownerMemberId, actorMemberId: actor.id, type: "STRATEGY_OBJECTIVE_ASSIGNED", title: "Objetivo estrategico atribuido", body: "Voce recebeu a responsabilidade por um objetivo estrategico.", href: `/hub/estrategia/objetivos?id=${objective.id}`, entityType: "STRATEGIC_OBJECTIVE", entityId: objective.id, idempotencyKey: `objective:${objective.id}:assigned:${objective.ownerMemberId}` }]);
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "STRATEGIC_OBJECTIVE_CREATED", entity: "HubStrategicObjective", entityId: objective.id, metadata: { directorateId } });
    return objective;
  });
}

export async function updateStrategicObjective(prisma: PrismaClient, actor: HubStrategicGrowthActor, objectiveId: string, input: Record<string, unknown>) {
  const version = boundedInteger(input.version, "Versao", 1, Number.MAX_SAFE_INTEGER);
  const requestedStatus = input.status === undefined ? null : enumValue(input.status, "Status do objetivo", OBJECTIVE_STATUSES);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const objective = await tx.hubStrategicObjective.findFirst({ where: { id: objectiveId, organizationId: actor.organizationId } });
    if (!objective) throw new HubApiError("Objetivo nao encontrado.", 404);
    const cycle = await openCycle(tx, actor.organizationId, objective.cycleId);
    if (cycle.status === "CLOSED") throw new HubApiError("Objetivos de ciclos encerrados sao somente leitura.", 409);
    if (!hubStrategyGrowthPolicy.canManageObjective(actor, objective) && !(objective.ownerMemberId === actor.id && hubStrategyGrowthPolicy.canUpdateKeyResult(actor, objective))) throw new HubApiError("Acesso negado.", 403);
    if (objective.version !== version) throw serializationConflict();
    const status = requestedStatus || objective.status;
    const progress = input.progress == null ? objective.progress : boundedInteger(input.progress, "Progresso", 0, 100);
    const updated = await tx.hubStrategicObjective.update({ where: { id: objective.id }, data: { status, progress, completedAt: status === "COMPLETED" ? objective.completedAt || new Date() : null, version: { increment: 1 } } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: objective.status === "COMPLETED" && status !== "COMPLETED" ? "STRATEGIC_OBJECTIVE_REOPENED" : "STRATEGIC_OBJECTIVE_UPDATED", entity: "HubStrategicObjective", entityId: objective.id, metadata: { fromStatus: objective.status, toStatus: status, progress } });
    return updated;
  });
}

export async function createKeyResult(prisma: PrismaClient, actor: HubStrategicGrowthActor, input: Record<string, unknown>) {
  const direction = enumValue(input.direction, "Direcao", KEY_RESULT_DIRECTIONS) as HubKeyResultDirection;
  return strategicGrowthTransaction(prisma, async (tx) => {
    const objective = await tx.hubStrategicObjective.findFirst({ where: { id: requiredText(input.objectiveId, "Objetivo", 64), organizationId: actor.organizationId }, include: { keyResults: { select: { weight: true } }, cycle: { select: { status: true } } } });
    if (!objective) throw new HubApiError("Objetivo nao encontrado.", 404);
    if (objective.cycle.status !== "ACTIVE" && objective.cycle.status !== "DRAFT") throw new HubApiError("O ciclo nao aceita alteracoes.", 409);
    if (!hubStrategyGrowthPolicy.canManageObjective(actor, objective)) throw new HubApiError("Acesso negado.", 403);
    const owner = await requireActiveMember(tx, actor.organizationId, typeof input.ownerMemberId === "string" ? input.ownerMemberId : objective.ownerMemberId);
    const weight = decimalNumber(input.weight, "Peso");
    const total = objective.keyResults.reduce((sum, item) => sum + Number(item.weight), 0) + weight;
    if (weight <= 0 || total > 100.000001) throw new HubApiError("A soma dos pesos do objetivo deve ficar entre 0 e 100.", 400);
    const keyResult = await tx.hubKeyResult.create({ data: { organizationId: actor.organizationId, objectiveId: objective.id, title: requiredText(input.title, "Titulo", 200), ownerMemberId: owner?.id || null, unit: requiredText(input.unit, "Unidade", 40), startValue: decimalNumber(input.startValue, "Valor inicial"), targetValue: decimalNumber(input.targetValue, "Meta"), currentValue: decimalNumber(input.currentValue ?? input.startValue, "Valor atual"), direction, weight } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "KEY_RESULT_CREATED", entity: "HubKeyResult", entityId: keyResult.id, metadata: { objectiveId: objective.id, weight } });
    return keyResult;
  });
}

export async function updateKeyResultValue(prisma: PrismaClient, actor: HubStrategicGrowthActor, keyResultId: string, input: Record<string, unknown>) {
  const version = boundedInteger(input.version, "Versao", 1, Number.MAX_SAFE_INTEGER);
  const value = decimalNumber(input.value, "Valor");
  return strategicGrowthTransaction(prisma, async (tx) => {
    const keyResult = await tx.hubKeyResult.findFirst({ where: { id: keyResultId, organizationId: actor.organizationId }, include: { objective: { include: { cycle: { select: { status: true } } } } } });
    if (!keyResult) throw new HubApiError("Resultado-chave nao encontrado.", 404);
    if (keyResult.objective.cycle.status === "ARCHIVED" || keyResult.objective.cycle.status === "CLOSED") throw new HubApiError("O ciclo nao aceita alteracoes.", 409);
    if (!hubStrategyGrowthPolicy.canUpdateKeyResult(actor, keyResult.objective, keyResult.ownerMemberId)) throw new HubApiError("Acesso negado.", 403);
    if (keyResult.version !== version) throw serializationConflict();
    const progress = keyResultProgress(keyResult.direction, Number(keyResult.startValue), Number(keyResult.targetValue), value);
    await tx.hubKeyResultHistory.create({ data: { organizationId: actor.organizationId, keyResultId: keyResult.id, previousValue: keyResult.currentValue, value, progress, notes: optionalText(input.notes, 1000), recordedById: actor.id } });
    const updated = await tx.hubKeyResult.update({ where: { id: keyResult.id }, data: { currentValue: value, status: progress >= 100 ? "COMPLETED" : progress < 60 ? "AT_RISK" : "ACTIVE", version: { increment: 1 } } });
    const results = await tx.hubKeyResult.findMany({ where: { objectiveId: keyResult.objectiveId }, select: { startValue: true, targetValue: true, currentValue: true, direction: true, weight: true } });
    const weightTotal = results.reduce((sum, result) => sum + Number(result.weight), 0);
    const objectiveProgress = weightTotal ? Math.round(results.reduce((sum, result) => sum + keyResultProgress(result.direction, Number(result.startValue), Number(result.targetValue), Number(result.currentValue)) * Number(result.weight), 0) / weightTotal) : 0;
    await tx.hubStrategicObjective.update({ where: { id: keyResult.objectiveId }, data: { progress: objectiveProgress, version: { increment: 1 } } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "KEY_RESULT_VALUE_UPDATED", entity: "HubKeyResult", entityId: keyResult.id, metadata: { progress: Number(progress.toFixed(2)) } });
    return { ...updated, progress };
  });
}

export async function recordIndicatorMeasurement(prisma: PrismaClient, actor: HubStrategicGrowthActor, indicatorId: string, input: Record<string, unknown>) {
  const idempotencyKey = requiredText(input.idempotencyKey, "Chave de idempotencia", 120);
  const hash = requestHash(input);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const duplicate = await tx.hubIndicatorMeasurement.findUnique({ where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey } } });
    if (duplicate) { assertMatchingRequestHash(duplicate.requestHash, hash); return duplicate; }
    const indicator = await tx.hubStrategicIndicator.findFirst({ where: { id: indicatorId, organizationId: actor.organizationId, isActive: true } });
    if (!indicator) throw new HubApiError("Indicador nao encontrado.", 404);
    if (!(hubStrategyGrowthPolicy.canManageInitiative(actor, indicator))) throw new HubApiError("Acesso negado.", 403);
    const organization = await tx.hubOrganization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
    const measuredAt = organizationDateTime(input.measuredAt, "Data da medicao", organization.timezone);
    const periodKey = new Intl.DateTimeFormat("en-CA", { timeZone: organization.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(measuredAt);
    const measurement = await tx.hubIndicatorMeasurement.create({ data: { organizationId: actor.organizationId, indicatorId: indicator.id, measuredAt, periodKey, value: decimalNumber(input.value, "Valor"), notes: optionalText(input.notes, 1000), recordedById: actor.id, idempotencyKey, requestHash: hash } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "INDICATOR_MEASUREMENT_RECORDED", entity: "HubIndicatorMeasurement", entityId: measurement.id, metadata: { indicatorId, periodKey } });
    return measurement;
  });
}

export async function createStrategicIndicator(prisma: PrismaClient, actor: HubStrategicGrowthActor, input: Record<string, unknown>) {
  const direction = enumValue(input.direction ?? "INCREASE", "Direcao", KEY_RESULT_DIRECTIONS) as HubKeyResultDirection;
  const frequency = enumValue(input.frequency ?? "MONTHLY", "Frequencia", INDICATOR_FREQUENCIES);
  const draft = { organizationId: actor.organizationId, directorateId: typeof input.directorateId === "string" ? input.directorateId : actor.directorateId || null, ownerMemberId: typeof input.ownerMemberId === "string" ? input.ownerMemberId : actor.id };
  if (!hubStrategyGrowthPolicy.canManageInitiative(actor, draft)) throw new HubApiError("Acesso negado.", 403);
  return strategicGrowthTransaction(prisma, async (tx) => {
    await requireActiveMember(tx, actor.organizationId, draft.ownerMemberId);
    await requireDirectorate(tx, actor.organizationId, draft.directorateId);
    return tx.hubStrategicIndicator.create({ data: { organizationId: actor.organizationId, name: requiredText(input.name, "Nome", 160), description: optionalText(input.description), unit: requiredText(input.unit, "Unidade", 40), direction, frequency, ownerMemberId: draft.ownerMemberId, directorateId: draft.directorateId, targetValue: decimalNumber(input.targetValue, "Meta") } });
  });
}

export async function createStrategicInitiative(prisma: PrismaClient, actor: HubStrategicGrowthActor, input: Record<string, unknown>) {
  const status = enumValue(input.status ?? "PLANNED", "Status da iniciativa", INITIATIVE_STATUSES);
  const draft = { organizationId: actor.organizationId, directorateId: typeof input.directorateId === "string" ? input.directorateId : actor.directorateId || null, ownerMemberId: typeof input.ownerMemberId === "string" ? input.ownerMemberId : actor.id };
  if (!hubStrategyGrowthPolicy.canManageInitiative(actor, draft)) throw new HubApiError("Acesso negado.", 403);
  return strategicGrowthTransaction(prisma, async (tx) => {
    await Promise.all([requireObjective(tx, actor.organizationId, typeof input.objectiveId === "string" ? input.objectiveId : null), requireBoard(tx, actor.organizationId, typeof input.boardId === "string" ? input.boardId : null), requireProject(tx, actor.organizationId, typeof input.projectId === "string" ? input.projectId : null), typeof input.opportunityId === "string" ? requireOpportunity(tx, actor.organizationId, input.opportunityId) : null, requireActiveMember(tx, actor.organizationId, draft.ownerMemberId), requireDirectorate(tx, actor.organizationId, draft.directorateId)]);
    return tx.hubStrategicInitiative.create({ data: { organizationId: actor.organizationId, objectiveId: typeof input.objectiveId === "string" ? input.objectiveId : null, boardId: typeof input.boardId === "string" ? input.boardId : null, projectId: typeof input.projectId === "string" ? input.projectId : null, opportunityId: typeof input.opportunityId === "string" ? input.opportunityId : null, title: requiredText(input.title, "Titulo", 200), description: optionalText(input.description), ownerMemberId: draft.ownerMemberId, directorateId: draft.directorateId, status, startsAt: organizationDate(input.startsAt, "Inicio", true), dueAt: organizationDate(input.dueAt, "Prazo", true), progress: boundedInteger(input.progress ?? 0, "Progresso", 0, 100) } });
  });
}

export async function updateStrategicInitiative(prisma: PrismaClient, actor: HubStrategicGrowthActor, initiativeId: string, input: Record<string, unknown>) {
  const version = boundedInteger(input.version, "Versao", 1, Number.MAX_SAFE_INTEGER);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const initiative = await tx.hubStrategicInitiative.findFirst({ where: { id: initiativeId, organizationId: actor.organizationId } });
    if (!initiative) throw new HubApiError("Iniciativa nao encontrada.", 404);
    if (!hubStrategyGrowthPolicy.canManageInitiative(actor, initiative)) throw new HubApiError("Acesso negado.", 403);
    if (initiative.version !== version) throw serializationConflict();
    const objectiveId = input.objectiveId === null ? null : typeof input.objectiveId === "string" ? input.objectiveId : initiative.objectiveId;
    const ownerMemberId = input.ownerMemberId === null ? null : typeof input.ownerMemberId === "string" ? input.ownerMemberId : initiative.ownerMemberId;
    const directorateId = input.directorateId === null ? null : typeof input.directorateId === "string" ? input.directorateId : initiative.directorateId;
    await Promise.all([requireObjective(tx, actor.organizationId, objectiveId), requireActiveMember(tx, actor.organizationId, ownerMemberId), requireDirectorate(tx, actor.organizationId, directorateId)]);
    const status = input.status === undefined ? initiative.status : enumValue(input.status, "Status da iniciativa", INITIATIVE_STATUSES);
    const progress = input.progress === undefined ? initiative.progress : boundedInteger(input.progress, "Progresso", 0, 100);
    const updated = await tx.hubStrategicInitiative.update({ where: { id: initiative.id }, data: { objectiveId, ownerMemberId, directorateId, status, progress, startsAt: input.startsAt === undefined ? initiative.startsAt : organizationDate(input.startsAt, "Inicio", true), dueAt: input.dueAt === undefined ? initiative.dueAt : organizationDate(input.dueAt, "Prazo", true), version: { increment: 1 } } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "STRATEGIC_INITIATIVE_UPDATED", entity: "HubStrategicInitiative", entityId: initiative.id, metadata: { status, progress } });
    return updated;
  });
}

export async function createStrategicRisk(prisma: PrismaClient, actor: HubStrategicGrowthActor, input: Record<string, unknown>) {
  const cycleId = requiredText(input.cycleId, "Ciclo", 64);
  const status = enumValue(input.status ?? "OPEN", "Status do risco", RISK_STATUSES);
  const draft = { organizationId: actor.organizationId, directorateId: typeof input.directorateId === "string" ? input.directorateId : actor.directorateId || null, ownerMemberId: typeof input.ownerMemberId === "string" ? input.ownerMemberId : actor.id };
  if (!hubStrategyGrowthPolicy.canManageRisk(actor, draft)) throw new HubApiError("Acesso negado.", 403);
  return strategicGrowthTransaction(prisma, async (tx) => { await openCycle(tx, actor.organizationId, cycleId); await Promise.all([requireObjective(tx, actor.organizationId, typeof input.objectiveId === "string" ? input.objectiveId : null), requireActiveMember(tx, actor.organizationId, draft.ownerMemberId), requireDirectorate(tx, actor.organizationId, draft.directorateId)]); const probability = boundedInteger(input.probability, "Probabilidade", 1, 5); const impact = boundedInteger(input.impact, "Impacto", 1, 5); const risk = await tx.hubStrategicRisk.create({ data: { organizationId: actor.organizationId, cycleId, objectiveId: typeof input.objectiveId === "string" ? input.objectiveId : null, directorateId: draft.directorateId, title: requiredText(input.title, "Titulo", 200), description: optionalText(input.description), category: requiredText(input.category, "Categoria", 100), probability, impact, score: riskScore(probability, impact), ownerMemberId: draft.ownerMemberId, status, mitigation: optionalText(input.mitigation), reviewDate: organizationDate(input.reviewDate, "Data de revisao", true) } }); await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "STRATEGIC_RISK_CREATED", entity: "HubStrategicRisk", entityId: risk.id, metadata: { probability, impact, score: risk.score } }); return risk; });
}

export async function createStrategicReview(prisma: PrismaClient, actor: HubStrategicGrowthActor, input: Record<string, unknown>) {
  if (!hubStrategyGrowthPolicy.canManageReview(actor, { organizationId: actor.organizationId })) throw new HubApiError("Acesso negado.", 403);
  return strategicGrowthTransaction(prisma, async (tx) => { const cycle = await openCycle(tx, actor.organizationId, requiredText(input.cycleId, "Ciclo", 64)); await requireMeeting(tx, actor.organizationId, typeof input.meetingId === "string" ? input.meetingId : null); const participants = Array.isArray(input.participantMemberIds) ? [...new Set(input.participantMemberIds.map(String))] : []; for (const memberId of participants) await requireActiveMember(tx, actor.organizationId, memberId); const review = await tx.hubStrategicReview.create({ data: { organizationId: actor.organizationId, cycleId: cycle.id, meetingId: typeof input.meetingId === "string" ? input.meetingId : null, reviewDate: organizationDate(input.reviewDate, "Data da revisao"), participantMemberIds: participants, summary: optionalText(input.summary), decisions: (input.decisions || undefined) as Prisma.InputJsonValue | undefined, nextActions: (input.nextActions || undefined) as Prisma.InputJsonValue | undefined, createdById: actor.id } }); await notifyHubPermissionRecipients(tx, { organizationId: actor.organizationId, actorMemberId: actor.id, excludeActor: true, permission: "strategy:access", type: "STRATEGIC_REVIEW_SCHEDULED", title: "Revisao estrategica agendada", body: "Uma revisao estrategica foi agendada.", href: `/hub/estrategia/revisoes?id=${review.id}`, entityType: "STRATEGIC_REVIEW", entityId: review.id, idempotencyKey: `strategic-review:${review.id}:scheduled` }); return review; });
}

export async function updateStrategicRisk(prisma: PrismaClient, actor: HubStrategicGrowthActor, riskId: string, input: Record<string, unknown>) {
  const version = boundedInteger(input.version, "Versao", 1, Number.MAX_SAFE_INTEGER);
  const requestedStatus = input.status === undefined ? null : enumValue(input.status, "Status do risco", RISK_STATUSES);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const risk = await tx.hubStrategicRisk.findFirst({ where: { id: riskId, organizationId: actor.organizationId } });
    if (!risk) throw new HubApiError("Risco nao encontrado.", 404);
    await openCycle(tx, actor.organizationId, risk.cycleId);
    if (!hubStrategyGrowthPolicy.canManageRisk(actor, risk)) throw new HubApiError("Acesso negado.", 403);
    if (risk.version !== version) throw serializationConflict();
    const probability = input.probability == null ? risk.probability : boundedInteger(input.probability, "Probabilidade", 1, 5);
    const impact = input.impact == null ? risk.impact : boundedInteger(input.impact, "Impacto", 1, 5);
    const status = requestedStatus || risk.status;
    const mitigation = input.mitigation === undefined ? risk.mitigation : optionalText(input.mitigation);
    const score = riskScore(probability, impact);
    await tx.hubStrategicRiskHistory.create({ data: { organizationId: actor.organizationId, riskId: risk.id, status, probability, impact, score, mitigation, changedById: actor.id } });
    const updated = await tx.hubStrategicRisk.update({ where: { id: risk.id }, data: { probability, impact, score, status, mitigation, reviewDate: input.reviewDate === undefined ? risk.reviewDate : organizationDate(input.reviewDate, "Data de revisao", true), version: { increment: 1 } } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "STRATEGIC_RISK_UPDATED", entity: "HubStrategicRisk", entityId: risk.id, metadata: { status, probability, impact, score } });
    return updated;
  });
}

export async function closeStrategicReview(prisma: PrismaClient, actor: HubStrategicGrowthActor, reviewId: string, version: number) {
  return strategicGrowthTransaction(prisma, async (tx) => {
    const review = await tx.hubStrategicReview.findFirst({ where: { id: reviewId, organizationId: actor.organizationId } });
    if (!review) throw new HubApiError("Revisao estrategica nao encontrada.", 404);
    if (!hubStrategyGrowthPolicy.canManageReview(actor, review)) throw new HubApiError("Acesso negado.", 403);
    if (review.status === "CLOSED") return review;
    if (review.version !== version) throw serializationConflict();
    const [objectives, indicators, risks] = await Promise.all([
      tx.hubStrategicObjective.findMany({ where: { organizationId: actor.organizationId, cycleId: review.cycleId }, select: { id: true, title: true, status: true, progress: true, version: true } }),
      tx.hubStrategicIndicator.findMany({ where: { organizationId: actor.organizationId, isActive: true }, select: { id: true, name: true, targetValue: true, measurements: { orderBy: { measuredAt: "desc" }, take: 1, select: { value: true, measuredAt: true } } } }),
      tx.hubStrategicRisk.findMany({ where: { organizationId: actor.organizationId, cycleId: review.cycleId }, select: { id: true, title: true, status: true, score: true } }),
    ]);
    const updated = await tx.hubStrategicReview.update({ where: { id: review.id }, data: { status: "CLOSED", closedAt: new Date(), closedById: actor.id, objectiveSnapshots: objectives as unknown as Prisma.InputJsonValue, indicatorSnapshots: indicators.map((item) => ({ ...item, targetValue: item.targetValue.toString(), measurements: item.measurements.map((measurement) => ({ ...measurement, value: measurement.value.toString() })) })) as unknown as Prisma.InputJsonValue, riskSummary: risks as unknown as Prisma.InputJsonValue, version: { increment: 1 } } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "STRATEGIC_REVIEW_CLOSED", entity: "HubStrategicReview", entityId: review.id, metadata: { objectiveCount: objectives.length, indicatorCount: indicators.length, riskCount: risks.length } });
    return updated;
  });
}

export async function createGrowthOrganization(prisma: PrismaClient, actor: HubStrategicGrowthActor, input: Record<string, unknown>) {
  if (!hasHubPermission(actor.role, "growth:create")) throw new HubApiError("Acesso negado.", 403);
  const name = requiredText(input.name, "Nome", 180);
  const status = enumValue(input.status ?? "PROSPECT", "Status da organizacao", GROWTH_ORGANIZATION_STATUSES);
  return strategicGrowthTransaction(prisma, async (tx) => tx.hubGrowthOrganization.create({ data: { organizationId: actor.organizationId, name, normalizedName: name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " "), document: optionalText(input.document, 40), website: publicHttpsUrl(input.website, "Site"), industry: optionalText(input.industry, 120), city: optionalText(input.city, 120), state: optionalText(input.state, 80), country: optionalText(input.country, 2) || "BR", notes: optionalText(input.notes), status } }));
}

export async function createGrowthContact(prisma: PrismaClient, actor: HubStrategicGrowthActor, input: Record<string, unknown>) {
  if (!hasHubPermission(actor.role, "growth:create")) throw new HubApiError("Acesso negado.", 403);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const growthOrganization = await requireGrowthOrganization(tx, actor.organizationId, requiredText(input.growthOrganizationId, "Organizacao externa", 64));
    const email = optionalText(input.email, 320)?.toLowerCase() || null;
    return tx.hubGrowthContact.create({ data: { organizationId: actor.organizationId, growthOrganizationId: growthOrganization!.id, name: requiredText(input.name, "Nome", 180), role: optionalText(input.role, 120), email, normalizedEmail: email, phone: optionalText(input.phone, 40), linkedinUrl: publicHttpsUrl(input.linkedinUrl, "LinkedIn"), isPrimary: Boolean(input.isPrimary), notes: optionalText(input.notes) } });
  });
}

export async function listGrowthOrganizations(prisma: PrismaClient, actor: HubStrategicGrowthActor) {
  const canReadSensitive = hubStrategyGrowthPolicy.canReadSensitiveContact(actor, { organizationId: actor.organizationId });
  return prisma.hubGrowthOrganization.findMany({ where: { organizationId: actor.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, industry: true, city: true, state: true, status: true, ...(canReadSensitive ? { document: true, website: true, notes: true, contacts: { where: { isActive: true }, select: { id: true, name: true, role: true, email: true, phone: true, linkedinUrl: true, isPrimary: true } } } : {}) } });
}

export async function createLead(prisma: PrismaClient, actor: HubStrategicGrowthActor, input: Record<string, unknown>) {
  const idempotencyKey = requiredText(input.idempotencyKey, "Chave de idempotencia", 120); const hash = requestHash(input);
  const source = enumValue(input.source ?? "OTHER", "Origem do lead", LEAD_SOURCES);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const duplicate = await tx.hubLead.findUnique({ where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey } } });
    if (duplicate) { assertMatchingRequestHash(duplicate.requestHash, hash); return duplicate; }
    const ownerMemberId = typeof input.ownerMemberId === "string" ? input.ownerMemberId : actor.id;
    const directorateId = typeof input.directorateId === "string" ? input.directorateId : actor.directorateId || null;
    const draft = { organizationId: actor.organizationId, ownerMemberId, directorateId };
    if (!hubStrategyGrowthPolicy.canManageLead(actor, draft)) throw new HubApiError("Acesso negado.", 403);
    await Promise.all([requireGrowthOrganization(tx, actor.organizationId, typeof input.growthOrganizationId === "string" ? input.growthOrganizationId : null), requireActiveMember(tx, actor.organizationId, ownerMemberId), requireDirectorate(tx, actor.organizationId, directorateId)]);
    return tx.hubLead.create({ data: { organizationId: actor.organizationId, growthOrganizationId: typeof input.growthOrganizationId === "string" ? input.growthOrganizationId : null, title: requiredText(input.title, "Titulo", 200), source, ownerMemberId, directorateId, notes: optionalText(input.notes), idempotencyKey, requestHash: hash } });
  });
}

export async function convertLead(prisma: PrismaClient, actor: HubStrategicGrowthActor, leadId: string, input: Record<string, unknown>) {
  const idempotencyKey = requiredText(input.idempotencyKey, "Chave de idempotencia", 120); const hash = requestHash(input);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const mutation = await tx.hubStrategicGrowthMutation.findUnique({ where: { organizationId_scope_idempotencyKey: { organizationId: actor.organizationId, scope: "LEAD_CONVERSION", idempotencyKey } } });
    if (mutation) { assertMatchingRequestHash(mutation.requestHash, hash); return tx.hubOpportunity.findUniqueOrThrow({ where: { id: mutation.entityId } }); }
    const lead = await requireLead(tx, actor.organizationId, leadId);
    if (!hubStrategyGrowthPolicy.canManageLead(actor, lead)) throw new HubApiError("Acesso negado.", 403);
    if (lead.status === "CONVERTED" && lead.convertedOpportunityId) {
      const existing = await tx.hubOpportunity.findUniqueOrThrow({ where: { id: lead.convertedOpportunityId } });
      await tx.hubStrategicGrowthMutation.create({ data: { organizationId: actor.organizationId, scope: "LEAD_CONVERSION", idempotencyKey, requestHash: hash, entityType: "HubOpportunity", entityId: existing.id } });
      return existing;
    }
    if (lead.status !== "QUALIFIED") throw new HubApiError("Somente leads qualificados podem ser convertidos.", 409);
    const stage = await requireStage(tx, actor.organizationId, requiredText(input.stageId, "Etapa", 64));
    if (stage.isWon || stage.isLost) throw new HubApiError("Etapa inicial invalida.", 409);
    const growthOrganizationId = typeof input.growthOrganizationId === "string" ? input.growthOrganizationId : lead.growthOrganizationId;
    if (!growthOrganizationId) throw new HubApiError("Informe a organizacao externa.", 400);
    await requireGrowthOrganization(tx, actor.organizationId, growthOrganizationId);
    const organization = await tx.hubOrganization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { currency: true } });
    const opportunity = await tx.hubOpportunity.create({ data: { organizationId: actor.organizationId, growthOrganizationId, title: requiredText(input.title ?? lead.title, "Titulo", 200), ownerMemberId: lead.ownerMemberId || actor.id, directorateId: lead.directorateId, stageId: stage.id, estimatedValueCents: nonNegativeCents(input.estimatedValueCents ?? 0), currency: organization.currency, source: lead.source, probability: stage.probability, sourceLeadId: lead.id } });
    await tx.hubLead.update({ where: { id: lead.id }, data: { status: "CONVERTED", convertedOpportunityId: opportunity.id, convertedAt: new Date(), version: { increment: 1 } } });
    await tx.hubStrategicGrowthMutation.create({ data: { organizationId: actor.organizationId, scope: "LEAD_CONVERSION", idempotencyKey, requestHash: hash, entityType: "HubOpportunity", entityId: opportunity.id } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "LEAD_CONVERTED", entity: "HubLead", entityId: lead.id, metadata: { opportunityId: opportunity.id } });
    return opportunity;
  });
}

export async function updateLeadStatus(prisma: PrismaClient, actor: HubStrategicGrowthActor, leadId: string, input: Record<string, unknown>) {
  const version = boundedInteger(input.version, "Versao", 1, Number.MAX_SAFE_INTEGER);
  const status = enumValue(input.status, "Status do lead", LEAD_STATUSES);
  if (status === "CONVERTED") throw new HubApiError("Use a conversao de lead.", 400);
  const disqualificationReason = status === "DISQUALIFIED" ? requiredText(input.disqualificationReason, "Motivo da desqualificacao", 1000) : null;
  return strategicGrowthTransaction(prisma, async (tx) => {
    const lead = await requireLead(tx, actor.organizationId, leadId);
    if (!hubStrategyGrowthPolicy.canManageLead(actor, lead)) throw new HubApiError("Acesso negado.", 403);
    if (lead.version !== version) throw serializationConflict();
    if (lead.status === "CONVERTED") throw new HubApiError("Leads convertidos preservam o historico.", 409);
    const updated = await tx.hubLead.update({ where: { id: lead.id }, data: { status, disqualificationReason, version: { increment: 1 } } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "LEAD_STATUS_CHANGED", entity: "HubLead", entityId: lead.id, metadata: { from: lead.status, to: status, ...(disqualificationReason ? { disqualificationReason } : {}) } });
    return updated;
  });
}

export async function configurePipeline(prisma: PrismaClient, actor: HubStrategicGrowthActor, stages: Array<Record<string, unknown>>) {
  if (!hasHubPermission(actor.role, "growth:manage-pipeline")) throw new HubApiError("Acesso negado.", 403);
  if (!stages.length) throw new HubApiError("Informe as etapas do pipeline.", 400);
  let activeOrder = 0;
  const normalized = stages.map((stage, index) => { const isActive = stage.isActive !== false; return { id: typeof stage.id === "string" ? stage.id : null, version: typeof stage.id === "string" ? boundedInteger(stage.version, "Versao da etapa", 1, Number.MAX_SAFE_INTEGER) : null, name: requiredText(stage.name, "Nome", 100), order: isActive ? ++activeOrder : 10001 + index, probability: boundedInteger(stage.probability, "Probabilidade", 0, 100), isWon: Boolean(stage.isWon), isLost: Boolean(stage.isLost), isActive }; });
  if (normalized.filter((stage) => stage.isActive && stage.isWon).length !== 1 || normalized.filter((stage) => stage.isActive && stage.isLost).length !== 1) throw new HubApiError("O pipeline deve ter exatamente uma etapa ganha e uma perdida ativas.", 400);
  if (normalized.some((stage) => stage.isWon && stage.isLost)) throw new HubApiError("Uma etapa nao pode ser ganha e perdida ao mesmo tempo.", 400);
  if (new Set(normalized.map((stage) => stage.name.toLocaleLowerCase("pt-BR"))).size !== normalized.length) throw new HubApiError("Os nomes das etapas devem ser unicos.", 400);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const existing = await tx.hubPipelineStage.findMany({ where: { organizationId: actor.organizationId } });
    const existingById = new Map(existing.map((stage) => [stage.id, stage]));
    for (const stage of normalized) if (stage.id) {
      const current = await requireStage(tx, actor.organizationId, stage.id, false);
      if (current.version !== stage.version) throw serializationConflict();
    }
    const suppliedIds = new Set(normalized.flatMap((stage) => stage.id ? [stage.id] : []));
    const opportunities = await tx.hubOpportunity.findMany({ where: { organizationId: actor.organizationId } });

    // Phase one removes terminal flags and vacates unique order/name slots.
    await tx.hubPipelineStage.updateMany({ where: { organizationId: actor.organizationId }, data: { isWon: false, isLost: false, order: { increment: 10000 } } });
    for (const stage of existing) await tx.hubPipelineStage.update({ where: { id: stage.id }, data: { name: `__pipeline_reconfigure__${stage.id}` } });
    for (const stage of existing) if (!suppliedIds.has(stage.id)) await tx.hubPipelineStage.update({ where: { id: stage.id }, data: { isActive: false, isWon: false, isLost: false, version: { increment: 1 } } });

    for (const stage of normalized) {
      if (stage.id) {
        await tx.hubPipelineStage.update({ where: { id: stage.id }, data: { name: stage.name, order: stage.order, probability: stage.probability, isWon: stage.isWon, isLost: stage.isLost, isActive: stage.isActive, version: { increment: 1 } } });
      } else {
        await tx.hubPipelineStage.create({ data: { organizationId: actor.organizationId, name: stage.name, order: stage.order, probability: stage.probability, isWon: stage.isWon, isLost: stage.isLost, isActive: stage.isActive } });
      }
    }
    const suppliedNames = new Set(normalized.map((stage) => stage.name.toLocaleLowerCase("pt-BR")));
    for (const stage of existing) if (!suppliedIds.has(stage.id)) await tx.hubPipelineStage.update({ where: { id: stage.id }, data: { name: suppliedNames.has(stage.name.toLocaleLowerCase("pt-BR")) ? `${stage.name} (arquivada ${stage.id.slice(-6)})` : stage.name } });
    const finalStages = await tx.hubPipelineStage.findMany({ where: { organizationId: actor.organizationId }, orderBy: { order: "asc" } });
    const active = finalStages.filter((stage) => stage.isActive);
    if (active.map((stage) => stage.order).join(",") !== active.map((_, index) => index + 1).join(",")) throw new HubApiError("A ordenacao ativa do pipeline deve ser contigua.", 400);
    const won = active.find((stage) => stage.isWon)!;
    const lost = active.find((stage) => stage.isLost)!;
    const firstOpen = active.find((stage) => !stage.isWon && !stage.isLost);
    for (const opportunity of opportunities) {
      const previousStage = existingById.get(opportunity.stageId);
      let target = finalStages.find((stage) => stage.id === opportunity.stageId && stage.isActive);
      if (opportunity.status === "WON" && previousStage?.isWon && target?.id !== won.id) target = won;
      if (opportunity.status === "LOST" && previousStage?.isLost && target?.id !== lost.id) target = lost;
      if (!target) target = opportunity.status === "WON" ? won : opportunity.status === "LOST" ? lost : firstOpen;
      if (!target) throw new HubApiError("O pipeline precisa manter uma etapa aberta para oportunidades abertas.", 409);
      const nextStatus = stageStatus(target);
      const stageChanged = target.id !== opportunity.stageId;
      const statusChanged = nextStatus !== opportunity.status;
      const probability = nextStatus === "OPEN" && opportunity.probabilityOverride == null ? target.probability : opportunity.probability;
      if (stageChanged || statusChanged || probability !== opportunity.probability) {
        await tx.hubOpportunity.update({ where: { id: opportunity.id }, data: { stageId: target.id, status: nextStatus, probability, wonAt: nextStatus === "WON" ? opportunity.wonAt || new Date() : null, lostAt: nextStatus === "LOST" ? opportunity.lostAt || new Date() : null, cancelledAt: nextStatus === "CANCELLED" ? opportunity.cancelledAt || new Date() : null, version: { increment: 1 } } });
        if (stageChanged || statusChanged) await tx.hubOpportunityStageHistory.create({ data: { organizationId: actor.organizationId, opportunityId: opportunity.id, fromStageId: opportunity.stageId, toStageId: target.id, fromStatus: opportunity.status, toStatus: nextStatus, reason: previousStage && !suppliedIds.has(previousStage.id) ? "Reconciliacao de pipeline" : "Reconfiguracao de etapa terminal", changedById: actor.id } });
      }
    }
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "PIPELINE_CONFIGURED", entity: "HubPipelineStage", metadata: { stageCount: normalized.length } });
    return finalStages;
  });
}

function stageStatus(stage: { isWon: boolean; isLost: boolean }): HubOpportunityStatus { return stage.isWon ? "WON" : stage.isLost ? "LOST" : "OPEN"; }

export async function moveOpportunity(prisma: PrismaClient, actor: HubStrategicGrowthActor, opportunityId: string, input: Record<string, unknown>) {
  const version = boundedInteger(input.version, "Versao", 1, Number.MAX_SAFE_INTEGER);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const opportunity = await tx.hubOpportunity.findFirst({ where: { id: opportunityId, organizationId: actor.organizationId } });
    if (!opportunity) throw new HubApiError("Oportunidade nao encontrada.", 404);
    if (!hubStrategyGrowthPolicy.canManageOpportunity(actor, opportunity)) throw new HubApiError("Acesso negado.", 403);
    if (opportunity.version !== version) throw serializationConflict();
    const stage = await requireStage(tx, actor.organizationId, requiredText(input.stageId, "Etapa", 64));
    const status = stageStatus(stage);
    if ((status === "WON" || status === "LOST") && input.confirm !== true) throw new HubApiError("Confirme explicitamente a decisao de ganho ou perda.", 409, { code: "CONFIRMATION_REQUIRED" });
    const lossReason = status === "LOST" ? requiredText(input.lossReason, "Motivo interno da perda", 500) : null;
    const updated = await tx.hubOpportunity.update({ where: { id: opportunity.id }, data: { stageId: stage.id, status, probability: opportunity.probabilityOverride ?? stage.probability, lossReason, cancellationReason: null, wonAt: status === "WON" ? opportunity.wonAt || new Date() : null, lostAt: status === "LOST" ? opportunity.lostAt || new Date() : null, cancelledAt: null, version: { increment: 1 } } });
    await tx.hubOpportunityStageHistory.create({ data: { organizationId: actor.organizationId, opportunityId: opportunity.id, fromStageId: opportunity.stageId, toStageId: stage.id, fromStatus: opportunity.status, toStatus: status, reason: lossReason, changedById: actor.id } });
    await createHubNotifications(tx, opportunity.ownerMemberId && opportunity.ownerMemberId !== actor.id ? [{ organizationId: actor.organizationId, recipientMemberId: opportunity.ownerMemberId, actorMemberId: actor.id, type: "OPPORTUNITY_STAGE_CHANGED", title: "Etapa da oportunidade alterada", body: "Uma oportunidade sob sua responsabilidade mudou de etapa.", href: `/hub/crescimento/oportunidades?id=${opportunity.id}`, entityType: "OPPORTUNITY", entityId: opportunity.id, idempotencyKey: `opportunity:${opportunity.id}:stage:${updated.version}:${opportunity.ownerMemberId}` }] : []);
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: status === "WON" ? "OPPORTUNITY_WON" : status === "LOST" ? "OPPORTUNITY_LOST" : "OPPORTUNITY_MOVED", entity: "HubOpportunity", entityId: opportunity.id, metadata: { fromStageId: opportunity.stageId, toStageId: stage.id, status } });
    return updated;
  });
}

export async function createOpportunity(prisma: PrismaClient, actor: HubStrategicGrowthActor, input: Record<string, unknown>) {
  const source = enumValue(input.source ?? "OTHER", "Origem da oportunidade", LEAD_SOURCES);
  const draft = { organizationId: actor.organizationId, directorateId: typeof input.directorateId === "string" ? input.directorateId : actor.directorateId || null, ownerMemberId: typeof input.ownerMemberId === "string" ? input.ownerMemberId : actor.id };
  if (!hubStrategyGrowthPolicy.canManageOpportunity(actor, draft)) throw new HubApiError("Acesso negado.", 403);
  return strategicGrowthTransaction(prisma, async (tx) => { const growthOrganizationId = requiredText(input.growthOrganizationId, "Organizacao externa", 64); const [external, stage, organization] = await Promise.all([requireGrowthOrganization(tx, actor.organizationId, growthOrganizationId), requireStage(tx, actor.organizationId, requiredText(input.stageId, "Etapa", 64)), tx.hubOrganization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { currency: true, timezone: true } }), requireActiveMember(tx, actor.organizationId, draft.ownerMemberId), requireDirectorate(tx, actor.organizationId, draft.directorateId)]); if (!external || stage.isWon || stage.isLost) throw new HubApiError("Etapa inicial invalida.", 409); await requireContact(tx, actor.organizationId, typeof input.primaryContactId === "string" ? input.primaryContactId : null, growthOrganizationId); const opportunity = await tx.hubOpportunity.create({ data: { organizationId: actor.organizationId, growthOrganizationId: external.id, primaryContactId: typeof input.primaryContactId === "string" ? input.primaryContactId : null, title: requiredText(input.title, "Titulo", 200), description: optionalText(input.description), ownerMemberId: draft.ownerMemberId, directorateId: draft.directorateId, stageId: stage.id, estimatedValueCents: nonNegativeCents(input.estimatedValueCents ?? 0), currency: organization.currency, expectedCloseDate: organizationDate(input.expectedCloseDate, "Previsao", true), source, probability: stage.probability, nextAction: optionalText(input.nextAction, 500), nextActionAt: organizationDateTime(input.nextActionAt, "Proxima acao", organization.timezone, true) } }); if (opportunity.ownerMemberId && opportunity.ownerMemberId !== actor.id) await createHubNotifications(tx, [{ organizationId: actor.organizationId, recipientMemberId: opportunity.ownerMemberId, actorMemberId: actor.id, type: "OPPORTUNITY_ASSIGNED", title: "Oportunidade atribuida", body: "Voce recebeu uma oportunidade comercial.", href: `/hub/crescimento/oportunidades?id=${opportunity.id}`, entityType: "OPPORTUNITY", entityId: opportunity.id, idempotencyKey: `opportunity:${opportunity.id}:assigned:${opportunity.ownerMemberId}` }]); return opportunity; });
}

export async function updateOpportunity(prisma: PrismaClient, actor: HubStrategicGrowthActor, opportunityId: string, input: Record<string, unknown>) {
  const version = boundedInteger(input.version, "Versao", 1, Number.MAX_SAFE_INTEGER);
  const requestedSource = input.source === undefined ? null : enumValue(input.source, "Origem da oportunidade", LEAD_SOURCES);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const opportunity = await requireOpportunity(tx, actor.organizationId, opportunityId);
    if (!hubStrategyGrowthPolicy.canManageOpportunity(actor, opportunity)) throw new HubApiError("Acesso negado.", 403);
    if (opportunity.version !== version) throw serializationConflict();
    const growthOrganizationId = typeof input.growthOrganizationId === "string" ? input.growthOrganizationId : opportunity.growthOrganizationId;
    const ownerMemberId = input.ownerMemberId === null ? null : typeof input.ownerMemberId === "string" ? input.ownerMemberId : opportunity.ownerMemberId;
    const directorateId = input.directorateId === null ? null : typeof input.directorateId === "string" ? input.directorateId : opportunity.directorateId;
    const primaryContactId = input.primaryContactId === null ? null : typeof input.primaryContactId === "string" ? input.primaryContactId : opportunity.primaryContactId;
    const organization = await tx.hubOrganization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
    await Promise.all([requireGrowthOrganization(tx, actor.organizationId, growthOrganizationId), requireActiveMember(tx, actor.organizationId, ownerMemberId), requireDirectorate(tx, actor.organizationId, directorateId), requireContact(tx, actor.organizationId, primaryContactId, growthOrganizationId)]);
    let probabilityOverride = opportunity.probabilityOverride;
    let probabilityOverrideReason = opportunity.probabilityOverrideReason;
    let probability = opportunity.probability;
    if (Object.prototype.hasOwnProperty.call(input, "probabilityOverride")) {
      if (!hubStrategyGrowthPolicy.canOverrideOpportunityProbability(actor, opportunity)) throw new HubApiError("Acesso negado.", 403);
      if (input.probabilityOverride == null || input.probabilityOverride === "") {
        probabilityOverride = null; probabilityOverrideReason = null;
        const stage = await requireStage(tx, actor.organizationId, opportunity.stageId, false); probability = stage.probability;
      } else {
        probabilityOverride = boundedInteger(input.probabilityOverride, "Probabilidade", 0, 100);
        probabilityOverrideReason = requiredText(input.probabilityOverrideReason, "Motivo da probabilidade", 1000);
        probability = probabilityOverride;
      }
    }
    const updated = await tx.hubOpportunity.update({ where: { id: opportunity.id }, data: {
      growthOrganizationId, primaryContactId, ownerMemberId, directorateId,
      title: input.title === undefined ? opportunity.title : requiredText(input.title, "Titulo", 200),
      description: input.description === undefined ? opportunity.description : optionalText(input.description),
      estimatedValueCents: input.estimatedValueCents === undefined ? opportunity.estimatedValueCents : nonNegativeCents(input.estimatedValueCents),
      expectedCloseDate: input.expectedCloseDate === undefined ? opportunity.expectedCloseDate : organizationDate(input.expectedCloseDate, "Previsao", true),
      source: requestedSource ?? opportunity.source,
      nextAction: input.nextAction === undefined ? opportunity.nextAction : optionalText(input.nextAction, 500),
      nextActionAt: input.nextActionAt === undefined ? opportunity.nextActionAt : organizationDateTime(input.nextActionAt, "Proxima acao", organization.timezone, true),
      probability, probabilityOverride, probabilityOverrideReason, version: { increment: 1 },
    } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "OPPORTUNITY_UPDATED", entity: "HubOpportunity", entityId: opportunity.id, metadata: { reassigned: opportunity.ownerMemberId !== ownerMemberId, probabilityOverride: probabilityOverride ?? undefined } });
    return updated;
  });
}

export async function cancelOpportunity(prisma: PrismaClient, actor: HubStrategicGrowthActor, opportunityId: string, input: Record<string, unknown>) {
  if (input.confirm !== true) throw new HubApiError("Confirme explicitamente o cancelamento.", 409);
  const version = boundedInteger(input.version, "Versao", 1, Number.MAX_SAFE_INTEGER);
  const reason = requiredText(input.reason, "Motivo do cancelamento", 1000);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const opportunity = await requireOpportunity(tx, actor.organizationId, opportunityId);
    if (!hubStrategyGrowthPolicy.canManageOpportunity(actor, opportunity)) throw new HubApiError("Acesso negado.", 403);
    if (opportunity.version !== version) throw serializationConflict();
    if (opportunity.status !== "OPEN") throw new HubApiError("Somente oportunidades abertas podem ser canceladas.", 409);
    const updated = await tx.hubOpportunity.update({ where: { id: opportunity.id }, data: { status: "CANCELLED", cancellationReason: reason, cancelledAt: new Date(), wonAt: null, lostAt: null, version: { increment: 1 } } });
    await tx.hubOpportunityStageHistory.create({ data: { organizationId: actor.organizationId, opportunityId: opportunity.id, fromStageId: opportunity.stageId, toStageId: opportunity.stageId, fromStatus: opportunity.status, toStatus: "CANCELLED", reason, changedById: actor.id } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "OPPORTUNITY_CANCELLED", entity: "HubOpportunity", entityId: opportunity.id, metadata: { reason } });
    return updated;
  });
}

export async function reopenOpportunity(prisma: PrismaClient, actor: HubStrategicGrowthActor, opportunityId: string, input: Record<string, unknown>) {
  if (input.confirm !== true) throw new HubApiError("Confirme explicitamente a reabertura.", 409);
  const version = boundedInteger(input.version, "Versao", 1, Number.MAX_SAFE_INTEGER);
  const reason = requiredText(input.reason, "Motivo da reabertura", 1000);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const opportunity = await requireOpportunity(tx, actor.organizationId, opportunityId);
    if (!hubStrategyGrowthPolicy.canReopenOpportunity(actor, opportunity)) throw new HubApiError("Acesso negado.", 403);
    if (opportunity.version !== version) throw serializationConflict();
    if (opportunity.status === "OPEN") throw new HubApiError("A oportunidade ja esta aberta.", 409);
    const stage = typeof input.stageId === "string" ? await requireStage(tx, actor.organizationId, input.stageId) : await tx.hubPipelineStage.findFirst({ where: { organizationId: actor.organizationId, isActive: true, isWon: false, isLost: false }, orderBy: { order: "asc" } });
    if (!stage || stage.isWon || stage.isLost) throw new HubApiError("Etapa de reabertura invalida.", 409);
    const updated = await tx.hubOpportunity.update({ where: { id: opportunity.id }, data: { stageId: stage.id, status: "OPEN", probability: opportunity.probabilityOverride ?? stage.probability, lossReason: null, cancellationReason: null, wonAt: null, lostAt: null, cancelledAt: null, version: { increment: 1 } } });
    await tx.hubOpportunityStageHistory.create({ data: { organizationId: actor.organizationId, opportunityId: opportunity.id, fromStageId: opportunity.stageId, toStageId: stage.id, fromStatus: opportunity.status, toStatus: "OPEN", reason, changedById: actor.id } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "OPPORTUNITY_REOPENED", entity: "HubOpportunity", entityId: opportunity.id, metadata: { reason } });
    return updated;
  });
}

export async function createProjectFromOpportunity(prisma: PrismaClient, actor: HubStrategicGrowthActor, opportunityId: string, input: Record<string, unknown>) {
  if (input.confirm !== true) throw new HubApiError("Confirme explicitamente a criacao do projeto.", 409);
  const key = requiredText(input.idempotencyKey, "Chave de idempotencia", 120); const hash = requestHash(input);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const mutation = await tx.hubStrategicGrowthMutation.findUnique({ where: { organizationId_scope_idempotencyKey: { organizationId: actor.organizationId, scope: "OPPORTUNITY_PROJECT", idempotencyKey: key } } });
    if (mutation) { assertMatchingRequestHash(mutation.requestHash, hash); return tx.hubProject.findUniqueOrThrow({ where: { id: mutation.entityId } }); }
    const opportunity = await tx.hubOpportunity.findFirst({ where: { id: opportunityId, organizationId: actor.organizationId } });
    if (!opportunity) throw new HubApiError("Oportunidade nao encontrada.", 404);
    if (!hubStrategyGrowthPolicy.canManageOpportunity(actor, opportunity)) throw new HubApiError("Acesso negado.", 403);
    if (opportunity.status !== "WON") throw new HubApiError("Somente oportunidades ganhas podem originar projetos.", 409);
    if (opportunity.projectId) return tx.hubProject.findUniqueOrThrow({ where: { id: opportunity.projectId } });
    const project = await tx.hubProject.create({ data: { organizationId: actor.organizationId, idempotencyKey: `opportunity:${opportunity.id}`, title: opportunity.title, description: opportunity.description, grossAmountCents: opportunity.estimatedValueCents, status: "DRAFT", responsibleMemberId: opportunity.ownerMemberId, createdById: actor.id } });
    await tx.hubOpportunity.update({ where: { id: opportunity.id }, data: { projectId: project.id, projectCreationKey: key, version: { increment: 1 } } });
    await tx.hubStrategicGrowthMutation.create({ data: { organizationId: actor.organizationId, scope: "OPPORTUNITY_PROJECT", idempotencyKey: key, requestHash: hash, entityType: "HubProject", entityId: project.id } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "PROJECT_CREATED_FROM_OPPORTUNITY", entity: "HubProject", entityId: project.id, metadata: { opportunityId } });
    return project;
  });
}

export async function addOpportunityActivity(prisma: PrismaClient, actor: HubStrategicGrowthActor, opportunityId: string, input: Record<string, unknown>) {
  const type = enumValue(input.type ?? "NOTE", "Tipo da atividade", ACTIVITY_TYPES);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const opportunity = await requireOpportunity(tx, actor.organizationId, opportunityId);
    if (!hubStrategyGrowthPolicy.canManageOpportunity(actor, opportunity)) throw new HubApiError("Acesso negado.", 403);
    const organization = await tx.hubOrganization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
    const replacesActivityId = typeof input.replacesActivityId === "string" ? input.replacesActivityId : null;
    await Promise.all([requireMeeting(tx, actor.organizationId, typeof input.meetingId === "string" ? input.meetingId : null), requireTask(tx, actor.organizationId, typeof input.taskId === "string" ? input.taskId : null), requireReplacementActivity(tx, actor.organizationId, opportunityId, replacesActivityId)]);
    const activity = await tx.hubOpportunityActivity.create({ data: { organizationId: actor.organizationId, opportunityId, type, title: requiredText(input.title, "Titulo", 180), description: optionalText(input.description), occurredAt: input.occurredAt == null ? new Date() : organizationDateTime(input.occurredAt, "Data", organization.timezone), nextActionAt: organizationDateTime(input.nextActionAt, "Proxima acao", organization.timezone, true), meetingId: typeof input.meetingId === "string" ? input.meetingId : null, taskId: typeof input.taskId === "string" ? input.taskId : null, replacesActivityId, createdById: actor.id } });
    if (replacesActivityId) await tx.hubOpportunityActivity.update({ where: { id: replacesActivityId }, data: { cancelledAt: new Date(), cancellationReason: requiredText(input.correctionReason, "Motivo da correcao", 1000) } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: replacesActivityId ? "OPPORTUNITY_ACTIVITY_CORRECTED" : "OPPORTUNITY_ACTIVITY_CREATED", entity: "HubOpportunityActivity", entityId: activity.id, metadata: replacesActivityId ? { replacesActivityId } : undefined });
    return activity;
  });
}

export async function cancelOpportunityActivity(prisma: PrismaClient, actor: HubStrategicGrowthActor, activityId: string, input: Record<string, unknown>) {
  if (input.confirm !== true) throw new HubApiError("Confirme explicitamente o cancelamento.", 409);
  const reason = requiredText(input.reason, "Motivo do cancelamento", 1000);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const activity = await tx.hubOpportunityActivity.findFirst({ where: { id: activityId, organizationId: actor.organizationId }, include: { opportunity: true } });
    if (!activity) throw new HubApiError("Atividade nao encontrada.", 404);
    if (!hubStrategyGrowthPolicy.canManageOpportunity(actor, activity.opportunity)) throw new HubApiError("Acesso negado.", 403);
    if (activity.cancelledAt) return activity;
    const updated = await tx.hubOpportunityActivity.update({ where: { id: activity.id }, data: { cancelledAt: new Date(), cancellationReason: reason } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "OPPORTUNITY_ACTIVITY_CANCELLED", entity: "HubOpportunityActivity", entityId: activity.id, metadata: { reason } });
    return updated;
  });
}

export async function createProposalRevision(prisma: PrismaClient, actor: HubStrategicGrowthActor, proposalId: string, input: Record<string, unknown>) {
  const items = Array.isArray(input.items) ? input.items as Array<Record<string, unknown>> : [];
  if (!items.length) throw new HubApiError("A proposta precisa de pelo menos um item.", 400);
  const calculated = items.map((item, index) => { const quantity = decimalNumber(item.quantity, "Quantidade"); const unitAmountCents = nonNegativeCents(item.unitAmountCents, "Valor unitario"); if (quantity <= 0) throw new HubApiError("Quantidade deve ser positiva.", 400); return { description: requiredText(item.description, "Descricao", 240), quantity, unitAmountCents, totalAmountCents: Math.round(quantity * unitAmountCents), order: index + 1 }; });
  const subtotalCents = calculated.reduce((sum, item) => sum + item.totalAmountCents, 0); const discountCents = nonNegativeCents(input.discountCents ?? 0, "Desconto");
  if (discountCents > subtotalCents) throw new HubApiError("O desconto nao pode superar o subtotal.", 400);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const proposal = await tx.hubProposal.findFirst({ where: { id: proposalId, organizationId: actor.organizationId }, include: { opportunity: true, revisions: { orderBy: { revisionNumber: "desc" }, take: 1 } } });
    if (!proposal) throw new HubApiError("Proposta nao encontrada.", 404);
    if (!hubStrategyGrowthPolicy.canAccessProposal(actor, { ...proposal.opportunity, createdById: proposal.createdById })) throw new HubApiError("Acesso negado.", 403);
    if (!["DRAFT", "INTERNAL_REVIEW"].includes(proposal.status)) throw new HubApiError("A proposta aprovada ou enviada e imutavel.", 409);
    const revision = await tx.hubProposalRevision.create({ data: { organizationId: actor.organizationId, proposalId: proposal.id, revisionNumber: (proposal.revisions[0]?.revisionNumber || 0) + 1, scope: requiredText(input.scope, "Escopo", 8000), deliverables: requiredText(input.deliverables, "Entregaveis", 8000), timeline: requiredText(input.timeline, "Cronograma", 4000), commercialTerms: requiredText(input.commercialTerms, "Termos comerciais", 8000), createdById: actor.id, items: { create: calculated.map((item) => ({ ...item, organizationId: actor.organizationId })) } } });
    await tx.hubProposal.update({ where: { id: proposal.id }, data: { activeRevisionId: revision.id, subtotalCents, discountCents, totalCents: subtotalCents - discountCents, version: { increment: 1 } } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "PROPOSAL_REVISION_CREATED", entity: "HubProposalRevision", entityId: revision.id, metadata: { proposalId, revisionNumber: revision.revisionNumber, itemCount: calculated.length, totalCents: subtotalCents - discountCents } });
    return revision;
  });
}

export async function createProposal(prisma: PrismaClient, actor: HubStrategicGrowthActor, input: Record<string, unknown>) {
  return strategicGrowthTransaction(prisma, async (tx) => { const opportunity = await requireOpportunity(tx, actor.organizationId, requiredText(input.opportunityId, "Oportunidade", 64)); if (!hubStrategyGrowthPolicy.canAccessProposal(actor, { ...opportunity, createdById: actor.id })) throw new HubApiError("Acesso negado.", 403); return tx.hubProposal.create({ data: { organizationId: actor.organizationId, opportunityId: opportunity.id, title: requiredText(input.title, "Titulo", 200), summary: optionalText(input.summary), validUntil: organizationDate(input.validUntil, "Validade", true), currency: opportunity.currency, createdById: actor.id } }); });
}

export async function requestProposalReview(prisma: PrismaClient, actor: HubStrategicGrowthActor, proposalId: string, version: number) {
  return strategicGrowthTransaction(prisma, async (tx) => { const proposal = await tx.hubProposal.findFirst({ where: { id: proposalId, organizationId: actor.organizationId }, include: { opportunity: true } }); if (!proposal) throw new HubApiError("Proposta nao encontrada.", 404); if (!hubStrategyGrowthPolicy.canAccessProposal(actor, { ...proposal.opportunity, createdById: proposal.createdById })) throw new HubApiError("Acesso negado.", 403); if (proposal.version !== version) throw serializationConflict(); if (proposal.status !== "DRAFT" || !proposal.activeRevisionId) throw new HubApiError("Crie uma revisao antes de solicitar analise.", 409); const updated = await tx.hubProposal.update({ where: { id: proposal.id }, data: { status: "INTERNAL_REVIEW", version: { increment: 1 } } }); await notifyHubPermissionRecipients(tx, { organizationId: actor.organizationId, actorMemberId: actor.id, excludeActor: true, permission: "growth:manage-proposals", type: "PROPOSAL_REVIEW_REQUESTED", title: "Proposta aguardando revisao", body: "Uma proposta comercial aguarda revisao interna.", href: `/hub/crescimento/propostas?id=${proposal.id}`, entityType: "PROPOSAL", entityId: proposal.id, idempotencyKey: `proposal:${proposal.id}:review:${updated.version}` }); return updated; });
}

export async function approveProposal(prisma: PrismaClient, actor: HubStrategicGrowthActor, proposalId: string, version: number) {
  return strategicGrowthTransaction(prisma, async (tx) => {
    const proposal = await tx.hubProposal.findFirst({ where: { id: proposalId, organizationId: actor.organizationId }, include: { opportunity: true } });
    if (!proposal) throw new HubApiError("Proposta nao encontrada.", 404);
    if (!hubStrategyGrowthPolicy.canAccessProposal(actor, { ...proposal.opportunity, createdById: proposal.createdById })) throw new HubApiError("Acesso negado.", 403);
    if (proposal.version !== version) throw serializationConflict();
    if (proposal.status !== "INTERNAL_REVIEW" || !proposal.activeRevisionId) throw new HubApiError("A proposta nao esta pronta para aprovacao.", 409);
    let exceptionalSelfApproval = false;
    if (proposal.createdById === actor.id) {
      const administrators = await tx.hubMember.count({ where: { organizationId: actor.organizationId, status: "ACTIVE", role: { in: ["SUPER_ADMIN", "ADMIN"] } } });
      if (administrators !== 1 || !["SUPER_ADMIN", "ADMIN"].includes(actor.role)) throw new HubApiError("O autor nao pode aprovar a propria proposta.", 403);
      exceptionalSelfApproval = true;
    }
    await tx.hubProposalRevision.update({ where: { id: proposal.activeRevisionId }, data: { isLocked: true } });
    const updated = await tx.hubProposal.update({ where: { id: proposal.id }, data: { status: "APPROVED", approvedById: actor.id, version: { increment: 1 } } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "PROPOSAL_APPROVED", entity: "HubProposal", entityId: proposal.id, metadata: exceptionalSelfApproval ? { exceptionalSelfApproval: true } : undefined });
    return updated;
  });
}

export async function sendProposal(prisma: PrismaClient, actor: HubStrategicGrowthActor, proposalId: string, input: Record<string, unknown>) {
  const version = boundedInteger(input.version, "Versao", 1, Number.MAX_SAFE_INTEGER);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const proposal = await tx.hubProposal.findFirst({ where: { id: proposalId, organizationId: actor.organizationId }, include: { opportunity: true } });
    if (!proposal) throw new HubApiError("Proposta nao encontrada.", 404);
    if (!hubStrategyGrowthPolicy.canAccessProposal(actor, { ...proposal.opportunity, createdById: proposal.createdById })) throw new HubApiError("Acesso negado.", 403);
    if (!hubStrategyGrowthPolicy.canAccessProposal(actor, { ...proposal.opportunity, createdById: proposal.createdById })) throw new HubApiError("Acesso negado.", 403);
    if (proposal.version !== version) throw serializationConflict();
    if (proposal.status !== "APPROVED" || !proposal.activeRevisionId) throw new HubApiError("Somente propostas aprovadas podem ser enviadas.", 409);
    await tx.hubProposalRevision.update({ where: { id: proposal.activeRevisionId }, data: { isLocked: true } });
    const updated = await tx.hubProposal.update({ where: { id: proposal.id }, data: { status: "SENT", sentAt: new Date(), version: { increment: 1 } } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "PROPOSAL_SENT", entity: "HubProposal", entityId: proposal.id });
    await notifyHubPermissionRecipients(tx, { organizationId: actor.organizationId, actorMemberId: actor.id, excludeActor: true, permission: "growth:manage-proposals", type: "PROPOSAL_SENT", title: "Proposta enviada", body: "Uma proposta comercial foi marcada como enviada.", href: `/hub/crescimento/propostas?id=${proposal.id}`, entityType: "PROPOSAL", entityId: proposal.id, idempotencyKey: `proposal:${proposal.id}:sent:${updated.version}` });
    return updated;
  });
}

export async function rejectProposal(prisma: PrismaClient, actor: HubStrategicGrowthActor, proposalId: string, input: Record<string, unknown>) {
  const version = boundedInteger(input.version, "Versao", 1, Number.MAX_SAFE_INTEGER);
  const reason = requiredText(input.reason, "Motivo da rejeicao", 1000);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const proposal = await tx.hubProposal.findFirst({ where: { id: proposalId, organizationId: actor.organizationId }, include: { opportunity: true } });
    if (!proposal) throw new HubApiError("Proposta nao encontrada.", 404);
    if (!hubStrategyGrowthPolicy.canAccessProposal(actor, { ...proposal.opportunity, createdById: proposal.createdById })) throw new HubApiError("Acesso negado.", 403);
    if (proposal.version !== version) throw serializationConflict();
    if (!(["APPROVED", "SENT"] as const).includes(proposal.status as "APPROVED" | "SENT")) throw new HubApiError("A proposta nao pode ser rejeitada neste estado.", 409);
    const updated = await tx.hubProposal.update({ where: { id: proposal.id }, data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: reason, version: { increment: 1 } } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "PROPOSAL_REJECTED", entity: "HubProposal", entityId: proposal.id, metadata: { reason } });
    return updated;
  });
}

export async function expireProposal(prisma: PrismaClient, actor: HubStrategicGrowthActor, proposalId: string, input: Record<string, unknown>) {
  const version = boundedInteger(input.version, "Versao", 1, Number.MAX_SAFE_INTEGER);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const proposal = await tx.hubProposal.findFirst({ where: { id: proposalId, organizationId: actor.organizationId }, include: { opportunity: true } });
    if (!proposal) throw new HubApiError("Proposta nao encontrada.", 404);
    if (!hubStrategyGrowthPolicy.canAccessProposal(actor, { ...proposal.opportunity, createdById: proposal.createdById })) throw new HubApiError("Acesso negado.", 403);
    if (proposal.version !== version) throw serializationConflict();
    if (!(["APPROVED", "SENT"] as const).includes(proposal.status as "APPROVED" | "SENT") || !proposal.validUntil) throw new HubApiError("A proposta nao pode expirar neste estado.", 409);
    const organization = await tx.hubOrganization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
    if (proposal.validUntil.toISOString().slice(0, 10) >= localDateKey(new Date(), organization.timezone)) throw new HubApiError("A validade da proposta ainda nao terminou no fuso da organizacao.", 409);
    const updated = await tx.hubProposal.update({ where: { id: proposal.id }, data: { status: "EXPIRED", expiredAt: new Date(), version: { increment: 1 } } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "PROPOSAL_EXPIRED", entity: "HubProposal", entityId: proposal.id });
    return updated;
  });
}

export async function cancelProposal(prisma: PrismaClient, actor: HubStrategicGrowthActor, proposalId: string, input: Record<string, unknown>) {
  if (input.confirm !== true) throw new HubApiError("Confirme explicitamente o cancelamento.", 409);
  const version = boundedInteger(input.version, "Versao", 1, Number.MAX_SAFE_INTEGER);
  const reason = requiredText(input.reason, "Motivo do cancelamento", 1000);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const proposal = await tx.hubProposal.findFirst({ where: { id: proposalId, organizationId: actor.organizationId }, include: { opportunity: true } });
    if (!proposal) throw new HubApiError("Proposta nao encontrada.", 404);
    if (!hubStrategyGrowthPolicy.canAccessProposal(actor, { ...proposal.opportunity, createdById: proposal.createdById })) throw new HubApiError("Acesso negado.", 403);
    if (proposal.version !== version) throw serializationConflict();
    if (!(["DRAFT", "INTERNAL_REVIEW", "APPROVED", "SENT"] as const).includes(proposal.status as "DRAFT" | "INTERNAL_REVIEW" | "APPROVED" | "SENT")) throw new HubApiError("A proposta nao pode ser cancelada neste estado.", 409);
    const updated = await tx.hubProposal.update({ where: { id: proposal.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: reason, version: { increment: 1 } } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "PROPOSAL_CANCELLED", entity: "HubProposal", entityId: proposal.id, metadata: { reason } });
    return updated;
  });
}

export async function acceptProposal(prisma: PrismaClient, actor: HubStrategicGrowthActor, proposalId: string, input: Record<string, unknown>) {
  if (input.confirm !== true) throw new HubApiError("Confirme explicitamente a aceitacao.", 409);
  const version = boundedInteger(input.version, "Versao", 1, Number.MAX_SAFE_INTEGER);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const proposal = await tx.hubProposal.findFirst({ where: { id: proposalId, organizationId: actor.organizationId }, include: { opportunity: true } });
    if (!proposal) throw new HubApiError("Proposta nao encontrada.", 404);
    if (!hubStrategyGrowthPolicy.canAccessProposal(actor, { ...proposal.opportunity, createdById: proposal.createdById })) throw new HubApiError("Acesso negado.", 403);
    if (proposal.status === "ACCEPTED") return proposal;
    if (proposal.version !== version) throw serializationConflict();
    if (!["APPROVED", "SENT"].includes(proposal.status)) throw new HubApiError("A proposta nao pode ser aceita neste estado.", 409);
    if (proposal.validUntil) {
      const organization = await tx.hubOrganization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
      if (proposal.validUntil.toISOString().slice(0, 10) < localDateKey(new Date(), organization.timezone)) throw new HubApiError("A proposta esta expirada no fuso da organizacao.", 409);
    }
    const updated = await tx.hubProposal.update({ where: { id: proposal.id }, data: { status: "ACCEPTED", acceptedAt: new Date(), version: { increment: 1 } } });
    if (input.markOpportunityWon === true && proposal.opportunity.status === "OPEN") {
      const won = await tx.hubPipelineStage.findFirst({ where: { organizationId: actor.organizationId, isActive: true, isWon: true } });
      if (!won) throw new HubApiError("Configure uma etapa ganha antes de concluir.", 409);
      await tx.hubOpportunity.update({ where: { id: proposal.opportunityId }, data: { stageId: won.id, status: "WON", probability: proposal.opportunity.probabilityOverride ?? won.probability, wonAt: new Date(), lostAt: null, cancelledAt: null, version: { increment: 1 } } });
      await tx.hubOpportunityStageHistory.create({ data: { organizationId: actor.organizationId, opportunityId: proposal.opportunityId, fromStageId: proposal.opportunity.stageId, toStageId: won.id, fromStatus: proposal.opportunity.status, toStatus: "WON", reason: `Aceite da proposta ${proposal.id}`, changedById: actor.id } });
    }
    await notifyHubPermissionRecipients(tx, { organizationId: actor.organizationId, actorMemberId: actor.id, excludeActor: true, permission: "growth:manage-proposals", type: "PROPOSAL_ACCEPTED", title: "Proposta aceita", body: "Uma proposta comercial foi aceita.", href: `/hub/crescimento/propostas?id=${proposal.id}`, entityType: "PROPOSAL", entityId: proposal.id, idempotencyKey: `proposal:${proposal.id}:accepted` });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "PROPOSAL_ACCEPTED", entity: "HubProposal", entityId: proposal.id, metadata: { opportunityId: proposal.opportunityId, totalCents: proposal.totalCents } });
    return updated;
  });
}

export async function createProjectFromProposal(prisma: PrismaClient, actor: HubStrategicGrowthActor, proposalId: string, input: Record<string, unknown>) {
  if (input.confirm !== true) throw new HubApiError("Confirme explicitamente a criacao do projeto.", 409);
  const key = requiredText(input.idempotencyKey, "Chave de idempotencia", 120); const hash = requestHash(input);
  return strategicGrowthTransaction(prisma, async (tx) => {
    const mutation = await tx.hubStrategicGrowthMutation.findUnique({ where: { organizationId_scope_idempotencyKey: { organizationId: actor.organizationId, scope: "PROPOSAL_PROJECT", idempotencyKey: key } } });
    if (mutation) { assertMatchingRequestHash(mutation.requestHash, hash); return tx.hubProject.findUniqueOrThrow({ where: { id: mutation.entityId } }); }
    const proposal = await tx.hubProposal.findFirst({ where: { id: proposalId, organizationId: actor.organizationId }, include: { opportunity: true } });
    if (!proposal) throw new HubApiError("Proposta nao encontrada.", 404);
    if (!hubStrategyGrowthPolicy.canAccessProposal(actor, { ...proposal.opportunity, createdById: proposal.createdById })) throw new HubApiError("Acesso negado.", 403);
    if (proposal.status !== "ACCEPTED") throw new HubApiError("Somente propostas aceitas podem originar projetos.", 409);
    if (proposal.projectId) return tx.hubProject.findUniqueOrThrow({ where: { id: proposal.projectId } });
    if (proposal.opportunity.projectId) {
      const project = await tx.hubProject.findUniqueOrThrow({ where: { id: proposal.opportunity.projectId } });
      await tx.hubProposal.update({ where: { id: proposal.id }, data: { projectId: project.id, projectCreationKey: key, version: { increment: 1 } } });
      await tx.hubStrategicGrowthMutation.create({ data: { organizationId: actor.organizationId, scope: "PROPOSAL_PROJECT", idempotencyKey: key, requestHash: hash, entityType: "HubProject", entityId: project.id } });
      await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "PROJECT_LINKED_FROM_PROPOSAL", entity: "HubProject", entityId: project.id, metadata: { proposalId, opportunityId: proposal.opportunityId } });
      return project;
    }
    const project = await tx.hubProject.create({ data: { organizationId: actor.organizationId, idempotencyKey: `proposal:${proposal.id}`, title: proposal.title, description: proposal.summary, grossAmountCents: proposal.totalCents, status: "DRAFT", responsibleMemberId: proposal.opportunity.ownerMemberId, createdById: actor.id } });
    await tx.hubProposal.update({ where: { id: proposal.id }, data: { projectId: project.id, projectCreationKey: key, version: { increment: 1 } } });
    await tx.hubOpportunity.update({ where: { id: proposal.opportunityId }, data: { projectId: project.id, projectCreationKey: `proposal:${proposal.id}`, version: { increment: 1 } } });
    await tx.hubStrategicGrowthMutation.create({ data: { organizationId: actor.organizationId, scope: "PROPOSAL_PROJECT", idempotencyKey: key, requestHash: hash, entityType: "HubProject", entityId: project.id } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "PROJECT_CREATED_FROM_PROPOSAL", entity: "HubProject", entityId: project.id, metadata: { proposalId, opportunityId: proposal.opportunityId } });
    return project;
  });
}

export async function updatePartnership(prisma: PrismaClient, actor: HubStrategicGrowthActor, partnershipId: string, input: Record<string, unknown>) {
  const version = boundedInteger(input.version, "Versao", 1, Number.MAX_SAFE_INTEGER);
  const requestedStatus = input.status ? enumValue(input.status, "Status da parceria", PARTNERSHIP_STATUSES) : null;
  return strategicGrowthTransaction(prisma, async (tx) => {
    const partnership = await tx.hubPartnership.findFirst({ where: { id: partnershipId, organizationId: actor.organizationId } });
    if (!partnership) throw new HubApiError("Parceria nao encontrada.", 404);
    if (!hubStrategyGrowthPolicy.canManagePartnership(actor, partnership)) throw new HubApiError("Acesso negado.", 403);
    if (partnership.version !== version) throw serializationConflict();
    const status = requestedStatus ?? partnership.status;
    if (status !== partnership.status && !PARTNERSHIP_TRANSITIONS[partnership.status].includes(status)) throw new HubApiError("Transicao de parceria invalida.", 409);
    const ownerMemberId = input.ownerMemberId === null ? null : typeof input.ownerMemberId === "string" ? input.ownerMemberId : partnership.ownerMemberId;
    const opportunityId = input.opportunityId === null ? null : typeof input.opportunityId === "string" ? input.opportunityId : partnership.opportunityId;
    const initiativeId = input.initiativeId === null ? null : typeof input.initiativeId === "string" ? input.initiativeId : partnership.initiativeId;
    await Promise.all([requireActiveMember(tx, actor.organizationId, ownerMemberId), opportunityId ? requireOpportunity(tx, actor.organizationId, opportunityId) : null, requireInitiative(tx, actor.organizationId, initiativeId)]);
    const updated = await tx.hubPartnership.update({ where: { id: partnership.id }, data: { status, ownerMemberId, opportunityId, initiativeId, goals: input.goals === undefined ? partnership.goals : optionalText(input.goals), notes: input.notes === undefined ? partnership.notes : optionalText(input.notes), version: { increment: 1 } } });
    await writeHubAudit(tx, { organizationId: actor.organizationId, memberId: actor.id, action: "PARTNERSHIP_STATUS_CHANGED", entity: "HubPartnership", entityId: partnership.id, metadata: { from: partnership.status, to: status } });
    return updated;
  });
}

export async function createPartnership(prisma: PrismaClient, actor: HubStrategicGrowthActor, input: Record<string, unknown>) {
  const status = enumValue(input.status ?? "PROPOSED", "Status da parceria", PARTNERSHIP_STATUSES);
  return strategicGrowthTransaction(prisma, async (tx) => { const external = await requireGrowthOrganization(tx, actor.organizationId, requiredText(input.growthOrganizationId, "Organizacao externa", 64)); const ownerMemberId = typeof input.ownerMemberId === "string" ? input.ownerMemberId : actor.id; const draft = { organizationId: actor.organizationId, ownerMemberId }; if (!hubStrategyGrowthPolicy.canManagePartnership(actor, draft)) throw new HubApiError("Acesso negado.", 403); await Promise.all([requireActiveMember(tx, actor.organizationId, ownerMemberId), typeof input.opportunityId === "string" ? requireOpportunity(tx, actor.organizationId, input.opportunityId) : null, requireInitiative(tx, actor.organizationId, typeof input.initiativeId === "string" ? input.initiativeId : null)]); return tx.hubPartnership.create({ data: { organizationId: actor.organizationId, growthOrganizationId: external!.id, title: requiredText(input.title, "Titulo", 200), type: requiredText(input.type, "Tipo", 100), ownerMemberId, status, startsAt: organizationDate(input.startsAt, "Inicio", true), endsAt: organizationDate(input.endsAt, "Fim", true), goals: optionalText(input.goals), notes: optionalText(input.notes), opportunityId: typeof input.opportunityId === "string" ? input.opportunityId : null, initiativeId: typeof input.initiativeId === "string" ? input.initiativeId : null } }); });
}
