"use client";

import { ArrowRight, CalendarClock, CalendarDays, CheckCircle2, FolderKanban, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ErrorNotice, coreApi } from "@/components/hub/HubCoreUi";
import { hubUi } from "@/components/hub/styles";

type Dashboard = { scope: "organization" | "directorate"; summary: { activeProjects: number; pendingTasks: number; upcomingDeadlines: number }; nextMeeting: { id: string; title: string; startAt: string; endAt: string; location: string | null; participants: Array<{ member: { id: string; name: string; avatarUrl: string | null } }> } | null; upcomingDeadlines: Array<{ type: string; id: string; title: string; at: string; href: string; directorate: { name: string } | null }>; directorates: Array<{ id: string; name: string; icon: string | null; memberCount: number; activeProjects: number; pendingTasks: number }> };
type Context = { scope: "organization" | "directorate"; preference: "organization" | "directorate" | null; hasDirectorate: boolean; directorateName: string | null };

export function HubDashboardCore() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [context, setContext] = useState<Context | null>(null);
  const [memberName, setMemberName] = useState("");
  const [error, setError] = useState("");
  async function load() {
    try {
      setError("");
      const [dashboard, saved, member] = await Promise.all([
        coreApi<Dashboard>("/api/hub/dashboard", { cache: "no-store" }),
        coreApi<Context>("/api/hub/dashboard-context", { cache: "no-store" }),
        coreApi<{ name?: string }>("/api/hub/me", { cache: "no-store" }),
      ]);
      setData(dashboard); setContext(saved); setMemberName(member.name || "");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar o painel."); }
  }
  useEffect(() => { void load(); }, []);
  async function select(scope: "organization" | "directorate") {
    try { await coreApi("/api/hub/dashboard-context", { method: "PUT", body: JSON.stringify({ scope }) }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível trocar a visão."); }
  }
  if (!data || !context) return <div className={hubUi.page}><div className="h-24 animate-pulse rounded-2xl bg-white" /><div className="h-40 animate-pulse rounded-2xl bg-white" /></div>;
  const today = data.upcomingDeadlines.slice(0, 3); // Próximos prazos priorizados na Home.
  const meetingDate = data.nextMeeting ? new Date(data.nextMeeting.startAt) : null;
  return <div className={hubUi.page}>
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[11px] uppercase tracking-[.16em] text-zinc-500">Olá{memberName ? `, ${memberName.split(" ")[0]}` : ""}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.03em]">Visão geral da EJ</h1><p className="mt-2 text-sm text-zinc-500">Tudo que precisa de atenção hoje, em um só lugar.</p>{data.scope === "directorate" && context.directorateName ? <p className="mt-2 text-sm font-medium text-zinc-700">Visualizando: {context.directorateName}</p> : null}</div><div><div className="flex w-fit rounded-xl border border-zinc-200 bg-white p-1"><button onClick={() => void select("organization")} className={`rounded-lg px-3 py-2 text-sm font-semibold ${data.scope === "organization" ? "bg-zinc-950 text-white" : "text-zinc-500 hover:bg-zinc-100"}`}>Toda a EJ</button><button disabled={!context.hasDirectorate} title={context.hasDirectorate ? undefined : "Você ainda não possui uma diretoria ativa."} onClick={() => void select("directorate")} className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${data.scope === "directorate" ? "bg-zinc-950 text-white" : "text-zinc-500 hover:bg-zinc-100"}`}>Minha diretoria</button></div>{!context.hasDirectorate ? <p className="mt-2 text-xs text-zinc-500">Você ainda não possui uma diretoria ativa.</p> : null}</div></header>
    <ErrorNotice message={error} />
    <section className="grid divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white md:grid-cols-3 md:divide-x md:divide-y-0"><Metric icon={<FolderKanban />} label="Projetos ativos" value={String(data.summary.activeProjects)} note={`${today.filter((item) => item.type === "PROJECT").length} com entrega próxima`} href="/hub/projetos" /><Metric icon={<CheckCircle2 />} label="Tarefas pendentes" value={String(data.summary.pendingTasks)} note={`${today.filter((item) => item.type === "TASK").length} com prazo próximo`} href="/hub/tarefas" /><Metric icon={<CalendarClock />} label="Próximos prazos" value={String(data.summary.upcomingDeadlines)} note={data.nextMeeting ? "Reunião agendada em seguida" : "Sem reunião futura agendada"} href="/hub/agenda" /></section>
    <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]"><section className="min-w-0"><div className="flex items-center justify-between gap-3 border-b border-zinc-200 pb-4"><div><h2 className="text-xl font-semibold">Para hoje</h2><p className="mt-1 text-sm text-zinc-500">Prioridades para manter a EJ em movimento</p></div><Link href="/hub/tarefas" className="text-sm font-semibold">Ver tarefas</Link></div><div className="divide-y divide-zinc-200">{today.map((item, index) => <Link key={item.href} href={item.href} className="flex min-w-0 items-center gap-4 py-4 hover:bg-zinc-50"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-100 font-mono text-xs font-semibold">0{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.title}</span><span className="mt-1 block truncate text-xs text-zinc-500">{item.type === "PROJECT" ? "Projeto" : "Tarefa"} · {item.directorate?.name || "Toda a EJ"}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-zinc-500" /></Link>)}{!today.length ? <p className="py-10 text-center text-sm text-zinc-500">Nenhuma prioridade com prazo próximo.</p> : null}</div></section>
      <section className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5"><div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-blue-600" /><h2 className="text-xl font-semibold">Próxima reunião</h2></div>{data.nextMeeting && meetingDate ? <div className="mt-5"><p className="font-mono text-xs font-semibold uppercase text-blue-700">{meetingDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · {meetingDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p><h3 className="mt-2 font-semibold">{data.nextMeeting.title}</h3><p className="mt-1 text-sm text-zinc-500">{data.nextMeeting.location || "Agenda da organização"}</p><div className="mt-5 flex items-center justify-between gap-3"><div className="flex -space-x-2">{data.nextMeeting.participants.map(({ member }) => <span key={member.id} title={member.name} className="grid h-7 w-7 place-items-center overflow-hidden rounded-full border-2 border-white bg-blue-100 font-mono text-[9px] text-blue-800">{member.avatarUrl ? <Image src={member.avatarUrl} alt="" width={28} height={28} unoptimized className="h-full w-full object-cover" /> : member.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>)}</div><Link href={`/hub/reunioes/${data.nextMeeting.id}`} className="text-sm font-semibold">Abrir agenda</Link></div></div> : <p className="mt-6 text-center text-sm text-zinc-500">Nenhuma reunião agendada.</p>}</section></div>
    <section className="border-t border-zinc-200 pt-5"><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Diretorias</h2><p className="mt-1 text-sm text-zinc-500">Panorama rápido das áreas da EJ</p></div><Link href="/hub/diretorias" className="text-sm font-semibold">Ver diretorias</Link></div><div className="mt-4 divide-y divide-zinc-200">{data.directorates.map((item) => <Link key={item.id} href={`/hub/diretorias/${item.id}`} className="flex min-w-0 items-center gap-4 py-4 hover:bg-zinc-50"><span className="grid h-8 w-8 place-items-center text-zinc-500">{item.icon || <Users className="h-4 w-4" />}</span><p className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</p><p className="truncate text-xs text-zinc-500">{item.memberCount} membros · {item.activeProjects} projetos · {item.pendingTasks} tarefas</p></Link>)}</div></section>
  </div>;
}

function Metric({ icon, label, value, note, href }: { icon: ReactNode; label: string; value: string; note: string; href: string }) { return <Link href={href} className="p-5 transition hover:bg-zinc-50"><span className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-100 text-zinc-800 [&>svg]:h-5 [&>svg]:w-5">{icon}</span><p className="mt-5 text-sm text-zinc-500">{label}</p><p className="mt-1 text-2xl font-semibold tracking-[-.03em]">{value}</p><p className="mt-1 truncate text-xs text-zinc-500">{note}</p></Link>; }
