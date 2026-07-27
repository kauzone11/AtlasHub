import type { HubRole } from "@prisma/client";
import { hasHubPermission, type HubPermission } from "./permissions";

export type HubOperationalActor = {
  id: string;
  organizationId: string;
  role: HubRole;
  directorateId: string | null;
};

type ScopedObject = { organizationId: string; directorateId?: string | null };

function sameOrganization(actor: HubOperationalActor, object: ScopedObject) {
  return actor.organizationId === object.organizationId;
}

function permitted(actor: HubOperationalActor, permission: HubPermission, object: ScopedObject) {
  return sameOrganization(actor, object) && hasHubPermission(actor.role, permission);
}

export const hubOperationalPolicy = {
  canViewFinancialEntry: (actor: HubOperationalActor, entry: ScopedObject) => permitted(actor, "finance:access", entry),
  canEditFinancialEntry: (actor: HubOperationalActor, entry: ScopedObject & { createdById?: string }) =>
    permitted(actor, "finance:create", entry) && actor.id === entry.createdById,
  canApproveFinancialEntry: (actor: HubOperationalActor, entry: ScopedObject & { createdById?: string }) =>
    permitted(actor, "finance:review", entry) && actor.id !== entry.createdById,
  canSettleFinancialEntry: (actor: HubOperationalActor, entry: ScopedObject) => permitted(actor, "finance:settle", entry),
  canCancelFinancialEntry: (actor: HubOperationalActor, entry: ScopedObject & { createdById?: string }) =>
    actor.id === entry.createdById ? permitted(actor, "finance:create", entry) : permitted(actor, "finance:settle", entry),
  canReviewReimbursement: (actor: HubOperationalActor, request: ScopedObject & { requesterMemberId: string }) =>
    permitted(actor, "finance:review", request) && actor.id !== request.requesterMemberId,
  canAccessBudget: (actor: HubOperationalActor, budget: ScopedObject) =>
    sameOrganization(actor, budget) && (hasHubPermission(actor.role, "finance:budget-read") || hasHubPermission(actor.role, "finance:budget-manage")),
  canCreateBudget: (actor: HubOperationalActor, budget: ScopedObject) => permitted(actor, "finance:budget-manage", budget),
  canOperateFinancialPeriod: (actor: HubOperationalActor, period: ScopedObject) => permitted(actor, "finance:period-close", period),
  canAccessMemberProfile: (actor: HubOperationalActor, profile: ScopedObject & { memberId: string; directorateId?: string | null }) =>
    sameOrganization(actor, profile) && (actor.id === profile.memberId || hasHubPermission(actor.role, "people:manage") ||
      (hasHubPermission(actor.role, "people:manage-directorate") && actor.directorateId === profile.directorateId)),
  canReadSensitivePeopleData: (actor: HubOperationalActor, profile: ScopedObject) => permitted(actor, "people:read-sensitive", profile),
  canManageDirectorate: (actor: HubOperationalActor, object: ScopedObject) =>
    sameOrganization(actor, object) && (hasHubPermission(actor.role, "people:manage") ||
      (hasHubPermission(actor.role, "people:manage-directorate") && actor.directorateId === object.directorateId)),
  canParticipateInEvaluation: (actor: HubOperationalActor, evaluation: ScopedObject & { evaluatorMemberId: string; evaluatedMemberId: string }) =>
    sameOrganization(actor, evaluation) && (actor.id === evaluation.evaluatorMemberId || actor.id === evaluation.evaluatedMemberId || hasHubPermission(actor.role, "people:manage")),
  canAccessRecruitment: (actor: HubOperationalActor, object: ScopedObject) => permitted(actor, "people:recruitment-manage", object),
};
