"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { HubAvailabilityCore, HubCalendarCore, HubMeetingsCore } from "@/components/hub/HubAgendaCore";

const tabs = [
  { id: "calendario", label: "Calendário" },
  { id: "reunioes", label: "Reuniões" },
  { id: "disponibilidade", label: "Disponibilidade" },
] as const;
type Tab = typeof tabs[number]["id"];

export function HubAgendaTabs() {
  const router = useRouter(); const params = useSearchParams();
  const current = tabs.some((tab) => tab.id === params.get("tab")) ? params.get("tab") as Tab : "calendario";
  function select(tab: Tab) { const next = new URLSearchParams(params.toString()); if (tab === "calendario") next.delete("tab"); else next.set("tab", tab); router.replace(`/hub/agenda${next.size ? `?${next}` : ""}`); }
  return <div className="space-y-6"><header><p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">Organização da EJ</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.03em]">Agenda</h1><div className="mt-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-1" role="tablist" aria-label="Agenda">{tabs.map((tab) => <button key={tab.id} role="tab" aria-selected={current === tab.id} onClick={() => select(tab.id)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${current === tab.id ? "bg-zinc-950 text-white" : "text-zinc-500 hover:bg-zinc-100"}`}>{tab.label}</button>)}</div></header>
    {current === "calendario" ? <HubCalendarCore /> : null}
    {current === "reunioes" ? <HubMeetingsCore /> : null}
    {current === "disponibilidade" ? <HubAvailabilityCore /> : null}
  </div>;
}
