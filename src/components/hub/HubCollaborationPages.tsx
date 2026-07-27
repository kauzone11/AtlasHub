"use client";

import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Copy,
  Plus,
  Save,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { hubUi } from "@/components/hub/styles";

type Json = Record<string, unknown>;
class ClientApiError extends Error {
  constructor(
    message: string,
    readonly details: Json,
  ) {
    super(message);
  }
}
export async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json();
  if (!response.ok)
    throw new ClientApiError(
      data.error || "Não foi possível concluir a operação.",
      data,
    );
  return data;
}
function useLoad<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    try {
      setError("");
      setData(await api(url));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao carregar.");
    }
  };
  useEffect(() => {
    void load();
    // A URL e a unica entrada reativa; load e recriada apenas para expor recarga manual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return { data, error, load };
}
export const field =
  "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black";
const statusLabel: Record<string, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendada",
  CANCELLED: "Cancelada",
  COMPLETED: "Concluída",
  PENDING: "Pendente",
  ACCEPTED: "Aceita",
  DECLINED: "Recusada",
  TENTATIVE: "Talvez",
  LOW: "Baixa",
  NORMAL: "Normal",
  HIGH: "Alta",
  URGENT: "Urgente",
};
export function Alert({ error, success }: { error?: string; success?: string }) {
  return error ? (
    <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
      {error}
    </p>
  ) : success ? (
    <p
      role="status"
      className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
    >
      {success}
    </p>
  ) : null;
}
export function Header({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600">{description}</p>
      </div>
      {action}
    </header>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${hubUi.panel} p-10 text-center text-sm text-zinc-500`}>
      {children}
    </div>
  );
}

type Rule = {
  id?: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  timezone?: string;
  isActive?: boolean;
};
const days = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
const time = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const minute = (value: string) => {
  const [hour, minutes] = value.split(":").map(Number);
  return hour * 60 + minutes;
};
export function AvailabilityPage() {
  const {
    data,
    error: loadError,
    load,
  } = useLoad<{
    rules: Rule[];
    exceptions: Array<{
      id: string;
      date: string;
      type: string;
      startMinute: number | null;
      endMinute: number | null;
      reason: string | null;
    }>;
    timezone: string;
  }>("/api/hub/availability");
  const [rules, setRules] = useState<Rule[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [exception, setException] = useState({
    date: "",
    type: "UNAVAILABLE",
    start: "",
    end: "",
    reason: "",
  });
  useEffect(() => {
    if (data) setRules(data.rules);
  }, [data]);
  const update = (
    index: number,
    key: "startMinute" | "endMinute",
    value: string,
  ) =>
    setRules((current) =>
      current.map((item, row) =>
        row === index ? { ...item, [key]: minute(value) } : item,
      ),
    );
  async function save() {
    try {
      setError("");
      await api("/api/hub/availability", {
        method: "PUT",
        body: JSON.stringify({ rules }),
      });
      setSuccess("Disponibilidade semanal salva.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao salvar.");
    }
  }
  async function addException(event: React.FormEvent) {
    event.preventDefault();
    try {
      setError("");
      await api("/api/hub/availability/exceptions", {
        method: "POST",
        body: JSON.stringify({
          date: exception.date,
          type: exception.type,
          startMinute: exception.start ? minute(exception.start) : null,
          endMinute: exception.end ? minute(exception.end) : null,
          reason: exception.reason,
        }),
      });
      setException({
        date: "",
        type: "UNAVAILABLE",
        start: "",
        end: "",
        reason: "",
      });
      setSuccess("Exceção adicionada.");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Falha ao adicionar.",
      );
    }
  }
  return (
    <div className={hubUi.page}>
      <Header
        title="Disponibilidade"
        description={`Defina seus horários semanais e exceções no fuso ${data?.timezone || "da organização"}.`}
      />
      <Alert error={error || loadError} success={success} />
      <section className={`${hubUi.panel} overflow-hidden`}>
        <div className="border-b border-zinc-200 p-5">
          <h2 className="font-semibold">Semana padrão</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Você pode adicionar vários intervalos por dia.
          </p>
        </div>
        <div className="divide-y divide-zinc-100">
          {days.map((label, weekday) => {
            const rows = rules
              .map((rule, index) => ({ rule, index }))
              .filter((item) => item.rule.weekday === weekday);
            return (
              <div
                key={label}
                className="grid gap-3 p-4 md:grid-cols-[9rem_1fr_auto]"
              >
                <strong className="text-sm">{label}</strong>
                <div className="space-y-2">
                  {rows.length ? (
                    rows.map(({ rule, index }) => (
                      <div
                        key={`${weekday}-${index}`}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <label className="text-xs">
                          <span className="sr-only">Início em {label}</span>
                          <input
                            className={field}
                            type="time"
                            value={time(rule.startMinute)}
                            onChange={(event) =>
                              update(index, "startMinute", event.target.value)
                            }
                          />
                        </label>
                        <span aria-hidden>até</span>
                        <label className="text-xs">
                          <span className="sr-only">Fim em {label}</span>
                          <input
                            className={field}
                            type="time"
                            value={time(rule.endMinute)}
                            onChange={(event) =>
                              update(index, "endMinute", event.target.value)
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className={hubUi.secondaryButton}
                          onClick={() =>
                            setRules((current) =>
                              current.filter((_, row) => row !== index),
                            )
                          }
                        >
                          Remover
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-500">Indisponível</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-label={`Adicionar intervalo em ${label}`}
                    className={hubUi.secondaryButton}
                    onClick={() =>
                      setRules((current) => [
                        ...current,
                        {
                          weekday,
                          startMinute: 540,
                          endMinute: 1080,
                          timezone: data?.timezone,
                        },
                      ])
                    }
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  {weekday > 0 ? (
                    <button
                      type="button"
                      aria-label={`Copiar segunda-feira para ${label}`}
                      className={hubUi.secondaryButton}
                      onClick={() =>
                        setRules((current) => [
                          ...current.filter((item) => item.weekday !== weekday),
                          ...current
                            .filter((item) => item.weekday === 1)
                            .map((item) => ({
                              ...item,
                              id: undefined,
                              weekday,
                            })),
                        ])
                      }
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t border-zinc-200 p-4">
          <button type="button" onClick={save} className={hubUi.primaryButton}>
            <Save className="h-4 w-4" />
            Salvar semana
          </button>
        </div>
      </section>
      <section className={`${hubUi.panel} p-5`}>
        <h2 className="font-semibold">Exceções</h2>
        <form
          onSubmit={addException}
          className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-5"
        >
          <input
            required
            aria-label="Data da exceção"
            className={field}
            type="date"
            value={exception.date}
            onChange={(e) =>
              setException({ ...exception, date: e.target.value })
            }
          />
          <select
            aria-label="Tipo da exceção"
            className={field}
            value={exception.type}
            onChange={(e) =>
              setException({ ...exception, type: e.target.value })
            }
          >
            <option value="UNAVAILABLE">Dia indisponível</option>
            <option value="AVAILABLE">Disponível temporariamente</option>
          </select>
          <input
            aria-label="Início temporário"
            className={field}
            type="time"
            value={exception.start}
            onChange={(e) =>
              setException({ ...exception, start: e.target.value })
            }
          />
          <input
            aria-label="Fim temporário"
            className={field}
            type="time"
            value={exception.end}
            onChange={(e) =>
              setException({ ...exception, end: e.target.value })
            }
          />
          <button className={hubUi.primaryButton}>Adicionar</button>
        </form>
        <div className="mt-4 divide-y divide-zinc-100">
          {data?.exceptions.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap justify-between gap-3 py-3 text-sm"
            >
              <span>
                {new Date(item.date).toLocaleDateString("pt-BR", {
                  timeZone: "UTC",
                })}{" "}
                · {item.type === "UNAVAILABLE" ? "Indisponível" : "Disponível"}
                {item.startMinute !== null
                  ? ` · ${time(item.startMinute)}–${time(item.endMinute || 0)}`
                  : ""}
              </span>
              <button
                type="button"
                className="text-sm underline"
                onClick={async () => {
                  await api(`/api/hub/availability/exceptions/${item.id}`, {
                    method: "DELETE",
                  });
                  await load();
                }}
              >
                Excluir
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

type Meeting = {
  id: string;
  title: string;
  status: string;
  startAt: string;
  endAt: string;
  timezone: string;
  location?: string | null;
  directorate?: { name: string } | null;
  participants: Array<{
    memberId: string;
    responseStatus: string;
    member: { name: string };
  }>;
};
function MeetingRows({ meetings }: { meetings: Meeting[] }) {
  return meetings.length ? (
    <div className="divide-y divide-zinc-100">
      {meetings.map((meeting) => (
        <Link
          key={meeting.id}
          href={`/hub/reunioes/${meeting.id}`}
          className="grid gap-2 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black sm:grid-cols-[1fr_auto]"
        >
          <div>
            <h3 className="font-medium break-words">{meeting.title}</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {new Date(meeting.startAt).toLocaleString("pt-BR", {
                timeZone: meeting.timezone,
              })}{" "}
              · {meeting.directorate?.name || "Organização"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {meeting.participants.length} participante(s)
            </p>
          </div>
          <span className="self-start rounded-full border border-zinc-200 px-2 py-1 text-xs">
            {statusLabel[meeting.status] || meeting.status}
          </span>
        </Link>
      ))}
    </div>
  ) : (
    <p className="py-8 text-center text-sm text-zinc-500">
      Nenhuma reunião encontrada.
    </p>
  );
}
export function MeetingsPage() {
  const [filter, setFilter] = useState("upcoming");
  const { data, error } = useLoad<{
    meetings: Meeting[];
    capabilities: { canCreateMeeting: boolean };
  }>(
    `/api/hub/meetings?filter=${filter}`,
  );
  return (
    <div className={hubUi.page}>
      <Header
        title="Reuniões"
        description="Acompanhe convites, encontros passados e reuniões da sua organização."
        action={data?.capabilities.canCreateMeeting ? (
          <Link href="/hub/reunioes/nova" className={hubUi.primaryButton}>
            <Plus className="h-4 w-4" />
            Nova reunião
          </Link>
        ) : undefined}
      />
      <Alert error={error} />
      <div role="tablist" aria-label="Período" className="flex gap-2">
        <button
          role="tab"
          aria-selected={filter === "upcoming"}
          onClick={() => setFilter("upcoming")}
          className={
            filter === "upcoming" ? hubUi.primaryButton : hubUi.secondaryButton
          }
        >
          Próximas
        </button>
        <button
          role="tab"
          aria-selected={filter === "past"}
          onClick={() => setFilter("past")}
          className={
            filter === "past" ? hubUi.primaryButton : hubUi.secondaryButton
          }
        >
          Passadas
        </button>
        <button
          role="tab"
          aria-selected={filter === "mine"}
          onClick={() => setFilter("mine")}
          className={
            filter === "mine" ? hubUi.primaryButton : hubUi.secondaryButton
          }
        >
          Minhas
        </button>
      </div>
      <section className={`${hubUi.panel} px-5`}>
        <MeetingRows meetings={data?.meetings || []} />
        {data && !data.capabilities.canCreateMeeting && !data.meetings.length ? (
          <p className="pb-8 text-center text-sm text-zinc-500">
            Seu perfil possui acesso somente para acompanhar reunioes.
          </p>
        ) : null}
      </section>
    </div>
  );
}

type Options = {
  members: Array<{ id: string; name: string }>;
  directorates: Array<{ id: string; name: string }>;
  boards: Array<{
    id: string;
    name: string;
    columns: Array<{ id: string; name: string }>;
  }>;
  permissions: string[];
  timezone: string;
  capabilities: { canCreateMeeting: boolean };
};
export function NewMeetingPage() {
  const { data: options } = useLoad<Options>("/api/hub/collaboration/options");
  const [form, setForm] = useState({
    title: "",
    description: "",
    startLocal: "",
    endLocal: "",
    location: "",
    meetingUrl: "",
    directorateId: "",
    participantIds: [] as string[],
  });
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<
    Array<{ memberName: string; reason: string }>
  >([]);
  const [overrideReason, setOverrideReason] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [status, setStatus] = useState<"DRAFT" | "SCHEDULED">("SCHEDULED");
  if (options && !options.capabilities.canCreateMeeting)
    return (
      <div className={hubUi.page}>
        <Header title="Reunioes" description="Seu perfil possui acesso somente leitura." />
      </div>
    );
  async function submit(event: React.FormEvent, confirmConflicts = false) {
    event.preventDefault();
    try {
      setError("");
      const result = await api("/api/hub/meetings", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          timezone: options?.timezone,
          status,
          idempotencyKey,
          confirmConflicts,
          overrideReason,
        }),
      });
      location.href = `/hub/reunioes/${result.meeting.id}`;
    } catch (reason) {
      if (
        reason instanceof ClientApiError &&
        Array.isArray(reason.details.conflicts)
      )
        setConflicts(
          reason.details.conflicts as Array<{
            memberName: string;
            reason: string;
          }>,
        );
      else
        setError(reason instanceof Error ? reason.message : "Falha ao criar.");
    }
  }
  return (
    <div className={hubUi.page}>
      <Header
        title="Nova reunião"
        description="Agende no fuso da organização. Conflitos precisam de confirmação explícita e motivo auditável."
      />
      <Alert error={error} />
      <form onSubmit={submit} className={`${hubUi.panel} grid gap-4 p-5`}>
        <p className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700">
          Os horarios abaixo serao interpretados em {options?.timezone || "fuso da organizacao"}, independentemente do fuso deste dispositivo.
        </p>
        <label className="text-sm font-medium">
          Título
          <input
            required
            className={`${field} mt-1`}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label className="text-sm font-medium">
          Descrição
          <textarea
            className={`${field} mt-1 min-h-24`}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Início
            <input
              required
              type="datetime-local"
              className={`${field} mt-1`}
              value={form.startLocal}
              onChange={(e) =>
                setForm({ ...form, startLocal: e.target.value })
              }
            />
          </label>
          <label className="text-sm font-medium">
            Fim
            <input
              required
              type="datetime-local"
              className={`${field} mt-1`}
              value={form.endLocal}
              onChange={(e) => setForm({ ...form, endLocal: e.target.value })}
            />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Local
            <input
              className={`${field} mt-1`}
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </label>
          <label className="text-sm font-medium">
            Link HTTPS
            <input
              type="url"
              className={`${field} mt-1`}
              value={form.meetingUrl}
              onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })}
            />
          </label>
        </div>
        <label className="text-sm font-medium">
          Diretoria
          <select
            className={`${field} mt-1`}
            value={form.directorateId}
            onChange={(e) =>
              setForm({ ...form, directorateId: e.target.value })
            }
          >
            <option value="">Toda a organização</option>
            {options?.directorates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="text-sm font-medium">Participantes</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {options?.members.map((member) => (
              <label
                key={member.id}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={form.participantIds.includes(member.id)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      participantIds: e.target.checked
                        ? [...form.participantIds, member.id]
                        : form.participantIds.filter((id) => id !== member.id),
                    })
                  }
                />
                {member.name}
              </label>
            ))}
          </div>
        </fieldset>
        {conflicts.length ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <h2 className="font-semibold">Conflitos encontrados</h2>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {conflicts.map((item, index) => (
                <li key={`${item.memberName}-${index}`}>
                  {item.memberName}: {item.reason}
                </li>
              ))}
            </ul>
            <label className="mt-3 block text-sm font-medium">
              Motivo para confirmar mesmo assim
              <input
                required
                className={`${field} mt-1`}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={(event) =>
                void submit(event as unknown as React.FormEvent, true)
              }
              className={`${hubUi.primaryButton} mt-3`}
            >
              Confirmar conflitos
            </button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            onClick={() => setStatus("SCHEDULED")}
            className={hubUi.primaryButton}
          >
            <CalendarDays className="h-4 w-4" />
            Agendar reunião
          </button>
          <button
            type="submit"
            onClick={() => setStatus("DRAFT")}
            className={hubUi.secondaryButton}
          >
            Salvar rascunho
          </button>
        </div>
      </form>
    </div>
  );
}

export function MeetingDetailPage({ id }: { id: string }) {
  const { data, error, load } = useLoad<{
    meeting: Meeting & {
      description: string | null;
      minutes: string | null;
      agendaItems: Array<{ id: string; title: string }>;
      decisions: Array<{
        id: string;
        title: string;
        description: string | null;
      }>;
      sourceTasks: Array<{ id: string; title: string; boardId: string }>;
    };
  }>(`/api/hub/meetings/${id}`);
  const { data: options } = useLoad<Options>("/api/hub/collaboration/options");
  const [minutes, setMinutes] = useState("");
  const [decision, setDecision] = useState("");
  const [actionTitle, setActionTitle] = useState("");
  const [actionBoardId, setActionBoardId] = useState("");
  useEffect(() => {
    if (data) setMinutes(data.meeting.minutes || "");
  }, [data]);
  if (!data)
    return (
      <div className={hubUi.page}>
        <Alert error={error} />
      </div>
    );
  const meeting = data.meeting;
  async function respond(status: string) {
    await api(`/api/hub/meetings/${id}/respond`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
    await load();
  }
  return (
    <div className={hubUi.page}>
      <Header
        title={meeting.title}
        description={`${new Date(meeting.startAt).toLocaleString("pt-BR", { timeZone: meeting.timezone })} · ${statusLabel[meeting.status] || meeting.status}`}
        action={
          <Link href="/hub/reunioes" className={hubUi.secondaryButton}>
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        }
      />
      <section className={`${hubUi.panel} p-5`}>
        <h2 className="font-semibold">Sua resposta</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => respond("ACCEPTED")}
            className={hubUi.secondaryButton}
          >
            Aceitar
          </button>
          <button
            onClick={() => respond("TENTATIVE")}
            className={hubUi.secondaryButton}
          >
            Talvez
          </button>
          <button
            onClick={() => respond("DECLINED")}
            className={hubUi.secondaryButton}
          >
            Recusar
          </button>
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${hubUi.panel} p-5`}>
          <h2 className="font-semibold">Participantes</h2>
          <ul className="mt-3 space-y-2">
            {meeting.participants.map((item) => (
              <li
                key={item.memberId}
                className="flex justify-between gap-3 text-sm"
              >
                <span>{item.member.name}</span>
                <span>
                  {statusLabel[item.responseStatus] || item.responseStatus}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className={`${hubUi.panel} p-5`}>
          <h2 className="font-semibold">Pauta</h2>
          {meeting.agendaItems.length ? (
            <ol className="mt-3 list-decimal pl-5 text-sm">
              {meeting.agendaItems.map((item) => (
                <li key={item.id}>{item.title}</li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">Nenhum item de pauta.</p>
          )}
        </section>
      </div>
      <section className={`${hubUi.panel} p-5`}>
        <h2 className="font-semibold">Ata</h2>
        <textarea
          aria-label="Ata da reunião"
          className={`${field} mt-3 min-h-40`}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        />
        <button
          onClick={async () => {
            await api(`/api/hub/meetings/${id}`, {
              method: "PATCH",
              body: JSON.stringify({ minutes }),
            });
            await load();
          }}
          className={`${hubUi.primaryButton} mt-3`}
        >
          <Save className="h-4 w-4" />
          Salvar ata
        </button>
      </section>
      <section className={`${hubUi.panel} p-5`}>
        <h2 className="font-semibold">Decisões</h2>
        <div className="mt-3 space-y-2">
          {meeting.decisions.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-zinc-200 p-3"
            >
              <h3 className="font-medium">{item.title}</h3>
              {item.description ? (
                <p className="mt-1 text-sm text-zinc-600">{item.description}</p>
              ) : null}
            </article>
          ))}
        </div>
        <form
          className="mt-4 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await api(`/api/hub/meetings/${id}/decisions`, {
              method: "POST",
              body: JSON.stringify({ title: decision }),
            });
            setDecision("");
            await load();
          }}
        >
          <input
            required
            className={field}
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            placeholder="Registrar decisão"
          />
          <button className={hubUi.primaryButton}>Adicionar</button>
        </form>
      </section>
      {meeting.sourceTasks.length ? (
        <section className={`${hubUi.panel} p-5`}>
          <h2 className="font-semibold">Tarefas vinculadas</h2>
          {meeting.sourceTasks.map((task) => (
            <Link
              className="mt-2 block text-sm underline"
              key={task.id}
              href={`/hub/tarefas/${task.id}`}
            >
              {task.title}
            </Link>
          ))}
        </section>
      ) : null}
      {options?.boards.length ? (
        <section className={`${hubUi.panel} p-5`}>
          <h2 className="font-semibold">Criar tarefa de ação</h2>
          <p className="mt-1 text-sm text-zinc-500">
            A tarefa manterá o vínculo com esta reunião.
          </p>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={async (event) => {
              event.preventDefault();
              const board = options.boards.find(
                (item) => item.id === actionBoardId,
              );
              if (!board?.columns[0]) return;
              await api("/api/hub/tasks", {
                method: "POST",
                body: JSON.stringify({
                  boardId: board.id,
                  columnId: board.columns[0].id,
                  sourceMeetingId: id,
                  title: actionTitle,
                  priority: "NORMAL",
                  assigneeIds: [],
                  idempotencyKey: `meeting-action:${id}:${actionTitle.trim().toLowerCase()}`,
                }),
              });
              setActionTitle("");
              await load();
            }}
          >
            <label className="text-sm font-medium">
              Ação
              <input
                required
                className={`${field} mt-1`}
                value={actionTitle}
                onChange={(event) => setActionTitle(event.target.value)}
              />
            </label>
            <label className="text-sm font-medium">
              Quadro
              <select
                required
                className={`${field} mt-1`}
                value={actionBoardId}
                onChange={(event) => setActionBoardId(event.target.value)}
              >
                <option value="">Selecione</option>
                {options.boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </select>
            </label>
            <button className={`${hubUi.primaryButton} self-end`}>
              <Plus className="h-4 w-4" />
              Criar tarefa
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

export function AgendaPage() {
  const [view, setView] = useState("list");
  const { data: meetings, error } = useLoad<{ meetings: Meeting[] }>(
    "/api/hub/meetings?filter=upcoming",
  );
  const { data: tasks } = useLoad<{
    tasks: Array<{
      id: string;
      title: string;
      dueAt: string | null;
      board: { id: string; name: string };
    }>;
  }>("/api/hub/tasks?mine=true");
  return (
    <div className={hubUi.page}>
      <Header
        title="Agenda"
        description="Reuniões e prazos no contexto da organização, com lista móvel sempre disponível."
      />
      <Alert error={error} />
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Visualização"
      >
        <button
          className={
            view === "day" ? hubUi.primaryButton : hubUi.secondaryButton
          }
          onClick={() => setView("day")}
        >
          Dia
        </button>
        <button
          className={
            view === "week" ? hubUi.primaryButton : hubUi.secondaryButton
          }
          onClick={() => setView("week")}
        >
          Semana
        </button>
        <button
          className={
            view === "list" ? hubUi.primaryButton : hubUi.secondaryButton
          }
          onClick={() => setView("list")}
        >
          Lista
        </button>
      </div>
      <section className={`${hubUi.panel} px-5`}>
        <h2 className="pt-5 font-semibold">Próximas reuniões</h2>
        <MeetingRows
          meetings={(meetings?.meetings || []).filter(
            (item) =>
              view !== "day" ||
              new Date(item.startAt).toDateString() ===
                new Date().toDateString(),
          )}
        />
      </section>
      <section className={`${hubUi.panel} p-5`}>
        <h2 className="font-semibold">Prazos de tarefas</h2>
        <div className="mt-3 divide-y divide-zinc-100">
          {tasks?.tasks
            .filter((item) => item.dueAt)
            .map((task) => (
              <Link
                key={task.id}
                href={`/hub/tarefas/${task.id}`}
                className="flex justify-between gap-3 py-3 text-sm"
              >
                <span>{task.title}</span>
                <time>{new Date(task.dueAt!).toLocaleDateString("pt-BR")}</time>
              </Link>
            ))}
        </div>
      </section>
    </div>
  );
}

type Board = {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  isArchived: boolean;
  directorate?: { name: string } | null;
  _count?: { tasks: number };
  columns?: Array<{
    id: string;
    name: string;
    order: number;
    isDoneColumn: boolean;
    tasks: Array<{
      id: string;
      title: string;
      priority: string;
      dueAt: string | null;
      version: number;
      completedAt: string | null;
      assignees: Array<{ member: { name: string } }>;
    }>;
  }>;
};
export function BoardsPage() {
  const { data, error, load } = useLoad<{ boards: Board[] }>("/api/hub/boards");
  const { data: options } = useLoad<Options>("/api/hub/collaboration/options");
  const [name, setName] = useState("");
  async function create(event: React.FormEvent) {
    event.preventDefault();
    await api("/api/hub/boards", {
      method: "POST",
      body: JSON.stringify({ name, scope: "ORGANIZATION" }),
    });
    setName("");
    await load();
  }
  return (
    <div className={hubUi.page}>
      <Header
        title="Quadros"
        description="Trabalho da organização e das diretorias às quais você pertence."
      />
      <Alert error={error} />
      {options?.permissions.includes("boards:create") ? (
        <form
          onSubmit={create}
          className={`${hubUi.panel} flex flex-col gap-3 p-4 sm:flex-row`}
        >
          <input
            required
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do novo quadro"
          />
          <button className={hubUi.primaryButton}>
            <Plus className="h-4 w-4" />
            Criar quadro
          </button>
        </form>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.boards.map((board) => (
          <Link
            key={board.id}
            href={`/hub/quadros/${board.id}`}
            className={`${hubUi.panel} p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black`}
          >
            <h2 className="font-semibold break-words">{board.name}</h2>
            <p className="mt-2 text-sm text-zinc-500">
              {board.directorate?.name || "Organização"} ·{" "}
              {board._count?.tasks || 0} tarefas
            </p>
          </Link>
        ))}
      </div>
      {data && !data.boards.length ? (
        <Empty>
          Crie o primeiro quadro para organizar o trabalho da equipe.
        </Empty>
      ) : null}
    </div>
  );
}

export function BoardDetailPage({ id }: { id: string }) {
  const { data, error, load } = useLoad<{ board: Board }>(
    `/api/hub/boards/${id}`,
  );
  const [title, setTitle] = useState("");
  if (!data)
    return (
      <div className={hubUi.page}>
        <Alert error={error} />
      </div>
    );
  const board = data.board;
  const columns = board.columns || [];
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!columns[0]) return;
    await api("/api/hub/tasks", {
      method: "POST",
      body: JSON.stringify({
        boardId: id,
        columnId: columns[0].id,
        title,
        priority: "NORMAL",
        assigneeIds: [],
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    setTitle("");
    await load();
  }
  async function move(task: { id: string; version: number }, columnId: string) {
    await api(`/api/hub/tasks/${task.id}/move`, {
      method: "POST",
      body: JSON.stringify({ columnId, version: task.version }),
    });
    await load();
  }
  return (
    <div className={hubUi.page}>
      <Header
        title={board.name}
        description={board.description || "Quadro de trabalho"}
        action={
          <Link href="/hub/quadros" className={hubUi.secondaryButton}>
            <ArrowLeft className="h-4 w-4" />
            Quadros
          </Link>
        }
      />
      <Alert error={error} />
      <form
        onSubmit={create}
        className={`${hubUi.panel} flex flex-col gap-3 p-4 sm:flex-row`}
      >
        <input
          required
          className={field}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nova tarefa"
        />
        <button className={hubUi.primaryButton}>
          <Plus className="h-4 w-4" />
          Adicionar
        </button>
      </form>
      <div className="hidden min-w-0 gap-4 overflow-x-auto pb-3 md:flex">
        {columns.map((column, columnIndex) => (
          <section
            key={column.id}
            className="w-80 shrink-0 rounded-2xl bg-zinc-200/70 p-3"
            aria-labelledby={`column-${column.id}`}
          >
            <h2
              id={`column-${column.id}`}
              className="flex justify-between text-sm font-semibold"
            >
              <span>{column.name}</span>
              <span>{column.tasks.length}</span>
            </h2>
            <div className="mt-3 space-y-3">
              {column.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onMoveLeft={
                    columnIndex
                      ? () => move(task, columns[columnIndex - 1].id)
                      : undefined
                  }
                  onMoveRight={
                    columnIndex < columns.length - 1
                      ? () => move(task, columns[columnIndex + 1].id)
                      : undefined
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="space-y-4 md:hidden">
        {columns.map((column, columnIndex) => (
          <section key={column.id} className={`${hubUi.panel} p-4`}>
            <h2 className="font-semibold">
              {column.name}{" "}
              <span className="text-sm text-zinc-500">
                ({column.tasks.length})
              </span>
            </h2>
            <div className="mt-3 space-y-3">
              {column.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onMoveLeft={
                    columnIndex
                      ? () => move(task, columns[columnIndex - 1].id)
                      : undefined
                  }
                  onMoveRight={
                    columnIndex < columns.length - 1
                      ? () => move(task, columns[columnIndex + 1].id)
                      : undefined
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
function TaskCard({
  task,
  onMoveLeft,
  onMoveRight,
}: {
  task: {
    id: string;
    title: string;
    priority: string;
    dueAt: string | null;
    assignees: Array<{ member: { name: string } }>;
  };
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
}) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-3">
      <Link
        href={`/hub/tarefas/${task.id}`}
        className="font-medium break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
      >
        {task.title}
      </Link>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500">
        <span>{statusLabel[task.priority] || task.priority}</span>
        {task.dueAt ? (
          <time>{new Date(task.dueAt).toLocaleDateString("pt-BR")}</time>
        ) : null}
        {task.assignees.map((item) => (
          <span
            key={item.member.name}
            title={item.member.name}
            className="rounded-full bg-zinc-100 px-2"
          >
            {item.member.name
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")}
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          disabled={!onMoveLeft}
          aria-label={`Mover ${task.title} para a coluna anterior`}
          className={hubUi.secondaryButton}
          onClick={onMoveLeft}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          disabled={!onMoveRight}
          aria-label={`Mover ${task.title} para a próxima coluna`}
          className={hubUi.secondaryButton}
          onClick={onMoveRight}
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}

type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  dueAt: string | null;
  version: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  board: { id: string; name: string };
  column: { name: string };
  sourceMeeting: { id: string; title: string; startAt: string } | null;
  assignees: Array<{ member: { id: string; name: string } }>;
  comments: Array<{
    id: string;
    body: string;
    createdAt: string;
    author: { name: string };
  }>;
  checklistItems: Array<{ id: string; title: string; isCompleted: boolean }>;
};

export function TaskDetailPage({ id }: { id: string }) {
  const { data, error, load } = useLoad<{ task: TaskDetail }>(
    `/api/hub/tasks/${id}`,
  );
  const [comment, setComment] = useState("");
  if (!data)
    return (
      <div className={hubUi.page}>
        <Alert error={error} />
      </div>
    );
  const task = data.task;
  return (
    <div className={hubUi.page}>
      <Header
        title={task.title}
        description={`${task.board.name} · ${task.column.name}`}
        action={
          <Link
            href={`/hub/quadros/${task.board.id}`}
            className={hubUi.secondaryButton}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao quadro
          </Link>
        }
      />
      <Alert error={error} />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className={`${hubUi.panel} p-5`}>
          <h2 className="font-semibold">Descrição</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-700">
            {task.description || "Sem descrição."}
          </p>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-zinc-500">Prioridade</dt>
              <dd>{statusLabel[task.priority] || task.priority}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Prazo</dt>
              <dd>
                {task.dueAt
                  ? new Date(task.dueAt).toLocaleString("pt-BR")
                  : "Sem prazo"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Criada em</dt>
              <dd>{new Date(task.createdAt).toLocaleString("pt-BR")}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Atualizada em</dt>
              <dd>{new Date(task.updatedAt).toLocaleString("pt-BR")}</dd>
            </div>
          </dl>
          {task.sourceMeeting ? (
            <Link
              href={`/hub/reunioes/${task.sourceMeeting.id}`}
              className="mt-5 block rounded-xl border border-zinc-200 p-3 text-sm underline"
            >
              Reunião de origem: {task.sourceMeeting.title}
            </Link>
          ) : null}
        </section>
        <section className={`${hubUi.panel} p-5`}>
          <h2 className="font-semibold">Responsáveis</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {task.assignees.length ? (
              task.assignees.map((item) => (
                <li key={item.member.id}>{item.member.name}</li>
              ))
            ) : (
              <li className="text-zinc-500">Sem responsável.</li>
            )}
          </ul>
        </section>
      </div>
      <section className={`${hubUi.panel} p-5`}>
        <h2 className="font-semibold">Checklist</h2>
        <ul className="mt-3 space-y-2">
          {task.checklistItems.map((item) => (
            <li key={item.id} className="flex gap-2 text-sm">
              <span aria-hidden>{item.isCompleted ? "✓" : "○"}</span>
              <span>{item.title}</span>
              <span className="sr-only">
                {item.isCompleted ? "Concluído" : "Pendente"}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className={`${hubUi.panel} p-5`}>
        <h2 className="font-semibold">Comentários</h2>
        <div className="mt-3 divide-y divide-zinc-100">
          {task.comments.map((item) => (
            <article key={item.id} className="py-3">
              <p className="text-sm font-medium">{item.author.name}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">
                {item.body}
              </p>
              <time className="mt-1 block text-xs text-zinc-500">
                {new Date(item.createdAt).toLocaleString("pt-BR")}
              </time>
            </article>
          ))}
        </div>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={async (event) => {
            event.preventDefault();
            await api(`/api/hub/tasks/${id}/comments`, {
              method: "POST",
              body: JSON.stringify({ body: comment }),
            });
            setComment("");
            await load();
          }}
        >
          <label className="sr-only" htmlFor="task-comment">
            Novo comentário
          </label>
          <textarea
            id="task-comment"
            required
            className={`${field} min-h-20`}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Escreva um comentário"
          />
          <button className={hubUi.primaryButton}>Comentar</button>
        </form>
      </section>
    </div>
  );
}

export function MyTasksPage() {
  const { data, error } = useLoad<{
    tasks: Array<{
      id: string;
      title: string;
      dueAt: string | null;
      completedAt: string | null;
      priority: string;
      board: { id: string; name: string };
    }>;
  }>("/api/hub/tasks?mine=true");
  const groups = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const week = new Date(now.getTime() + 7 * 86400000);
    const tasks = data?.tasks || [];
    return [
      {
        title: "Atrasadas",
        items: tasks.filter(
          (task) =>
            task.dueAt && !task.completedAt && task.dueAt.slice(0, 10) < today,
        ),
      },
      {
        title: "Vencem hoje",
        items: tasks.filter(
          (task) => task.dueAt?.slice(0, 10) === today && !task.completedAt,
        ),
      },
      {
        title: "Próximas",
        items: tasks.filter(
          (task) =>
            task.dueAt &&
            !task.completedAt &&
            task.dueAt.slice(0, 10) > today &&
            new Date(task.dueAt) <= week,
        ),
      },
      {
        title: "Sem prazo",
        items: tasks.filter((task) => !task.dueAt && !task.completedAt),
      },
      {
        title: "Concluídas recentemente",
        items: tasks.filter((task) => task.completedAt).slice(0, 20),
      },
    ];
  }, [data]);
  return (
    <div className={hubUi.page}>
      <Header
        title="Minhas tarefas"
        description="Prioridades acessíveis dos quadros em que você participa."
      />
      <Alert error={error} />
      <div className="grid gap-5 lg:grid-cols-2">
        {groups.map((group) => (
          <section key={group.title} className={`${hubUi.panel} p-5`}>
            <h2 className="font-semibold">{group.title}</h2>
            <div className="mt-3 divide-y divide-zinc-100">
              {group.items.length ? (
                group.items.map((task) => (
                  <Link
                    key={task.id}
                    href={`/hub/tarefas/${task.id}`}
                    className="flex justify-between gap-3 py-3 text-sm"
                  >
                    <span className="break-words font-medium">
                      {task.title}
                      <span className="mt-1 block text-xs font-normal text-zinc-500">
                        {task.board.name}
                      </span>
                    </span>
                    {task.completedAt ? (
                      <Check
                        className="h-4 w-4 text-zinc-600"
                        aria-label="Concluída"
                      />
                    ) : task.dueAt ? (
                      <time>
                        {new Date(task.dueAt).toLocaleDateString("pt-BR")}
                      </time>
                    ) : null}
                  </Link>
                ))
              ) : (
                <p className="py-4 text-sm text-zinc-500">Nenhuma tarefa.</p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
