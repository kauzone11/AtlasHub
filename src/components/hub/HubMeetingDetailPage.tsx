"use client";

import { ArrowDown, ArrowLeft, ArrowUp, Plus, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Alert,
  Header,
  api,
  field,
} from "@/components/hub/HubCollaborationPages";
import { hubUi } from "@/components/hub/styles";
import { HubSearchMultiSelect } from "@/components/hub/HubSearchMultiSelect";

type Capabilities = {
  canEdit: boolean;
  canSchedule: boolean;
  canCancel: boolean;
  canComplete: boolean;
  canRespond: boolean;
  canManageAgenda: boolean;
  canRecordAttendance: boolean;
  canRecordDecision: boolean;
  canCorrectMinutes: boolean;
};

type Participant = {
  memberId: string;
  responseStatus: string;
  attendanceStatus: string | null;
  member: { id: string; name: string };
};

type AgendaItem = {
  id?: string;
  title: string;
  description?: string | null;
  estimatedMinutes?: number | null;
  presenterMemberId?: string | null;
  presenter?: { id: string; name: string } | null;
};

type Meeting = {
  id: string;
  title: string;
  description: string | null;
  status: "DRAFT" | "SCHEDULED" | "COMPLETED" | "CANCELLED";
  startAt: string;
  endAt: string;
  timezone: string;
  location: string | null;
  meetingUrl: string | null;
  version: number;
  organizationWide: boolean;
  directorates: Array<{ id: string; name: string }>;
  externalGuests: Array<{ id: string; name: string; email?: string | null }>;
  cancelReason: string | null;
  minutes: string | null;
  participants: Participant[];
  agendaItems: AgendaItem[];
  decisions: Array<{
    id: string;
    title: string;
    description: string | null;
  }>;
  sourceTasks: Array<{ id: string; title: string; completedAt: string | null }>;
};

type Options = {
  memberId: string;
  timezone: string;
  role: string;
  members: Array<{ id: string; name: string; directorateId?: string | null }>;
  directorates: Array<{ id: string; name: string }>;
  boards: Array<{
    id: string;
    name: string;
    columns: Array<{ id: string; name: string }>;
  }>;
};

const labels: Record<string, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendada",
  COMPLETED: "Concluida",
  CANCELLED: "Cancelada",
  PENDING: "Pendente",
  ACCEPTED: "Aceita",
  DECLINED: "Recusada",
  TENTATIVE: "Talvez",
  ATTENDED: "Presente",
  ABSENT: "Ausente",
};

