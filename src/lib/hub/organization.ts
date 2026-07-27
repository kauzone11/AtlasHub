import type { HubOrganization, Prisma, PrismaClient } from "@prisma/client";

export const HUB_LEGACY_ORGANIZATION_SLUG = "economik";
export const DEFAULT_HUB_LOCALE = "pt-BR";
export const DEFAULT_HUB_CURRENCY = "BRL";
export const DEFAULT_HUB_TIMEZONE = "America/Sao_Paulo";

type HubOrganizationClient = Pick<Prisma.TransactionClient, "hubOrganization">;
type HubOrganizationTransactionClient = Pick<PrismaClient, "$transaction">;

export class HubCurrencyLockedError extends Error {
  constructor() {
    super("A moeda não pode ser alterada após movimentações financeiras.");
    this.name = "HubCurrencyLockedError";
  }
}

export type HubOrganizationSettingsUpdate = {
  name: string;
  hubName: string;
  logoUrl: string | null;
  timezone: string;
  locale: string;
  currency: string;
};

export function normalizeHubOrganizationSlug(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

export function isValidHubOrganizationSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length >= 2 && value.length <= 63;
}

export async function resolveLegacyHubOrganization(client: HubOrganizationClient) {
  return client.hubOrganization.upsert({
    where: { slug: HUB_LEGACY_ORGANIZATION_SLUG },
    update: {},
    create: {
      name: "Economik",
      hubName: "Economik Hub",
      slug: HUB_LEGACY_ORGANIZATION_SLUG,
      timezone: DEFAULT_HUB_TIMEZONE,
      locale: DEFAULT_HUB_LOCALE,
      currency: DEFAULT_HUB_CURRENCY,
    },
  });
}

export async function updateHubOrganizationSettingsAtomic(
  client: HubOrganizationTransactionClient,
  input: {
    organizationId: string;
    data: HubOrganizationSettingsUpdate;
    afterUpdate?: (tx: Prisma.TransactionClient, organization: HubOrganization) => Promise<void>;
  },
) {
  return client.$transaction(async (tx) => {
    const current = await tx.hubOrganization.findUniqueOrThrow({
      where: { id: input.organizationId },
      select: { currency: true },
    });
    if (input.data.currency !== current.currency) {
      const transactionCount = await tx.hubWalletTransaction.count({
        where: { account: { member: { organizationId: input.organizationId } } },
      });
      if (transactionCount > 0) throw new HubCurrencyLockedError();
    }
    const organization = await tx.hubOrganization.update({ where: { id: input.organizationId }, data: input.data });
    await input.afterUpdate?.(tx, organization);
    return organization;
  }, { isolationLevel: "Serializable" });
}

export function normalizeHubLocale(value: string | null | undefined) {
  const candidate = value?.trim() || DEFAULT_HUB_LOCALE;
  try {
    const locale = new Intl.Locale(candidate).toString();
    if (!Intl.DateTimeFormat.supportedLocalesOf([locale]).length) throw new Error();
    return locale;
  } catch {
    return DEFAULT_HUB_LOCALE;
  }
}

export function isSupportedHubLocale(value: string) {
  try {
    return normalizeHubLocale(value) === new Intl.Locale(value.trim()).toString();
  } catch {
    return false;
  }
}

export function normalizeHubCurrency(value: string | null | undefined) {
  const candidate = value?.trim().toUpperCase() || DEFAULT_HUB_CURRENCY;
  try {
    const supportedValuesOf = (Intl as typeof Intl & { supportedValuesOf?: (key: "currency") => string[] }).supportedValuesOf;
    if (!/^[A-Z]{3}$/.test(candidate) || (supportedValuesOf && !supportedValuesOf("currency").includes(candidate))) throw new Error();
    new Intl.NumberFormat(DEFAULT_HUB_LOCALE, { style: "currency", currency: candidate }).format(0);
    return candidate;
  } catch {
    return DEFAULT_HUB_CURRENCY;
  }
}

export function isSupportedHubCurrency(value: string) {
  return normalizeHubCurrency(value) === value.trim().toUpperCase();
}

export function isSupportedHubTimezone(value: string) {
  try {
    new Intl.DateTimeFormat(DEFAULT_HUB_LOCALE, { timeZone: value.trim() }).format();
    return true;
  } catch {
    return false;
  }
}
