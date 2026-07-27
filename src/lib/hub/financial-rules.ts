import { prisma } from "@/lib/prisma";

export const DEFAULT_HUB_FINANCIAL_RULE = {
  organizationSharePct: 50,
  atlasSharePct: 15,
  memberSharePct: 35,
} as const;

export type HubFinancialRuleInput = {
  organizationSharePct: number;
  atlasSharePct: number;
  memberSharePct: number;
};

export function validateHubFinancialRule(input: HubFinancialRuleInput) {
  const values = [input.organizationSharePct, input.atlasSharePct, input.memberSharePct];
  if (values.some((value) => !Number.isFinite(value))) return "Informe porcentagens válidas.";
  if (values.some((value) => value < 0 || value > 100)) return "Cada porcentagem deve ficar entre 0 e 100.";
  if (values.some((value) => Math.round(value * 100) !== value * 100)) return "Use no máximo duas casas decimais.";
  if (Math.round(values.reduce((sum, value) => sum + value, 0) * 100) !== 10_000) return "A soma deve ser exatamente 100%.";
  return null;
}

export async function getOrCreateHubFinancialRule(organizationId: string) {
  return prisma.hubFinancialRule.upsert({
    where: { organizationId },
    update: {},
    create: { organizationId, ...DEFAULT_HUB_FINANCIAL_RULE },
  });
}
