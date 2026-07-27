import { PrismaClient } from "@prisma/client";
import { hashHubPassword } from "../src/lib/hub/auth";
import { generateHubTemporaryPassword, validateHubPassword } from "../src/lib/hub/security";
import { resolveLegacyHubOrganization } from "../src/lib/hub/organization";

const prisma = new PrismaClient();

function initialAdministrator() {
  const email = (process.env.ATLAS_HUB_INITIAL_ADMIN_EMAIL || process.env.ECONOMIK_INITIAL_ADMIN_EMAIL)?.trim().toLowerCase();
  const name = (process.env.ATLAS_HUB_INITIAL_ADMIN_NAME || process.env.ECONOMIK_INITIAL_ADMIN_NAME)?.trim();
  let password = process.env.ATLAS_HUB_INITIAL_ADMIN_PASSWORD || process.env.ECONOMIK_INITIAL_ADMIN_PASSWORD;
  const localFallback = process.env.NODE_ENV !== "production" && (process.env.ATLAS_HUB_ENABLE_LOCAL_ADMIN || process.env.ECONOMIK_ENABLE_LOCAL_ADMIN) === "true";
  const generatedLocally = !password && localFallback;

  if ((!email || !name || !password) && !localFallback) {
    throw new Error("Defina ATLAS_HUB_INITIAL_ADMIN_EMAIL, ATLAS_HUB_INITIAL_ADMIN_NAME e ATLAS_HUB_INITIAL_ADMIN_PASSWORD. Para desenvolvimento local, habilite explicitamente ATLAS_HUB_ENABLE_LOCAL_ADMIN=true.");
  }

  if (localFallback) password ||= generateHubTemporaryPassword();
  const resolvedEmail = email || `admin.local.${Date.now()}@example.invalid`;
  const resolvedName = name || "Administrador local";
  const resolvedPassword = password || generateHubTemporaryPassword();
  const passwordError = validateHubPassword(resolvedPassword);
  if (passwordError) throw new Error(`Senha inicial inválida: ${passwordError}`);
  return { email: resolvedEmail, name: resolvedName, password: resolvedPassword, generatedLocally };
}

async function main() {
  const administrator = initialAdministrator();
  const organization = await resolveLegacyHubOrganization(prisma);

  const directorates = ["Adm-Fin", "Comercial", "Conselheiro", "Marketing", "Presidência", "Projetos", "RH"];
  for (const [order, name] of directorates.entries()) {
    const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await prisma.hubDirectorate.upsert({
      where: { organizationId_slug: { organizationId: organization.id, slug } },
      update: { name, order },
      create: { organizationId: organization.id, name, slug, order },
    });
  }

  await prisma.hubFinancialRule.upsert({
    where: { organizationId: organization.id },
    update: {},
    create: { organizationId: organization.id, organizationSharePct: 50, atlasSharePct: 15, memberSharePct: 35 },
  });

  const existing = await prisma.hubMember.findUnique({
    where: { organizationId_normalizedEmail: { organizationId: organization.id, normalizedEmail: administrator.email } },
  });
  if (!existing) {
    const passwordHash = await hashHubPassword(administrator.password);
    const account = await prisma.hubAccount.upsert({
      where: { normalizedEmail: administrator.email },
      update: {},
      create: { email: administrator.email, normalizedEmail: administrator.email, passwordHash, mustChangePassword: true },
    });
    await prisma.hubMember.create({
      data: {
        organizationId: organization.id,
        accountId: account.id,
        email: administrator.email,
        normalizedEmail: administrator.email,
        name: administrator.name,
        passwordHash: account.passwordHash,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        mustChangePassword: true,
      },
    });
  }

  if (administrator.generatedLocally) {
    console.warn("[hub-seed] Credencial aleatória de desenvolvimento gerada para uso local e exibida uma única vez.");
    console.warn(`[hub-seed] E-mail local: ${administrator.email}`);
    console.warn(`[hub-seed] Senha local: ${administrator.password}`);
  }
  console.log("[hub-seed] Fundação Atlas Hub pronta.");
}

main().catch((error) => {
  console.error("[hub-seed] Falha:", error instanceof Error ? error.message : "erro desconhecido");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
