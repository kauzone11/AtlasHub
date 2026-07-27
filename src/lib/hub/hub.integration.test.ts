import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { assertOrganizationRetainsActiveSuperAdmin } from "./member-management";
import { approveHubWalletRequest, createHubManualTransaction, createHubMemberWalletRequest, rejectHubWalletRequest, reverseHubWalletTransaction } from "./wallet-operations";
import { payApprovedProject, reverseApprovedProject } from "./projects";
import { ensureBackfilledHubMember } from "./backfill";
import { HubCurrencyLockedError, HUB_LEGACY_ORGANIZATION_SLUG, resolveLegacyHubOrganization, updateHubOrganizationSettingsAtomic } from "./organization";
import { resolveHubLoginMember } from "./login";
import { provisionHubOrganization, STANDARD_HUB_DIRECTORATES } from "./provisioning";
import { hashHubPassword } from "./auth";
import { writeHubAudit } from "./audit";
import { createHubNotifications } from "./notifications";

const testDatabaseUrl = process.env.ATLAS_HUB_TEST_DATABASE_URL || process.env.ECONOMIK_TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("ATLAS_HUB_TEST_DATABASE_URL é obrigatória para executar os testes de integração do Hub.");

async function deleteHubTestOrganizations(prisma: PrismaClient, organizationIds: string[]) {
  await prisma.$transaction(async (tx) => {
    await tx.hubWalletRequest.deleteMany({ where: { member: { organizationId: { in: organizationIds } } } });
    await tx.hubWalletTransaction.deleteMany({ where: { account: { member: { organizationId: { in: organizationIds } } } } });
    await tx.hubWalletAccount.deleteMany({ where: { member: { organizationId: { in: organizationIds } } } });
    await tx.hubAuditLog.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await tx.hubProject.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await tx.hubFinancialRule.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await tx.hubMember.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await tx.hubDirectorate.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await tx.hubOrganization.deleteMany({ where: { id: { in: organizationIds } } });
  });
}

test("resolução do seed reutiliza o tenant legado sem duplicar nem romper associações", async () => {
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const rollbackMarker = "ROLLBACK_HUB_WORKSPACE_RESOLUTION_TEST";
  try {
    await assert.rejects(() => prisma.$transaction(async (tx) => {
      const existing = await tx.hubOrganization.upsert({
        where: { slug: HUB_LEGACY_ORGANIZATION_SLUG },
        update: {},
        create: { name: "Economik pilot", hubName: "Economik Hub", slug: HUB_LEGACY_ORGANIZATION_SLUG },
      });
      const directorate = await tx.hubDirectorate.upsert({
        where: { organizationId_slug: { organizationId: existing.id, slug: "test-preserved" } },
        update: {},
        create: { organizationId: existing.id, name: "Test preserved", slug: "test-preserved" },
      });
      const customized = await tx.hubOrganization.update({
        where: { id: existing.id },
        data: {
          name: "Economik personalizada",
          hubName: "Hub do cliente",
          logoUrl: "https://example.com/custom-logo.png",
          timezone: "America/Fortaleza",
          locale: "en-US",
          currency: "USD",
          isActive: false,
        },
      });

      const first = await resolveLegacyHubOrganization(tx);
      const second = await resolveLegacyHubOrganization(tx);
      assert.equal(first.id, existing.id);
      assert.equal(second.id, existing.id);
      assert.equal(first.slug, HUB_LEGACY_ORGANIZATION_SLUG);
      assert.equal(first.name, customized.name);
      assert.equal(first.hubName, customized.hubName);
      assert.equal(first.logoUrl, customized.logoUrl);
      assert.equal(first.timezone, customized.timezone);
      assert.equal(first.locale, customized.locale);
      assert.equal(first.currency, customized.currency);
      assert.equal(first.isActive, customized.isActive);
      assert.equal(await tx.hubOrganization.count({ where: { slug: HUB_LEGACY_ORGANIZATION_SLUG } }), 1);
      assert.equal((await tx.hubDirectorate.findUniqueOrThrow({ where: { id: directorate.id } })).organizationId, existing.id);
      throw new Error(rollbackMarker);
    }), new RegExp(rollbackMarker));
  } finally {
    await prisma.$disconnect();
  }
});

test("operações simultâneas preservam ao menos um SUPER_ADMIN ativo", async () => {
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const organization = await prisma.hubOrganization.create({ data: { name: `Atlas Hub test ${suffix}`, hubName: `Atlas Hub test ${suffix}`, slug: `hub-test-${suffix}` } });
  try {
    const members = await Promise.all(["a", "b"].map((name) => prisma.hubMember.create({
      data: {
        organizationId: organization.id,
        email: `${name}-${suffix}@example.test`,
        normalizedEmail: `${name}-${suffix}@example.test`,
        name,
        passwordHash: "integration-test-not-a-real-credential",
        role: "SUPER_ADMIN",
        status: "ACTIVE",
      },
    })));

    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const disable = (memberId: string) => prisma.$transaction(async (tx) => {
      await assertOrganizationRetainsActiveSuperAdmin(tx, {
        organizationId: organization.id,
        currentRole: "SUPER_ADMIN",
        currentStatus: "ACTIVE",
        nextRole: "SUPER_ADMIN",
        nextStatus: "DISABLED",
      });
      arrivals += 1;
      if (arrivals === 2) release();
      await gate;
      await tx.hubMember.update({ where: { id: memberId }, data: { status: "DISABLED", sessionVersion: { increment: 1 } } });
    }, { isolationLevel: "Serializable" });

    const results = await Promise.allSettled(members.map((member) => disable(member.id)));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(await prisma.hubMember.count({ where: { organizationId: organization.id, role: "SUPER_ADMIN", status: "ACTIVE" } }), 1);
  } finally {
    await prisma.hubOrganization.delete({ where: { id: organization.id } });
    await prisma.$disconnect();
  }
});

