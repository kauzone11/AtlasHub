"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Plus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CoreModal,
  Empty,
  ErrorNotice,
  coreApi,
  input,
  useCoreLoad,
  useCoreOptions,
} from "@/components/hub/HubCoreUi";
import { hubUi } from "@/components/hub/styles";
import { HubSearchMultiSelect } from "@/components/hub/HubSearchMultiSelect";

type CalendarEvent = {
  id: string;
  entityId?: string;
  source: string;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location?: string | null;
  directorateId?: string | null;
  projectId?: string | null;
  href: string | null;
  version?: number;
};
type CalendarView = "month" | "week" | "day" | "list";
function startDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}
function addDays(date: Date, count: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + count);
  return value;
}
function range(anchor: Date, view: CalendarView) {
  if (view === "month")
    return {
      from: new Date(
        anchor.getFullYear(),
        anchor.getMonth(),
        1 - new Date(anchor.getFullYear(), anchor.getMonth(), 1).getDay(),
      ),
      to: new Date(
        anchor.getFullYear(),
        anchor.getMonth() + 1,
        8 - new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1).getDay(),
      ),
    };
  if (view === "week") {
    const from = addDays(startDay(anchor), -anchor.getDay());
    return { from, to: addDays(from, 7) };
  }
  if (view === "day")
    return { from: startDay(anchor), to: addDays(startDay(anchor), 1) };
  return { from: startDay(anchor), to: addDays(startDay(anchor), 45) };
}

export function HubCalendarCore() {
  const options = useCoreOptions();
  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(new Date());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const period = useMemo(() => range(anchor, view), [anchor, view]);
  const state = useCoreLoad(
    async () =>
      await coreApi<{ events: CalendarEvent[]; timezone: string }>(
        `/api/hub/calendar?from=${period.from.toISOString()}&to=${period.to.toISOString()}`,
      ),
    [period.from.getTime(), period.to.getTime()],
  );
  const move = (direction: number) =>
    setAnchor((date) =>
      view === "month"
        ? new Date(date.getFullYear(), date.getMonth() + direction, 1)
        : addDays(date, direction * (view === "week" ? 7 : 1)),
    );
  const days: Date[] = [];
  for (
    let date = new Date(period.from);
    date < period.to;
    date = addDays(date, 1)
  )
    days.push(date);
  return (
    <div className="space-y-4">
      <ErrorNotice message={state.error} />
      {view === "list" ? (
        <section className={`${hubUi.panel} divide-y divide-zinc-100 overflow-hidden`}>
          <CalendarToolbar anchor={anchor} view={view} timezone={state.data?.timezone || options?.timezone} onToday={() => setAnchor(new Date())} onMove={move} onView={setView} onCreate={() => setOpen(true)} />
          {state.data?.events.map((event) => (
            <EventRow key={event.id} event={event} onEdit={setEditing} />
          ))}
          {!state.data?.events.length ? (
            <Empty>Nenhum compromisso neste período.</Empty>
          ) : null}
        </section>
      ) : (
        <section className={`${hubUi.panel} overflow-hidden p-6`}>
          <CalendarToolbar anchor={anchor} view={view} timezone={state.data?.timezone || options?.timezone} onToday={() => setAnchor(new Date())} onMove={move} onView={setView} onCreate={() => setOpen(true)} />
          <div className="mt-6 overflow-x-auto"><div className={`grid min-w-[720px] border-l border-t border-zinc-200 ${view === "month" || view === "week" ? "grid-cols-7" : "grid-cols-1"}`}>
            {view !== "day" ? ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((label) => <div key={label} className="border-b border-r border-zinc-200 bg-zinc-50 p-3 text-center text-xs font-semibold text-zinc-500">{label}</div>) : null}
            {days.map((day) => {
              const events =
                state.data?.events.filter(
                  (event) =>
                    new Date(event.startAt).toDateString() ===
                    day.toDateString(),
                ) || [];
              return (
                <article
                  key={day.toISOString()}
                  className={`min-h-28 border-b border-r border-zinc-200 p-2 ${day.toDateString() === new Date().toDateString() ? "bg-zinc-50" : "bg-white"}`}
                >
                  <time className="inline-grid h-7 w-7 place-items-center rounded-full font-mono text-xs text-zinc-500">
                    {day.getDate()}
                  </time>
                  <div className="mt-1 space-y-1">
                    {events.map((event) =>
                      event.href ? (
                        <Link
                          key={event.id}
                          href={event.href}
                           className={`block truncate rounded-md border-l-2 px-2 py-1 text-[11px] font-medium ${event.source === "MEETING" ? "border-blue-500 bg-blue-50 text-blue-800" : event.source === "TASK" ? "border-amber-500 bg-amber-50 text-amber-800" : event.source === "PROJECT" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-zinc-500 bg-zinc-100 text-zinc-800"}`}
                        >
                          {event.allDay
                            ? ""
                            : new Date(event.startAt).toLocaleTimeString(
                                "pt-BR",
                                { hour: "2-digit", minute: "2-digit" },
                              ) + " "}
                          {event.title}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          key={event.id}
                          onClick={() => setEditing(event)}
                           className="block w-full truncate rounded-md border-l-2 border-blue-500 bg-blue-50 px-2 py-1 text-left text-[11px] font-medium text-blue-800 hover:bg-blue-100"
                        >
                          {event.title}
                        </button>
                      ),
                    )}
                  </div>
                </article>
              );
            })}
          </div></div>
        </section>
      )}
      <CoreModal open={open} onClose={() => setOpen(false)} title="Novo evento">
        <EventForm
          options={options}
          onSaved={async () => {
            setOpen(false);
            await state.refresh();
          }}
          onError={state.setError}
        />
      </CoreModal>
      <CoreModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Editar evento"
      >
        <EventForm
          key={editing?.id}
          event={editing || undefined}
          options={options}
          onSaved={async () => {
            setEditing(null);
            await state.refresh();
          }}
          onError={state.setError}
        />
      </CoreModal>
    </div>
  );
}

