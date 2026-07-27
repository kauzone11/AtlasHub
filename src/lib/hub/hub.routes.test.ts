import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import nextConfig from "../../../next.config";

const root = resolve(process.cwd(), "src/app/api/hub");
const route = (relative: string) => readFileSync(resolve(root, relative, "route.ts"), "utf8");

const adminContracts: Array<[string, string]> = [
  ["admin/dashboard", "admin:access"],
  ["admin/financial-rules", "financial-rules:manage"],
  ["admin/metricas/options", "projects:manage"],
  ["admin/metricas/projects", "projects:manage"],
  ["admin/metricas/projects/[id]", "projects:manage"],
  ["admin/wallet/accounts", "wallet:manage"],
  ["admin/wallet/accounts/[memberId]", "wallet:manage"],
  ["admin/wallet/accounts/[memberId]/transactions", "wallet:manage"],
  ["admin/wallet/requests", "requests:review"],
  ["admin/wallet/requests/[id]/approve", "requests:review"],
  ["admin/wallet/requests/[id]/reject", "requests:review"],
  ["admin/wallet/transactions/[id]/reverse", "wallet:manage"],
];

test("rotas administrativas declaram a permissão exata e o wrapper seguro", () => {
  for (const [path, permission] of adminContracts) {
    const source = route(path);
    assert.match(source, /withHubApi/, `${path} precisa usar withHubApi`);
    assert.ok(source.includes(`requireHubPermission("${permission}")`), `${path} precisa exigir ${permission}`);
  }
  for (const path of ["admin/organization", "admin/directorates", "admin/directorates/[id]", "admin/members", "admin/members/[id]"]) {
    const source = route(path);
    assert.match(source, /withHubApi/, `${path} precisa usar withHubApi`);
    assert.match(source, /requireHubSettingsAccess/, `${path} precisa usar a política canônica de ajustes`);
  }
  const audit = route("admin/audit");
  assert.match(audit, /requireHubMember/);
  assert.match(audit, /audit:read-full/);
  assert.match(audit, /audit:read-financial/);
  assert.match(audit, /FINANCIAL_ACTIONS\.includes\(action\)/);
});

test("ajustes são canônicos, protegidos no servidor e o admin legado redireciona", () => {
  const settingsPage = readFileSync(resolve(process.cwd(), "src/app/hub/ajustes/page.tsx"), "utf8");
  const settingsShell = readFileSync(resolve(process.cwd(), "src/components/hub/HubSettingsPage.tsx"), "utf8");
  const standardShell = readFileSync(resolve(process.cwd(), "src/components/hub/AtlasHubShell.tsx"), "utf8");
  const legacy = readFileSync(resolve(process.cwd(), "src/app/hub/admin/page.tsx"), "utf8");
  assert.match(settingsPage, /getHubOrganizationContext/);
  assert.match(settingsPage, /canAccessHubSettings/);
  assert.match(settingsPage, /notFound\(\)/);
  assert.match(settingsPage, /getHubSettings/);
  assert.match(legacy, /redirect\("\/hub\/ajustes"\)/);
  assert.match(standardShell, />Ajustes</);
  assert.match(standardShell, /canAccessHubSettings/);
  assert.doesNotMatch(standardShell + settingsShell, /\/hub\/admin/);
  for (const path of ["settings", "settings/organization", "settings/invitations", "settings/invitations/[id]", "settings/members/[id]", "settings/directorates/[id]/leadership"]) {
    const source = route(path);
    assert.match(source, /withHubApi/);
    assert.match(source, /requireHubSettingsAccess/);
  }
});

test("rotas de membro mantêm escopo próprio e troca forçada de senha", () => {
  for (const path of ["dashboard", "metricas/ranking", "wallet/me", "wallet/me/requests", "wallet/me/transactions", "me", "me/profile", "me/avatar"]) {
    const source = route(path);
    assert.match(source, /withHubApi/);
    assert.match(source, /requireHubMember|requireHubPermission|getHubSession/);
  }
  assert.match(route("wallet/me/requests"), /memberId: session\.memberId/);
  assert.match(route("auth/change-password"), /allowPasswordChangeRequired: true/);
  assert.match(route("auth/change-password"), /sessionVersion: \{ increment: 1 \}/);
});