test("o mesmo e-mail é permitido entre organizações e rejeitado dentro da mesma organização", async () => {
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const first = await prisma.hubOrganization.create({ data: { name: "First", hubName: "First", slug: `first-${suffix}` } });
  const second = await prisma.hubOrganization.create({ data: { name: "Second", hubName: "Second", slug: `second-${suffix}` } });
  try {
    const normalizedEmail = `duplicate-${suffix}@example.test`;
    await prisma.hubMember.create({ data: { organizationId: first.id, email: normalizedEmail, normalizedEmail, name: "First", passwordHash: "integration-test", status: "ACTIVE" } });
    await prisma.hubMember.create({ data: { organizationId: second.id, email: normalizedEmail.toUpperCase(), normalizedEmail, name: "Second", passwordHash: "integration-test", status: "ACTIVE" } });
    await assert.rejects(() => prisma.hubMember.create({ data: { organizationId: first.id, email: normalizedEmail, normalizedEmail, name: "Duplicate", passwordHash: "integration-test", status: "ACTIVE" } }), (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002"));
  } finally {
    await prisma.hubOrganization.deleteMany({ where: { id: { in: [first.id, second.id] } } });
    await prisma.$disconnect();
  }
});

test("operações financeiras concorrentes são atômicas, idempotentes e limitadas à organização", async () => {
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const organization = await prisma.hubOrganization.create({ data: { name: "Finance test", hubName: "Finance test", slug: `finance-${suffix}` } });
  const otherOrganization = await prisma.hubOrganization.create({ data: { name: "Other", hubName: "Other", slug: `other-finance-${suffix}` } });
  try {
    const actor = await prisma.hubMember.create({ data: { organizationId: organization.id, email: `actor-${suffix}@example.test`, normalizedEmail: `actor-${suffix}@example.test`, name: "Actor", passwordHash: "integration-test", role: "SUPER_ADMIN", status: "ACTIVE" } });
    const member = await prisma.hubMember.create({ data: { organizationId: organization.id, email: `member-${suffix}@example.test`, normalizedEmail: `member-${suffix}@example.test`, name: "Member", passwordHash: "integration-test", status: "ACTIVE" } });
    const account = await prisma.hubWalletAccount.create({ data: { memberId: member.id, balanceCents: 10_000 } });

    const firstRequest = await prisma.hubWalletRequest.create({ data: { accountId: account.id, memberId: member.id, amountCents: 2_000, reason: "Primeira aprovação" } });
    const doubleApproval = await Promise.allSettled([1, 2].map(() => prisma.$transaction((tx) => approveHubWalletRequest(tx, { requestId: firstRequest.id, organizationId: organization.id, actorId: actor.id }), { isolationLevel: "Serializable" })));
    assert.equal(doubleApproval.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(await prisma.hubWalletTransaction.count({ where: { sourceType: "REQUEST_APPROVAL", sourceId: firstRequest.id } }), 1);
    assert.equal((await prisma.hubWalletAccount.findUniqueOrThrow({ where: { id: account.id } })).balanceCents, 8_000);

    const contested = await prisma.hubWalletRequest.create({ data: { accountId: account.id, memberId: member.id, amountCents: 1_000, reason: "Decisão concorrente" } });
    const approveOrReject = await Promise.allSettled([
      prisma.$transaction((tx) => approveHubWalletRequest(tx, { requestId: contested.id, organizationId: organization.id, actorId: actor.id }), { isolationLevel: "Serializable" }),
      prisma.$transaction((tx) => rejectHubWalletRequest(tx, { requestId: contested.id, organizationId: organization.id, actorId: actor.id }), { isolationLevel: "Serializable" }),
    ]);
    assert.equal(approveOrReject.filter((item) => item.status === "fulfilled").length, 1);
    assert.notEqual((await prisma.hubWalletRequest.findUniqueOrThrow({ where: { id: contested.id } })).status, "PENDING");

    await prisma.hubWalletAccount.update({ where: { id: account.id }, data: { balanceCents: 1_000 } });
    const overspendRequests = await Promise.all(["a", "b"].map((key) => prisma.hubWalletRequest.create({ data: { accountId: account.id, memberId: member.id, amountCents: 800, reason: `Concorrente ${key}` } })));
    const overspend = await Promise.allSettled(overspendRequests.map((item) => prisma.$transaction((tx) => approveHubWalletRequest(tx, { requestId: item.id, organizationId: organization.id, actorId: actor.id }), { isolationLevel: "Serializable" })));
    assert.equal(overspend.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal((await prisma.hubWalletAccount.findUniqueOrThrow({ where: { id: account.id } })).balanceCents, 200);

    const manual = await Promise.allSettled([1, 2].map(() => prisma.$transaction((tx) => createHubManualTransaction(tx, { organizationId: organization.id, actorId: actor.id, memberId: member.id, direction: "CREDIT", amountCents: 500, reason: "Crédito idempotente", idempotencyKey: `same-${suffix}` }), { isolationLevel: "Serializable" })));
    assert.equal(manual.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(await prisma.hubWalletTransaction.count({ where: { idempotencyKey: `manual:${organization.id}:same-${suffix}` } }), 1);
    assert.equal((await prisma.hubWalletAccount.findUniqueOrThrow({ where: { id: account.id } })).balanceCents, 700);

    await prisma.hubWalletRequest.updateMany({ where: { accountId: account.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    const memberRequests = await Promise.allSettled([1, 2].map(() => prisma.$transaction((tx) => createHubMemberWalletRequest(tx, { organizationId: organization.id, memberId: member.id, amountCents: 100, reason: "Pedido idempotente", idempotencyKey: `member-request-${suffix}` }), { isolationLevel: "Serializable" })));
    assert.equal(memberRequests.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(await prisma.hubWalletRequest.count({ where: { idempotencyKey: `member-request-${suffix}` } }), 1);

    await assert.rejects(() => prisma.$transaction((tx) => approveHubWalletRequest(tx, { requestId: overspendRequests[0].id, organizationId: otherOrganization.id, actorId: actor.id }), { isolationLevel: "Serializable" }), /Solicitação não encontrada/);
  } finally {
    await deleteHubTestOrganizations(prisma, [organization.id, otherOrganization.id]);
    await prisma.$disconnect();
  }
});

test("aprovação e cancelamento concorrentes de projeto geram um único pagamento e estorno", async () => {
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const organization = await prisma.hubOrganization.create({ data: { name: "Project test", hubName: "Project test", slug: `project-${suffix}` } });
  try {
    const actor = await prisma.hubMember.create({ data: { organizationId: organization.id, email: `project-actor-${suffix}@example.test`, normalizedEmail: `project-actor-${suffix}@example.test`, name: "Actor", passwordHash: "integration-test", role: "SUPER_ADMIN", status: "ACTIVE" } });
    const member = await prisma.hubMember.create({ data: { organizationId: organization.id, email: `project-member-${suffix}@example.test`, normalizedEmail: `project-member-${suffix}@example.test`, name: "Member", passwordHash: "integration-test", status: "ACTIVE" } });
    const project = await prisma.hubProject.create({ data: { organizationId: organization.id, title: "Projeto concorrente", description: "Teste de concorrência", grossAmountCents: 10_000, responsibleMemberId: member.id, createdById: actor.id } });
    await prisma.hubProjectParticipant.create({ data: { projectId: project.id, memberId: member.id, percentage: 100, amountCents: 10_000 } });

    const approve = () => prisma.$transaction(async (tx) => {
      const claimed = await tx.hubProject.updateMany({ where: { id: project.id, organizationId: organization.id, status: "DRAFT" }, data: { updatedAt: new Date() } });
      if (claimed.count !== 1) throw new Error("PROJECT_CONFLICT");
      return payApprovedProject(tx, { projectId: project.id, organizationId: organization.id, actorId: actor.id, grossAmountCents: 10_000, participants: [{ memberId: member.id, percentage: 100 }] });
    }, { isolationLevel: "Serializable" });
    const approvals = await Promise.allSettled([approve(), approve()]);
    assert.equal(approvals.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(await prisma.hubWalletTransaction.count({ where: { sourceType: "PROJECT_PAYOUT", sourceId: project.id } }), 1);
    const account = await prisma.hubWalletAccount.findUniqueOrThrow({ where: { memberId: member.id } });
    assert.equal(account.balanceCents, 3_500);

    const cancel = () => prisma.$transaction((tx) => reverseApprovedProject(tx, { projectId: project.id, organizationId: organization.id, actorId: actor.id, reason: "Cancelamento concorrente" }), { isolationLevel: "Serializable" });
    const cancellations = await Promise.allSettled([cancel(), cancel()]);
    assert.equal(cancellations.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(await prisma.hubWalletTransaction.count({ where: { sourceType: "PROJECT_REVERSAL", sourceId: project.id } }), 1);
    assert.equal((await prisma.hubWalletAccount.findUniqueOrThrow({ where: { id: account.id } })).balanceCents, 0);
  } finally {
    await deleteHubTestOrganizations(prisma, [organization.id]);
    await prisma.$disconnect();
  }
});

test("notificações preservam isolamento, idempotência, ownership e operações com destinatários inativos", async () => {
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const first = await prisma.hubOrganization.create({ data: { name: "Notifications A", hubName: "Notifications A", slug: `notifications-a-${suffix}` } });
  const second = await prisma.hubOrganization.create({ data: { name: "Notifications B", hubName: "Notifications B", slug: `notifications-b-${suffix}` } });
  try {
    const actor = await prisma.hubMember.create({ data: { organizationId: first.id, email: `actor-${suffix}@example.test`, normalizedEmail: `actor-${suffix}@example.test`, name: "Actor", passwordHash: "integration-test", role: "SUPER_ADMIN", status: "ACTIVE" } });
    const reviewer = await prisma.hubMember.create({ data: { organizationId: first.id, email: `reviewer-${suffix}@example.test`, normalizedEmail: `reviewer-${suffix}@example.test`, name: "Reviewer", passwordHash: "integration-test", role: "FINANCE", status: "ACTIVE" } });
    const member = await prisma.hubMember.create({ data: { organizationId: first.id, email: `member-${suffix}@example.test`, normalizedEmail: `member-${suffix}@example.test`, name: "Member", passwordHash: "integration-test", status: "ACTIVE" } });
    const otherRecipient = await prisma.hubMember.create({ data: { organizationId: first.id, email: `other-${suffix}@example.test`, normalizedEmail: `other-${suffix}@example.test`, name: "Other", passwordHash: "integration-test", status: "ACTIVE" } });
    const responsible = await prisma.hubMember.create({ data: { organizationId: first.id, email: `responsible-${suffix}@example.test`, normalizedEmail: `responsible-${suffix}@example.test`, name: "Responsible", passwordHash: "integration-test", status: "ACTIVE" } });
    const participant = await prisma.hubMember.create({ data: { organizationId: first.id, email: `participant-${suffix}@example.test`, normalizedEmail: `participant-${suffix}@example.test`, name: "Participant", passwordHash: "integration-test", status: "ACTIVE" } });
    const foreign = await prisma.hubMember.create({ data: { organizationId: second.id, email: `foreign-${suffix}@example.test`, normalizedEmail: `foreign-${suffix}@example.test`, name: "Foreign", passwordHash: "integration-test", status: "ACTIVE" } });

    const notification = (organizationId: string, recipientMemberId: string, idempotencyKey: string, actorMemberId: string | null = null) => ({
      organizationId, recipientMemberId, actorMemberId, type: "MEMBER_UPDATED" as const, title: "Acesso atualizado", body: "Seu acesso está atualizado.", href: "/hub/minha-conta", entityType: "MEMBER", entityId: recipientMemberId, idempotencyKey,
    });

    const firstCreate = await prisma.$transaction((tx) => createHubNotifications(tx, [notification(first.id, member.id, `local:${suffix}`, actor.id)]));
    const retry = await prisma.$transaction((tx) => createHubNotifications(tx, [notification(first.id, member.id, `local:${suffix}`, actor.id)]));
    const otherOrganizationCreate = await prisma.$transaction((tx) => createHubNotifications(tx, [notification(second.id, foreign.id, `local:${suffix}`, foreign.id)]));
    assert.deepEqual(firstCreate, { created: 1, skippedInactive: 0, duplicate: 0 });
    assert.deepEqual(retry, { created: 0, skippedInactive: 0, duplicate: 1 });
    assert.equal(otherOrganizationCreate.created, 1);
    assert.equal(await prisma.hubNotification.count({ where: { idempotencyKey: `local:${suffix}` } }), 2);

    await prisma.hubMember.update({ where: { id: member.id }, data: { status: "DISABLED" } });
    const skipped = await prisma.$transaction((tx) => createHubNotifications(tx, [notification(first.id, member.id, `inactive:${suffix}`, actor.id)]));
    assert.deepEqual(skipped, { created: 0, skippedInactive: 1, duplicate: 0 });
    await assert.rejects(() => prisma.$transaction((tx) => createHubNotifications(tx, [notification(first.id, foreign.id, `foreign-recipient:${suffix}`, actor.id)])), /outra organização/);
    await assert.rejects(() => prisma.$transaction((tx) => createHubNotifications(tx, [notification(first.id, reviewer.id, `foreign-actor:${suffix}`, foreign.id)])), /Ator.+outra organização/);
    await assert.rejects(() => prisma.$transaction((tx) => createHubNotifications(tx, [notification(first.id, "missing-member", `missing:${suffix}`, actor.id)])), /inexistente/);
    for (const href of ["https://example.com", "//example.com", "/hub\nmalformed"]) {
      await assert.rejects(() => prisma.$transaction((tx) => createHubNotifications(tx, [{ ...notification(first.id, reviewer.id, `bad-link:${suffix}:${href}`, actor.id), href }])), /internos ao Atlas Hub/);
    }

    await prisma.hubMember.update({ where: { id: member.id }, data: { status: "ACTIVE" } });
    const auditOne = await writeHubAudit(prisma, { organizationId: first.id, memberId: actor.id, action: "MEMBER_UPDATED", entity: "MEMBER", entityId: member.id });
    const auditTwo = await writeHubAudit(prisma, { organizationId: first.id, memberId: actor.id, action: "MEMBER_UPDATED", entity: "MEMBER", entityId: member.id });
    await prisma.$transaction((tx) => createHubNotifications(tx, [notification(first.id, member.id, `notification:audit:${auditOne.id}:member-updated`, actor.id), notification(first.id, member.id, `notification:audit:${auditTwo.id}:member-updated`, actor.id)]));
    assert.equal(await prisma.hubNotification.count({ where: { organizationId: first.id, recipientMemberId: member.id, idempotencyKey: { startsWith: "notification:audit:" } } }), 2);

    const rollbackKey = `rollback:${suffix}`;
    await assert.rejects(() => prisma.$transaction(async (tx) => {
      await createHubNotifications(tx, [notification(first.id, reviewer.id, rollbackKey, actor.id)]);
      throw new Error("ROLLBACK_NOTIFICATION_SOURCE");
    }), /ROLLBACK_NOTIFICATION_SOURCE/);
    assert.equal(await prisma.hubNotification.count({ where: { organizationId: first.id, idempotencyKey: rollbackKey } }), 0);

    const account = await prisma.hubWalletAccount.create({ data: { memberId: member.id, balanceCents: 20_000 } });
    const createdRequest = await prisma.$transaction((tx) => createHubMemberWalletRequest(tx, { organizationId: first.id, memberId: member.id, amountCents: 1_000, reason: "Revisão ativa", idempotencyKey: `review-request:${suffix}` }));
    assert.equal(await prisma.hubNotification.count({ where: { organizationId: first.id, recipientMemberId: reviewer.id, type: "WALLET_REQUEST_CREATED", entityId: createdRequest.id } }), 1);
    await prisma.$transaction((tx) => approveHubWalletRequest(tx, { requestId: createdRequest.id, organizationId: first.id, actorId: actor.id }));
    assert.equal(await prisma.hubNotification.count({ where: { organizationId: first.id, recipientMemberId: member.id, type: "WALLET_REQUEST_APPROVED", entityId: createdRequest.id } }), 1);

    const inactiveApproval = await prisma.hubWalletRequest.create({ data: { accountId: account.id, memberId: member.id, amountCents: 500, reason: "Aprovação após inativação" } });
    await prisma.hubMember.update({ where: { id: member.id }, data: { status: "DISABLED" } });
    await prisma.$transaction((tx) => approveHubWalletRequest(tx, { requestId: inactiveApproval.id, organizationId: first.id, actorId: actor.id }));
    assert.equal((await prisma.hubWalletRequest.findUniqueOrThrow({ where: { id: inactiveApproval.id } })).status, "APPROVED");
    const inactiveRejection = await prisma.hubWalletRequest.create({ data: { accountId: account.id, memberId: member.id, amountCents: 500, reason: "Rejeição após inativação" } });
    await prisma.$transaction((tx) => rejectHubWalletRequest(tx, { requestId: inactiveRejection.id, organizationId: first.id, actorId: actor.id }));
    assert.equal((await prisma.hubWalletRequest.findUniqueOrThrow({ where: { id: inactiveRejection.id } })).status, "REJECTED");

    const project = await prisma.hubProject.create({ data: { organizationId: first.id, title: "Responsável fora do rateio", description: "Teste de destinatários", grossAmountCents: 10_000, responsibleMemberId: responsible.id, createdById: actor.id } });
    await prisma.hubProjectParticipant.create({ data: { projectId: project.id, memberId: participant.id, percentage: 100, amountCents: 10_000 } });
    await prisma.$transaction((tx) => payApprovedProject(tx, { projectId: project.id, organizationId: first.id, actorId: actor.id, grossAmountCents: 10_000, participants: [{ memberId: participant.id, percentage: 100 }] }));
    assert.equal(await prisma.hubNotification.count({ where: { organizationId: first.id, type: "PROJECT_APPROVED", entityId: project.id, recipientMemberId: { in: [responsible.id, participant.id] } } }), 2);
    await prisma.hubMember.update({ where: { id: participant.id }, data: { status: "DISABLED" } });
    await prisma.$transaction((tx) => reverseApprovedProject(tx, { projectId: project.id, organizationId: first.id, actorId: actor.id, reason: "Participante ficou inativo" }));
    assert.equal((await prisma.hubProject.findUniqueOrThrow({ where: { id: project.id } })).status, "CANCELLED");
    assert.equal(await prisma.hubNotification.count({ where: { organizationId: first.id, type: "PROJECT_CANCELLED", entityId: project.id, recipientMemberId: responsible.id } }), 1);
    assert.equal(await prisma.hubNotification.count({ where: { organizationId: first.id, type: "PROJECT_CANCELLED", entityId: project.id, recipientMemberId: participant.id } }), 0);

    const ownerKey = `ownership:${suffix}`;
    await prisma.$transaction((tx) => createHubNotifications(tx, [notification(first.id, reviewer.id, `${ownerKey}:reviewer`, actor.id), notification(first.id, otherRecipient.id, `${ownerKey}:other`, actor.id)]));
    const foreignRead = await prisma.hubNotification.updateMany({ where: { organizationId: first.id, recipientMemberId: otherRecipient.id, idempotencyKey: `${ownerKey}:reviewer` }, data: { readAt: new Date() } });
    assert.equal(foreignRead.count, 0);
    const readAll = await prisma.hubNotification.updateMany({ where: { organizationId: first.id, recipientMemberId: reviewer.id, archivedAt: null, readAt: null }, data: { readAt: new Date() } });
    assert.ok(readAll.count >= 1);
    assert.equal(await prisma.hubNotification.count({ where: { organizationId: first.id, recipientMemberId: otherRecipient.id, idempotencyKey: `${ownerKey}:other`, readAt: null } }), 1);
    const archived = await prisma.hubNotification.updateMany({ where: { organizationId: first.id, recipientMemberId: reviewer.id, idempotencyKey: `${ownerKey}:reviewer` }, data: { archivedAt: new Date() } });
    assert.equal(archived.count, 1);

    const sameCreatedAt = new Date("2026-07-14T00:00:00.000Z");
    const pageKeys = Array.from({ length: 5 }, (_, index) => `page:${suffix}:${index}`);
    await prisma.hubNotification.createMany({ data: pageKeys.map((idempotencyKey, index) => ({ ...notification(first.id, otherRecipient.id, idempotencyKey, actor.id), entityId: `page-${index}`, createdAt: sameCreatedAt })) });
    const pageOne = await prisma.hubNotification.findMany({ where: { organizationId: first.id, recipientMemberId: otherRecipient.id, idempotencyKey: { in: pageKeys } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 3 });
    const pageTwo = await prisma.hubNotification.findMany({ where: { organizationId: first.id, recipientMemberId: otherRecipient.id, idempotencyKey: { in: pageKeys } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 3, cursor: { id: pageOne[2].id }, skip: 1 });
    assert.equal(new Set([...pageOne, ...pageTwo].map((item) => item.id)).size, 5);
    assert.deepEqual([...pageOne, ...pageTwo].map((item) => item.id), [...pageOne, ...pageTwo].map((item) => item.id).sort((a, b) => b.localeCompare(a)));

    const firstScoped = await prisma.hubNotification.findMany({ where: { organizationId: first.id, recipientMemberId: reviewer.id } });
    assert.equal(firstScoped.every((item) => item.organizationId === first.id && item.recipientMemberId === reviewer.id), true);
    assert.equal(firstScoped.some((item) => item.title.includes("integration-test") || item.body.includes("integration-test")), false);
    assert.equal(await prisma.hubNotification.count({ where: { organizationId: first.id, recipientMemberId: reviewer.id, archivedAt: null, readAt: null } }), 0);
  } finally {
    await deleteHubTestOrganizations(prisma, [first.id, second.id]);
    await prisma.$disconnect();
  }
});

test("backfill é idempotente e preserva credenciais existentes", async () => {
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const organization = await prisma.hubOrganization.create({ data: { name: "Backfill test", hubName: "Backfill test", slug: `backfill-${suffix}` } });
  try {
    let hashFactoryCalls = 0;
    const input = { organizationId: organization.id, email: `  BACKFILL-${suffix}@EXAMPLE.TEST `, name: "Migrated", createPasswordHash: async () => { hashFactoryCalls += 1; return "first-secure-hash"; } };
    const first = await ensureBackfilledHubMember(prisma, input);
    const second = await ensureBackfilledHubMember(prisma, { ...input, createPasswordHash: async () => { hashFactoryCalls += 1; return "must-not-overwrite"; } });
    assert.equal(first.created, true);
    assert.equal(first.status, "PASSWORD_RESET_REQUIRED");
    assert.equal(second.created, false);
    assert.equal(second.status, "EXISTING_ACCOUNT_PRESERVED");
    assert.equal(first.member.id, second.member.id);
    assert.equal(hashFactoryCalls, 1);
    const stored = await prisma.hubMember.findUniqueOrThrow({ where: { id: first.member.id } });
    assert.equal(stored.passwordHash, "first-secure-hash");
    assert.equal(stored.mustChangePassword, true);
    assert.equal(stored.normalizedEmail, `backfill-${suffix}@example.test`);
  } finally {
    await deleteHubTestOrganizations(prisma, [organization.id]);
    await prisma.$disconnect();
  }
});

test("mapeamentos físicos Economik preservam IDs, projetos, carteiras e saldos", async () => {
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const organization = await prisma.hubOrganization.create({ data: { name: "Physical mapping", hubName: "Physical Hub", slug: `physical-${suffix}` } });
  try {
    const member = await prisma.hubMember.create({ data: { organizationId: organization.id, email: `physical-${suffix}@example.test`, normalizedEmail: `physical-${suffix}@example.test`, name: "Physical", passwordHash: "integration-test", status: "ACTIVE" } });
    const project = await prisma.hubProject.create({ data: { organizationId: organization.id, title: "Preserved project", grossAmountCents: 12_345 } });
    const account = await prisma.hubWalletAccount.create({ data: { memberId: member.id, balanceCents: 9_876 } });
    const physicalOrganizations = await prisma.$queryRaw<Array<{ id: string; workspaceSlug: string }>>`SELECT "id", "slug" AS "workspaceSlug" FROM "EconomikWorkspace" WHERE "id" = ${organization.id}`;
    const physicalMembers = await prisma.$queryRaw<Array<{ id: string; workspaceId: string }>>`SELECT "id", "workspaceId" FROM "EconomikMember" WHERE "id" = ${member.id}`;
    const physicalProjects = await prisma.$queryRaw<Array<{ id: string; workspaceId: string }>>`SELECT "id", "workspaceId" FROM "EconomikMetricProject" WHERE "id" = ${project.id}`;
    const physicalWallets = await prisma.$queryRaw<Array<{ id: string; balanceCents: number }>>`SELECT "id", "balanceCents" FROM "EconomikWalletAccount" WHERE "id" = ${account.id}`;
    assert.deepEqual(physicalOrganizations, [{ id: organization.id, workspaceSlug: organization.slug }]);
    assert.deepEqual(physicalMembers, [{ id: member.id, workspaceId: organization.id }]);
    assert.deepEqual(physicalProjects, [{ id: project.id, workspaceId: organization.id }]);
    assert.deepEqual(physicalWallets, [{ id: account.id, balanceCents: 9_876 }]);
  } finally {
    await deleteHubTestOrganizations(prisma, [organization.id]);
    await prisma.$disconnect();
  }
});

test("login resolve o membro somente no slug informado", async () => {
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const first = await prisma.hubOrganization.create({ data: { name: "Login A", hubName: "Login A Hub", slug: `login-a-${suffix}` } });
  const second = await prisma.hubOrganization.create({ data: { name: "Login B", hubName: "Login B Hub", slug: `login-b-${suffix}` } });
  try {
    const normalizedEmail = `login-${suffix}@example.test`;
    const passwordHash = await hashHubPassword("Secure!Password2026");
    const member = await prisma.hubMember.create({ data: { organizationId: first.id, email: normalizedEmail, normalizedEmail, name: "Login member", passwordHash, status: "ACTIVE" } });
    assert.equal((await resolveHubLoginMember(prisma, { organizationSlug: first.slug, email: normalizedEmail.toUpperCase() }))?.id, member.id);
    assert.equal(await resolveHubLoginMember(prisma, { organizationSlug: second.slug, email: normalizedEmail }), null);
  } finally {
    await deleteHubTestOrganizations(prisma, [first.id, second.id]);
    await prisma.$disconnect();
  }
});

test("organização inativa não resolve autenticação", async () => {
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const organization = await prisma.hubOrganization.create({ data: { name: "Inactive", hubName: "Inactive Hub", slug: `inactive-${suffix}`, isActive: false } });
  try {
    const email = `inactive-${suffix}@example.test`;
    await prisma.hubMember.create({ data: { organizationId: organization.id, email, normalizedEmail: email, name: "Inactive", passwordHash: "integration-test", status: "ACTIVE" } });
    assert.equal(await resolveHubLoginMember(prisma, { organizationSlug: organization.slug, email }), null);
  } finally {
    await deleteHubTestOrganizations(prisma, [organization.id]);
    await prisma.$disconnect();
  }
});

test("consultas escopadas não expõem membros ou projetos de outra organização", async () => {
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const first = await prisma.hubOrganization.create({ data: { name: "Scope A", hubName: "Scope A Hub", slug: `scope-a-${suffix}` } });
  const second = await prisma.hubOrganization.create({ data: { name: "Scope B", hubName: "Scope B Hub", slug: `scope-b-${suffix}` } });
  try {
    const email = `scope-${suffix}@example.test`;
    const foreignMember = await prisma.hubMember.create({ data: { organizationId: second.id, email, normalizedEmail: email, name: "Foreign", passwordHash: "integration-test", status: "ACTIVE" } });
    const foreignProject = await prisma.hubProject.create({ data: { organizationId: second.id, title: "Foreign project" } });
    assert.equal(await prisma.hubMember.findFirst({ where: { id: foreignMember.id, organizationId: first.id } }), null);
    assert.equal(await prisma.hubProject.findFirst({ where: { id: foreignProject.id, organizationId: first.id } }), null);
  } finally {
    await deleteHubTestOrganizations(prisma, [first.id, second.id]);
    await prisma.$disconnect();
  }
});

test("organização A não aprova nem reverte recursos financeiros da organização B", async () => {
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const first = await prisma.hubOrganization.create({ data: { name: "Finance A", hubName: "Finance A Hub", slug: `financial-a-${suffix}` } });
  const second = await prisma.hubOrganization.create({ data: { name: "Finance B", hubName: "Finance B Hub", slug: `financial-b-${suffix}` } });
  try {
    const actor = await prisma.hubMember.create({ data: { organizationId: first.id, email: `actor-a-${suffix}@example.test`, normalizedEmail: `actor-a-${suffix}@example.test`, name: "Actor A", passwordHash: "integration-test", role: "SUPER_ADMIN", status: "ACTIVE" } });
    const foreign = await prisma.hubMember.create({ data: { organizationId: second.id, email: `member-b-${suffix}@example.test`, normalizedEmail: `member-b-${suffix}@example.test`, name: "Member B", passwordHash: "integration-test", status: "ACTIVE" } });
    const account = await prisma.hubWalletAccount.create({ data: { memberId: foreign.id, balanceCents: 5_000 } });
    const request = await prisma.hubWalletRequest.create({ data: { accountId: account.id, memberId: foreign.id, amountCents: 1_000 } });
    const transaction = await prisma.hubWalletTransaction.create({ data: { accountId: account.id, type: "CREDIT", amountCents: 500, status: "COMPLETED", sourceType: "SYSTEM" } });
    await assert.rejects(() => prisma.$transaction((tx) => approveHubWalletRequest(tx, { requestId: request.id, organizationId: first.id, actorId: actor.id })), /Solicitação não encontrada/);
    await assert.rejects(() => prisma.$transaction((tx) => reverseHubWalletTransaction(tx, { transactionId: transaction.id, organizationId: first.id, actorId: actor.id, reason: "Cross tenant" })), /Movimentação não encontrada/);
  } finally {
    await deleteHubTestOrganizations(prisma, [first.id, second.id]);
    await prisma.$disconnect();
  }
});

test("provisionamento cria a organização completa e duplicidade não deixa dados parciais", async () => {
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const input = { name: "Provisioned EJ", hubName: "Provisioned Hub", slug: `provisioned-${suffix}`, timezone: "America/Fortaleza", adminEmail: `admin-${suffix}@example.test`, adminName: "Admin Provisioned", adminPassword: "Secure!Provision2026" };
  let organizationId: string | undefined;
  try {
    const created = await provisionHubOrganization(prisma, input);
    organizationId = created.organizationId;
    assert.equal(await prisma.hubDirectorate.count({ where: { organizationId } }), STANDARD_HUB_DIRECTORATES.length);
    assert.equal(await prisma.hubFinancialRule.count({ where: { organizationId } }), 1);
    const admin = await prisma.hubMember.findFirstOrThrow({ where: { organizationId, role: "SUPER_ADMIN" }, include: { walletAccount: true } });
    assert.equal(admin.mustChangePassword, true);
    assert.ok(admin.walletAccount);
    const before = await prisma.hubOrganization.count({ where: { slug: input.slug } });
    await assert.rejects(() => provisionHubOrganization(prisma, { ...input, adminEmail: `other-${suffix}@example.test` }), /Já existe uma organização/);
    assert.equal(await prisma.hubOrganization.count({ where: { slug: input.slug } }), before);
    assert.equal(await prisma.hubMember.count({ where: { organizationId } }), 1);
  } finally {
    if (organizationId) await deleteHubTestOrganizations(prisma, [organizationId]);
    await prisma.$disconnect();
  }
});

test("bloqueio de moeda é transacional e resiste a atualizações concorrentes", async () => {
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const organization = await prisma.hubOrganization.create({ data: { name: "Currency lock", hubName: "Currency lock", slug: `currency-lock-${suffix}` } });
  try {
    const member = await prisma.hubMember.create({ data: { organizationId: organization.id, email: `currency-${suffix}@example.test`, normalizedEmail: `currency-${suffix}@example.test`, name: "Currency", passwordHash: "integration-test", status: "ACTIVE" } });
    const account = await prisma.hubWalletAccount.create({ data: { memberId: member.id } });
    const base = { name: organization.name, hubName: organization.hubName, logoUrl: null, timezone: organization.timezone, locale: organization.locale };
    await updateHubOrganizationSettingsAtomic(prisma, { organizationId: organization.id, data: { ...base, currency: "USD" } });
    await prisma.hubWalletTransaction.create({ data: { accountId: account.id, type: "CREDIT", amountCents: 100, status: "COMPLETED", sourceType: "SYSTEM" } });

    const attempts = await Promise.allSettled(["EUR", "GBP"].map((currency) => updateHubOrganizationSettingsAtomic(prisma, {
      organizationId: organization.id,
      data: { ...base, currency },
    })));
    assert.equal(attempts.every((attempt) => attempt.status === "rejected" && attempt.reason instanceof HubCurrencyLockedError), true);
    assert.equal((await prisma.hubOrganization.findUniqueOrThrow({ where: { id: organization.id } })).currency, "USD");
  } finally {
    await deleteHubTestOrganizations(prisma, [organization.id]);
    await prisma.$disconnect();
  }
});

test("corrida real entre primeira transação e moeda preserva uma ordem serial válida", async () => {
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const organization = await prisma.hubOrganization.create({ data: { name: "Currency race", hubName: "Currency race", slug: `currency-race-${suffix}` } });
  try {
    const member = await prisma.hubMember.create({ data: { organizationId: organization.id, email: `currency-race-${suffix}@example.test`, normalizedEmail: `currency-race-${suffix}@example.test`, name: "Currency race", passwordHash: "integration-test", status: "ACTIVE" } });
    const account = await prisma.hubWalletAccount.create({ data: { memberId: member.id } });
    const base = { name: organization.name, hubName: organization.hubName, logoUrl: null, timezone: organization.timezone, locale: organization.locale };
    const [currencyAttempt, transactionAttempt] = await Promise.allSettled([
      updateHubOrganizationSettingsAtomic(prisma, { organizationId: organization.id, data: { ...base, currency: "USD" } }),
      prisma.$transaction(async (tx) => {
        await tx.hubOrganization.update({ where: { id: organization.id }, data: {} });
        return tx.hubWalletTransaction.create({ data: { accountId: account.id, type: "CREDIT", amountCents: 100, status: "COMPLETED", sourceType: "SYSTEM" } });
      }, { isolationLevel: "Serializable" }),
    ]);
    if (transactionAttempt.status === "rejected") {
      const code = transactionAttempt.reason && typeof transactionAttempt.reason === "object" && "code" in transactionAttempt.reason
        ? transactionAttempt.reason.code
        : null;
      assert.equal(code, "P2034");
    }
    const stored = await prisma.hubOrganization.findUniqueOrThrow({ where: { id: organization.id } });
    if (currencyAttempt.status === "fulfilled") assert.equal(stored.currency, "USD");
    else {
      const code = currencyAttempt.reason && typeof currencyAttempt.reason === "object" && "code" in currencyAttempt.reason
        ? currencyAttempt.reason.code
        : null;
      assert.ok(currencyAttempt.reason instanceof HubCurrencyLockedError || code === "P2034");
      assert.equal(stored.currency, "BRL");
    }
    assert.equal(await prisma.hubWalletTransaction.count({ where: { accountId: account.id } }), transactionAttempt.status === "fulfilled" ? 1 : 0);
  } finally {
    await deleteHubTestOrganizations(prisma, [organization.id]);
    await prisma.$disconnect();
  }
});
