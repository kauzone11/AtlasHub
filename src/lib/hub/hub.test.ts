import assert from "node:assert/strict";
import test from "node:test";
import { decodeHubSession, decodeLegacyHubSession, encodeHubSession, HUB_SESSION_COOKIE, isHubSessionStateValid, LEGACY_HUB_SESSION_COOKIE, migrateLegacyHubSessionCookies, resolveHubSessionSecrets, verifyHubSessionCookie, type HubSessionPayload } from "./auth";
import { hubAuditActionLabel, hubAuditEntityLabel, hubMemberStatusLabel, hubProjectStatusLabel, hubRoleLabel, hubWalletSourceTypeLabel, formatHubDate, formatHubMoney } from "./display";
import { validateHubFinancialRule } from "./financial-rules";
import { canAssignHubRole, canManageHubMember, hubRoleLevel, hasHubPermission } from "./permissions";
import { parseProjectInput } from "./projects";
import { generateHubTemporaryPassword, validateHubPassword } from "./security";
import { allocateCents, calculateAvailableBalance, summarizeHubWallet } from "./wallet";
import { walletRequestStatusLabel, walletTransactionStatusLabel, walletTransactionTypeLabel } from "./wallet-labels";
import { isSupportedHubCurrency, isSupportedHubLocale, normalizeHubOrganizationSlug } from "./organization";
import { normalizeHubLogoUrl } from "./organization-logo";

const claims: HubSessionPayload = {
  memberId: "member-1", organizationId: "organization-1", organizationSlug: "example-ej", email: "member@example.test", role: "MEMBER",
  directorateId: null, mustChangePassword: false, sessionVersion: 3, iat: 1_000, exp: 2_000,
};
const canonicalSecret = "canonical-atlas-hub-secret-for-tests-2026";
const legacySecret = "legacy-economik-secret-for-tests-2026";

test("cookie canônico usa exclusivamente o segredo canônico", () => {
  const token = encodeHubSession(claims, canonicalSecret);
  assert.deepEqual(decodeHubSession(token, canonicalSecret, 1_500), claims);
  assert.equal(decodeHubSession(token, legacySecret, 1_500), null);
});

test("payload novo assinado somente com segredo legado é rejeitado", () => {
  const token = encodeHubSession(claims, legacySecret);
  assert.equal(decodeLegacyHubSession(token, [legacySecret], 1_500), null);
  assert.equal(verifyHubSessionCookie(token, HUB_SESSION_COOKIE, { canonical: canonicalSecret, legacy: [legacySecret] }, 1_500), null);
});

test("payload legado com workspaceId é normalizado para o contexto de organização", () => {
  const legacyClaims = {
    memberId: claims.memberId,
    workspaceId: claims.organizationId,
    email: claims.email,
    role: claims.role,
    directorateId: claims.directorateId,
    mustChangePassword: claims.mustChangePassword,
    sessionVersion: claims.sessionVersion,
    iat: claims.iat,
    exp: claims.exp,
  } as unknown as HubSessionPayload;
  const decoded = decodeHubSession(encodeHubSession(legacyClaims, legacySecret), legacySecret, 1_500);
  assert.equal(decoded?.organizationId, claims.organizationId);
  assert.equal(decoded?.organizationSlug, "");
  assert.equal("workspaceId" in (decoded || {}), false);
  const verified = verifyHubSessionCookie(encodeHubSession(legacyClaims, legacySecret), HUB_SESSION_COOKIE, { canonical: canonicalSecret, legacy: [legacySecret] }, 1_500);
  assert.equal(verified?.acceptedWithLegacySecret, true);
  assert.equal(verified?.payload.organizationId, claims.organizationId);
  const legacyCookie = verifyHubSessionCookie(encodeHubSession(legacyClaims, legacySecret), LEGACY_HUB_SESSION_COOKIE, { canonical: legacySecret, legacy: [legacySecret] }, 1_500);
  assert.equal(legacyCookie?.acceptedWithLegacySecret, true);
});

test("cookie canônico válido não consulta o segredo legado", () => {
  const verified = verifyHubSessionCookie(encodeHubSession(claims, canonicalSecret), HUB_SESSION_COOKIE, { canonical: canonicalSecret, legacy: [legacySecret] }, 1_500);
  assert.deepEqual(verified, { payload: claims, acceptedWithLegacySecret: false, hasLegacyPayloadShape: false });
});

