import type { HubRole } from "@prisma/client";
import { hasHubPermission } from "./permissions";

export type HubStrategicGrowthActor = {
  id: string;
  organizationId: string;
  role: HubRole;
  directorateId?: string | null;
};

type Scoped = { organizationId: string; directorateId?: string | null };
type Assigned = Scoped & { ownerMemberId?: string | null };

const sameOrganization = (actor: HubStrategicGrowthActor, object: Scoped) => actor.organizationId === object.organizationId;
const organizationManager = (actor: HubStrategicGrowthActor) =>
  hasHubPermission(actor.role, "strategy:read-sensitive") || hasHubPermission(actor.role, "growth:read-sensitive");
const insideDirectorate = (actor: HubStrategicGrowthActor, object: Scoped) =>
  Boolean(actor.directorateId && object.directorateId && actor.directorateId === object.directorateId);

export const hubStrategyGrowthPolicy = {
  canAccessObjective(actor: HubStrategicGrowthActor, objective: Scoped) {
    return sameOrganization(actor, objective) && hasHubPermission(actor.role, "strategy:access") &&
      (actor.role !== "DIRECTOR" || insideDirectorate(actor, objective) || !objective.directorateId);
  },
  canManageObjective(actor: HubStrategicGrowthActor, objective: Assigned) {
    return sameOrganization(actor, objective) && hasHubPermission(actor.role, "strategy:manage") &&
      (organizationManager(actor) || insideDirectorate(actor, objective));
  },
  canUpdateKeyResult(actor: HubStrategicGrowthActor, objective: Assigned, keyResultOwnerId?: string | null) {
    return sameOrganization(actor, objective) && hasHubPermission(actor.role, "strategy:update-progress") &&
      (organizationManager(actor) || insideDirectorate(actor, objective) || objective.ownerMemberId === actor.id || keyResultOwnerId === actor.id);
  },
  canManageInitiative(actor: HubStrategicGrowthActor, initiative: Assigned) {
    return sameOrganization(actor, initiative) && hasHubPermission(actor.role, "strategy:update-progress") &&
      (organizationManager(actor) || insideDirectorate(actor, initiative) || initiative.ownerMemberId === actor.id);
  },
  canAccessRisk(actor: HubStrategicGrowthActor, risk: Scoped) {
    return sameOrganization(actor, risk) && hasHubPermission(actor.role, "strategy:access") &&
      (organizationManager(actor) || !risk.directorateId || insideDirectorate(actor, risk));
  },
  canManageRisk(actor: HubStrategicGrowthActor, risk: Assigned) {
    return sameOrganization(actor, risk) && hasHubPermission(actor.role, "strategy:update-progress") &&
      (organizationManager(actor) || insideDirectorate(actor, risk) || risk.ownerMemberId === actor.id);
  },
  canManageReview(actor: HubStrategicGrowthActor, review: Scoped & { createdById?: string | null; participantMemberIds?: string[] }) {
    return sameOrganization(actor, review) && hasHubPermission(actor.role, "strategy:access") &&
      ((hasHubPermission(actor.role, "strategy:review") && organizationManager(actor)) || review.createdById === actor.id || Boolean(review.participantMemberIds?.includes(actor.id)));
  },
  canAccessOpportunity(actor: HubStrategicGrowthActor, opportunity: Assigned) {
    return sameOrganization(actor, opportunity) && hasHubPermission(actor.role, "growth:access") &&
      (hasHubPermission(actor.role, "growth:read-sensitive") || insideDirectorate(actor, opportunity) || opportunity.ownerMemberId === actor.id);
  },
  canManageOpportunity(actor: HubStrategicGrowthActor, opportunity: Assigned) {
    return this.canAccessOpportunity(actor, opportunity) &&
      (hasHubPermission(actor.role, "growth:manage") || (hasHubPermission(actor.role, "growth:create") && opportunity.ownerMemberId === actor.id));
  },
  canReopenOpportunity(actor: HubStrategicGrowthActor, opportunity: Assigned) {
    return this.canAccessOpportunity(actor, opportunity) && hasHubPermission(actor.role, "growth:manage") &&
      (actor.role !== "DIRECTOR" || insideDirectorate(actor, opportunity));
  },
  canOverrideOpportunityProbability(actor: HubStrategicGrowthActor, opportunity: Assigned) {
    return this.canManageOpportunity(actor, opportunity) && hasHubPermission(actor.role, "growth:manage");
  },
  canManageLead(actor: HubStrategicGrowthActor, lead: Assigned) {
    return sameOrganization(actor, lead) && hasHubPermission(actor.role, "growth:access") &&
      (hasHubPermission(actor.role, "growth:manage") ? (actor.role !== "DIRECTOR" || insideDirectorate(actor, lead)) : hasHubPermission(actor.role, "growth:create") && lead.ownerMemberId === actor.id);
  },
  canManagePartnership(actor: HubStrategicGrowthActor, partnership: Assigned) {
    return sameOrganization(actor, partnership) && hasHubPermission(actor.role, "growth:access") &&
      (hasHubPermission(actor.role, "growth:manage") || partnership.ownerMemberId === actor.id);
  },
  canAccessProposal(actor: HubStrategicGrowthActor, proposal: Assigned & { createdById?: string | null }) {
    return sameOrganization(actor, proposal) && hasHubPermission(actor.role, "growth:access") &&
      ((hasHubPermission(actor.role, "growth:manage-proposals") && (hasHubPermission(actor.role, "growth:read-sensitive") || insideDirectorate(actor, proposal))) ||
        (hasHubPermission(actor.role, "growth:create") && (proposal.createdById === actor.id || proposal.ownerMemberId === actor.id)));
  },
  canReadSensitiveContact(actor: HubStrategicGrowthActor, object: Scoped) {
    return sameOrganization(actor, object) && hasHubPermission(actor.role, "growth:read-sensitive");
  },
};

