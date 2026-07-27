import { PrismaClient } from "@prisma/client";

const migrationName = "20260714050000_harden_hub_collaboration";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL e obrigatoria para o preflight.");

const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const showIds = process.env.ATLAS_HUB_PREFLIGHT_SHOW_IDS === "1";

type CountRow = { count: bigint | number };
type IdRow = { id: string };

async function count(sql: string) {
  const rows = await prisma.$queryRawUnsafe<CountRow[]>(sql);
  return Number(rows[0]?.count || 0);
}

async function ids(sql: string) {
  if (!showIds) return [];
  return (await prisma.$queryRawUnsafe<IdRow[]>(sql))
    .map((row) => row.id)
    .filter(Boolean);
}

async function main() {
  const migrationTable = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS exists`,
  );
  const applied = migrationTable[0]?.exists ? await prisma.$queryRawUnsafe<Array<{ applied: boolean }>>(
    `SELECT EXISTS (
      SELECT 1 FROM "_prisma_migrations"
      WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL
    ) AS applied`,
    migrationName,
  ) : [{ applied: false }];
  if (applied[0]?.applied) {
    console.log(`[hub-collaboration-preflight] migration=${migrationName} applied=true`);
    console.log("[hub-collaboration-preflight] incompatible_total=0");
    return;
  }

  const requiredTables = ["HubAvailabilityException", "HubAvailabilityRule", "HubMeeting"];
  const tableState = await prisma.$queryRawUnsafe<Array<{ name: string; exists: boolean }>>(
    `SELECT name, to_regclass('public."' || name || '"') IS NOT NULL AS exists
     FROM unnest($1::text[]) AS name`,
    requiredTables,
  );
  const existingTables = tableState.filter((item) => item.exists).length;
  if (existingTables === 0) {
    for (const name of ["duplicate_full_day_exceptions", "duplicate_ranged_exceptions", "meetings_shorter_than_15_minutes", "meetings_non_positive_range", "invalid_availability_rules", "invalid_availability_exceptions"])
      console.log(`[hub-collaboration-preflight] ${name}=0`);
    console.log("[hub-collaboration-preflight] schema_state=empty_before_initial_migration");
    console.log("[hub-collaboration-preflight] incompatible_total=0");
    return;
  }
  if (existingTables !== requiredTables.length) {
    console.error("[hub-collaboration-preflight] schema_state=partial_collaboration_schema");
    process.exitCode = 1;
    return;
  }

  const checks = [
    {
      name: "duplicate_full_day_exceptions",
      countSql: `SELECT COUNT(*)::bigint AS count FROM "HubAvailabilityException" e
        WHERE "startMinute" IS NULL AND "endMinute" IS NULL AND EXISTS (
          SELECT 1 FROM "HubAvailabilityException" d WHERE d."organizationId"=e."organizationId"
          AND d."memberId"=e."memberId" AND d.date=e.date AND d.type=e.type
          AND d."startMinute" IS NULL AND d."endMinute" IS NULL AND d.id<>e.id)`,
      idsSql: `SELECT id FROM "HubAvailabilityException" e
        WHERE "startMinute" IS NULL AND "endMinute" IS NULL AND EXISTS (
          SELECT 1 FROM "HubAvailabilityException" d WHERE d."organizationId"=e."organizationId"
          AND d."memberId"=e."memberId" AND d.date=e.date AND d.type=e.type
          AND d."startMinute" IS NULL AND d."endMinute" IS NULL AND d.id<>e.id) ORDER BY id`,
    },
    {
      name: "duplicate_ranged_exceptions",
      countSql: `SELECT COUNT(*)::bigint AS count FROM "HubAvailabilityException" e
        WHERE "startMinute" IS NOT NULL AND "endMinute" IS NOT NULL AND EXISTS (
          SELECT 1 FROM "HubAvailabilityException" d WHERE d."organizationId"=e."organizationId"
          AND d."memberId"=e."memberId" AND d.date=e.date AND d.type=e.type
          AND d."startMinute"=e."startMinute" AND d."endMinute"=e."endMinute" AND d.id<>e.id)`,
      idsSql: `SELECT id FROM "HubAvailabilityException" e
        WHERE "startMinute" IS NOT NULL AND "endMinute" IS NOT NULL AND EXISTS (
          SELECT 1 FROM "HubAvailabilityException" d WHERE d."organizationId"=e."organizationId"
          AND d."memberId"=e."memberId" AND d.date=e.date AND d.type=e.type
          AND d."startMinute"=e."startMinute" AND d."endMinute"=e."endMinute" AND d.id<>e.id) ORDER BY id`,
    },
    {
      name: "meetings_shorter_than_15_minutes",
      countSql: `SELECT COUNT(*)::bigint AS count FROM "HubMeeting" WHERE "endAt" > "startAt" AND "endAt" < "startAt" + INTERVAL '15 minutes'`,
      idsSql: `SELECT id FROM "HubMeeting" WHERE "endAt" > "startAt" AND "endAt" < "startAt" + INTERVAL '15 minutes' ORDER BY id`,
    },
    {
      name: "meetings_non_positive_range",
      countSql: `SELECT COUNT(*)::bigint AS count FROM "HubMeeting" WHERE "endAt" <= "startAt"`,
      idsSql: `SELECT id FROM "HubMeeting" WHERE "endAt" <= "startAt" ORDER BY id`,
    },
    {
      name: "invalid_availability_rules",
      countSql: `SELECT COUNT(*)::bigint AS count FROM "HubAvailabilityRule" WHERE "startMinute" NOT BETWEEN 0 AND 1439 OR "endMinute" NOT BETWEEN 1 AND 1440 OR "endMinute" <= "startMinute"`,
      idsSql: `SELECT id FROM "HubAvailabilityRule" WHERE "startMinute" NOT BETWEEN 0 AND 1439 OR "endMinute" NOT BETWEEN 1 AND 1440 OR "endMinute" <= "startMinute" ORDER BY id`,
    },
    {
      name: "invalid_availability_exceptions",
      countSql: `SELECT COUNT(*)::bigint AS count FROM "HubAvailabilityException" WHERE NOT (("startMinute" IS NULL AND "endMinute" IS NULL) OR ("startMinute" BETWEEN 0 AND 1439 AND "endMinute" BETWEEN 1 AND 1440 AND "endMinute" > "startMinute"))`,
      idsSql: `SELECT id FROM "HubAvailabilityException" WHERE NOT (("startMinute" IS NULL AND "endMinute" IS NULL) OR ("startMinute" BETWEEN 0 AND 1439 AND "endMinute" BETWEEN 1 AND 1440 AND "endMinute" > "startMinute")) ORDER BY id`,
    },
  ];
  let incompatibleTotal = 0;
  for (const check of checks) {
    const exactCount = await count(check.countSql);
    incompatibleTotal += exactCount;
    console.log(`[hub-collaboration-preflight] ${check.name}=${exactCount}`);
    const affectedIds = await ids(check.idsSql);
    if (affectedIds.length) console.log(`[hub-collaboration-preflight] ${check.name}_ids=${affectedIds.join(",")}`);
  }
  console.log(`[hub-collaboration-preflight] incompatible_total=${incompatibleTotal}`);
  if (incompatibleTotal) {
    console.error("Preflight bloqueado. Consulte docs/atlas-hub-collaboration-preflight.md; nenhum dado foi alterado.");
    process.exitCode = 1;
  }
}

main().finally(() => prisma.$disconnect());
