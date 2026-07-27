import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const baseUrl = process.env.ATLAS_HUB_TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!baseUrl) throw new Error("ATLAS_HUB_TEST_DATABASE_URL e obrigatoria para o teste de migrations.");
const tag = `${Date.now()}_${process.pid}`;
const cleanName = `atlas_accounts_clean_${tag}`;
const upgradeName = `atlas_accounts_upgrade_${tag}`;
const base = new URL(baseUrl); const admin = new URL(baseUrl); admin.pathname = "/postgres"; admin.search = "";
const url = (name: string) => { const value = new URL(base); value.pathname = `/${name}`; value.search = ""; return value.toString(); };
const root = new PrismaClient({ datasourceUrl: admin.toString() });
function deploy(databaseUrl: string, schema?: string) { const result = spawnSync(process.execPath, [path.join(process.cwd(), "node_modules", "prisma", "build", "index.js"), "migrate", "deploy", ...(schema ? ["--schema", schema] : [])], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8" }); if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`); }
async function create(name: string) { await root.$executeRawUnsafe(`CREATE DATABASE "${name}"`); }
async function drop(name: string) { await root.$executeRawUnsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${name}' AND pid<>pg_backend_pid()`); await root.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`); }

async function main() {
  let temp = "";
  try {
    await create(cleanName); await create(upgradeName);
    deploy(url(cleanName));
    const clean = new PrismaClient({ datasourceUrl: url(cleanName) });
    assert.equal(Number((await clean.$queryRawUnsafe<Array<{ value: bigint }>>(`SELECT count(*)::bigint AS value FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('HubAccount','WorkspaceHubLink','WorkspaceHubMutation','WorkspaceHubAudit')`))[0].value), 4);
    await clean.$disconnect();

    temp = await mkdtemp(path.join(tmpdir(), "atlas-account-migrations-"));
    const prismaDir = path.join(temp, "prisma"); await mkdir(prismaDir);
    await cp(path.join(process.cwd(), "prisma", "schema.prisma"), path.join(prismaDir, "schema.prisma"));
    await cp(path.join(process.cwd(), "prisma", "migrations"), path.join(prismaDir, "migrations"), { recursive: true, filter: (source) => !source.includes("20260714230000_connect_hub_accounts_workspace") });
    deploy(url(upgradeName), path.join(prismaDir, "schema.prisma"));
    const before = new PrismaClient({ datasourceUrl: url(upgradeName) });
    const hash = await bcrypt.hash("MigrationPass123!", 12);
    await before.$executeRawUnsafe(`INSERT INTO "EconomikWorkspace" (id,name,"hubName",slug,timezone,locale,currency,"isActive","createdAt","updatedAt") VALUES ('account-org-a','Org A','Hub A','account-org-a','America/Fortaleza','pt-BR','BRL',true,NOW(),NOW()),('account-org-b','Org B','Hub B','account-org-b','America/Fortaleza','pt-BR','BRL',true,NOW(),NOW())`);
    await before.$executeRawUnsafe(`INSERT INTO "EconomikMember" (id,"workspaceId",email,"normalizedEmail",name,"passwordHash",role,status,"mustChangePassword","sessionVersion","createdAt","updatedAt") VALUES ('account-member-a','account-org-a','Existing@Example.com','existing@example.com','Existing A',$1,'SUPER_ADMIN','ACTIVE',true,2,NOW(),NOW()),('account-member-b','account-org-b','existing@example.com','existing@example.com','Existing B',$1,'ADMIN','ACTIVE',true,3,NOW(),NOW())`, hash);
    await before.$disconnect();
    deploy(url(upgradeName));
    const upgraded = new PrismaClient({ datasourceUrl: url(upgradeName) });
    const accounts = await upgraded.hubAccount.findMany({ where: { normalizedEmail: "existing@example.com" }, include: { memberships: { orderBy: { id: "asc" } } } });
    assert.equal(accounts.length, 1);
    assert.deepEqual(accounts[0].memberships.map((member) => member.id), ["account-member-a", "account-member-b"]);
    assert.equal(accounts[0].memberships.every((member) => member.accountId === accounts[0].id), true);
    assert.equal(await bcrypt.compare("MigrationPass123!", accounts[0].passwordHash), true);
    await upgraded.$disconnect();
    console.log("migration tests: 4 passed (clean installation, existing identities upgraded, multiple memberships preserved, password login preserved)");
  } finally {
    if (temp) await rm(temp, { recursive: true, force: true });
    await drop(cleanName).catch(() => undefined); await drop(upgradeName).catch(() => undefined); await root.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
