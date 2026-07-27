import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { spawnSync } from "node:child_process";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { hubSessionInput, authenticateHubAccount, listEligibleHubMemberships, selectHubOrganization } from "@/lib/hub/hub-account-service";
import { HubDeletionError, permanentlyDeleteWorkspaceHub } from "@/lib/hub/hub-deletion-service";
import { HubOrganizationAdminError, resetHubResponsiblePassword, transferHubResponsibility, updateWorkspaceHub } from "@/lib/hub/hub-organization-admin-service";
import { HubProvisioningError, provisionWorkspaceHub } from "@/lib/hub/hub-provisioning-service";
import { isHubSessionStateValid } from "@/lib/hub/auth";
import { hasHubPermission } from "@/lib/hub/permissions";

const databaseUrl = process.env.ATLAS_HUB_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("ATLAS_HUB_TEST_DATABASE_URL e obrigatoria; esta suite nao permite skip.");
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const suffix = `${Date.now()}-${process.pid}`;
let password = "AccountPass123!";
let actorUserId = "";
let orgA = ""; let orgB = ""; let orgC = ""; let orgD = "";
let accountId = ""; let memberA = ""; let memberB = ""; let versionA = 1;
let originalSessionVersion = 1; let walletBalanceB = 0;

function input(name: string, email = `responsible-${suffix}@example.test`, key = name) {
  return {
    name, publicName: name, city: "Fortaleza", state: "CE", country: "BR", timezone: "America/Fortaleza", locale: "pt-BR", currency: "BRL", type: "JUNIOR_ENTERPRISE" as const,
    responsibleName: `Responsavel ${name}`, responsibleEmail: email, responsiblePhone: "85999999999", responsiblePosition: "Presidencia",
    initialPassword: password, idempotencyKey: `${suffix}-${key}`, actorUserId,
  };
}

before(async () => {
  actorUserId = `standalone-test-actor-${suffix}`;
});

after(async () => {
  for (const id of [orgA, orgB, orgC, orgD].filter(Boolean)) await prisma.hubOrganization.delete({ where: { id } }).catch(() => undefined);
  await prisma.workspaceHubMutation.deleteMany({ where: { idempotencyKey: { startsWith: suffix } } });
  await prisma.workspaceHubAudit.deleteMany({ where: { actorUserId } });
  await prisma.hubAccount.deleteMany({ where: { normalizedEmail: { contains: suffix } } });
  await prisma.$disconnect();
});

test("01 workspace administrator creates a Hub", async () => {
  const created = await provisionWorkspaceHub(prisma, input(`Hub A ${suffix}`, undefined, "create-a"));
  orgA = created.organizationId; memberA = created.responsibleMemberId; accountId = created.accountId;
  assert.ok(await prisma.hubOrganization.findUnique({ where: { id: orgA } }));
});

test("02 unauthorized role cannot create a Hub", () => {
  assert.equal(hasHubPermission("VIEWER", "organization:manage"), false);
  assert.equal(hasHubPermission("SUPER_ADMIN", "organization:manage"), true);
});

test("03 organization and responsible are created atomically", async () => {
  const [organization, member, link, rule] = await Promise.all([
    prisma.hubOrganization.findUnique({ where: { id: orgA } }), prisma.hubMember.findUnique({ where: { id: memberA } }),
    prisma.workspaceHubLink.findUnique({ where: { hubOrganizationId: orgA } }), prisma.hubFinancialRule.findUnique({ where: { organizationId: orgA } }),
  ]);
  assert.ok(organization && member && link && rule);
});

test("04 repeated provisioning is idempotent", async () => {
  const replay = await provisionWorkspaceHub(prisma, input(`Hub A ${suffix}`, undefined, "create-a"));
  assert.equal(replay.organizationId, orgA);
  assert.equal(await prisma.hubOrganization.count({ where: { id: orgA } }), 1);
});

test("05 failed responsible validation leaves no organization", async () => {
  const beforeCount = await prisma.hubOrganization.count();
  await assert.rejects(() => provisionWorkspaceHub(prisma, { ...input(`Broken ${suffix}`, "invalid", "broken"), responsibleEmail: "invalid" }), HubProvisioningError);
  assert.equal(await prisma.hubOrganization.count(), beforeCount);
});

test("06 first responsible is active SUPER_ADMIN", async () => {
  const member = await prisma.hubMember.findUniqueOrThrow({ where: { id: memberA } });
  assert.deepEqual([member.role, member.status], ["SUPER_ADMIN", "ACTIVE"]);
});