function CalendarToolbar({ anchor, view, timezone, onToday, onMove, onView, onCreate }: { anchor: Date; view: CalendarView; timezone?: string; onToday: () => void; onMove: (direction: number) => void; onView: (view: CalendarView) => void; onCreate: () => void }) {
  return <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><h2 className="font-display text-xl font-semibold capitalize">{anchor.toLocaleDateString("pt-BR", { month: "long", year: "numeric", ...(view === "day" ? { day: "numeric" } : {}) })}</h2><p className="mt-1 text-sm text-zinc-500">Reuniões, prazos e marcos de projetos · {timezone || "fuso local"}</p></div><div className="flex flex-wrap items-center gap-2"><button onClick={onToday} className={hubUi.secondaryButton}>Hoje</button><button onClick={() => onMove(-1)} aria-label="Anterior" className={`${hubUi.secondaryButton} px-3`}><ChevronLeft className="h-4 w-4" /></button><button onClick={() => onMove(1)} aria-label="Próximo" className={`${hubUi.secondaryButton} px-3`}><ChevronRight className="h-4 w-4" /></button><select aria-label="Visualização do calendário" value={view} onChange={(event) => onView(event.target.value as CalendarView)} className="min-h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm"><option value="month">Mês</option><option value="week">Semana</option><option value="day">Dia</option><option value="list">Lista</option></select><button onClick={onCreate} className={`${hubUi.primaryButton} px-3`}><Plus className="h-4 w-4" /><span className="sr-only sm:not-sr-only">Evento</span></button></div></div>;
}
function EventRow({
  event,
  onEdit,
}: {
  event: CalendarEvent;
  onEdit: (event: CalendarEvent) => void;
}) {
  const content = (
    <>
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100">
        <CalendarDays className="h-4 w-4" />
      </span>
      <div className="flex-1">
        <p className="font-medium">{event.title}</p>
        <p className="text-xs text-zinc-500">
          {new Date(event.startAt).toLocaleString("pt-BR")} · {event.source}
        </p>
      </div>
    </>
  );
  return event.href ? (
    <Link href={event.href} className="flex items-center gap-3 p-4">
      {content}
    </Link>
  ) : (
    <button
      type="button"
      onClick={() => onEdit(event)}
      className="flex w-full items-center gap-3 p-4 text-left hover:bg-zinc-50"
    >
      {content}
    </button>
  );
}
function EventForm({
  event,
  options,
  onSaved,
  onError,
}: {
  event?: CalendarEvent;
  options: ReturnType<typeof useCoreOptions>;
  onSaved: () => Promise<void>;
  onError: (value: string) => void;
}) {
  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 30) * 30, 0, 0);
  const [form, setForm] = useState({
    title: event?.title || "",
    description: event?.description || "",
    startAt: event?.startAt.slice(0, 16) || now.toISOString().slice(0, 16),
    endAt:
      event?.endAt.slice(0, 16) ||
      new Date(now.getTime() + 3600000).toISOString().slice(0, 16),
    location: event?.location || "",
    directorateId: event?.directorateId || "",
    projectId: event?.projectId || "",
  });
  async function save(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    try {
      await coreApi(
        event ? `/api/hub/calendar/${event.id}` : "/api/hub/calendar",
        {
          method: event ? "PATCH" : "POST",
          body: JSON.stringify(
            event ? { ...form, version: event.version } : form,
          ),
        },
      );
      await onSaved();
    } catch (reason) {
      onError(
        reason instanceof Error ? reason.message : "Não foi possível criar.",
      );
    }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <label className="block text-sm font-medium">
        Título
        <input
          required
          className={`${input} mt-1`}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </label>
      <label className="block text-sm font-medium">
        Descrição
        <textarea
          className={`${input} mt-1 min-h-20`}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Início
          <input
            type="datetime-local"
            className={`${input} mt-1`}
            value={form.startAt}
            onChange={(e) => setForm({ ...form, startAt: e.target.value })}
          />
        </label>
        <label className="block text-sm font-medium">
          Fim
          <input
            type="datetime-local"
            className={`${input} mt-1`}
            value={form.endAt}
            onChange={(e) => setForm({ ...form, endAt: e.target.value })}
          />
        </label>
        <label className="block text-sm font-medium">
          Diretoria
          <select
            className={`${input} mt-1`}
            value={form.directorateId}
            onChange={(e) =>
              setForm({ ...form, directorateId: e.target.value })
            }
          >
            <option value="">Toda a EJ</option>
            {options?.directorates.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Projeto
          <select
            className={`${input} mt-1`}
            value={form.projectId}
            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
          >
            <option value="">Sem projeto</option>
            {options?.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Local
          <input
            className={`${input} mt-1`}
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </label>
      </div>
      <div className="flex justify-end">
        <button className={hubUi.primaryButton}>
          {event ? "Salvar alterações" : "Criar evento"}
        </button>
      </div>
    </form>
  );
}

type Meeting = {
  id: string;
  title: string;
  status: string;
  startAt: string;
  endAt: string;
  location: string | null;
  participants: Array<{
    memberId: string;
    responseStatus: string;
    member: { name: string };
  }>;
  directorates?: Array<{ directorate: { id: string; name: string } }>;
};
export function HubMeetingsCore() {
  const options = useCoreOptions();
  const state = useCoreLoad(
    async () =>
      await coreApi<{ meetings: Meeting[] }>(
        "/api/hub/meetings?filter=upcoming&view=list",
      ),
    [],
  );
  const [open, setOpen] = useState(false);
  const meetings = state.data?.meetings || []; const confirmed = meetings.flatMap((meeting) => meeting.participants).filter((participant) => participant.responseStatus === "ACCEPTED").length; const participants = meetings.flatMap((meeting) => meeting.participants).length; const nextMeeting = meetings[0];
  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">Coordenação de equipe</p><h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.035em]">Reuniões</h2><p className="mt-2 text-sm text-zinc-500">Convide pessoas no momento certo e acompanhe cada encontro.</p></div><button onClick={() => setOpen(true)} className={hubUi.primaryButton}><Plus className="h-4 w-4" />Nova reunião</button></header>
      <ErrorNotice message={state.error} />
      <section className="grid gap-4 md:grid-cols-3"><MeetingMetric icon={<CalendarDays />} label="Reuniões futuras" value={String(meetings.length)} note="Agenda da organização" /><MeetingMetric icon={<Users />} label="Participação confirmada" value={participants ? `${Math.round((confirmed / participants) * 100)}%` : "—"} note={`${Math.max(participants - confirmed, 0)} convites aguardando`} /><MeetingMetric icon={<Clock3 />} label="Próxima reunião" value={nextMeeting ? new Date(nextMeeting.startAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"} note={nextMeeting?.title || "Nenhuma reunião agendada"} /></section>
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"><div className="border-b border-zinc-200 px-5 py-5"><h3 className="font-display text-xl font-semibold">Agenda de reuniões</h3><p className="mt-1 text-sm text-zinc-500">{meetings.length} encontros futuros</p></div><div className="divide-y divide-zinc-200">{meetings.map((meeting) => <Link key={meeting.id} href={`/hub/reunioes/${meeting.id}`} className="flex flex-col gap-4 px-5 py-5 transition hover:bg-zinc-50 sm:flex-row sm:items-center"><div className="min-w-[94px]"><p className="font-mono text-xs font-semibold">{new Date(meeting.startAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}—{new Date(meeting.endAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p><p className="mt-1 text-xs text-zinc-500">{new Date(meeting.startAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</p></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="truncate font-semibold">{meeting.title}</h4><span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[10px] font-semibold">{meeting.status}</span></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500"><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{meeting.location || "Sem local"}</span><span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{meeting.participants.length} participantes</span></div></div><div className="flex -space-x-2">{meeting.participants.slice(0, 4).map((participant) => <span key={participant.memberId} title={participant.member.name} className="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-zinc-100 font-mono text-[10px] font-semibold">{participant.member.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>)}</div></Link>)}{!meetings.length ? <Empty>Nenhuma reunião futura.</Empty> : null}</div></section>
      <CoreModal
        open={open}
        onClose={() => setOpen(false)}
        title="Nova reunião"
        description="Selecione quantas diretorias e participantes forem necessários."
      >
        <MeetingForm
          options={options}
          onSaved={async () => {
            setOpen(false);
            await state.refresh();
          }}
          onError={state.setError}
        />
      </CoreModal>
    </div>
  );
}

function MeetingMetric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) { return <div className={`${hubUi.panel} p-5`}><span className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100 text-zinc-800 [&>svg]:h-5 [&>svg]:w-5">{icon}</span><p className="mt-5 text-sm text-zinc-500">{label}</p><p className="mt-1 font-display text-2xl font-semibold tracking-[-0.03em]">{value}</p><p className="mt-1 truncate text-xs text-zinc-500">{note}</p></div>; }
function MeetingForm({
  options,
  onSaved,
  onError,
}: {
  options: ReturnType<typeof useCoreOptions>;
  onSaved: () => Promise<void>;
  onError: (value: string) => void;
}) {
  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 30) * 30, 0, 0);
  const [form, setForm] = useState({
    title: "",
    description: "",
    startLocal: now.toISOString().slice(0, 16),
    endLocal: new Date(now.getTime() + 3600000).toISOString().slice(0, 16),
    location: "",
    directorateIds: [] as string[],
    participantIds: [] as string[],
    organizationWide: false,
    externalGuests: "",
    agenda: "",
  });
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      const result = await coreApi<{ meeting: { id: string } }>(
        "/api/hub/meetings",
        {
          method: "POST",
          body: JSON.stringify({
            ...form,
            timezone: options?.timezone,
            status: "SCHEDULED",
            directorateId: form.directorateIds[0] || null,
            externalGuests: form.externalGuests
              .split("\n")
              .filter(Boolean)
              .map((line) => {
                const [name, email] = line.split("<");
                return {
                  name: name.trim(),
                  email: email?.replace(">", "").trim() || null,
                };
              }),
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      await onSaved();
      if (result.meeting?.id)
        window.location.assign(`/hub/reunioes/${result.meeting.id}`);
    } catch (reason) {
      onError(
        reason instanceof Error ? reason.message : "Não foi possível criar.",
      );
    }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <label className="block text-sm font-medium">
        Título
        <input
          required
          className={`${input} mt-1`}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </label>
      <label className="block text-sm font-medium">
        Descrição e pauta
        <textarea
          className={`${input} mt-1 min-h-24`}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Início
          <input
            type="datetime-local"
            className={`${input} mt-1`}
            value={form.startLocal}
            onChange={(e) => setForm({ ...form, startLocal: e.target.value })}
          />
        </label>
        <label className="block text-sm font-medium">
          Fim
          <input
            type="datetime-local"
            className={`${input} mt-1`}
            value={form.endLocal}
            onChange={(e) => setForm({ ...form, endLocal: e.target.value })}
          />
        </label>
        <label className="block text-sm font-medium">
          Local
          <input
            className={`${input} mt-1`}
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 rounded-xl border border-zinc-200 p-3 text-sm font-medium"><input type="checkbox" checked={form.organizationWide} onChange={(event) => setForm({ ...form, organizationWide: event.target.checked })} />Toda a EJ</label>
      <HubSearchMultiSelect label="Diretorias convidadas" options={(options?.directorates || []).map((d) => ({ id: d.id, label: d.name }))} value={form.directorateIds} onChange={(directorateIds) => setForm({ ...form, directorateIds })} />
      <HubSearchMultiSelect label="Pessoas convidadas" options={(options?.members || []).map((m) => ({ id: m.id, label: m.name, detail: m.directorateId ? "Membro de diretoria" : "Membro da organização" }))} value={form.participantIds} onChange={(participantIds) => setForm({ ...form, participantIds })} />
      <label className="block text-sm font-medium">
        Convidados externos{" "}
        <span className="font-normal text-zinc-500">
          (um por linha: Nome &lt;email&gt;)
        </span>
        <textarea
          className={`${input} mt-1 min-h-20`}
          value={form.externalGuests}
          onChange={(e) => setForm({ ...form, externalGuests: e.target.value })}
        />
      </label>
      <div className="flex justify-end">
        <button className={hubUi.primaryButton}>Agendar reunião</button>
      </div>
    </form>
  );
}

type Poll = {
  id: string;
  title: string;
  status: string;
  dates: string[];
  slotMinutes: number;
  responseDeadline: string | null;
  _count: { participants: number; selections: number };
};
type PollDetail = Poll & {
  participants: Array<{ id: string; name: string }>;
  slots: Array<{
    slotStart: string;
    count: number;
    percentage: number;
    fullAttendance: boolean;
    selectedByMe: boolean;
  }>;
  bestSlots: Array<{ slotStart: string; count: number; percentage: number }>;
  capabilities: { canManage: boolean };
  timezone: string;
};
export function HubAvailabilityCore() {
  const options = useCoreOptions();
  const list = useCoreLoad(
    async () =>
      (await coreApi<{ polls: Poll[] }>("/api/hub/availability/polls")).polls,
    [],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useCoreLoad(
    async () =>
      selectedId
        ? (
            await coreApi<{ poll: PollDetail }>(
              `/api/hub/availability/polls/${selectedId}`,
            )
          ).poll
        : null,
    [selectedId],
  );
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [hasEditedSelections, setHasEditedSelections] = useState(false);
  const poll = detail.data;
  useEffect(() => { if (!selectedId && list.data?.[0]) setSelectedId(list.data[0].id); }, [list.data, selectedId]);
  function toggle(slot: string) {
    setHasEditedSelections(true);
    setDraft((current) => {
      const next = new Set(
        hasEditedSelections
          ? current
          : poll?.slots
              .filter((item) => item.selectedByMe)
              .map((item) => item.slotStart),
      );
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  }
  async function save() {
    if (!selectedId) return;
    try {
      await coreApi(`/api/hub/availability/polls/${selectedId}`, {
        method: "PUT",
        body: JSON.stringify({ slots: [...draft] }),
      });
      setDraft(new Set());
      setHasEditedSelections(false);
      await detail.refresh();
    } catch (reason) {
      detail.setError(
        reason instanceof Error ? reason.message : "Não foi possível salvar.",
      );
    }
  }
  const timezone = poll?.timezone || options?.timezone || "America/Fortaleza";
  const dateKey = (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
  const timeKey = (value: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
  const dates = poll ? [...new Set(poll.slots.map((slot) => dateKey(slot.slotStart)))].sort() : [];
  const times = poll ? [...new Set(poll.slots.map((slot) => timeKey(slot.slotStart)))].sort() : [];
  const slotMap = new Map(poll?.slots.map((slot) => [`${dateKey(slot.slotStart)}|${timeKey(slot.slotStart)}`, slot]) || []);
  const selectedSlots = hasEditedSelections ? draft : new Set(poll?.slots.filter((slot) => slot.selectedByMe).map((slot) => slot.slotStart) || []);
  return (
    <div className="space-y-6"><header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">Planejamento pessoal</p><h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.035em]">Disponibilidade</h2><p className="mt-2 max-w-3xl text-sm text-zinc-500">Defina seus horários para projetos e reuniões. Suas escolhas atualizam os convites automaticamente.</p></div><button onClick={() => void save()} disabled={!poll} className={hubUi.primaryButton}>Salvar disponibilidade</button></header><ErrorNotice message={detail.error || list.error} />
      {poll ? <div className="grid gap-4 lg:grid-cols-[1fr_290px]"><section className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h3 className="font-display text-xl font-semibold">Sua semana</h3><p className="mt-1 text-sm text-zinc-500">{poll.title}</p></div><div className="flex flex-wrap gap-2"><select aria-label="Consulta de disponibilidade" value={selectedId || ""} onChange={(event) => { setSelectedId(event.target.value); setDraft(new Set()); }} className="min-h-9 max-w-56 rounded-lg border border-zinc-200 bg-white px-2 text-sm">{list.data?.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button onClick={() => setOpen(true)} className={`${hubUi.secondaryButton} min-h-9 px-3`}><Plus className="h-4 w-4" />Nova</button></div></div><div className="mt-6 overflow-x-auto"><div className="min-w-[650px]"><div className="grid border-b border-zinc-200" style={{ gridTemplateColumns: `72px repeat(${Math.max(dates.length, 1)}, minmax(90px, 1fr))` }}><div />{dates.map((date) => <div key={date} className="pb-3 text-center"><p className="text-xs font-semibold text-zinc-700">{new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</p><span className="mt-1 inline-grid h-7 w-7 place-items-center rounded-full font-mono text-[11px] text-zinc-500">{date.slice(-2)}</span></div>)}</div>{times.map((time) => <div key={time} className="grid" style={{ gridTemplateColumns: `72px repeat(${Math.max(dates.length, 1)}, minmax(90px, 1fr))` }}><div className="border-b border-zinc-200 py-3 font-mono text-[11px] text-zinc-500">{time}</div>{dates.map((date) => { const slot = slotMap.get(`${date}|${time}`); const selected = Boolean(slot && selectedSlots.has(slot.slotStart)); return <button disabled={!slot} title={slot ? `${date} às ${time}` : "Horário indisponível"} key={date} onPointerDown={(event) => { if (!slot) return; event.currentTarget.setPointerCapture(event.pointerId); toggle(slot.slotStart); }} onPointerEnter={(event) => { if (slot && event.buttons === 1) toggle(slot.slotStart); }} onClick={(event) => event.preventDefault()} className="group border-b border-l border-zinc-200 p-1.5"><span className={`flex h-8 items-center justify-center rounded-lg text-[11px] transition-all ${selected ? "bg-zinc-950 font-semibold text-white shadow-sm" : slot?.fullAttendance ? "bg-zinc-100 text-zinc-500" : "bg-transparent text-transparent group-hover:bg-zinc-50"}`}>{selected ? "✓" : slot ? `${slot.count}/${poll.participants.length}` : ""}</span></button>; })}</div>)}</div></div></section>
        <aside className="rounded-2xl bg-zinc-950 p-5 text-white"><span className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-300 text-zinc-950"><Clock3 className="h-4 w-4" /></span><h3 className="mt-5 font-display text-xl font-semibold">Agenda inteligente</h3><p className="mt-2 text-sm leading-6 text-zinc-300">Você tem <strong className="text-white">{selectedSlots.size} horários</strong> abertos nesta consulta. Os organizadores verão apenas esses períodos antes de criar uma reunião.</p><div className="mt-6 border-t border-white/15 pt-4"><p className="flex items-center gap-2 text-xs text-zinc-300"><Clock3 className="h-4 w-4" />Reuniões fora do horário exigem aceite.</p>{poll.bestSlots[0] && poll.capabilities.canManage ? <button
                  onClick={async () => {
                    try {
                      const result = await coreApi<{ meeting: { id: string } }>(
                        `/api/hub/availability/polls/${selectedId}`,
                        {
                          method: "POST",
                          body: JSON.stringify({
                            slotStart: poll.bestSlots[0].slotStart,
                          }),
                        },
                      );
                      window.location.assign(
                        `/hub/reunioes/${result.meeting.id}`,
                      );
                    } catch (reason) {
                      detail.setError(
                        reason instanceof Error
                          ? reason.message
                          : "Não foi possível criar a reunião.",
                      );
                    }
                  }}
                  className="mt-5 w-full rounded-xl bg-white px-3 py-2 text-sm font-semibold text-zinc-950"
                >
                  Criar reunião no melhor horário
                </button> : null}</div></aside></div> : <Empty>Selecione uma consulta ou crie uma nova.</Empty>}
      <CoreModal
        open={open}
        onClose={() => setOpen(false)}
        title="Nova consulta de disponibilidade"
      >
        <PollForm
          options={options}
          onSaved={async (id) => {
            setOpen(false);
            await list.refresh();
            setSelectedId(id);
          }}
          onError={list.setError}
        />
      </CoreModal></div>
  );
}
function PollForm({
  options,
  onSaved,
  onError,
}: {
  options: ReturnType<typeof useCoreOptions>;
  onSaved: (id: string) => Promise<void>;
  onError: (value: string) => void;
}) {
  const [form, setForm] = useState({
    title: "",
    dates: [new Date().toISOString().slice(0, 10)],
    startMinute: 480,
    endMinute: 1080,
    slotMinutes: 30,
    directorateIds: [] as string[],
    participantIds: [] as string[],
    responseDeadline: "",
  });
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      const result = await coreApi<{ poll: { id: string } }>(
        "/api/hub/availability/polls",
        { method: "POST", body: JSON.stringify(form) },
      );
      await onSaved(result.poll.id);
    } catch (reason) {
      onError(
        reason instanceof Error ? reason.message : "Não foi possível criar.",
      );
    }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <label className="block text-sm font-medium">
        Título
        <input
          required
          className={`${input} mt-1`}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </label>
      <label className="block text-sm font-medium">
        Datas{" "}
        <span className="font-normal text-zinc-500">
          (separadas por vírgula)
        </span>
        <input
          className={`${input} mt-1`}
          value={form.dates.join(", ")}
          onChange={(e) =>
            setForm({
              ...form,
              dates: e.target.value
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-medium">
          De
          <input
            type="time"
            className={`${input} mt-1`}
            defaultValue="08:00"
            onChange={(e) => {
              const [h, m] = e.target.value.split(":").map(Number);
              setForm({ ...form, startMinute: h * 60 + m });
            }}
          />
        </label>
        <label className="block text-sm font-medium">
          Até
          <input
            type="time"
            className={`${input} mt-1`}
            defaultValue="18:00"
            onChange={(e) => {
              const [h, m] = e.target.value.split(":").map(Number);
              setForm({ ...form, endMinute: h * 60 + m });
            }}
          />
        </label>
        <label className="block text-sm font-medium">
          Intervalo
          <select
            className={`${input} mt-1`}
            value={form.slotMinutes}
            onChange={(e) =>
              setForm({ ...form, slotMinutes: Number(e.target.value) })
            }
          >
            <option value="15">15 min</option>
            <option value="30">30 min</option>
            <option value="60">60 min</option>
          </select>
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Diretorias</legend>
        <div className="mt-2 grid gap-2 rounded-xl border p-3 sm:grid-cols-2">
          {options?.directorates.map((d) => (
            <label key={d.id} className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.directorateIds.includes(d.id)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    directorateIds: e.target.checked
                      ? [...form.directorateIds, d.id]
                      : form.directorateIds.filter((id) => id !== d.id),
                  })
                }
              />
              {d.name}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium">Pessoas adicionais</legend>
        <div className="mt-2 grid max-h-40 gap-2 overflow-y-auto rounded-xl border p-3 sm:grid-cols-2">
          {options?.members.map((m) => (
            <label key={m.id} className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.participantIds.includes(m.id)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    participantIds: e.target.checked
                      ? [...form.participantIds, m.id]
                      : form.participantIds.filter((id) => id !== m.id),
                  })
                }
              />
              {m.name}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-medium">
        Prazo de resposta
        <input
          type="datetime-local"
          className={`${input} mt-1`}
          value={form.responseDeadline}
          onChange={(e) =>
            setForm({ ...form, responseDeadline: e.target.value })
          }
        />
      </label>
      <div className="flex justify-end">
        <button className={hubUi.primaryButton}>Criar consulta</button>
      </div>
    </form>
  );
}
