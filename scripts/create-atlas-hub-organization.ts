import { prisma } from "../src/lib/prisma";
import { provisionHubOrganization } from "../src/lib/hub/provisioning";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

async function main() {
  const result = await provisionHubOrganization(prisma, {
    name: required("ATLAS_HUB_NEW_ORGANIZATION_NAME"),
    hubName: required("ATLAS_HUB_NEW_ORGANIZATION_HUB_NAME"),
    slug: required("ATLAS_HUB_NEW_ORGANIZATION_SLUG"),
    timezone: required("ATLAS_HUB_NEW_ORGANIZATION_TIMEZONE"),
    adminEmail: required("ATLAS_HUB_NEW_ORGANIZATION_ADMIN_EMAIL"),
    adminName: required("ATLAS_HUB_NEW_ORGANIZATION_ADMIN_NAME"),
    adminPassword: required("ATLAS_HUB_NEW_ORGANIZATION_ADMIN_PASSWORD"),
  });
  console.log(`Organização criada: ${result.organizationSlug}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Falha ao criar organização.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