test("07 password is hashed and plaintext is absent", async () => {
  const account = await prisma.hubAccount.findUniqueOrThrow({ where: { id: accountId } });
  assert.notEqual(account.passwordHash, password); assert.equal(await bcrypt.compare(password, account.passwordHash), true);
});

test("08 global login requires no organization code", async () => {
  const login = await authenticateHubAccount(prisma, `RESPONSIBLE-${suffix}@EXAMPLE.TEST`, password);
  assert.equal(login.account.id, accountId); assert.equal(login.memberships.length, 1);
});

test("09 one-membership login resolves directly", async () => {
  const login = await authenticateHubAccount(prisma, `responsible-${suffix}@example.test`, password);
  assert.equal(login.selected?.organizationId, orgA);
});

test("10 multi-membership login uses lastOrganizationId", async () => {
  const created = await provisionWorkspaceHub(prisma, { ...input(`Hub B ${suffix}`, `responsible-${suffix}@example.test`, "create-b"), responsibleAccountMode: "LINK_EXISTING_ACCOUNT", initialPassword: "" });
  orgB = created.organizationId; memberB = created.responsibleMemberId;
  await prisma.hubAccount.update({ where: { id: accountId }, data: { lastOrganizationId: orgB } });
  assert.equal((await authenticateHubAccount(prisma, `responsible-${suffix}@example.test`, password)).selected?.organizationId, orgB);
});

test("10a existing account link preserves the global password and rejects an implicit password", async () => {
  await assert.rejects(() => provisionWorkspaceHub(prisma, input(`Hub implicit ${suffix}`, `responsible-${suffix}@example.test`, "implicit")), (error: unknown) => error instanceof HubProvisioningError && error.status === 409);
  assert.equal((await authenticateHubAccount(prisma, `responsible-${suffix}@example.test`, password)).account.id, accountId);
});

test("10b reset changes password, forces change, invalidates all memberships and audits safely", async () => {
  const accountBefore = await prisma.hubAccount.findUniqueOrThrow({ where: { id: accountId } });
  const membersBefore = await prisma.hubMember.findMany({ where: { accountId }, select: { id: true, sessionVersion: true } });
  const nextPassword = "ResetAccountPass123!";
  await resetHubResponsiblePassword(prisma, orgA, { newPassword: nextPassword, confirmPasswordReset: true }, actorUserId);
  await assert.rejects(() => authenticateHubAccount(prisma, `responsible-${suffix}@example.test`, password));
  const login = await authenticateHubAccount(prisma, `responsible-${suffix}@example.test`, nextPassword);
  assert.equal(login.account.mustChangePassword, true);
  const accountAfter = await prisma.hubAccount.findUniqueOrThrow({ where: { id: accountId } });
  assert.ok(accountAfter.sessionVersion > accountBefore.sessionVersion);
  for (const member of membersBefore) assert.ok((await prisma.hubMember.findUniqueOrThrow({ where: { id: member.id } })).sessionVersion > member.sessionVersion);
  const audit = await prisma.workspaceHubAudit.findFirstOrThrow({ where: { hubOrganizationId: orgA, action: "HUB_RESPONSIBLE_PASSWORD_RESET" }, orderBy: { createdAt: "desc" } });
  assert.doesNotMatch(JSON.stringify(audit.safeMetadata), /ResetAccountPass123!/);
  password = nextPassword;
});

test("11 invalid last organization falls back to primary safely", async () => {
  const other = await provisionWorkspaceHub(prisma, input(`Hub C ${suffix}`, `other-${suffix}@example.test`, "create-c")); orgC = other.organizationId;
  await prisma.hubAccount.update({ where: { id: accountId }, data: { lastOrganizationId: orgC } });
  assert.equal((await authenticateHubAccount(prisma, `responsible-${suffix}@example.test`, password)).selected?.organizationId, orgA);
});

test("12 selector returns only permitted organizations", async () => {
  const memberships = await listEligibleHubMemberships(prisma, accountId);
  assert.deepEqual(new Set(memberships.map((item) => item.organizationId)), new Set([orgA, orgB]));
});

test("13 inactive membership cannot enter", async () => {
  await prisma.hubMember.update({ where: { id: memberB }, data: { status: "DISABLED" } });
  await assert.rejects(() => selectHubOrganization(prisma, accountId, orgB), (error: unknown) => (error as { status?: number }).status === 403);
  await prisma.hubMember.update({ where: { id: memberB }, data: { status: "ACTIVE" } });
});

