import { PrismaClient } from "@prisma/client";

const migrationName = "20260714160000_add_hub_internal_operations";
const standaloneBaseline = "20260727000000_atlas_hub_standalone_baseline";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL e obrigatoria para o preflight de operacoes do Hub.");
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

async function main() {
  const state = await prisma.$queryRaw<Array<{ migration_table: boolean; category_table: boolean; wallet_table: boolean; project_table: boolean }>>`
    SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS migration_table,
           to_regclass('public."HubFinancialCategory"') IS NOT NULL AS category_table,
           to_regclass('public."EconomikWalletAccount"') IS NOT NULL AS wallet_table,
           to_regclass('public."EconomikMetricProject"') IS NOT NULL AS project_table`;
  const applied = state[0]?.migration_table ? await prisma.$queryRaw<Array<{ applied: boolean; baseline: boolean }>>`
    SELECT
      EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name=${migrationName} AND finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied,
      EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name=${standaloneBaseline} AND finished_at IS NOT NULL AND rolled_back_at IS NULL) AS baseline` : [{ applied: false, baseline: false }];
  if (applied[0]?.applied || applied[0]?.baseline) {
    const migration = applied[0]?.baseline ? standaloneBaseline : migrationName;
    console.log(`[hub-operations-preflight] migration=${migration} applied=true`);
    console.log("[hub-operations-preflight] incompatible_total=0");
    return;
  }
  if (state[0]?.category_table) { console.error("[hub-operations-preflight] schema_state=partial_unversioned_operations_schema"); process.exitCode = 1; return; }
  const wallet = state[0]?.wallet_table ? await prisma.hubWalletAccount.aggregate({ _count: true, _sum: { balanceCents: true } }) : { _count: 0, _sum: { balanceCents: 0 } };
  const projects = state[0]?.project_table ? await prisma.hubProject.count() : 0;
  console.log(`[hub-operations-preflight] wallet_accounts_preserved=${wallet._count}`);
  console.log(`[hub-operations-preflight] wallet_balance_snapshot_cents=${wallet._sum.balanceCents || 0}`);
  console.log(`[hub-operations-preflight] projects_preserved=${projects}`);
  console.log("[hub-operations-preflight] incompatible_total=0");
}
main().finally(() => prisma.$disconnect());
