import crypto from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

export class HubDeletionError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message);
    this.name = "HubDeletionError";
  }
}

type DeleteInput = {
  organizationId: string;
  version: number;
  typedName: string;
  acknowledgePermanentDeletion: boolean;
  idempotencyKey: string;
  actorUserId: string;
};

const digest = (input: DeleteInput) => crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");

type TableRow = { tableName: string };
type ForeignKeyRow = { childTable: string; parentTable: string };

async function organizationScopedTables(tx: Prisma.TransactionClient) {
  const tables = await tx.$queryRaw<TableRow[]>`
    SELECT table_name AS "tableName"
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'organizationId' AND table_name LIKE 'Hub%'
    ORDER BY table_name
  `;
  const allowed = tables.map((row) => row.tableName).filter((name) => /^Hub[A-Za-z0-9_]+$/.test(name));
  const foreignKeys = await tx.$queryRaw<ForeignKeyRow[]>`
    SELECT tc.table_name AS "childTable", ccu.table_name AS "parentTable"
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_schema = tc.constraint_schema AND ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name LIKE 'Hub%' AND ccu.table_name LIKE 'Hub%'
  `;
  const children = new Map<string, string[]>();
  for (const edge of foreignKeys) {
    if (edge.childTable === edge.parentTable || !allowed.includes(edge.childTable) || !allowed.includes(edge.parentTable)) continue;
    children.set(edge.parentTable, [...(children.get(edge.parentTable) || []), edge.childTable]);
  }
  const order: string[] = [];
  const visited = new Set<string>();
  function visit(table: string) {
    if (visited.has(table)) return;
    visited.add(table);
    for (const child of children.get(table) || []) visit(child);
    order.push(table);
  }
  for (const table of allowed) visit(table);
  return order;
}

export async function permanentlyDeleteWorkspaceHub(prisma: PrismaClient, input: DeleteInput) {
  if (!input.idempotencyKey || input.idempotencyKey.length > 128) throw new HubDeletionError("Chave de idempotencia invalida.", 400);
  if (!input.acknowledgePermanentDeletion) throw new HubDeletionError("Confirme que os dados serao removidos permanentemente.", 400);
  const requestHash = digest(input);
  const previous = await prisma.workspaceHubMutation.findUnique({ where: { scope_idempotencyKey: { scope: `DELETE:${input.organizationId}`, idempotencyKey: input.idempotencyKey } } });
  if (previous) {
    if (previous.requestHash !== requestHash) throw new HubDeletionError("A chave de idempotencia ja foi usada com outros dados.", 409);
    return { ...(previous.resultJson as { deletedId: string; recordCounts: Record<string, number> }), repeated: true };
  }

  return prisma.$transaction(async (tx) => {
    const organization = await tx.hubOrganization.findUnique({
      where: { id: input.organizationId },
      include: { responsibleMember: { select: { accountId: true } } },
    });
    if (!organization) throw new HubDeletionError("Hub nao encontrado.", 404);
    if (organization.version !== input.version) throw new HubDeletionError("O Hub foi alterado por outra pessoa. Recarregue e tente novamente.", 409);
    if (input.typedName.trim() !== organization.name) throw new HubDeletionError("Digite exatamente o nome da organizacao para confirmar.", 400);

    const tables = await organizationScopedTables(tx);
    const recordCounts: Record<string, number> = {};
    for (const table of tables) {
      const identifier = Prisma.raw(`"${table}"`);
      const rows = await tx.$queryRaw<{ value: bigint }[]>(Prisma.sql`SELECT count(*)::bigint AS value FROM ${identifier} WHERE "organizationId" = ${organization.id}`);
      const count = Number(rows[0]?.value || BigInt(0));
      if (count) recordCounts[table] = count;
    }
    recordCounts.EconomikMember = await tx.hubMember.count({ where: { organizationId: organization.id } });
    recordCounts.EconomikDirectorate = await tx.hubDirectorate.count({ where: { organizationId: organization.id } });
    recordCounts.EconomikWalletRequest = await tx.hubWalletRequest.count({ where: { account: { member: { organizationId: organization.id } } } });
    recordCounts.EconomikWalletTransaction = await tx.hubWalletTransaction.count({ where: { account: { member: { organizationId: organization.id } } } });

    await tx.workspaceHubAudit.create({ data: {
      action: "HUB_PERMANENTLY_DELETED",
      hubOrganizationId: organization.id,
      organizationName: organization.name,
      responsibleAccountId: organization.responsibleMember?.accountId,
      actorUserId: input.actorUserId,
      safeMetadata: { recordCounts, deletedAt: new Date().toISOString() },
    } });
    const result = { deletedId: organization.id, recordCounts, repeated: false };
    await tx.workspaceHubMutation.create({ data: { scope: `DELETE:${input.organizationId}`, idempotencyKey: input.idempotencyKey, requestHash, resultJson: result } });

    for (const table of tables) {
      const identifier = Prisma.raw(`"${table}"`);
      await tx.$executeRaw(Prisma.sql`DELETE FROM ${identifier} WHERE "organizationId" = ${organization.id}`);
    }
    await tx.hubWalletRequest.deleteMany({ where: { account: { member: { organizationId: organization.id } } } });
    await tx.hubWalletTransaction.deleteMany({ where: { account: { member: { organizationId: organization.id } } } });
    await tx.hubOrganization.delete({ where: { id: organization.id } });
    return result;
  }, { isolationLevel: "Serializable", timeout: 30_000 });
}