test("APIs de notificações exigem membro, escopo duplo e seleções mínimas", () => {
  for (const path of ["notifications", "notifications/summary", "notifications/[id]", "notifications/read-all"]) {
    const source = route(path);
    assert.match(source, /withHubApi/);
    assert.match(source, /requireHubMember/);
    assert.match(source, /organizationId: session\.organizationId/);
    assert.match(source, /recipientMemberId: session\.memberId/);
  }
  const list = route("notifications");
  const summary = route("notifications/summary");
  assert.match(list, /select: \{ id: true, type: true, title: true, body: true, href: true, readAt: true, createdAt: true/);
  assert.doesNotMatch(list, /include:/);
  assert.doesNotMatch(list, /idempotencyKey: true|organizationId: true|recipientMemberId: true|actorMemberId: true/);
  assert.match(list, /Number\.isSafeInteger/);
  assert.match(list, /createdAt: "desc"[\s\S]*id: "desc"/);
  assert.match(list, /Cursor de notificações inválido/);
  assert.match(summary, /select: \{ id: true, title: true, href: true, createdAt: true \}/);
  assert.doesNotMatch(summary, /idempotencyKey: true|organizationId: true|recipientMemberId: true|actorMemberId: true/);
});

test("shell canônico compartilha badge vivo e inbox mantém filtro não lido coerente", () => {
  const standardShell = readFileSync(resolve(process.cwd(), "src/components/hub/AtlasHubShell.tsx"), "utf8");
  const link = readFileSync(resolve(process.cwd(), "src/components/hub/HubNotificationLink.tsx"), "utf8");
  const inbox = readFileSync(resolve(process.cwd(), "src/app/hub/notificacoes/page.tsx"), "utf8");
  assert.match(standardShell, /<HubNotificationsProvider>/);
  assert.match(standardShell, /<HubNotificationLink \/>/);
  assert.match(link, /unreadCount > 9 \? "9\+"/);
  assert.match(link, /showLabel/);
  assert.match(link, /role="dialog"/);
  assert.match(link, /"all"[\s\S]*"unread"[\s\S]*"archived"/);
  assert.match(link, /"accept"[\s\S]*"decline"/);
  assert.match(link, /"dismiss"[\s\S]*"delete"/);
  assert.match(inbox, /filter === "unread" && actionName === "read"/);
  assert.match(inbox, /filter === "unread" \? \[\]/);
  assert.match(inbox, /event\.preventDefault\(\)/);
  assert.match(inbox, /controller\.abort\(\)/);
  assert.match(inbox, /router\.push\(item\.href\)/);
  assert.doesNotMatch(inbox, /window\.location|location\.reload/);
});

test("início renderiza semântica organizacional e configurações atualizam o contexto compartilhado", () => {
  const home = readFileSync(resolve(process.cwd(), "src/app/hub/page.tsx"), "utf8");
  const dashboard = readFileSync(resolve(process.cwd(), "src/components/hub/HubDashboardCore.tsx"), "utf8");
  const organizationPage = readFileSync(resolve(process.cwd(), "src/components/hub/HubSettingsPage.tsx"), "utf8");
  assert.match(home, /HubDashboardCore/);
  assert.doesNotMatch(dashboard, /Saldo atual|Entradas no mês|Despesas no mês|currentBalanceCents|entriesMonthCents|expensesMonthCents/);
  assert.match(dashboard, /Minha diretoria/);
  assert.match(dashboard, /Próximos prazos/);
  assert.doesNotMatch(dashboard, /wallet|carteira/i);
  assert.match(organizationPage, /updateOrganization/);
});

test("migration de notificações troca somente a unicidade para o escopo da organização", () => {
  const sql = readFileSync(resolve(process.cwd(), "prisma/migrations/20260727000000_atlas_hub_standalone_baseline/migration.sql"), "utf8");
  assert.match(sql, /CREATE UNIQUE INDEX "HubNotification_organizationId_idempotencyKey_key"/);
  assert.match(sql, /\("organizationId", "idempotencyKey"\)/);
  assert.match(sql, /HubAvailabilityException_full_day_key/);
  assert.doesNotMatch(sql, /DELETE|TRUNCATE|DROP TABLE/i);
});

test("workflow do Atlas Hub executa a matriz completa com PostgreSQL sem permitir skip", () => {
  const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/hub-ci.yml"), "utf8");
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:[\s\S]*branches: \[main\]/);
  assert.match(workflow, /postgres:16-alpine/);
  assert.match(workflow, /ATLAS_HUB_TEST_DATABASE_URL:/);
  for (const command of [
    "npm ci", "npx prisma format", "npx prisma validate", "npx prisma generate", "npm run hub:accounts:preflight", "npm run db:migrate:prod",
    "npm run hub:test", "npm run build",
  ]) assert.ok(workflow.includes(command), `workflow precisa executar ${command}`);
});

test("gerenciamento de membros usa hierarquia, e-mail por organização e transação serializável", () => {
  const collection = route("admin/members");
  const member = route("admin/members/[id]");
  const login = route("auth/login");
  const loginResolver = readFileSync(resolve(process.cwd(), "src/lib/hub/hub-account-service.ts"), "utf8");
  assert.match(collection, /assertCanAssignHubRole/);
  assert.match(collection, /normalizedEmail/);
  assert.match(member, /assertCanManageHubMember/);
  assert.match(member, /assertOrganizationRetainsActiveSuperAdmin/);
  assert.match(member, /isolationLevel: "Serializable"/);
  assert.match(member, /sessionVersion: \{ increment: 1 \}/);
  assert.match(member, /const audit = await writeHubAudit/);
  assert.match(member, /notification:audit:\$\{audit\.id\}:member-updated/);
  assert.doesNotMatch(login, /organizationSlug/);
  assert.match(login, /authenticateHubAccount/);
  assert.match(loginResolver, /hubAccount\.findUnique/);
  assert.match(loginResolver, /lastOrganizationId/);
});

