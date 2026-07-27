import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const baseUrl = process.env.ATLAS_HUB_TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!baseUrl) throw new Error("ATLAS_HUB_TEST_DATABASE_URL e obrigatoria para o teste de migrations.");

const tag = `${Date.now()}_${process.pid}`;
const cleanName = `atlas_sg_clean_${tag}`;
const upgradeName = `atlas_sg_upgrade_${tag}`;
const base = new URL(baseUrl);
const admin = new URL(baseUrl); admin.pathname = "/postgres"; admin.search = "";
const databaseUrl = (name: string) => { const url = new URL(base); url.pathname = `/${name}`; url.search = ""; return url.toString(); };
const adminPrisma = new PrismaClient({ datasourceUrl: admin.toString() });

function prismaDeploy(url: string, schema?: string) {
  const result = spawnSync(process.execPath, [path.join(process.cwd(), "node_modules", "prisma", "build", "index.js"), "migrate", "deploy", ...(schema ? ["--schema", schema] : [])], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url }, encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`prisma migrate deploy falhou: ${result.error || ""}\n${result.stdout || ""}\n${result.stderr || ""}`);
}

async function createDatabase(name: string) {
  await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
}

async function dropDatabase(name: string) {
  await adminPrisma.$executeRawUnsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid()`);
  await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
}

async function finalShape(prisma: PrismaClient) {
  const rows = await prisma.$queryRawUnsafe<Array<{ strategy: string | null; growth: string | null; cents: string | null }>>(`
    SELECT to_regclass('public."HubStrategyCycle"')::text AS strategy,
           to_regclass('public."HubOpportunity"')::text AS growth,
           (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='HubOpportunity' AND column_name='estimatedValueCents') AS cents
  `);
  assert.equal(rows[0]?.strategy, '"HubStrategyCycle"');
  assert.equal(rows[0]?.growth, '"HubOpportunity"');
  assert.equal(rows[0]?.cents, "integer");
}

async function seedScaffolding(prisma: PrismaClient) {
  const sql = `
    INSERT INTO "EconomikWorkspace" (id,name,"hubName",slug,timezone,locale,currency,"isActive","createdAt","updatedAt") VALUES
      ('mig-org','Migracao','Migracao','mig-org','America/Fortaleza','pt-BR','BRL',true,NOW(),NOW());
    INSERT INTO "EconomikDirectorate" (id,"workspaceId",name,slug,"isActive","order","createdAt","updatedAt") VALUES
      ('mig-dir','mig-org','Comercial','comercial',true,1,NOW(),NOW());
    INSERT INTO "EconomikMember" (id,"workspaceId",email,"normalizedEmail",name,"passwordHash",role,status,"directorateId","mustChangePassword","sessionVersion","createdAt","updatedAt") VALUES
      ('mig-member','mig-org','mig@example.com','mig@example.com','Migracao','hash','ADMIN','ACTIVE','mig-dir',false,1,NOW(),NOW());
    INSERT INTO "HubStrategyCycle" (id,"workspaceId","directorateId",name,"startsAt","endsAt",status,"createdAt","updatedAt") VALUES
      ('mig-cycle','mig-org','mig-dir','Ciclo legado','2026-01-01','2026-12-31','ACTIVE',NOW(),NOW());
    INSERT INTO "HubStrategicObjective" (id,"workspaceId","directorateId","cycleId","ownerId",title,description,status,"createdAt","updatedAt") VALUES
      ('mig-objective','mig-org','mig-dir','mig-cycle','mig-member','Objetivo legado','Preservar','ON_TRACK',NOW(),NOW());
    INSERT INTO "HubKeyResult" (id,"objectiveId",title,baseline,target,current,unit,"createdAt","updatedAt") VALUES
      ('mig-kr','mig-objective','KR legado',10,100,40,'%',NOW(),NOW());
    INSERT INTO "HubStrategicInitiative" (id,"workspaceId","directorateId","objectiveId","ownerId",name,status,"dueAt","createdAt","updatedAt") VALUES
      ('mig-initiative','mig-org','mig-dir','mig-objective','mig-member','Iniciativa legada','ACTIVE','2026-10-01',NOW(),NOW());
    INSERT INTO "HubStrategicIndicator" (id,"workspaceId","directorateId","ownerId",name,unit,target,"createdAt","updatedAt") VALUES
      ('mig-indicator','mig-org','mig-dir','mig-member','Indicador legado','%',80,NOW(),NOW());
    INSERT INTO "HubIndicatorMeasurement" (id,"indicatorId","reportedById",value,"measuredAt",note,"createdAt") VALUES
      ('mig-measurement','mig-indicator','mig-member',42.5,'2026-07-01 03:00:00','medicao',NOW());
    INSERT INTO "HubStrategicRisk" (id,"workspaceId","directorateId","ownerId",title,likelihood,impact,mitigation,status,"createdAt","updatedAt") VALUES
      ('mig-risk','mig-org','mig-dir','mig-member','Risco legado',3,4,'Mitigar','OPEN',NOW(),NOW());
    INSERT INTO "HubStrategicReview" (id,"cycleId","reviewerId","reviewedAt",summary,"createdAt") VALUES
      ('mig-review','mig-cycle','mig-member','2026-07-01','Revisao legada',NOW());
    INSERT INTO "HubExternalOrganization" (id,"workspaceId",name,type,website,"createdAt","updatedAt") VALUES
      ('mig-external','mig-org','Cliente legado','COMPANY','https://example.com',NOW(),NOW());
    INSERT INTO "HubExternalContact" (id,"externalOrganizationId",name,email,phone,role,"createdAt","updatedAt") VALUES
      ('mig-contact','mig-external','Contato legado','contato@example.com','85999999999','Compras',NOW(),NOW());
    INSERT INTO "HubCommercialPipeline" (id,"workspaceId",name,"isDefault","createdAt","updatedAt") VALUES
      ('mig-pipeline','mig-org','Pipeline legado',true,NOW(),NOW());
    INSERT INTO "HubCommercialStage" (id,"pipelineId",name,position,probability,"isWon","isLost") VALUES
      ('mig-stage-open','mig-pipeline','Aberta',1,20,false,false),
      ('mig-stage-won','mig-pipeline','Ganha',2,100,true,false),
      ('mig-stage-lost','mig-pipeline','Perdida',3,0,false,true);
    INSERT INTO "HubGrowthLead" (id,"workspaceId","directorateId","externalOrganizationId","createdById",name,source,status,"createdAt","updatedAt") VALUES
      ('mig-lead','mig-org','mig-dir','mig-external','mig-member','Lead legado','REFERRAL','QUALIFIED',NOW(),NOW());
    INSERT INTO "HubGrowthOpportunity" (id,"workspaceId","directorateId","leadId","pipelineId","stageId","ownerId",name,value,"expectedCloseAt","createdAt","updatedAt") VALUES
      ('mig-opportunity','mig-org','mig-dir','mig-lead','mig-pipeline','mig-stage-open','mig-member','Oportunidade legada',123.45,'2026-11-01',NOW(),NOW());
    INSERT INTO "HubGrowthActivity" (id,"opportunityId","memberId",type,"dueAt","completedAt",note,"createdAt") VALUES
      ('mig-activity','mig-opportunity','mig-member','CALL','2026-07-02','2026-07-01','Ligacao legada',NOW());
    INSERT INTO "HubGrowthProposal" (id,"workspaceId","opportunityId","createdById",title,amount,status,"createdAt","updatedAt") VALUES
      ('mig-proposal','mig-org','mig-opportunity','mig-member','Proposta legada',123.45,'APPROVED',NOW(),NOW());
    INSERT INTO "HubGrowthProposalRevision" (id,"proposalId",version,content,amount,"createdAt") VALUES
      ('mig-revision','mig-proposal',1,'Conteudo legado',123.45,NOW());
    INSERT INTO "HubPartnership" (id,"workspaceId","externalOrganizationId","managerId",name,status,"startsAt","endsAt","createdAt","updatedAt") VALUES
      ('mig-partnership','mig-org','mig-external','mig-member','Parceria legada','ACTIVE','2026-01-01','2026-12-31',NOW(),NOW());
  `;
  for (const statement of sql.split(";").map((item) => item.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(statement);
}

async function verifyUpgrade(prisma: PrismaClient) {
  const preserved = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    SELECT o.id AS opportunity_id, o."estimatedValueCents" AS opportunity_cents, o."growthOrganizationId" AS growth_id,
           p.id AS proposal_id, p."totalCents" AS proposal_cents, r.id AS revision_id, i."totalAmountCents" AS revision_cents,
           l.id AS lead_id, c.id AS contact_id, part.id AS partnership_id
    FROM "HubOpportunity" o JOIN "HubProposal" p ON p."opportunityId"=o.id
    JOIN "HubProposalRevision" r ON r."proposalId"=p.id JOIN "HubProposalItem" i ON i."revisionId"=r.id
    JOIN "HubLead" l ON l.id=o."sourceLeadId" JOIN "HubGrowthContact" c ON c."growthOrganizationId"=o."growthOrganizationId"
    JOIN "HubPartnership" part ON part."growthOrganizationId"=o."growthOrganizationId" WHERE o.id='mig-opportunity'
  `);
  assert.equal(preserved.length, 1);
  assert.deepEqual({ opportunity: preserved[0].opportunity_id, cents: preserved[0].opportunity_cents, proposal: preserved[0].proposal_id, proposalCents: preserved[0].proposal_cents, revision: preserved[0].revision_id, revisionCents: preserved[0].revision_cents, lead: preserved[0].lead_id, contact: preserved[0].contact_id, partnership: preserved[0].partnership_id },
    { opportunity: "mig-opportunity", cents: 12345, proposal: "mig-proposal", proposalCents: 12345, revision: "mig-revision", revisionCents: 12345, lead: "mig-lead", contact: "mig-contact", partnership: "mig-partnership" });
  const strategyIds = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*)::bigint AS count FROM "HubStrategyCycle" c JOIN "HubStrategicObjective" o ON o."cycleId"=c.id JOIN "HubKeyResult" k ON k."objectiveId"=o.id JOIN "HubStrategicInitiative" i ON i."objectiveId"=o.id JOIN "HubStrategicRisk" r ON r."cycleId"=c.id WHERE c.id='mig-cycle' AND o.id='mig-objective' AND k.id='mig-kr' AND i.id='mig-initiative' AND r.id='mig-risk'`);
  assert.equal(Number(strategyIds[0].count), 1);
}

async function main() {
let temp = "";
try {
  await createDatabase(cleanName); await createDatabase(upgradeName);
  prismaDeploy(databaseUrl(cleanName));
  const clean = new PrismaClient({ datasourceUrl: databaseUrl(cleanName) }); await finalShape(clean); await clean.$disconnect();

  temp = await mkdtemp(path.join(tmpdir(), "atlas-sg-migrations-"));
  const prismaDir = path.join(temp, "prisma"); await mkdir(prismaDir);
  await cp(path.join(process.cwd(), "prisma", "schema.prisma"), path.join(prismaDir, "schema.prisma"));
  await cp(path.join(process.cwd(), "prisma", "migrations"), path.join(prismaDir, "migrations"), { recursive: true, filter: (source) => !source.includes("20260714220000_complete_hub_strategy_growth") });
  prismaDeploy(databaseUrl(upgradeName), path.join(prismaDir, "schema.prisma"));
  const upgrade = new PrismaClient({ datasourceUrl: databaseUrl(upgradeName) });
  await seedScaffolding(upgrade); await upgrade.$disconnect();
  prismaDeploy(databaseUrl(upgradeName));
  const upgraded = new PrismaClient({ datasourceUrl: databaseUrl(upgradeName) }); await finalShape(upgraded); await verifyUpgrade(upgraded); await upgraded.$disconnect();
  console.log("migration tests: 2 passed (clean installation, scaffolding upgrade with preserved IDs and cents)");
} finally {
  if (temp) await rm(temp, { recursive: true, force: true });
  await dropDatabase(cleanName).catch(() => undefined); await dropDatabase(upgradeName).catch(() => undefined); await adminPrisma.$disconnect();
}
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
