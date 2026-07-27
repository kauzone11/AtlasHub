import { notFound, redirect } from "next/navigation";
import HubSettingsPage from "@/components/hub/HubSettingsPage";
import { getHubOrganizationContext } from "@/lib/hub/auth";
import { canAccessHubSettings } from "@/lib/hub/settings-policy";
import { getHubSettings } from "@/lib/hub/settings-service";
import { prisma } from "@/lib/prisma";

export default async function AtlasHubSettingsPage() {
  const context = await getHubOrganizationContext({ migrateLegacyCookie: true });
  if (!context) redirect("/hub/login");
  if (context.mustChangePassword) redirect("/hub/alterar-senha");
  if (!canAccessHubSettings(context.role, context.member.organizationPosition)) notFound();
  const settings = await getHubSettings(prisma, context.organizationId);
  return <HubSettingsPage initialSettings={settings} actorMemberId={context.memberId} />;
}
