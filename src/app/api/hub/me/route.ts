import { requireHubMember } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";

export const GET = withHubApi(async () => {
  const context = await requireHubMember({ allowPasswordChangeRequired: true });
  return hubJson({
    memberId: context.memberId,
    organizationId: context.organizationId,
    organizationSlug: context.organizationSlug,
    email: context.email,
    name: context.member.name,
    role: context.role,
    directorateId: context.directorateId,
    mustChangePassword: context.mustChangePassword,
    avatarUrl: context.member.avatarUrl,
    lastLoginAt: context.member.lastLoginAt?.toISOString() || null,
    directorateName: context.member.directorateName,
    organizationPosition: context.member.organizationPosition,
    memberCategory: context.member.memberCategory,
    permissions: context.permissions,
    organization: context.organization,
  });
});
