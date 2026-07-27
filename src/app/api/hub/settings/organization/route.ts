import { HubApiError, hubJson, withHubApi } from "@/lib/hub/api";
import { writeHubAudit } from "@/lib/hub/audit";
import { HubCurrencyLockedError, isSupportedHubCurrency, isSupportedHubLocale, isSupportedHubTimezone, updateHubOrganizationSettingsAtomic } from "@/lib/hub/organization";
import { normalizeHubLogoUrl } from "@/lib/hub/organization-logo";
import { requireHubSettingsAccess } from "@/lib/hub/settings-access";
import { prisma } from "@/lib/prisma";

function requiredText(value: unknown, label: string, max = 120) {
  if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > max) throw new HubApiError(`${label} inválido.`, 422);
  return value.trim();
}

export const PATCH = withHubApi(async (request: Request) => {
  const context = await requireHubSettingsAccess();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) throw new HubApiError("Dados inválidos.", 422);
  if ("slug" in body) throw new HubApiError("O slug não pode ser alterado por esta interface.", 422);
  const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : context.organization.currency;
  if (!isSupportedHubCurrency(currency)) throw new HubApiError("Moeda inválida.", 422);
  const timezone = requiredText(body.timezone, "Timezone", 80);
  const locale = requiredText(body.locale, "Locale", 35);
  if (!isSupportedHubTimezone(timezone)) throw new HubApiError("Use um timezone IANA válido.", 422);
  if (!isSupportedHubLocale(locale)) throw new HubApiError("Locale inválido.", 422);
  let logoUrl: string | null;
  try { logoUrl = normalizeHubLogoUrl(body.logoUrl); } catch { throw new HubApiError("URL do logo inválida.", 422); }
  const data = { name: requiredText(body.name, "Nome da organização"), hubName: requiredText(body.hubName, "Nome do Hub"), logoUrl, timezone, locale, currency };
  const organization = await updateHubOrganizationSettingsAtomic(prisma, {
    organizationId: context.organizationId,
    data,
    afterUpdate: async (tx) => {
      await writeHubAudit(tx, { organizationId: context.organizationId, memberId: context.memberId, action: "ORGANIZATION_UPDATED", entity: "ORGANIZATION", entityId: context.organizationId, metadata: { fields: Object.keys(data) } });
    },
  }).catch((error) => {
    if (error instanceof HubCurrencyLockedError) throw new HubApiError(error.message, 409);
    throw error;
  });
  return hubJson({ organization });
});
