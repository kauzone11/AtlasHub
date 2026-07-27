"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Header, api } from "@/components/hub/HubCollaborationPages";
import { hubUi } from "@/components/hub/styles";

type Task = {
  id: string;
  title: string;
  dueAt: string | null;
  completedAt: string | null;
  board: { id: string; name: string };
};

export function HubMyTasksPage() {
  const [data, setData] = useState<{
    groups: {
      overdue: Task[];
      dueToday: Task[];
      upcoming: Task[];
      noDueDate: Task[];
      recentlyCompleted: Task[];
    };
    timezone: string;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void api("/api/hub/tasks?mine=true")
      .then(setData)
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Falha ao carregar."),
      );
  }, []);
  const groups = data
    ? [
        ["Atrasadas", data.groups.overdue],
        ["Vencem hoje", data.groups.dueToday],
        ["Proximas", data.groups.upcoming],
        ["Sem prazo", data.groups.noDueDate],
        ["Concluidas recentemente", data.groups.recentlyCompleted],
      ] as const
    : [];
  return <div className={hubUi.page}>
    <Header title="Minhas tarefas" description={`Prioridades calculadas no fuso ${data?.timezone || "da organizacao"}.`} />
    <Alert error={error} />
    <div className="grid gap-5 lg:grid-cols-2">{groups.map(([title, tasks]) => <section key={title} className={`${hubUi.panel} p-5`}><h2 className="font-semibold">{title}</h2><div className="mt-3 divide-y divide-zinc-100">{tasks.length ? tasks.map((task) => <Link key={task.id} href={`/hub/tarefas/${task.id}`} className="flex justify-between gap-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"><span className="font-medium">{task.title}<span className="mt-1 block text-xs font-normal text-zinc-500">{task.board.name}</span></span>{task.completedAt ? <Check className="h-4 w-4" aria-label="Concluida" /> : task.dueAt ? <time>{new Date(task.dueAt).toLocaleDateString("pt-BR", { timeZone: data?.timezone })}</time> : null}</Link>) : <p className="py-4 text-sm text-zinc-500">Nenhuma tarefa.</p>}</div></section>)}</div>
  </div>;
}