test("cookie canônico com formato workspaceId é aceito e marcado para reemissão", () => {
  const legacyClaims = { ...claims, workspaceId: claims.organizationId, organizationId: undefined, organizationSlug: undefined } as unknown as HubSessionPayload;
  const verified = verifyHubSessionCookie(encodeHubSession(legacyClaims, canonicalSecret), HUB_SESSION_COOKIE, { canonical: canonicalSecret, legacy: [legacySecret] }, 1_500);
  assert.equal(verified?.acceptedWithLegacySecret, false);
  assert.equal(verified?.hasLegacyPayloadShape, true);
  assert.equal(verified?.payload.organizationId, claims.organizationId);
});

test("migração de cookie legado assina o cookie canônico e remove o antigo", () => {
  const writes: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  migrateLegacyHubSessionCookies({ set: (name: string, value: string, options: Record<string, unknown>) => { writes.push({ name, value, options }); } } as never, claims, 1_500);
  assert.equal(writes[0].name, HUB_SESSION_COOKIE);
  assert.deepEqual(decodeHubSession(writes[0].value, resolveHubSessionSecrets().canonical, 1_500), claims);
  assert.equal(writes[1].name, LEGACY_HUB_SESSION_COOKIE);
  assert.equal(writes[1].value, "");
});

test("fallback local Economik é aceito somente na lista legada fora de produção", () => {
  const local = resolveHubSessionSecrets({ NODE_ENV: "development" });
  assert.ok(local.legacy.includes("economik-local-only-secret-change-before-production"));
  assert.notEqual(local.canonical, "economik-local-only-secret-change-before-production");
  const production = resolveHubSessionSecrets({ NODE_ENV: "production", ATLAS_HUB_AUTH_SECRET: canonicalSecret });
  assert.equal(production.legacy.includes("economik-local-only-secret-change-before-production"), false);
  const legacyClaims = { ...claims, workspaceId: claims.organizationId, organizationId: undefined, organizationSlug: undefined } as unknown as HubSessionPayload;
  const localToken = encodeHubSession(legacyClaims, "economik-local-only-secret-change-before-production");
  assert.equal(verifyHubSessionCookie(localToken, LEGACY_HUB_SESSION_COOKIE, production, 1_500), null);
});

test("segredos canônico e legado podem ser diferentes sem validação cruzada", () => {
  const canonicalToken = encodeHubSession(claims, canonicalSecret);
  const legacyToken = encodeHubSession(claims, legacySecret);
  assert.equal(decodeHubSession(legacyToken, canonicalSecret, 1_500), null);
  assert.equal(decodeLegacyHubSession(canonicalToken, [legacySecret], 1_500), null);
});

test("ATLAS_HUB_AUTH_SECRET tem precedência para novas sessões", () => {
  const resolved = resolveHubSessionSecrets({
    NODE_ENV: "production",
    ATLAS_HUB_AUTH_SECRET: canonicalSecret,
    ECONOMIK_AUTH_SECRET: legacySecret,
    AUTH_SECRET: "previous-auth-secret-for-tests-2026-xx",
  });
  assert.equal(resolved.canonical, canonicalSecret);
  assert.deepEqual(resolved.legacy, [legacySecret, "previous-auth-secret-for-tests-2026-xx", canonicalSecret]);
});

test("assinaturas inválidas e sessões expiradas são rejeitadas", () => {
  const token = encodeHubSession(claims, canonicalSecret);
  assert.equal(decodeHubSession(`${token.slice(0, -1)}x`, canonicalSecret, 1_500), null);
  assert.equal(decodeHubSession(token, canonicalSecret, 2_000), null);
  assert.equal(decodeHubSession(encodeHubSession({ ...claims, iat: 1_600 }, canonicalSecret), canonicalSecret, 1_500), null);
});