test("interfaces Atlas Hub não usam replaceAll para expor enums", () => {
  for (const path of [
    "src/app/hub/admin/page.tsx",
    "src/components/hub/HubSettingsPage.tsx",
    "src/app/hub/carteira/extrato/page.tsx",
  ]) {
    assert.doesNotMatch(readFileSync(resolve(process.cwd(), path), "utf8"), /replaceAll\(["']_["']/);
  }
});

test("logout limpa os cookies canônico e legado", () => {
  const source = readFileSync(resolve(process.cwd(), "src/lib/hub/auth.ts"), "utf8");
  assert.match(source, /cookieStore\.set\(HUB_SESSION_COOKIE, ""/);
  assert.match(source, /cookieStore\.set\(LEGACY_HUB_SESSION_COOKIE, ""/);
});

test("a composição standalone não cria redirecionamentos legados nem loop", async () => {
  const redirects = await nextConfig.redirects?.();
  assert.equal(redirects, undefined);
});

test("a API standalone não cria rewrites legados nem handlers duplicados", async () => {
  const rewrites = await nextConfig.rewrites?.();
  assert.equal(rewrites, undefined);
  assert.equal(existsSync(resolve(process.cwd(), "src/app/api/hub")), true);
});

test("superfícies principais usam HUB_BRAND e não reintroduzem marca legada", () => {
  for (const path of [
    "src/components/hub/AtlasHubShell.tsx",
    "src/app/hub/login/page.tsx",
    "src/app/hub/alterar-senha/page.tsx",
  ]) {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");
    assert.match(source, /HUB_BRAND/);
    assert.doesNotMatch(source, />\s*E\s*</);
    assert.doesNotMatch(source, /Economik/);
    assert.doesNotMatch(source, /["']Atlas Hub["']/);
  }
});

test("logo de tenant não usa o otimizador do Next e mantém fallback visível", () => {
  const logo = readFileSync(resolve(process.cwd(), "src/components/hub/HubTenantLogo.tsx"), "utf8");
  const standardShell = readFileSync(resolve(process.cwd(), "src/components/hub/AtlasHubShell.tsx"), "utf8");
  assert.doesNotMatch(standardShell, /next\/image/);
  assert.match(logo, /<img/);
  assert.match(logo, /referrerPolicy="no-referrer"/);
  assert.match(logo, />AH<\/span>/);
  assert.match(logo, /onError/);
});

test("preferências regionais vêm do contexto autenticado em todas as superfícies financeiras", () => {
  const display = readFileSync(resolve(process.cwd(), "src/lib/hub/display.ts"), "utf8");
  assert.match(display, /preferences\.locale/);
  assert.match(display, /preferences\.currency/);
  assert.match(display, /preferences\.timezone/);
  assert.doesNotMatch(readFileSync(resolve(process.cwd(), "src/components/hub/HubDashboardCore.tsx"), "utf8"), /useHubDisplay|currentBalanceCents|entriesMonthCents|expensesMonthCents/);
  for (const path of [
    "src/app/hub/carteira/page.tsx",
    "src/app/hub/carteira/extrato/page.tsx",
    "src/app/hub/carteira/solicitar/page.tsx",
    "src/app/hub/metricas/page.tsx",
    "src/components/hub/HubFinancesCore.tsx",
  ]) assert.match(readFileSync(resolve(process.cwd(), path), "utf8"), /useHubDisplay/);
});

test("organização usa validação segura e bloqueio de moeda serializável", () => {
  const organizationRoute = route("admin/organization");
  const organization = readFileSync(resolve(process.cwd(), "src/lib/hub/organization.ts"), "utf8");
  assert.match(organizationRoute, /normalizeHubLogoUrl/);
  assert.match(organizationRoute, /isSupportedHubLocale/);
  assert.match(organizationRoute, /isSupportedHubCurrency/);
  assert.match(organization, /update: \{\}/);
  assert.match(organization, /isolationLevel: "Serializable"/);
  assert.match(organization, /hubWalletTransaction\.count/);
});

test("login normaliza código no cliente e provisionamento está documentado sem senha", () => {
  const login = readFileSync(resolve(process.cwd(), "src/app/hub/login/page.tsx"), "utf8");
  const example = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
  assert.match(login, /JSON\.stringify\(\{ email, password \}\)/);
  assert.doesNotMatch(login, /hub-organization/);
  for (const variable of ["NAME", "HUB_NAME", "SLUG", "TIMEZONE", "ADMIN_EMAIL", "ADMIN_NAME", "ADMIN_PASSWORD"]) {
    assert.match(example, new RegExp(`ATLAS_HUB_NEW_ORGANIZATION_${variable}=`));
  }
  assert.match(example, /npm run hub:organization:create/);
  assert.match(example, /ATLAS_HUB_NEW_ORGANIZATION_ADMIN_PASSWORD=""/);
});
