import { prisma } from "@/lib/prisma";
import { requireHubPermission } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";

export const GET = withHubApi(async () => {
  const session = await requireHubPermission("people:access");
  const organizationWide = ["SUPER_ADMIN", "ADMIN"].includes(session.role);
  const canManageDirectorate = organizationWide || (session.role === "DIRECTOR" && Boolean(session.directorateId));
  const memberScope = organizationWide ? {} : session.role === "DIRECTOR" ? { directorateId: session.directorateId } : { id: session.memberId };
  const [profile, members, onboardingItems, recognitions, attendanceCount, externalParticipation] = await Promise.all([
    prisma.hubMemberProfile.findFirst({ where: { organizationId: session.organizationId, memberId: session.memberId }, select: { phone: true, university: true, course: true, semester: true, linkedinUrl: true, bio: true, visibility: true, joinedAt: true, employmentType: true } }),
    prisma.hubMember.findMany({ where: { organizationId: session.organizationId, status: { not: "DELETED" }, ...memberScope }, select: { id: true, name: true, role: true, status: true, directorateId: true }, orderBy: { name: "asc" } }),
    prisma.hubOnboardingAssignmentItem.findMany({ where: { organizationId: session.organizationId, OR: [{ ownerMemberId: session.memberId }, { assignmentId: { in: (await prisma.hubOnboardingAssignment.findMany({ where: { organizationId: session.organizationId, memberId: session.memberId }, select: { id: true } })).map((item) => item.id) } }] }, select: { id: true, title: true, description: true, dueDate: true, completedAt: true, version: true, ownerMemberId: true }, orderBy: [{ completedAt: "asc" }, { dueDate: "asc" }] }),
    prisma.hubRecognition.findMany({ where: { organizationId: session.organizationId, OR: [{ visibility: "ORGANIZATION" }, { recipientMemberId: session.memberId }, { givenById: session.memberId }] }, select: { id: true, recipientMemberId: true, givenById: true, title: true, description: true, recognizedAt: true, visibility: true }, orderBy: { recognizedAt: "desc" }, take: 20 }),
    prisma.hubMeetingParticipant.count({ where: { memberId: session.memberId, meeting: { organizationId: session.organizationId }, attendanceStatus: "ATTENDED" } }),
    prisma.hubParticipationRecord.findMany({ where: { organizationId: session.organizationId, memberId: session.memberId }, select: { id: true, date: true, type: true, source: true }, orderBy: { date: "desc" }, take: 20 }),
  ]);
  return hubJson({ actor: { id: session.memberId, role: session.role, directorateId: session.directorateId }, profile, members, onboardingItems, recognitions, participation: { meetingAttendanceCount: attendanceCount, external: externalParticipation }, canManageDirectorate });
});
