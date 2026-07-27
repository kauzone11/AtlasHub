import assert from "node:assert/strict";
import test from "node:test";
import { hubOperationalPolicy } from "./operations-policy";
import { assertSafeHttpsUrl, csvCell, normalizeSearch } from "./operations-validation";
import { hasHubPermission } from "./permissions";

const admin = { id: "admin", organizationId: "org-a", role: "ADMIN" as const, directorateId: null };
const director = { id: "director", organizationId: "org-a", role: "DIRECTOR" as const, directorateId: "dir-a" };
const member = { id: "member", organizationId: "org-a", role: "MEMBER" as const, directorateId: "dir-a" };

test("operational permissions give administrators full finance and people access", () => {
  for (const permission of ["finance:access", "finance:create", "finance:review", "finance:settle", "finance:manage", "finance:reports", "finance:budget-manage", "finance:period-close", "people:access", "people:manage", "people:read-sensitive", "people:recruitment-manage"] as const) assert.equal(hasHubPermission("ADMIN", permission), true);
});
test("finance role cannot read sensitive people data", () => assert.equal(hasHubPermission("FINANCE", "people:read-sensitive"), false));
test("viewer has no operational write permission", () => { assert.equal(hasHubPermission("VIEWER", "finance:create"), false); assert.equal(hasHubPermission("VIEWER", "people:manage-own-profile"), false); });
test("financial object policy rejects cross-organization access", () => assert.equal(hubOperationalPolicy.canViewFinancialEntry(admin, { organizationId: "org-b" }), false));
test("self approval is rejected by normal object policy", () => assert.equal(hubOperationalPolicy.canApproveFinancialEntry(admin, { organizationId: "org-a", createdById: "admin" }), false));
test("directors can manage only their own directorate", () => { assert.equal(hubOperationalPolicy.canManageDirectorate(director, { organizationId: "org-a", directorateId: "dir-a" }), true); assert.equal(hubOperationalPolicy.canManageDirectorate(director, { organizationId: "org-a", directorateId: "dir-b" }), false); });
test("members access only their own profile", () => { assert.equal(hubOperationalPolicy.canAccessMemberProfile(member, { organizationId: "org-a", memberId: "member" }), true); assert.equal(hubOperationalPolicy.canAccessMemberProfile(member, { organizationId: "org-a", memberId: "other" }), false); });
test("recruitment remains restricted", () => { assert.equal(hubOperationalPolicy.canAccessRecruitment(admin, { organizationId: "org-a" }), true); assert.equal(hubOperationalPolicy.canAccessRecruitment(director, { organizationId: "org-a" }), false); });
test("search normalization is accent and case insensitive", () => assert.equal(normalizeSearch("  São João "), "sao joao"));
test("safe URL accepts public HTTPS", () => assert.equal(assertSafeHttpsUrl("https://example.com/receipt"), "https://example.com/receipt"));
test("safe URL rejects credentials and private hosts", () => { assert.throws(() => assertSafeHttpsUrl("https://user:pass@example.com")); assert.throws(() => assertSafeHttpsUrl("https://192.168.0.1/receipt")); assert.throws(() => assertSafeHttpsUrl("http://example.com")); });
test("CSV cells neutralize formula injection and quote content", () => { assert.equal(csvCell("=1+1"), '"\'=1+1"'); assert.equal(csvCell('a"b'), '"a""b"'); });
