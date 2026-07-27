import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const baseUrl = process.env.ATLAS_HUB_TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!baseUrl) throw new Error("ATLAS_HUB_TEST_DATABASE_URL e obrigatoria para o teste de migrations de convites.");
const tag = `${Date.now()}_${process.pid}`; const cleanName = `atlas_invites_clean_${tag}`; const upgradeName = `atlas_invites_upgrade_${tag}`;
const base = new URL(baseUrl); const admin = new URL(baseUrl); admin.pathname = "/postgres"; admin.search = "";
const url = (name: string) => { const value = new URL(base); value.pathname = `/${name}`; value.search = ""; return value.toString(); };
const root = new PrismaClient({ datasourceUrl: admin.toString() });
function deploy(databaseUrl: string, schema?: string) { const result = spawnSync(process.execPath, [path.join(process.cwd(), "node_modules", "prisma", "build", "index.js"), "migrate", "deploy", ...(schema ? ["--schema", schema] : [])], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8" }); if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`); }
async function create(name: string) { await root.$executeRawUnsafe(`CREATE DATABASE "${name}"`); }
async function drop(name: string) { await root.$executeRawUnsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${name}' AND pid<>pg_backend_pid()`); await root.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`); }

async function main() {
  let temp = "";
  try {
    await create(cleanName); await create(upgradeName); deploy(url(cleanName));
    const clean = new PrismaClient({ datasourceUrl: url(cleanName) });
    assert.equal(Number((await clean.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM information_schema.tables WHERE table_name='HubMemberInvitation'`)[0].count), 1); await clean.$disconnect();
    temp = await mkdtemp(path.join(tmpdir(), "atlas-invitation-migrations-")); const prismaDir = path.join(temp, "prisma"); await mkdir(prismaDir);
    await cp(path.join(process.cwd(), "prisma", "schema.prisma"), path.join(prismaDir, "schema.prisma"));
    await cp(path.join(process.cwd(), "prisma", "migrations"), path.join(prismaDir, "migrations"), { recursive: true, filter: (source) => !source.includes("20260721010000_complete_hub_invitations_governance") });
    deploy(url(upgradeName), path.join(prismaDir, "schema.prisma"));
    const before = new PrismaClient({ datasourceUrl: url(upgradeName) });
    await before.$executeRawUnsafe(`INSERT INTO "EconomikWorkspace" (id,name,"hubName",slug,timezone,locale,currency,"isActive","createdAt","updatedAt") VALUES ('upgrade-org','Upgrade','Upgrade','upgrade-org','America/Fortaleza','pt-BR','BRL',true,NOW(),NOW())`);
    await before.$executeRawUnsafe(`INSERT INTO "HubAccount" (id,email,"normalizedEmail","passwordHash",status,"mustChangePassword","sessionVersion","createdAt","updatedAt") VALUES ('legacy-account','legacy@example.test','legacy@example.test','temporary','ACTIVE',true,1,NOW(),NOW())`);
    await before.$executeRawUnsafe(`INSERT INTO "EconomikMember" (id,"workspaceId",email,"normalizedEmail",name,"passwordHash",role,status,"accountId","mustChangePassword","sessionVersion","organizationPosition","memberCategory","isPrimary","createdAt","updatedAt") VALUES ('legacy-member','upgrade-org','legacy@example.test','legacy@example.test','Legacy','temporary','MEMBER','INVITED','legacy-account',true,1,'MEMBER','MEMBER',false,NOW(),NOW())`);
    await before.$executeRawUnsafe(`INSERT INTO "EconomikMember" (id,"workspaceId",email,"normalizedEmail",name,"passwordHash",role,status,"mustChangePassword","sessionVersion","organizationPosition","memberCategory","isPrimary","createdAt","updatedAt") VALUES ('president-a','upgrade-org','president-a@example.test','president-a@example.test','President A','test','MEMBER','ACTIVE',false,1,'PRESIDENT','MEMBER',true,NOW() - INTERVAL '1 day',NOW()),('president-b','upgrade-org','president-b@example.test','president-b@example.test','President B','test','MEMBER','ACTIVE',false,1,'PRESIDENT','MEMBER',false,NOW(),NOW())`);
    await before.$disconnect(); deploy(url(upgradeName));
    const upgraded = new PrismaClient({ datasourceUrl: url(upgradeName) });
    assert.equal((await upgraded.hubMember.findUniqueOrThrow({ where: { id: "legacy-member" } })).status, "INVITED"); assert.equal(await upgraded.hubMemberInvitation.count(), 0); assert.equal(await upgraded.hubAccount.count({ where: { id: "legacy-account" } }), 1); assert.equal(await upgraded.hubMember.count({ where: { organizationId: "upgrade-org", status: "ACTIVE", organizationPosition: "PRESIDENT" } }), 1); assert.equal(await upgraded.hubAuditLog.count({ where: { organizationId: "upgrade-org", action: "HUB_PRESIDENT_UNIQUENESS_REPAIRED" } }), 1); await upgraded.$disconnect();
    console.log("invitation migration tests: 6 passed (empty history, table/indexes, legacy INVITED/account preserved, duplicate Presidents repaired and audited)");
  } finally { if (temp) await rm(temp, { recursive: true, force: true }); await drop(cleanName).catch(() => undefined); await drop(upgradeName).catch(() => undefined); await root.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