export function strategyCapabilities(actor: HubStrategicGrowthActor, object: Assigned) {
  return {
    canEdit: hubStrategyGrowthPolicy.canManageObjective(actor, object),
    canUpdateProgress: hubStrategyGrowthPolicy.canUpdateKeyResult(actor, object),
    canReadSensitive: hasHubPermission(actor.role, "strategy:read-sensitive"),
  };
}

export function opportunityCapabilities(actor: HubStrategicGrowthActor, object: Assigned & { createdById?: string | null }) {
  return {
    canEdit: hubStrategyGrowthPolicy.canManageOpportunity(actor, object),
    canMove: hubStrategyGrowthPolicy.canManageOpportunity(actor, object),
    canManageProposals: hubStrategyGrowthPolicy.canAccessProposal(actor, object),
    canReadSensitive: hasHubPermission(actor.role, "growth:read-sensitive"),
    canCancel: hubStrategyGrowthPolicy.canManageOpportunity(actor, object),
    canReopen: hubStrategyGrowthPolicy.canReopenOpportunity(actor, object),
    canOverrideProbability: hubStrategyGrowthPolicy.canOverrideOpportunityProbability(actor, object),
  };
}

export const initiativeCapabilities = (actor: HubStrategicGrowthActor, object: Assigned) => ({ canEdit: hubStrategyGrowthPolicy.canManageInitiative(actor, object) });
export const riskCapabilities = (actor: HubStrategicGrowthActor, object: Assigned) => ({ canEdit: hubStrategyGrowthPolicy.canManageRisk(actor, object) });
export const reviewCapabilities = (actor: HubStrategicGrowthActor, object: Scoped & { createdById?: string | null; participantMemberIds?: string[] }) => ({ canClose: hubStrategyGrowthPolicy.canManageReview(actor, object) });
export const leadCapabilities = (actor: HubStrategicGrowthActor, object: Assigned) => ({ canEdit: hubStrategyGrowthPolicy.canManageLead(actor, object), canConvert: hubStrategyGrowthPolicy.canManageLead(actor, object) });
export const proposalCapabilities = (actor: HubStrategicGrowthActor, object: Assigned & { createdById?: string | null }) => ({ canManage: hubStrategyGrowthPolicy.canAccessProposal(actor, object) });
export const partnershipCapabilities = (actor: HubStrategicGrowthActor, object: Assigned) => ({ canEdit: hubStrategyGrowthPolicy.canManagePartnership(actor, object) });

export function strategicDirectorateScope(actor: HubStrategicGrowthActor) {
  if (hasHubPermission(actor.role, "strategy:read-sensitive") || !hasHubPermission(actor.role, "strategy:manage")) return {};
  return actor.directorateId ? { OR: [{ directorateId: actor.directorateId }, { directorateId: null }] } : { directorateId: null };
}

export function growthDirectorateScope(actor: HubStrategicGrowthActor) {
  if (hasHubPermission(actor.role, "growth:read-sensitive")) return {};
  return { OR: [
    { ownerMemberId: actor.id },
    ...(actor.directorateId ? [{ directorateId: actor.directorateId }] : []),
  ] };
}
