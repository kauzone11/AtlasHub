import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL e obrigatoria para o preflight de estrategia e crescimento.");
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const issues: string[] = [];

async function existsTable(name: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ value: boolean }>>(`SELECT to_regclass('public."${name}"') IS NOT NULL AS value`);
  return rows[0]?.value || false;
}

async function existsColumn(table: string, column: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ value: boolean }>>(`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' AND column_name='${column}') AS value`);
  return rows[0]?.value || false;
}

async function count(sql: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ value: bigint | number }>>(sql);
  return Number(rows[0]?.value || 0);
}

async function main() {
  const migrations = await existsTable("_prisma_migrations");
  const applied = new Set<string>();
  if (migrations) for (const row of await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)) applied.add(row.migration_name);
  const invalidApplied = applied.has("20260714200000_add_hub_strategy_growth");
  const scaffoldApplied = applied.has("20260714210000_add_hub_strategy_growth");
  const correctiveApplied = applied.has("20260714220000_complete_hub_strategy_growth");
  if (invalidApplied) issues.push("migration-history divergence: 20260714200000_add_hub_strategy_growth is applied");
  if (correctiveApplied && !scaffoldApplied) issues.push("migration-history divergence: corrective migration exists without scaffolding migration");

  const hasStrategy = await existsTable("HubStrategyCycle");
  const hasWorkspaceShape = hasStrategy && await existsColumn("HubStrategyCycle", "workspaceId");
  const hasFinalShape = hasStrategy && await existsColumn("HubStrategyCycle", "organizationId") && await existsTable("HubOpportunity");
  const hasOldGrowth = await existsTable("HubGrowthOpportunity");
  if (hasStrategy && !hasWorkspaceShape && !hasFinalShape) issues.push("partial strategy/growth table shape");
  if (hasWorkspaceShape !== hasOldGrowth) issues.push("old strategy and growth table shapes are inconsistent");

  if (hasOldGrowth) {
    const unsafe = await count(`SELECT count(*)::bigint AS value FROM (
      SELECT value AS amount FROM "HubGrowthOpportunity" WHERE value IS NOT NULL UNION ALL
      SELECT amount FROM "HubGrowthProposal" WHERE amount IS NOT NULL UNION ALL
      SELECT amount FROM "HubGrowthProposalRevision" WHERE amount IS NOT NULL
    ) values_to_convert WHERE amount * 100 <> trunc(amount * 100) OR abs(amount * 100) > 2147483647`);
    if (unsafe) issues.push(`unsafe decimal-to-cent conversions=${unsafe}`);
    const crossOrganization = await count(`SELECT count(*)::bigint AS value FROM "HubGrowthOpportunity" o JOIN "HubGrowthLead" l ON l.id=o."leadId" WHERE o."workspaceId"<>l."workspaceId"`);
    if (crossOrganization) issues.push(`old cross-organization relationships=${crossOrganization}`);
    const invalidDirectorates = await count(`SELECT count(*)::bigint AS value FROM (
      SELECT s.id FROM "HubStrategyCycle" s JOIN "EconomikDirectorate" d ON d.id=s."directorateId" WHERE s."directorateId" IS NOT NULL AND d."workspaceId"<>s."workspaceId"
      UNION ALL SELECT l.id FROM "HubGrowthLead" l JOIN "EconomikDirectorate" d ON d.id=l."directorateId" WHERE l."directorateId" IS NOT NULL AND d."workspaceId"<>l."workspaceId"
      UNION ALL SELECT o.id FROM "HubGrowthOpportunity" o JOIN "EconomikDirectorate" d ON d.id=o."directorateId" WHERE o."directorateId" IS NOT NULL AND d."workspaceId"<>o."workspaceId"
    ) invalid`);
    if (invalidDirectorates) issues.push(`old invalid directorate relationships=${invalidDirectorates}`);
    const terminal = await count(`SELECT count(*)::bigint AS value FROM (SELECT p."workspaceId" FROM "HubCommercialPipeline" p JOIN "HubCommercialStage" s ON s."pipelineId"=p.id GROUP BY p."workspaceId" HAVING count(*) FILTER (WHERE s."isWon")<>1 OR count(*) FILTER (WHERE s."isLost")<>1) invalid`);
    if (terminal) issues.push(`old pipelines without exactly one won/lost stage=${terminal}`);
  }

  if (hasFinalShape) {
    const finalTables = ["HubStrategyCycle","HubStrategicObjective","HubKeyResult","HubStrategicInitiative","HubStrategicIndicator","HubIndicatorMeasurement","HubStrategicRisk","HubStrategicReview","HubGrowthOrganization","HubGrowthContact","HubLead","HubPipelineStage","HubOpportunity","HubOpportunityStageHistory","HubOpportunityActivity","HubProposal","HubProposalRevision","HubProposalItem","HubPartnership","HubStrategicGrowthMutation"];
    const missing = [] as string[]; for (const table of finalTables) if (!await existsTable(table)) missing.push(table);
    if (missing.length) issues.push(`missing final tables=${missing.join(",")}`);
    const crossOrganization = await count(`SELECT count(*)::bigint AS value FROM (
      SELECT o.id FROM "HubStrategicObjective" o JOIN "HubStrategyCycle" c ON c.id=o."cycleId" WHERE o."organizationId"<>c."organizationId"
      UNION ALL SELECT k.id FROM "HubKeyResult" k JOIN "HubStrategicObjective" o ON o.id=k."objectiveId" WHERE k."organizationId"<>o."organizationId"
      UNION ALL SELECT c.id FROM "HubGrowthContact" c JOIN "HubGrowthOrganization" g ON g.id=c."growthOrganizationId" WHERE c."organizationId"<>g."organizationId"
      UNION ALL SELECT o.id FROM "HubOpportunity" o JOIN "HubGrowthOrganization" g ON g.id=o."growthOrganizationId" WHERE o."organizationId"<>g."organizationId"
      UNION ALL SELECT o.id FROM "HubOpportunity" o JOIN "HubPipelineStage" s ON s.id=o."stageId" WHERE o."organizationId"<>s."organizationId"
      UNION ALL SELECT p.id FROM "HubProposal" p JOIN "HubOpportunity" o ON o.id=p."opportunityId" WHERE p."organizationId"<>o."organizationId"
      UNION ALL SELECT p.id FROM "HubPartnership" p JOIN "HubGrowthOrganization" g ON g.id=p."growthOrganizationId" WHERE p."organizationId"<>g."organizationId"
    ) invalid`);
    if (crossOrganization) issues.push(`final cross-organization relationships=${crossOrganization}`);
    const invalidDirectorates = await count(`SELECT count(*)::bigint AS value FROM (
      SELECT o.id FROM "HubStrategicObjective" o JOIN "EconomikDirectorate" d ON d.id=o."directorateId" WHERE o."directorateId" IS NOT NULL AND d."workspaceId"<>o."organizationId"
      UNION ALL SELECT l.id FROM "HubLead" l JOIN "EconomikDirectorate" d ON d.id=l."directorateId" WHERE l."directorateId" IS NOT NULL AND d."workspaceId"<>l."organizationId"
      UNION ALL SELECT o.id FROM "HubOpportunity" o JOIN "EconomikDirectorate" d ON d.id=o."directorateId" WHERE o."directorateId" IS NOT NULL AND d."workspaceId"<>o."organizationId"
    ) invalid`);
    if (invalidDirectorates) issues.push(`final invalid directorate relationships=${invalidDirectorates}`);
    const noncontiguous = await count(`SELECT count(*)::bigint AS value FROM (SELECT "organizationId" FROM "HubPipelineStage" WHERE "isActive" GROUP BY "organizationId" HAVING min("order")<>1 OR max("order")<>count(*) OR count(DISTINCT "order")<>count(*)) invalid`);
    if (noncontiguous) issues.push(`noncontiguous pipelines=${noncontiguous}`);
    const terminals = await count(`SELECT count(*)::bigint AS value FROM (SELECT "organizationId" FROM "HubPipelineStage" GROUP BY "organizationId" HAVING count(*) FILTER (WHERE "isActive" AND "isWon")<>1 OR count(*) FILTER (WHERE "isActive" AND "isLost")<>1) invalid`);
    if (terminals) issues.push(`pipelines without exactly one active won/lost stage=${terminals}`);
    const requiredConstraints = ["HubStrategicObjective_cycle_scope_fkey","HubKeyResult_objective_scope_fkey","HubStrategicInitiative_objective_scope_fkey","HubIndicatorMeasurement_indicator_scope_fkey","HubStrategicRisk_cycle_scope_fkey","HubGrowthContact_organization_scope_fkey","HubOpportunity_growth_organization_scope_fkey","HubOpportunity_stage_scope_fkey","HubProposal_opportunity_scope_fkey","HubPartnership_growth_organization_scope_fkey","HubOpportunity_values_check","HubProposal_totals_check"];
    const constraints = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(`SELECT conname FROM pg_constraint WHERE conname IN (${requiredConstraints.map((name) => `'${name}'`).join(",")})`);
    const present = new Set(constraints.map((item) => item.conname)); const missingConstraints = requiredConstraints.filter((name) => !present.has(name));
    if (missingConstraints.length) issues.push(`missing final constraints=${missingConstraints.join(",")}`);
  }

  const [wallet, projects, approvedProjects, financialEntries] = await Promise.all([
    await existsTable("EconomikWalletAccount") ? prisma.hubWalletAccount.aggregate({ _count: true, _sum: { balanceCents: true } }) : Promise.resolve({ _count: 0, _sum: { balanceCents: 0 } }),
    await existsTable("EconomikMetricProject") ? prisma.hubProject.count() : Promise.resolve(0),
    await existsTable("EconomikMetricProject") ? prisma.hubProject.count({ where: { status: "APPROVED" } }) : Promise.resolve(0),
    await existsTable("HubFinancialEntry") ? prisma.hubFinancialEntry.count() : Promise.resolve(0),
  ]);
  console.log(`[hub-strategy-growth-preflight] migrations invalid=${invalidApplied} scaffold=${scaffoldApplied} corrective=${correctiveApplied}`);
  console.log(`[hub-strategy-growth-preflight] shapes old=${hasWorkspaceShape && hasOldGrowth} final=${hasFinalShape}`);
  console.log(`[hub-strategy-growth-preflight] wallet_accounts_preserved=${wallet._count}`);
  console.log(`[hub-strategy-growth-preflight] wallet_balance_snapshot_cents=${wallet._sum.balanceCents || 0}`);
  console.log(`[hub-strategy-growth-preflight] projects_preserved=${projects}`);
  console.log(`[hub-strategy-growth-preflight] approved_projects_preserved=${approvedProjects}`);
  console.log(`[hub-strategy-growth-preflight] financial_entries_preserved=${financialEntries}`);
  console.log(`[hub-strategy-growth-preflight] incompatible_total=${issues.length}`);
  if (issues.length) throw new Error(issues.join("; "));
}

main().catch((error) => { console.error("[hub-strategy-growth-preflight] failed", error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