test("sessão é invalidada por versão, status, organization ou organização inativa", () => {
  const active = { organizationId: claims.organizationId, sessionVersion: claims.sessionVersion, status: "ACTIVE", organization: { isActive: true } };
  assert.equal(isHubSessionStateValid(claims, active), true);
  assert.equal(isHubSessionStateValid(claims, { ...active, sessionVersion: claims.sessionVersion + 1 }), false);
  assert.equal(isHubSessionStateValid(claims, { ...active, status: "DISABLED" }), false);
  assert.equal(isHubSessionStateValid(claims, { ...active, organizationId: "other" }), false);
  assert.equal(isHubSessionStateValid(claims, { ...active, organization: { isActive: false } }), false);
  const accountClaims = { ...claims, accountId: "account-1", accountSessionVersion: 4 };
  const accountState = { ...active, accountId: "account-1", account: { status: "ACTIVE", sessionVersion: 4 } };
  assert.equal(isHubSessionStateValid(accountClaims, accountState), true);
  assert.equal(isHubSessionStateValid(accountClaims, { ...accountState, account: { status: "ACTIVE", sessionVersion: 5 } }), false);
  assert.equal(isHubSessionStateValid(accountClaims, { ...accountState, account: { status: "DISABLED", sessionVersion: 4 } }), false);
});

test("matriz de permissões separa administração financeira e de membros", () => {
  assert.equal(hasHubPermission("SUPER_ADMIN", "members:manage"), true);
  assert.equal(hasHubPermission("ADMIN", "members:manage"), true);
  assert.equal(hasHubPermission("FINANCE", "members:manage"), false);
  assert.equal(hasHubPermission("FINANCE", "financial-rules:manage"), true);
  assert.equal(hasHubPermission("VIEWER", "request:create"), false);
  assert.equal(hasHubPermission("DIRECTOR", "admin:access"), false);
});

test("hierarquia de membros bloqueia escalada e proteção de SUPER_ADMIN", () => {
  assert.ok(hubRoleLevel("SUPER_ADMIN") > hubRoleLevel("ADMIN"));
  assert.equal(canManageHubMember("ADMIN", "SUPER_ADMIN"), false);
  assert.equal(canManageHubMember("ADMIN", "ADMIN"), true);
  assert.equal(canManageHubMember("FINANCE", "MEMBER"), false);
  assert.equal(canAssignHubRole("ADMIN", "SUPER_ADMIN"), false);
  assert.equal(canAssignHubRole("ADMIN", "ADMIN"), true);
  assert.equal(canAssignHubRole("SUPER_ADMIN", "SUPER_ADMIN"), true);
});

test("senha temporária é aleatória e atende à política", () => {
  const first = generateHubTemporaryPassword();
  const second = generateHubTemporaryPassword();
  assert.notEqual(first, second);
  assert.equal(validateHubPassword(first), null);
  assert.match(validateHubPassword("curta") || "", /8 caracteres/);
  assert.match(validateHubPassword("hub2027A") || "", /nome do produto/);
});

test("alocação em centavos reconcilia o total de modo determinístico", () => {
  const input = [{ memberId: "a", percentage: 33.33 }, { memberId: "b", percentage: 33.33 }, { memberId: "c", percentage: 33.34 }];
  const first = allocateCents(10_001, input);
  const second = allocateCents(10_001, input);
  assert.deepEqual(first, second);
  assert.equal(first.reduce((sum, item) => sum + item.amountCents, 0), 10_001);
});

test("resumo de carteira usa transações concluídas e reserva pendências", () => {
  const summary = summarizeHubWallet({
    balanceCents: 12_000,
    transactions: [
      { type: "CREDIT", amountCents: 15_000, status: "COMPLETED" },
      { type: "DEBIT", amountCents: 3_000, status: "COMPLETED" },
      { type: "CREDIT", amountCents: 99_999, status: "CANCELLED" },
      { type: "ADJUSTMENT", amountCents: -500, status: "COMPLETED" },
    ],
    requests: [{ amountCents: 2_500, status: "PENDING" }, { amountCents: 1_000, status: "REJECTED" }],
  });
  assert.equal(summary.totalCreditsCents, 15_000);
  assert.equal(summary.totalDebitsCents, 3_500);
  assert.equal(summary.availableBalanceCents, 9_500);
  assert.equal(calculateAvailableBalance(1_000, 2_000), 0);
});

test("regras financeiras exigem valores finitos, precisão e total de 100%", () => {
  assert.equal(validateHubFinancialRule({ organizationSharePct: 50, atlasSharePct: 15, memberSharePct: 35 }), null);
  assert.notEqual(validateHubFinancialRule({ organizationSharePct: 50, atlasSharePct: 15, memberSharePct: Number.NaN }), null);
  assert.notEqual(validateHubFinancialRule({ organizationSharePct: 50, atlasSharePct: 15, memberSharePct: 34.99 }), null);
});

