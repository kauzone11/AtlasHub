import type { HubRole } from "@prisma/client";

export type HubPermission =
  | "member:access"
  | "request:create"
  | "admin:access"
  | "organization:manage"
  | "members:manage"
  | "directorates:manage"
  | "projects:manage"
  | "wallet:manage"
  | "requests:review"
  | "financial-rules:manage"
  | "audit:read-full"
  | "audit:read-financial"
  | "collaboration:access"
  | "availability:manage-own"
  | "availability:read-organization"
  | "meetings:create"
  | "meetings:manage-all"
  | "boards:create"
  | "boards:manage-all"
  | "tasks:manage-all"
  | "finance:access"
  | "finance:create"
  | "finance:review"
  | "finance:settle"
  | "finance:manage"
  | "finance:reports"
  | "finance:budget-manage"
  | "finance:budget-read"
  | "finance:period-close"
  | "people:access"
  | "people:manage"
  | "people:manage-directorate"
  | "people:read-sensitive"
  | "people:cycles-manage"
  | "people:evaluate"
  | "people:recruitment-manage"
  | "people:manage-own-profile"
  | "strategy:access"
  | "strategy:manage"
  | "strategy:update-progress"
  | "strategy:review"
  | "strategy:read-sensitive"
  | "growth:access"
  | "growth:create"
  | "growth:manage"
  | "growth:manage-pipeline"
  | "growth:manage-proposals"
  | "growth:reports"
  | "growth:read-sensitive";

const ALL: HubPermission[] = [
  "member:access", "request:create", "admin:access", "organization:manage", "members:manage", "directorates:manage",
  "projects:manage", "wallet:manage", "requests:review", "financial-rules:manage",
  "audit:read-full", "audit:read-financial",
  "collaboration:access", "availability:manage-own", "availability:read-organization",
  "meetings:create", "meetings:manage-all", "boards:create", "boards:manage-all", "tasks:manage-all",
  "finance:access", "finance:create", "finance:review", "finance:settle", "finance:manage", "finance:reports",
  "finance:budget-manage", "finance:budget-read", "finance:period-close", "people:access", "people:manage", "people:manage-directorate",
  "people:read-sensitive", "people:cycles-manage", "people:evaluate", "people:recruitment-manage", "people:manage-own-profile",
  "strategy:access", "strategy:manage", "strategy:update-progress", "strategy:review", "strategy:read-sensitive",
  "growth:access", "growth:create", "growth:manage", "growth:manage-pipeline", "growth:manage-proposals", "growth:reports", "growth:read-sensitive",
];

export const HUB_ROLE_PERMISSIONS: Record<HubRole, readonly HubPermission[]> = {
  SUPER_ADMIN: ALL,
  ADMIN: ALL,
  FINANCE: ["member:access", "request:create", "admin:access", "projects:manage", "wallet:manage", "requests:review", "financial-rules:manage", "audit:read-financial", "collaboration:access", "availability:manage-own", "meetings:create", "finance:access", "finance:create", "finance:review", "finance:settle", "finance:manage", "finance:reports", "finance:budget-manage", "finance:budget-read", "finance:period-close", "people:access", "people:manage-own-profile", "strategy:access", "growth:reports"],
  DIRECTOR: ["member:access", "request:create", "collaboration:access", "availability:manage-own", "availability:read-organization", "meetings:create", "boards:create", "finance:budget-read", "people:access", "people:manage-directorate", "people:evaluate", "people:manage-own-profile", "strategy:access", "strategy:manage", "strategy:update-progress", "strategy:review", "growth:access", "growth:create", "growth:manage", "growth:manage-proposals", "growth:reports"],
  MEMBER: ["member:access", "request:create", "collaboration:access", "availability:manage-own", "people:access", "people:evaluate", "people:manage-own-profile", "strategy:access", "strategy:update-progress", "growth:access", "growth:create"],
  VIEWER: ["member:access", "collaboration:access", "strategy:access"],
};

export function hasHubPermission(role: HubRole | string | null | undefined, permission: HubPermission) {
  if (!role || !(role in HUB_ROLE_PERMISSIONS)) return false;
  return HUB_ROLE_PERMISSIONS[role as HubRole].includes(permission);
}

const HUB_ROLE_LEVELS: Record<HubRole, number> = {
  SUPER_ADMIN: 60,
  ADMIN: 50,
  FINANCE: 40,
  DIRECTOR: 30,
  MEMBER: 20,
  VIEWER: 10,
};

export class HubMemberPolicyError extends Error {
  readonly status = 403 as const;

  constructor() {
    super("Ação não permitida.");
    this.name = "HubMemberPolicyError";
  }
}

export function hubRoleLevel(role: HubRole) {
  return HUB_ROLE_LEVELS[role];
}

export function canManageHubMember(actorRole: HubRole, targetRole: HubRole) {
  if (!hasHubPermission(actorRole, "members:manage")) return false;
  if (targetRole === "SUPER_ADMIN") return actorRole === "SUPER_ADMIN";
  return hubRoleLevel(targetRole) <= hubRoleLevel(actorRole);
}

export function canAssignHubRole(actorRole: HubRole, targetRole: HubRole) {
  if (!hasHubPermission(actorRole, "members:manage")) return false;
  if (targetRole === "SUPER_ADMIN") return actorRole === "SUPER_ADMIN";
  return hubRoleLevel(targetRole) <= hubRoleLevel(actorRole);
}

export function assertCanManageHubMember(actorRole: HubRole, targetRole: HubRole) {
  if (!canManageHubMember(actorRole, targetRole)) throw new HubMemberPolicyError();
}

export function assertCanAssignHubRole(actorRole: HubRole, targetRole: HubRole) {
  if (!canAssignHubRole(actorRole, targetRole)) throw new HubMemberPolicyError();
}
