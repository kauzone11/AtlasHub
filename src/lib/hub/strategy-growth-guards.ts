import type { Prisma } from "@prisma/client";
import { HubApiError } from "./api";

type Tx = Prisma.TransactionClient;

const notFound = () => new HubApiError("Registro relacionado nao encontrado.", 404);

export async function requireActiveMember(tx: Tx, organizationId: string, id: string | null | undefined) {
  if (!id) return null;
  const value = await tx.hubMember.findFirst({ where: { id, organizationId, status: "ACTIVE" }, select: { id: true, directorateId: true } });
  if (!value) throw notFound();
  return value;
}

export async function requireDirectorate(tx: Tx, organizationId: string, id: string | null | undefined) {
  if (!id) return null;
  const value = await tx.hubDirectorate.findFirst({ where: { id, organizationId, isActive: true }, select: { id: true } });
  if (!value) throw notFound();
  return value;
}

export async function requireObjective(tx: Tx, organizationId: string, id: string | null | undefined) {
  if (!id) return null;
  const value = await tx.hubStrategicObjective.findFirst({ where: { id, organizationId }, select: { id: true, directorateId: true, ownerMemberId: true, cycleId: true } });
  if (!value) throw notFound();
  return value;
}

export async function requireIndicator(tx: Tx, organizationId: string, id: string) {
  const value = await tx.hubStrategicIndicator.findFirst({ where: { id, organizationId, isActive: true } });
  if (!value) throw notFound();
  return value;
}

export async function requireGrowthOrganization(tx: Tx, organizationId: string, id: string | null | undefined) {
  if (!id) return null;
  const value = await tx.hubGrowthOrganization.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!value) throw notFound();
  return value;
}

export async function requireContact(tx: Tx, organizationId: string, id: string | null | undefined, growthOrganizationId?: string | null) {
  if (!id) return null;
  const value = await tx.hubGrowthContact.findFirst({ where: { id, organizationId, ...(growthOrganizationId ? { growthOrganizationId } : {}) }, select: { id: true, growthOrganizationId: true } });
  if (!value) throw notFound();
  return value;
}

export async function requireLead(tx: Tx, organizationId: string, id: string) {
  const value = await tx.hubLead.findFirst({ where: { id, organizationId } });
  if (!value) throw notFound();
  return value;
}

export async function requireStage(tx: Tx, organizationId: string, id: string, activeOnly = true) {
  const value = await tx.hubPipelineStage.findFirst({ where: { id, organizationId, ...(activeOnly ? { isActive: true } : {}) } });
  if (!value) throw notFound();
  return value;
}

export async function requireOpportunity(tx: Tx, organizationId: string, id: string) {
  const value = await tx.hubOpportunity.findFirst({ where: { id, organizationId } });
  if (!value) throw notFound();
  return value;
}

export async function requireInitiative(tx: Tx, organizationId: string, id: string | null | undefined) {
  if (!id) return null;
  const value = await tx.hubStrategicInitiative.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!value) throw notFound();
  return value;
}

export async function requireMeeting(tx: Tx, organizationId: string, id: string | null | undefined) {
  if (!id) return null;
  const value = await tx.hubMeeting.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!value) throw notFound();
  return value;
}

export async function requireBoard(tx: Tx, organizationId: string, id: string | null | undefined) {
  if (!id) return null;
  const value = await tx.hubBoard.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!value) throw notFound();
  return value;
}

export async function requireTask(tx: Tx, organizationId: string, id: string | null | undefined) {
  if (!id) return null;
  const value = await tx.hubTask.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!value) throw notFound();
  return value;
}

export async function requireProject(tx: Tx, organizationId: string, id: string | null | undefined) {
  if (!id) return null;
  const value = await tx.hubProject.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!value) throw notFound();
  return value;
}

export async function requireReplacementActivity(tx: Tx, organizationId: string, opportunityId: string, id: string | null | undefined) {
  if (!id) return null;
  const value = await tx.hubOpportunityActivity.findFirst({ where: { id, organizationId, opportunityId }, select: { id: true, cancelledAt: true } });
  if (!value) throw notFound();
  return value;
}
