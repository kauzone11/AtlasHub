import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { writeHubAudit } from "@/lib/hub/audit";
import { HubCurrencyLockedError, isSupportedHubCurrency, isSupportedHubLocale, isSupportedHubTimezone, updateHubOrganizationSettingsAtomic } from "@/lib/hub/organization";
import { normalizeHubLogoUrl } from "@/lib/hub/organization-logo";
import { prisma } from "@/lib/prisma";
import { requireHubSettingsAccess } from "@/lib/hub/settings-access";

function text(value: unknown, label: string, max = 120) {
  if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > max) {
    throw new HubApiError(`${label} inválido.`, 422);
  }
  return value.trim();
}

function optionalLogoUrl(value: unknown) {
  try {
    return normalizeHubLogoUrl(value);
  } catch {
    throw new HubApiError("URL do logo inválida.", 422);
  }
}

function timezone(value: unknown) {
  const parsed = text(value, "Timezone", 80);
  if (!isSupportedHubTimezone(parsed)) throw new HubApiError("Use um timezone IANA válido.", 422);
  return parsed;
}

function locale(value: unknown) {
  const parsed = text(value, "Locale", 35);
  if (!isSupportedHubLocale(parsed)) throw new HubApiError("Locale inválido.", 422);
  return parsed;
}

export const GET = withHubApi(async () => {
  const context = await requireHubSettingsAccess();
  const transactionCount = await prisma.hubWalletTransaction.count({
    where: { account: { member: { organizationId: context.organizationId } } },
  });
  return hubJson({ organization: context.organization, currencyLocked: transactionCount > 0 });
});

export const PATCH = withHubApi(async (request: Request) => {
  const context = await requireHubSettingsAccess();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) throw new HubApiError("Dados inválidos.", 422);
  if ("slug" in body) throw new HubApiError("O slug não pode ser alterado por esta interface.", 422);

  const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : context.organization.currency;
  if (!isSupportedHubCurrency(currency)) throw new HubApiError("Moeda inválida.", 422);
  const data = {
    name: text(body.name, "Nome da organização"),
    hubName: text(body.hubName, "Nome do Hub"),
    logoUrl: optionalLogoUrl(body.logoUrl),
    timezone: timezone(body.timezone),
    locale: locale(body.locale),
    currency,
  };

  const organization = await updateHubOrganizationSettingsAtomic(prisma, {
    organizationId: context.organizationId,
    data,
    afterUpdate: async (tx) => {
      await writeHubAudit(tx, {
        organizationId: context.organizationId,
        memberId: context.memberId,
        action: "ORGANIZATION_UPDATED",
        entity: "ORGANIZATION",
        entityId: context.organizationId,
        metadata: { fields: Object.keys(data) },
      });
    },
  }).catch((error) => {
    if (error instanceof HubCurrencyLockedError) throw new HubApiError(error.message, 409);
    throw error;
  });
  return hubJson({ organization });
});