test("projetos rejeitam participantes duplicados e percentuais incompletos", () => {
  const base = { title: "Projeto válido", description: "Descrição válida", grossAmountCents: 10_000, competenceDate: "2026-07-01", isCollaborative: true, status: "APPROVED" };
  assert.throws(() => parseProjectInput({ ...base, participants: [{ memberId: "a", percentage: 50 }, { memberId: "a", percentage: 50 }] }), /repita participantes/);
  assert.throws(() => parseProjectInput({ ...base, participants: [{ memberId: "a", percentage: 99 }] }), /100%/);
  const valid = parseProjectInput({ ...base, participants: [{ memberId: "a", percentage: 40 }, { memberId: "b", percentage: 60 }] });
  assert.equal(valid.grossAmountCents, 10_000);
});

test("labels e moeda não expõem enums brutos", () => {
  assert.equal(hubRoleLabel("FINANCE"), "Financeiro");
  assert.equal(hubMemberStatusLabel("DISABLED"), "Desativado");
  assert.equal(hubProjectStatusLabel("APPROVED"), "Aprovado");
  assert.equal(walletRequestStatusLabel("PENDING"), "Pendente");
  assert.equal(walletTransactionTypeLabel("DEBIT"), "Gasto");
  assert.equal(walletTransactionStatusLabel("COMPLETED"), "Confirmada");
  assert.equal(hubAuditActionLabel("MEMBER_PASSWORD_RESET"), "Senha de membro redefinida");
  assert.equal(hubAuditEntityLabel("WALLET_TRANSACTION"), "Movimentação financeira");
  assert.equal(hubWalletSourceTypeLabel("PROJECT_PAYOUT"), "Participação em projeto");
  assert.equal(hubAuditActionLabel("UNRECOGNIZED_FUTURE_VALUE"), "Evento do sistema");
  assert.doesNotMatch(hubAuditActionLabel("UNRECOGNIZED_FUTURE_VALUE"), /UNRECOGNIZED/);
  assert.match(formatHubMoney(Number.NaN), /R\$/);
  assert.doesNotMatch(formatHubMoney(-0), /-0/);
});

test("formatadores usam locale, moeda e timezone da organização", () => {
  assert.match(formatHubMoney(123_45, { locale: "en-US", currency: "USD" }), /\$123\.45/);
  assert.match(formatHubMoney(123_45, { locale: "de-DE", currency: "EUR" }), /123,45/);
  assert.equal(isSupportedHubLocale("en-US"), true);
  assert.equal(isSupportedHubLocale("locale-inexistente"), false);
  assert.equal(isSupportedHubCurrency("USD"), true);
  assert.equal(isSupportedHubCurrency("ZZZ"), false);
  assert.notEqual(
    formatHubDate("2026-07-13T01:00:00.000Z", { locale: "en-US", timezone: "America/Fortaleza" }),
    formatHubDate("2026-07-13T01:00:00.000Z", { locale: "en-US", timezone: "UTC" }),
  );
});

test("slug de organização normaliza maiúsculas e espaços", () => {
  assert.equal(normalizeHubOrganizationSlug("  ECONO MIK  "), "economik");
  assert.equal(normalizeHubOrganizationSlug("Atlas-HUB"), "atlas-hub");
});

test("logo aceita somente URL HTTPS pública e normalizada", () => {
  assert.equal(normalizeHubLogoUrl(" https://EXAMPLE.com/tenant/logo.png#mark "), "https://example.com/tenant/logo.png");
  for (const invalid of [
    "http://example.com/logo.png",
    "https://localhost/logo.png",
    "https://tenant.local/logo.png",
    "https://127.0.0.1/logo.png",
    "https://10.0.0.1/logo.png",
    "https://172.16.0.1/logo.png",
    "https://192.168.1.1/logo.png",
    "https://169.254.1.1/logo.png",
    "https://[::1]/logo.png",
    "https://[fc00::1]/logo.png",
    "https://[fe80::1]/logo.png",
    "https://user:password@example.com/logo.png",
    "not-a-url",
    "ftp://example.com/logo.png",
  ]) assert.throws(() => normalizeHubLogoUrl(invalid));
});
