import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const count = async (sql: string) => Number((await prisma.$queryRawUnsafe<Array<{ value: bigint }>>(sql))[0]?.value || BigInt(0));

async function main() {
  const foundation = await prisma.$queryRawUnsafe<Array<{ tableName: string | null }>>(`SELECT to_regclass('public."EconomikMember"')::text AS "tableName"`);
  if (!foundation[0]?.tableName) {
    console.log("Atlas Hub accounts preflight (read-only)");
    console.log("foundationTables: 0");
    console.log("preflight result: safe (clean installation)");
    return;
  }
  const memberColumns = new Set((await prisma.$queryRawUnsafe<Array<{ columnName: string }>>(
    `SELECT column_name AS "columnName" FROM information_schema.columns WHERE table_schema='public' AND table_name='EconomikMember'`,
  )).map((row) => row.columnName));
  if (!memberColumns.has("normalizedEmail")) {
    console.log("Atlas Hub accounts preflight (read-only)");
    console.log("foundationTables: 1");
    console.log("prerequisiteNormalizedEmailMigrationPending: 1");
    console.log("preflight result: safe (prerequisite migration pending)");
    return;
  }
  const expected = ["HubAccount", "WorkspaceHubLink", "WorkspaceHubMutation", "WorkspaceHubAudit"];
  const existing = await prisma.$queryRawUnsafe<Array<{ tableName: string }>>(`SELECT table_name AS "tableName" FROM information_schema.tables WHERE table_schema='public' AND table_name IN (${expected.map((name) => `'${name}'`).join(",")})`);
  const hasAccounts = existing.some((row) => row.tableName === "HubAccount");
  const partialIdentityState = existing.length > 0
    && (existing.length < expected.length || (hasAccounts && !memberColumns.has("accountId"))) ? 1 : 0;
  const results: Record<string, number> = {
    partialIdentityState,
    conflictingPasswordHashes: await count(`SELECT count(*)::bigint AS value FROM (SELECT lower(btrim("normalizedEmail")) FROM "EconomikMember" WHERE "normalizedEmail" IS NOT NULL GROUP BY 1 HAVING count(DISTINCT "passwordHash") > 1) conflict`),
    membersWithoutNormalizedEmail: await count(`SELECT count(*)::bigint AS value FROM "EconomikMember" WHERE status <> 'DELETED'::"EconomikStatus" AND ("normalizedEmail" IS NULL OR btrim("normalizedEmail")='')`),
    membersWithoutOrganization: await count(`SELECT count(*)::bigint AS value FROM "EconomikMember" member LEFT JOIN "EconomikWorkspace" organization ON organization.id=member."workspaceId" WHERE organization.id IS NULL`),
    inactiveOrganizationRecentSessions: await count(`SELECT count(*)::bigint AS value FROM "EconomikMember" member JOIN "EconomikWorkspace" organization ON organization.id=member."workspaceId" WHERE NOT organization."isActive" AND member.status='ACTIVE'::"EconomikStatus" AND member."lastLoginAt" IS NOT NULL`),
    restrictiveOrganizationForeignKeys: await count(`SELECT count(*)::bigint AS value FROM information_schema.referential_constraints rc JOIN information_schema.table_constraints tc ON tc.constraint_name=rc.constraint_name AND tc.constraint_schema=rc.constraint_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=rc.unique_constraint_name AND ccu.constraint_schema=rc.unique_constraint_schema WHERE ccu.table_name='EconomikWorkspace' AND rc.delete_rule='RESTRICT'`),
  };
  if (hasAccounts && memberColumns.has("accountId")) {
    results.duplicateAccountEmails = await count(`SELECT count(*)::bigint AS value FROM (SELECT lower(btrim("normalizedEmail")) FROM "HubAccount" GROUP BY 1 HAVING count(*)>1) duplicate`);
    results.membersWithoutAccount = await count(`SELECT count(*)::bigint AS value FROM "EconomikMember" WHERE status <> 'DELETED'::"EconomikStatus" AND "accountId" IS NULL`);
    results.incompatibleMemberAccounts = await count(`SELECT count(*)::bigint AS value FROM "EconomikMember" member JOIN "HubAccount" account ON account.id=member."accountId" WHERE lower(btrim(member."normalizedEmail"))<>account."normalizedEmail"`);
  } else {
    results.duplicateAccountEmails = 0;
    results.membersWithoutAccount = 0;
    results.incompatibleMemberAccounts = 0;
  }
  console.log("Atlas Hub accounts preflight (read-only)");
  for (const [name, value] of Object.entries(results)) console.log(`${name}: ${value}`);
  const blockers = results.partialIdentityState + results.conflictingPasswordHashes + results.membersWithoutNormalizedEmail + results.membersWithoutOrganization + results.duplicateAccountEmails + results.membersWithoutAccount + results.incompatibleMemberAccounts;
  if (blockers > 0) throw new Error(`Preflight bloqueado por ${blockers} inconsistencia(s). Nenhuma alteracao foi aplicada.`);
  console.log("preflight result: safe");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
