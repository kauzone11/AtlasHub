import { prisma } from "@/lib/prisma";
import { requireHubMember } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";
import { getOrCreateHubFinancialRule } from "@/lib/hub/financial-rules";

export const GET = withHubApi(async (request: Request) => {
  const session = await requireHubMember();
  const params = new URL(request.url).searchParams;
  const period = params.get("period") === "all" ? "all" : "year";
  const year = Math.min(2100, Math.max(2000, Number(params.get("year")) || new Date().getUTCFullYear()));
  const competenceDate = period === "year" ? { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } : undefined;
  const [rule, projects] = await Promise.all([
    getOrCreateHubFinancialRule(session.organizationId),
    prisma.hubProject.findMany({
      where: { organizationId: session.organizationId, status: "APPROVED", competenceDate },
      select: { id: true, participants: { select: { memberId: true, amountCents: true, member: { select: { name: true, avatarUrl: true, directorate: { select: { name: true } } } } } } },
    }),
  ]);
  const memberMap = new Map<string, { name: string; avatarUrl: string | null; directorate: string | null; totalGrossCents: number; projects: Set<string> }>();
  const directorateMap = new Map<string, { totalGrossCents: number; members: Set<string>; projects: Set<string> }>();
  for (const project of projects) for (const participant of project.participants) {
    const member = memberMap.get(participant.memberId) || { name: participant.member.name, avatarUrl: participant.member.avatarUrl, directorate: participant.member.directorate?.name || null, totalGrossCents: 0, projects: new Set<string>() };
    member.totalGrossCents += participant.amountCents;
    member.projects.add(project.id);
    memberMap.set(participant.memberId, member);
    const name = participant.member.directorate?.name || "Sem diretoria";
    const directorate = directorateMap.get(name) || { totalGrossCents: 0, members: new Set<string>(), projects: new Set<string>() };
    directorate.totalGrossCents += participant.amountCents;
    directorate.members.add(participant.memberId);
    directorate.projects.add(project.id);
    directorateMap.set(name, directorate);
  }
  const ranking = Array.from(memberMap.entries()).map(([userId, item]) => ({ userId, name: item.name, avatarUrl: item.avatarUrl, directorate: item.directorate, totalGrossCents: item.totalGrossCents, projects: item.projects.size })).sort((a, b) => b.totalGrossCents - a.totalGrossCents || a.name.localeCompare(b.name)).map((item, index) => ({ ...item, position: index + 1 }));
  const directorates = Array.from(directorateMap.entries()).map(([directorate, item]) => ({ directorate, totalGrossCents: item.totalGrossCents, memberCount: item.members.size, projectCount: item.projects.size })).sort((a, b) => b.totalGrossCents - a.totalGrossCents || a.directorate.localeCompare(b.directorate)).map((item, index) => ({ ...item, position: index + 1 }));
  const own = ranking.find((item) => item.userId === session.memberId) || null;
  return hubJson({ ranking, directorates, own, period, year, financialRule: { organizationSharePct: rule.organizationSharePct, atlasSharePct: rule.atlasSharePct, memberSharePct: rule.memberSharePct, appliesTo: "future-approvals" } });
});