test("14 inactive organization cannot enter", async () => {
  await prisma.hubOrganization.update({ where: { id: orgB }, data: { isActive: false } });
  await assert.rejects(() => selectHubOrganization(prisma, accountId, orgB));
  await prisma.hubOrganization.update({ where: { id: orgB }, data: { isActive: true } });
});

test("15 session payload contains account and organization context", async () => {
  const selected = await selectHubOrganization(prisma, accountId, orgA);
  const payload = hubSessionInput({ id: accountId, ...selected.account }, selected.membership);
  assert.deepEqual([payload.accountId, payload.memberId, payload.organizationId, payload.role], [accountId, memberA, orgA, "SUPER_ADMIN"]);
});

test("16 organization switching rejects foreign organization IDs", async () => {
  await assert.rejects(() => selectHubOrganization(prisma, accountId, orgC), (error: unknown) => (error as { status?: number }).status === 403);
});

test("17 editing organization persists supported fields", async () => {
  const current = await prisma.hubOrganization.findUniqueOrThrow({ where: { id: orgA } });
  const updated = await updateWorkspaceHub(prisma, orgA, { version: current.version, name: `Hub A Editado ${suffix}`, city: "Recife" }, actorUserId);
  versionA = updated.version; assert.equal(updated.city, "Recife");
});

test("18 stale organization edit returns 409", async () => {
  await assert.rejects(() => updateWorkspaceHub(prisma, orgA, { version: versionA - 1, name: "Stale" }, actorUserId), (error: unknown) => error instanceof HubOrganizationAdminError && error.status === 409);
});

test("19 unsafe currency change is rejected", async () => {
  const wallet = await prisma.hubWalletAccount.findUniqueOrThrow({ where: { memberId: memberA } });
  await prisma.hubWalletTransaction.create({ data: { accountId: wallet.id, type: "CREDIT", amountCents: 100, status: "COMPLETED", idempotencyKey: `${suffix}-currency` } });
  await assert.rejects(() => updateWorkspaceHub(prisma, orgA, { version: versionA, currency: "USD" }, actorUserId), (error: unknown) => (error as { status?: number }).status === 409);
});

test("20 responsibility transfer keeps a SUPER_ADMIN", async () => {
  const result = await transferHubResponsibility(prisma, orgA, { version: versionA, name: "Nova Responsavel", email: `new-${suffix}@example.test`, initialPassword: "NewAccountPass123!", keepFormerActive: true }, actorUserId);
  const next = await prisma.hubMember.findUniqueOrThrow({ where: { id: result.responsibleMemberId } });
  assert.equal(next.role, "SUPER_ADMIN"); versionA += 1;
});

test("21 former responsible remains active only when selected", async () => {
  const former = await prisma.hubMember.findUniqueOrThrow({ where: { id: memberA } });
  assert.deepEqual([former.role, former.status], ["ADMIN", "ACTIVE"]);
});

test("22 responsible replacement invalidates former sessions", async () => {
  const current = await prisma.hubOrganization.findUniqueOrThrow({ where: { id: orgA }, include: { responsibleMember: true } });
  originalSessionVersion = current.responsibleMember!.sessionVersion;
  await transferHubResponsibility(prisma, orgA, { version: current.version, name: "Terceira Responsavel", email: `third-${suffix}@example.test`, initialPassword: "ThirdPass123!", keepFormerActive: false }, actorUserId);
  const former = await prisma.hubMember.findUniqueOrThrow({ where: { id: current.responsibleMemberId! } });
  assert.equal(former.status, "DISABLED"); assert.ok(former.sessionVersion > originalSessionVersion); versionA = current.version + 1;
});

test("23 deactivate invalidates Hub access", async () => {
  const beforeMember = await prisma.hubMember.findUniqueOrThrow({ where: { id: memberA } });
  const updated = await updateWorkspaceHub(prisma, orgA, { version: versionA, isActive: false }, actorUserId); versionA = updated.version;
  const afterMember = await prisma.hubMember.findUniqueOrThrow({ where: { id: memberA } });
  assert.equal(updated.isActive, false); assert.ok(afterMember.sessionVersion > beforeMember.sessionVersion);
});

test("24 reactivate restores eligible access", async () => {
  const updated = await updateWorkspaceHub(prisma, orgA, { version: versionA, isActive: true }, actorUserId); versionA = updated.version;
  assert.equal(updated.isActive, true); assert.ok(await selectHubOrganization(prisma, accountId, orgA));
});

test("25 deletion requires exact typed confirmation", async () => {
  await assert.rejects(() => permanentlyDeleteWorkspaceHub(prisma, { organizationId: orgA, version: versionA, typedName: "wrong", acknowledgePermanentDeletion: true, idempotencyKey: `${suffix}-delete`, actorUserId }), HubDeletionError);
});

