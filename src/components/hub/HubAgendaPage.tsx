"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert, Header, api } from "@/components/hub/HubCollaborationPages";
import { hubUi } from "@/components/hub/styles";

type Meeting = {
  id: string;
  title: string;
  status: string;
  startAt: string;
  endAt: string;
  timezone: string;
  participants: Array<{ memberId: string; responseStatus: string }>;
};
type Task = {
  id: string;
  title: string;
  dueAt: string | null;
  completedAt: string | null;
  board: { name: string };
};

function civilDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
function addDays(date: string, days: number) {
  const probe = new Date(`${date}T12:00:00.000Z`);
  probe.setUTCDate(probe.getUTCDate() + days);
  return probe.toISOString().slice(0, 10);
}

export function HubAgendaPage() {
  const [view, setView] = useState<"day" | "week" | "list">("day");
  const [scope, setScope] = useState<"mine" | "organization">("mine");
  const [selectedDate, setSelectedDate] = useState("");
  const [timezone, setTimezone] = useState("America/Fortaleza");
  const [memberId, setMemberId] = useState("");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [period, setPeriod] = useState<{
    startDate: string;
    endDateExclusive: string;
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const options = await api("/api/hub/collaboration/options");
      setTimezone(options.timezone);
      setMemberId(options.memberId);
      setSelectedDate(civilDate(new Date(), options.timezone));
    })().catch((reason) =>
      setError(reason instanceof Error ? reason.message : "Falha ao carregar."),
    );
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    void (async () => {
      try {
        setError("");
        const filter = scope === "mine" ? "mine" : "organization";
        const meetingQuery = `/api/hub/meetings?filter=${filter}&view=${view}&date=${selectedDate}`;
        const meetingData = await api(meetingQuery);
        setMeetings(meetingData.meetings);
        setPeriod(meetingData.period);
        const start = meetingData.period?.startDate || selectedDate;
        const end =
          meetingData.period?.endDateExclusive || addDays(selectedDate, 30);
        const taskData = await api(
          `/api/hub/tasks?mine=${scope === "mine"}&dueFrom=${start}&dueTo=${end}`,
        );
        setTasks(taskData.tasks);
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : "Falha ao carregar agenda.",
        );
      }
    })();
  }, [scope, selectedDate, view]);

  const title = useMemo(() => {
    if (view === "list") return "Proximos 30 dias";
    if (!period) return selectedDate;
    const start = new Date(`${period.startDate}T12:00:00.000Z`).toLocaleDateString("pt-BR");
    if (view === "day") return start;
    return `${start} a ${new Date(`${addDays(period.endDateExclusive, -1)}T12:00:00.000Z`).toLocaleDateString("pt-BR")}`;
  }, [period, selectedDate, view]);
  const step = view === "week" ? 7 : view === "list" ? 30 : 1;

  return (
    <div className={hubUi.page}>
      <Header
        title="Agenda"
        description={`Reunioes e prazos nos limites de ${timezone}. Em telas pequenas, todos os modos permanecem em lista.`}
      />
      <Alert error={error} />
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Visualizacao da agenda">
        {(["day", "week", "list"] as const).map((item) => (
          <button key={item} role="tab" aria-selected={view === item} className={view === item ? hubUi.primaryButton : hubUi.secondaryButton} onClick={() => setView(item)}>
            {item === "day" ? "Dia" : item === "week" ? "Semana" : "Lista"}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button aria-label="Periodo anterior" className={hubUi.secondaryButton} onClick={() => setSelectedDate(addDays(selectedDate, -step))}><ArrowLeft className="h-4 w-4" /></button>
          <button aria-label="Proximo periodo" className={hubUi.secondaryButton} onClick={() => setSelectedDate(addDays(selectedDate, step))}><ArrowRight className="h-4 w-4" /></button>
        </div>
        <p className="font-medium" aria-live="polite">{title}</p>
        <div className="flex gap-2" role="group" aria-label="Escopo">
          <button className={scope === "mine" ? hubUi.primaryButton : hubUi.secondaryButton} onClick={() => setScope("mine")}>Minha agenda</button>
          <button className={scope === "organization" ? hubUi.primaryButton : hubUi.secondaryButton} onClick={() => setScope("organization")}>Organizacao</button>
        </div>
      </div>
      <section className={`${hubUi.panel} p-5`}>
        <h2 className="font-semibold">Reunioes</h2>
        <div className="mt-3 divide-y divide-zinc-100">
          {meetings.length ? meetings.map((meeting) => {
            const response = meeting.participants.find((item) => item.memberId === memberId)?.responseStatus;
            return <Link key={meeting.id} href={`/hub/reunioes/${meeting.id}`} className="grid gap-2 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black sm:grid-cols-[1fr_auto]"><span><strong className="block">{meeting.title}</strong>{new Date(meeting.startAt).toLocaleString("pt-BR", { timeZone: timezone })}</span><span>{meeting.status}{response ? ` · ${response}` : ""}</span></Link>;
          }) : <p className="py-5 text-sm text-zinc-500">Nenhuma reuniao neste periodo.</p>}
        </div>
      </section>
      <section className={`${hubUi.panel} p-5`}>
        <h2 className="font-semibold">Prazos de tarefas</h2>
        <div className="mt-3 divide-y divide-zinc-100">
          {tasks.length ? tasks.map((task) => <Link key={task.id} href={`/hub/tarefas/${task.id}`} className="grid gap-2 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black sm:grid-cols-[1fr_auto]"><span><strong className="block">{task.title}</strong>{task.board.name}</span><span>{task.dueAt ? new Date(task.dueAt).toLocaleString("pt-BR", { timeZone: timezone }) : "Sem prazo"}{task.completedAt ? " · Concluida" : ""}</span></Link>) : <p className="py-5 text-sm text-zinc-500">Nenhum prazo neste periodo.</p>}
        </div>
      </section>
    </div>
  );
}