function localInput(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function HubMeetingDetailPage({ id }: { id: string }) {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    startLocal: "",
    endLocal: "",
    timezone: "",
    location: "",
    meetingUrl: "",
    directorateIds: [] as string[],
    participantIds: [] as string[],
    organizationWide: false,
    externalGuests: "",
  });
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [minutes, setMinutes] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [conflictReason, setConflictReason] = useState("");
  const [decision, setDecision] = useState("");
  const [attendance, setAttendance] = useState<
    Record<string, "ATTENDED" | "ABSENT">
  >({});
  const [actionTitle, setActionTitle] = useState("");
  const [actionBoardId, setActionBoardId] = useState("");
  const [actionEventId, setActionEventId] = useState(() => crypto.randomUUID());
  const [responseEventId, setResponseEventId] = useState(() =>
    crypto.randomUUID(),
  );

  async function load() {
    try {
      setError("");
      const [detail, optionData] = await Promise.all([
        api(`/api/hub/meetings/${id}`),
        api("/api/hub/collaboration/options"),
      ]);
      const next = detail.meeting as Meeting;
      setMeeting(next);
      setCapabilities(detail.capabilities as Capabilities);
      setOptions(optionData as Options);
      setForm({
        title: next.title,
        description: next.description || "",
        startLocal: localInput(next.startAt, next.timezone),
        endLocal: localInput(next.endAt, next.timezone),
        timezone: next.timezone,
        location: next.location || "",
        meetingUrl: next.meetingUrl || "",
        directorateIds: next.directorates.map((item) => item.id),
        participantIds: next.participants
          .filter(
            (item) =>
              item.memberId !== (optionData as Options).memberId &&
              !next.directorates.some(
                (directorate) =>
                  (optionData as Options).members.find(
                    (member) => member.id === item.memberId,
                  )?.directorateId === directorate.id,
              ),
          )
          .map((item) => item.memberId),
        organizationWide: next.organizationWide,
        externalGuests: next.externalGuests
          .map(
            (guest) => `${guest.name}${guest.email ? ` <${guest.email}>` : ""}`,
          )
          .join("\n"),
      });
      setAgenda(next.agendaItems);
      setMinutes(next.minutes || "");
      setAttendance(
        Object.fromEntries(
          next.participants
            .filter((item) => item.attendanceStatus)
            .map((item) => [item.memberId, item.attendanceStatus]),
        ) as Record<string, "ATTENDED" | "ABSENT">,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao carregar.");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function operation(work: () => Promise<void>, message: string) {
    try {
      setError("");
      setSuccess("");
      await work();
      setSuccess(message);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha na operacao.");
    }
  }

  if (!meeting || !capabilities)
    return (
      <div className={hubUi.page}>
        <Alert error={error} />
      </div>
    );

  return (
    <div className={hubUi.page}>
      <Header
        title={meeting.title}
        description={`${new Date(meeting.startAt).toLocaleString("pt-BR", { timeZone: meeting.timezone })} · ${labels[meeting.status]}`}
        action={
          <Link href="/hub/reunioes" className={hubUi.secondaryButton}>
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        }
      />
      <Alert error={error} success={success} />

      {meeting.status === "CANCELLED" ? (
        <section className={`${hubUi.panel} p-5`}>
          <h2 className="font-semibold">Reuniao cancelada</h2>
          <p className="mt-2 text-sm">
            {meeting.cancelReason || "Sem motivo informado."}
          </p>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {capabilities.canSchedule ? (
          <button
            className={hubUi.primaryButton}
            onClick={() =>
              operation(async () => {
                await api(`/api/hub/meetings/${id}/schedule`, {
                  method: "POST",
                  body: JSON.stringify({
                    confirmConflicts: Boolean(conflictReason),
                    overrideReason: conflictReason,
                  }),
                });
              }, "Rascunho agendado e convites enviados.")
            }
          >
            Agendar rascunho
          </button>
        ) : null}
        {capabilities.canComplete ? (
          <button
            disabled={meeting.participants.some(
              (item) => !attendance[item.memberId],
            )}
            title={
              meeting.participants.some((item) => !attendance[item.memberId])
                ? "Registre todas as presencas antes de concluir"
                : undefined
            }
            className={hubUi.primaryButton}
            onClick={() =>
              operation(async () => {
                await api(`/api/hub/meetings/${id}/complete`, {
                  method: "POST",
                  body: JSON.stringify({
                    attendance: meeting.participants.map((item) => ({
                      memberId: item.memberId,
                      status: attendance[item.memberId],
                    })),
                  }),
                });
              }, "Reuniao concluida.")
            }
          >
            Concluir reuniao
          </button>
        ) : null}
      </div>

      {capabilities.canCancel ? (
        <form
          className={`${hubUi.panel} flex flex-col gap-3 p-4 sm:flex-row`}
          onSubmit={(event) => {
            event.preventDefault();
            void operation(async () => {
              await api(`/api/hub/meetings/${id}/cancel`, {
                method: "POST",
                body: JSON.stringify({ reason: cancelReason }),
              });
            }, "Reuniao cancelada.");
          }}
        >
          <label className="flex-1 text-sm font-medium">
            Motivo do cancelamento
            <input
              required
              className={`${field} mt-1`}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
            />
          </label>
          <button className={`${hubUi.secondaryButton} self-end`}>
            Cancelar reuniao
          </button>
        </form>
      ) : null}

      {capabilities.canSchedule || capabilities.canEdit ? (
        <label className="block text-sm font-medium">
          Motivo para confirmar conflitos conhecidos (opcional)
          <input
            className={`${field} mt-1`}
            value={conflictReason}
            onChange={(event) => setConflictReason(event.target.value)}
          />
        </label>
      ) : null}

      {capabilities.canRespond ? (
        <section className={`${hubUi.panel} p-5`}>
          <h2 className="font-semibold">Sua resposta</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              ["ACCEPTED", "Aceitar"],
              ["TENTATIVE", "Talvez"],
              ["DECLINED", "Recusar"],
            ].map(([status, label]) => (
              <button
                key={status}
                className={hubUi.secondaryButton}
                onClick={() =>
                  operation(async () => {
                    await api(`/api/hub/meetings/${id}/respond`, {
                      method: "POST",
                      body: JSON.stringify({
                        status,
                        eventId: responseEventId,
                      }),
                    });
                    setResponseEventId(crypto.randomUUID());
                  }, "Resposta registrada.")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {capabilities.canEdit ? (
        <form
          className={`${hubUi.panel} grid gap-4 p-5`}
          onSubmit={(event) => {
            event.preventDefault();
            void operation(async () => {
              await api(`/api/hub/meetings/${id}/audience`, {
                method: "PUT",
                body: JSON.stringify({
                  version: meeting.version,
                  organizationWide: form.organizationWide,
                  directorateIds: form.directorateIds,
                  participantIds: form.participantIds,
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
                }),
              });
              await api(`/api/hub/meetings/${id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  title: form.title,
                  description: form.description,
                  startLocal: form.startLocal,
                  endLocal: form.endLocal,
                  timezone: form.timezone,
                  location: form.location,
                  meetingUrl: form.meetingUrl,
                  confirmConflicts: Boolean(conflictReason),
                  overrideReason: conflictReason,
                }),
              });
            }, "Reuniao atualizada.");
          }}
        >
          <h2 className="font-semibold">Editar reuniao</h2>
          <label className="text-sm font-medium">
            Titulo
            <input
              required
              className={`${field} mt-1`}
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
            />
          </label>
          <label className="text-sm font-medium">
            Descricao
            <textarea
              className={`${field} mt-1 min-h-24`}
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Inicio local
              <input
                required
                type="datetime-local"
                className={`${field} mt-1`}
                value={form.startLocal}
                onChange={(event) =>
                  setForm({ ...form, startLocal: event.target.value })
                }
              />
            </label>
            <label className="text-sm font-medium">
              Fim local
              <input
                required
                type="datetime-local"
                className={`${field} mt-1`}
                value={form.endLocal}
                onChange={(event) =>
                  setForm({ ...form, endLocal: event.target.value })
                }
              />
            </label>
          </div>
          <label className="text-sm font-medium">
            Fuso IANA
            <input
              required
              className={`${field} mt-1`}
              value={form.timezone}
              onChange={(event) =>
                setForm({ ...form, timezone: event.target.value })
              }
            />
            <span className="mt-1 block text-xs font-normal text-zinc-500">
              Os horarios sao interpretados neste fuso, nao no fuso do
              navegador.
            </span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Local
              <input
                className={`${field} mt-1`}
                value={form.location}
                onChange={(event) =>
                  setForm({ ...form, location: event.target.value })
                }
              />
            </label>
            <label className="text-sm font-medium">
              URL HTTPS
              <input
                type="url"
                className={`${field} mt-1`}
                value={form.meetingUrl}
                onChange={(event) =>
                  setForm({ ...form, meetingUrl: event.target.value })
                }
              />
            </label>
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-zinc-200 p-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.organizationWide}
              onChange={(event) =>
                setForm({ ...form, organizationWide: event.target.checked })
              }
            />
            Toda a EJ
          </label>
          <HubSearchMultiSelect
            label="Diretorias convidadas"
            options={(options?.directorates || []).map((directorate) => ({
              id: directorate.id,
              label: directorate.name,
            }))}
            value={form.directorateIds}
            onChange={(directorateIds) => setForm({ ...form, directorateIds })}
          />
          <HubSearchMultiSelect
            label="Pessoas convidadas"
            options={(options?.members || []).map((member) => ({
              id: member.id,
              label: member.name,
            }))}
            value={form.participantIds}
            onChange={(participantIds) => setForm({ ...form, participantIds })}
          />
          <label className="text-sm font-medium">
            Convidados externos{" "}
            <span className="font-normal text-zinc-500">
              (um por linha: Nome &lt;email&gt;)
            </span>
            <textarea
              className={`${field} mt-1 min-h-20`}
              value={form.externalGuests}
              onChange={(event) =>
                setForm({ ...form, externalGuests: event.target.value })
              }
            />
          </label>
          <button className={hubUi.primaryButton}>
            <Save className="h-4 w-4" />
            Salvar alteracoes
          </button>
        </form>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${hubUi.panel} p-5`}>
          <h2 className="font-semibold">Participantes e presenca</h2>
          <ul className="mt-3 space-y-3">
            {meeting.participants.map((item) => (
              <li
                key={item.memberId}
                className="grid gap-2 text-sm sm:grid-cols-[1fr_auto]"
              >
                <span>
                  {item.member.name} ·{" "}
                  {labels[item.responseStatus] || item.responseStatus}
                </span>
                {capabilities.canRecordAttendance ? (
                  <select
                    aria-label={`Presenca de ${item.member.name}`}
                    className={field}
                    value={attendance[item.memberId] || ""}
                    onChange={(event) =>
                      setAttendance({
                        ...attendance,
                        [item.memberId]: event.target.value as
                          "ATTENDED" | "ABSENT",
                      })
                    }
                  >
                    <option value="">Selecione</option>
                    <option value="ATTENDED">Presente</option>
                    <option value="ABSENT">Ausente</option>
                  </select>
                ) : (
                  <span>
                    {labels[item.attendanceStatus || ""] || "Nao registrada"}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {capabilities.canRecordAttendance ? (
            <button
              className={`${hubUi.secondaryButton} mt-4`}
              onClick={() =>
                operation(async () => {
                  await api(`/api/hub/meetings/${id}/attendance`, {
                    method: "PUT",
                    body: JSON.stringify({
                      attendance: Object.entries(attendance).map(
                        ([memberId, status]) => ({ memberId, status }),
                      ),
                    }),
                  });
                }, "Presencas salvas.")
              }
            >
              Salvar presencas
            </button>
          ) : null}
        </section>
        <section className={`${hubUi.panel} p-5`}>
          <h2 className="font-semibold">Pauta</h2>
          <div className="mt-3 space-y-3">
            {agenda.map((item, index) => (
              <div
                key={item.id || index}
                className="rounded-xl border border-zinc-200 p-3"
              >
                <input
                  disabled={!capabilities.canManageAgenda}
                  aria-label={`Titulo do item ${index + 1}`}
                  className={field}
                  value={item.title}
                  onChange={(event) =>
                    setAgenda(
                      agenda.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, title: event.target.value }
                          : row,
                      ),
                    )
                  }
                />
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input
                    disabled={!capabilities.canManageAgenda}
                    type="number"
                    min={1}
                    max={1440}
                    aria-label={`Duracao do item ${index + 1}`}
                    className={field}
                    value={item.estimatedMinutes || ""}
                    onChange={(event) =>
                      setAgenda(
                        agenda.map((row, rowIndex) =>
                          rowIndex === index
                            ? {
                                ...row,
                                estimatedMinutes:
                                  Number(event.target.value) || null,
                              }
                            : row,
                        ),
                      )
                    }
                  />
                  <select
                    disabled={!capabilities.canManageAgenda}
                    aria-label={`Apresentador do item ${index + 1}`}
                    className={field}
                    value={item.presenterMemberId || ""}
                    onChange={(event) =>
                      setAgenda(
                        agenda.map((row, rowIndex) =>
                          rowIndex === index
                            ? {
                                ...row,
                                presenterMemberId: event.target.value || null,
                              }
                            : row,
                        ),
                      )
                    }
                  >
                    <option value="">Sem apresentador</option>
                    {options?.members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>
                {capabilities.canManageAgenda ? (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      aria-label="Mover item para cima"
                      disabled={!index}
                      className={hubUi.secondaryButton}
                      onClick={() => {
                        const next = [...agenda];
                        [next[index - 1], next[index]] = [
                          next[index],
                          next[index - 1],
                        ];
                        setAgenda(next);
                      }}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Mover item para baixo"
                      disabled={index === agenda.length - 1}
                      className={hubUi.secondaryButton}
                      onClick={() => {
                        const next = [...agenda];
                        [next[index + 1], next[index]] = [
                          next[index],
                          next[index + 1],
                        ];
                        setAgenda(next);
                      }}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={hubUi.secondaryButton}
                      onClick={() =>
                        setAgenda(
                          agenda.filter((_, rowIndex) => rowIndex !== index),
                        )
                      }
                    >
                      Remover
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-zinc-500">
                    {item.presenter?.name || "Sem apresentador"} ·{" "}
                    {item.estimatedMinutes
                      ? `${item.estimatedMinutes} min`
                      : "Sem duracao"}
                  </p>
                )}
              </div>
            ))}
          </div>
          {capabilities.canManageAgenda ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={hubUi.secondaryButton}
                onClick={() => setAgenda([...agenda, { title: "" }])}
              >
                <Plus className="h-4 w-4" />
                Adicionar item
              </button>
              <button
                className={hubUi.primaryButton}
                onClick={() =>
                  operation(async () => {
                    await api(`/api/hub/meetings/${id}/agenda`, {
                      method: "PUT",
                      body: JSON.stringify({ items: agenda }),
                    });
                  }, "Pauta salva.")
                }
              >
                Salvar pauta
              </button>
            </div>
          ) : null}
        </section>
      </div>

      {capabilities.canEdit ||
      capabilities.canCorrectMinutes ||
      meeting.minutes ? (
        <section className={`${hubUi.panel} p-5`}>
          <h2 className="font-semibold">Ata</h2>
          <textarea
            disabled={!capabilities.canEdit && !capabilities.canCorrectMinutes}
            className={`${field} mt-3 min-h-40`}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
          {capabilities.canCorrectMinutes ? (
            <label className="mt-3 block text-sm font-medium">
              Motivo da correcao
              <input
                required
                className={`${field} mt-1`}
                value={correctionReason}
                onChange={(event) => setCorrectionReason(event.target.value)}
              />
            </label>
          ) : null}
          {capabilities.canEdit || capabilities.canCorrectMinutes ? (
            <button
              className={`${hubUi.primaryButton} mt-3`}
              onClick={() =>
                operation(async () => {
                  await api(`/api/hub/meetings/${id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                      minutes,
                      ...(capabilities.canCorrectMinutes
                        ? { correctionReason }
                        : {}),
                    }),
                  });
                }, "Ata salva.")
              }
            >
              <Save className="h-4 w-4" />
              Salvar ata
            </button>
          ) : null}
        </section>
      ) : null}

      <section className={`${hubUi.panel} p-5`}>
        <h2 className="font-semibold">Decisoes</h2>
        <div className="mt-3 space-y-2">
          {meeting.decisions.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-zinc-200 p-3"
            >
              <h3 className="font-medium">{item.title}</h3>
              {item.description ? (
                <p className="mt-1 text-sm">{item.description}</p>
              ) : null}
            </article>
          ))}
        </div>
        {capabilities.canRecordDecision ? (
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void operation(async () => {
                await api(`/api/hub/meetings/${id}/decisions`, {
                  method: "POST",
                  body: JSON.stringify({ title: decision }),
                });
                setDecision("");
              }, "Decisao registrada.");
            }}
          >
            <input
              required
              className={field}
              value={decision}
              onChange={(event) => setDecision(event.target.value)}
              placeholder="Registrar decisao"
            />
            <button className={hubUi.primaryButton}>Adicionar</button>
          </form>
        ) : null}
      </section>

      <section className={`${hubUi.panel} p-5`}>
        <h2 className="font-semibold">Tarefas vinculadas</h2>
        {meeting.sourceTasks.length ? (
          meeting.sourceTasks.map((task) => (
            <Link
              key={task.id}
              href={`/hub/tarefas/${task.id}`}
              className="mt-2 block text-sm underline"
            >
              {task.title} {task.completedAt ? "(concluida)" : ""}
            </Link>
          ))
        ) : (
          <p className="mt-2 text-sm text-zinc-500">
            Nenhuma tarefa vinculada.
          </p>
        )}
        {options?.boards.length &&
        options.role !== "VIEWER" &&
        ["DRAFT", "SCHEDULED"].includes(meeting.status) ? (
          <form
            className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              void operation(async () => {
                const board = options.boards.find(
                  (item) => item.id === actionBoardId,
                );
                if (!board?.columns[0])
                  throw new Error("Selecione um quadro valido.");
                await api("/api/hub/tasks", {
                  method: "POST",
                  body: JSON.stringify({
                    boardId: board.id,
                    columnId: board.columns[0].id,
                    sourceMeetingId: id,
                    title: actionTitle,
                    priority: "NORMAL",
                    assigneeIds: [],
                    idempotencyKey: actionEventId,
                  }),
                });
                setActionTitle("");
                setActionEventId(crypto.randomUUID());
              }, "Tarefa de acao criada.");
            }}
          >
            <label className="text-sm font-medium">
              Acao
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
        ) : null}
      </section>
    </div>
  );
}
