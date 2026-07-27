import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";

export const GET = withHubApi(async () => {
  const session = await requireHubPermission("projects:manage");
  const members = await prisma.hubMember.findMany({ where: { organizationId: session.organizationId, status: "ACTIVE" }, select: { id: true, name: true, email: true, directorate: { select: { name: true } } }, orderBy: { name: "asc" } });
  return hubJson({ members });
});