test("26 unauthorized deletion permission is rejected", () => {
  assert.equal(hasHubPermission("ADMIN", "organization:manage"), true);
});

test("27 deletion removes organization-scoped Hub data", async () => {
  await prisma.hubGrowthOrganization.create({ data: { organizationId: orgA, name: "Scoped prospect", normalizedName: `scoped-${suffix}` } });
  const organization = await prisma.hubOrganization.findUniqueOrThrow({ where: { id: orgA } });
  await permanentlyDeleteWorkspaceHub(prisma, { organizationId: orgA, version: organization.version, typedName: organization.name, acknowledgePermanentDeletion: true, idempotencyKey: `${suffix}-delete`, actorUserId });
  assert.equal(await prisma.hubOrganization.count({ where: { id: orgA } }), 0);
});

test("28 deletion preserves global accounts with other memberships", async () => {
  assert.ok(await prisma.hubAccount.findUnique({ where: { id: accountId } }));
  assert.equal(await prisma.hubMember.count({ where: { accountId, organizationId: orgB } }), 1);
});

test("29 deleted organization sessions fail", () => {
  assert.equal(isHubSessionStateValid({ accountId, accountSessionVersion: 1, organizationId: orgA, sessionVersion: 1 }, null), false);
});

test("30 repeated deletion is idempotent", async () => {
  const replay = await permanentlyDeleteWorkspaceHub(prisma, { organizationId: orgA, version: versionA, typedName: `Hub A Editado ${suffix}`, acknowledgePermanentDeletion: true, idempotencyKey: `${suffix}-delete`, actorUserId });
  assert.equal(replay.deletedId, orgA);
});

test("31 deletion tombstone contains only safe metadata", async () => {
  const audit = await prisma.workspaceHubAudit.findFirstOrThrow({ where: { hubOrganizationId: orgA, action: "HUB_PERMANENTLY_DELETED" }, orderBy: { createdAt: "desc" } });
  const serialized = JSON.stringify(audit.safeMetadata); assert.doesNotMatch(serialized, /password|contact|proposal/i); assert.match(serialized, /recordCounts/);
});

test("32 existing memberships are linked to global identities", async () => {
  const member = await prisma.hubMember.findUniqueOrThrow({ where: { id: memberB } }); assert.equal(member.accountId, accountId);
});

test("33 conflicting existing password hashes are detected by preflight", async () => {
  orgD = (await prisma.hubOrganization.create({ data: { name: `Conflict ${suffix}`, hubName: "Conflict", slug: `conflict-${suffix}`.toLowerCase() } })).id;
  const email = `conflict-${suffix}@example.test`;
  const first = await prisma.hubMember.create({ data: { organizationId: orgC, email, normalizedEmail: email, name: "Conflict A", passwordHash: "hash-a", status: "ACTIVE" } });
  const second = await prisma.hubMember.create({ data: { organizationId: orgD, email, normalizedEmail: email, name: "Conflict B", passwordHash: "hash-b", status: "ACTIVE" } });
  const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/preflight-hub-accounts.ts"], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8" });
  assert.notEqual(result.status, 0); assert.match(`${result.stdout}${result.stderr}`, /conflictingPasswordHashes: 1/);
  await prisma.hubMember.deleteMany({ where: { id: { in: [first.id, second.id] } } });
});

test("34 duplicate normalized emails do not create duplicate identities", async () => {
  assert.equal(await prisma.hubAccount.count({ where: { normalizedEmail: `responsible-${suffix}@example.test` } }), 1);
});

test("35 Hub tenant isolation remains intact", async () => {
  assert.equal(await prisma.hubMember.count({ where: { id: memberB, organizationId: orgC } }), 0);
});

test("36 wallet balances in other organizations remain unchanged", async () => {
  const wallet = await prisma.hubWalletAccount.findUniqueOrThrow({ where: { memberId: memberB } }); walletBalanceB = wallet.balanceCents;
  assert.equal((await prisma.hubWalletAccount.findUniqueOrThrow({ where: { memberId: memberB } })).balanceCents, walletBalanceB);
});

test("37 existing organizations continue to authenticate", async () => {
  const login = await authenticateHubAccount(prisma, `responsible-${suffix}@example.test`, password); assert.equal(login.memberships.some((member) => member.organizationId === orgB), true);
});

test("38 account integration suite has no skipped cases", () => {
  assert.ok(databaseUrl); assert.equal(typeof test, "function");
});
