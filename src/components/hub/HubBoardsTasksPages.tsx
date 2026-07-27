"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Header, api, field } from "@/components/hub/HubCollaborationPages";
import { hubUi } from "@/components/hub/styles";

type TaskCapabilities = {
  canEdit: boolean;
  canAssign: boolean;
  canArchive: boolean;
  canMove: boolean;
  canComment: boolean;
};
type BoardCapabilities = {
  canEdit: boolean;
  canArchive: boolean;
  canCreateTask: boolean;
  canManageColumns: boolean;
};
type TaskCard = {
  id: string;
  title: string;
  priority: string;
  dueAt: string | null;
  version: number;
  completedAt: string | null;
  assignees: Array<{ member: { id: string; name: string } }>;
  capabilities: TaskCapabilities;
};
type Column = {
  id: string;
  name: string;
  order: number;
  isDoneColumn: boolean;
  tasks: TaskCard[];
};
type Board = {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  isArchived: boolean;
  directorate?: { id: string; name: string } | null;
  _count?: { tasks: number };
  columns?: Column[];
  capabilities?: BoardCapabilities;
};
type Options = {
  timezone: string;
  role: string;
  members: Array<{ id: string; name: string }>;
};

function localInput(iso: string | null, timezone: string) {
  if (!iso) return "";
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

export function HubBoardsPage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [creation, setCreation] = useState<{
    canCreateOrganization: boolean;
    canViewArchived: boolean;
    directorates: Array<{ id: string; name: string }>;
  } | null>(null);
  const [archived, setArchived] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<"ORGANIZATION" | "DIRECTORATE">("ORGANIZATION");
  const [directorateId, setDirectorateId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    try {
      setError("");
      const data = await api(`/api/hub/boards?archived=${archived}`);
      setBoards(data.boards);
      setCreation(data.creation);
      if (!data.creation.canCreateOrganization && data.creation.directorates[0]) {
        setScope("DIRECTORATE");
        setDirectorateId(data.creation.directorates[0].id);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao carregar.");
    }
  }
  // A carga e intencionalmente reexecutada apenas quando o filtro muda.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [archived]);

  const canCreate = Boolean(
    creation?.canCreateOrganization || creation?.directorates.length,
  );
  return <div className={hubUi.page}>
    <Header title="Quadros" description="Quadros da organizacao e das diretorias em que voce pode atuar." />
    <Alert error={error} success={success} />
    {creation?.canViewArchived ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={archived} onChange={(event) => setArchived(event.target.checked)} />Mostrar somente quadros arquivados</label> : null}
    {canCreate && !archived ? <form className={`${hubUi.panel} grid gap-3 p-4 md:grid-cols-2`} onSubmit={(event) => { event.preventDefault(); void (async () => { try { setError(""); await api("/api/hub/boards", { method: "POST", body: JSON.stringify({ name, description, scope, directorateId: scope === "DIRECTORATE" ? directorateId : null }) }); setName(""); setDescription(""); setSuccess("Quadro criado."); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao criar."); } })(); }}>
      <label className="text-sm font-medium">Nome<input required className={`${field} mt-1`} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="text-sm font-medium">Descricao<input className={`${field} mt-1`} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <label className="text-sm font-medium">Escopo<select className={`${field} mt-1`} value={scope} onChange={(event) => setScope(event.target.value as "ORGANIZATION" | "DIRECTORATE")}><option value="ORGANIZATION" disabled={!creation?.canCreateOrganization}>Organizacao</option><option value="DIRECTORATE" disabled={!creation?.directorates.length}>Diretoria</option></select></label>
      {scope === "DIRECTORATE" ? <label className="text-sm font-medium">Diretoria<select required className={`${field} mt-1`} value={directorateId} onChange={(event) => setDirectorateId(event.target.value)}><option value="">Selecione</option>{creation?.directorates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
      <button className={hubUi.primaryButton}><Plus className="h-4 w-4" />Criar quadro</button>
    </form> : null}
    <div className="grid gap-4 md:grid-cols-2">{boards.map((board) => <Link key={board.id} href={`/hub/quadros/${board.id}`} className={`${hubUi.panel} p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black`}><h2 className="font-semibold">{board.name}</h2><p className="mt-2 text-sm text-zinc-500">{board.directorate?.name || "Organizacao"} · {board._count?.tasks || 0} tarefas{board.isArchived ? " · Arquivado" : ""}</p></Link>)}</div>
  </div>;
}

export function HubBoardDetailPage({ id }: { id: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [capabilities, setCapabilities] = useState<BoardCapabilities | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [boardName, setBoardName] = useState("");
  const [newColumn, setNewColumn] = useState("");
  const [replacementDone, setReplacementDone] = useState("");
  const [task, setTask] = useState({ title: "", description: "", priority: "NORMAL", dueLocal: "", assigneeIds: [] as string[] });
  const [taskEventId, setTaskEventId] = useState(() => crypto.randomUUID());

  async function load() {
    try {
      setError("");
      const [data, opts] = await Promise.all([api(`/api/hub/boards/${id}`), api("/api/hub/collaboration/options")]);
      setBoard(data.board);
      setCapabilities(data.capabilities);
      setOptions(opts);
      setBoardName(data.board.name);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao carregar."); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [id]);
  async function operation(work: () => Promise<void>, message: string) { try { setError(""); setSuccess(""); await work(); setSuccess(message); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha na operacao."); } }
  if (!board || !capabilities) return <div className={hubUi.page}><Alert error={error} /></div>;
  const columns = board.columns || [];
  async function columnsAction(payload: Record<string, unknown>) { await api(`/api/hub/boards/${id}/columns`, { method: "PUT", body: JSON.stringify(payload) }); }
  async function move(taskRow: TaskCard, columnId: string) { await operation(async () => { await api(`/api/hub/tasks/${taskRow.id}/move`, { method: "POST", body: JSON.stringify({ columnId, version: taskRow.version }) }); }, "Tarefa movida."); }
  return <div className={hubUi.page}>
    <Header title={board.name} description={board.description || "Quadro de trabalho"} action={<Link href="/hub/quadros" className={hubUi.secondaryButton}><ArrowLeft className="h-4 w-4" />Quadros</Link>} />
    <Alert error={error} success={success} />
    {capabilities.canEdit ? <section className={`${hubUi.panel} grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto]`}><label className="text-sm font-medium">Nome do quadro<input className={`${field} mt-1`} value={boardName} onChange={(event) => setBoardName(event.target.value)} /></label><button className={`${hubUi.primaryButton} self-end`} onClick={() => operation(async () => { await api(`/api/hub/boards/${id}`, { method: "PATCH", body: JSON.stringify({ name: boardName }) }); }, "Quadro renomeado.")}><Save className="h-4 w-4" />Salvar</button>{capabilities.canArchive ? <button className={`${hubUi.secondaryButton} self-end`} onClick={() => operation(async () => { await api(`/api/hub/boards/${id}`, { method: "PATCH", body: JSON.stringify({ isArchived: true }) }); }, "Quadro arquivado.")}>Arquivar</button> : null}</section> : null}
    {capabilities.canManageColumns ? <section className={`${hubUi.panel} p-4`}><h2 className="font-semibold">Estrutura do quadro</h2><form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void operation(async () => { await columnsAction({ action: "add", name: newColumn }); setNewColumn(""); }, "Coluna adicionada."); }}><input required className={field} value={newColumn} onChange={(event) => setNewColumn(event.target.value)} placeholder="Nova coluna" /><button className={hubUi.primaryButton}>Adicionar</button></form><label className="mt-3 block text-sm font-medium">Substituta para coluna de conclusao arquivada<select className={`${field} mt-1`} value={replacementDone} onChange={(event) => setReplacementDone(event.target.value)}><option value="">Selecione quando necessario</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label><div className="mt-3 space-y-2">{columns.map((column, index) => <div key={column.id} className="grid gap-2 rounded-xl border border-zinc-200 p-3 sm:grid-cols-[1fr_auto]"><input aria-label={`Nome da coluna ${column.name}`} className={field} defaultValue={column.name} onBlur={(event) => { if (event.target.value !== column.name) void operation(() => columnsAction({ action: "rename", columnId: column.id, name: event.target.value }), "Coluna renomeada."); }} /><div className="flex flex-wrap gap-2"><button aria-label="Mover coluna para esquerda" disabled={!index} className={hubUi.secondaryButton} onClick={() => { const ids = columns.map((item) => item.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; void operation(() => columnsAction({ action: "reorder", columnIds: ids }), "Colunas reordenadas."); }}><ArrowLeft className="h-4 w-4" /></button><button aria-label="Mover coluna para direita" disabled={index === columns.length - 1} className={hubUi.secondaryButton} onClick={() => { const ids = columns.map((item) => item.id); [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]]; void operation(() => columnsAction({ action: "reorder", columnIds: ids }), "Colunas reordenadas."); }}><ArrowRight className="h-4 w-4" /></button><button className={column.isDoneColumn ? hubUi.primaryButton : hubUi.secondaryButton} onClick={() => operation(() => columnsAction({ action: "done", columnId: column.id }), "Coluna de conclusao atualizada.")}>Concluida</button><button className={hubUi.secondaryButton} onClick={() => operation(() => columnsAction({ action: "archive", columnId: column.id, replacementDoneColumnId: replacementDone }), "Coluna arquivada.")}>Arquivar</button></div></div>)}</div></section> : null}
    {capabilities.canCreateTask && columns[0] ? <form className={`${hubUi.panel} grid gap-3 p-4 sm:grid-cols-2`} onSubmit={(event) => { event.preventDefault(); void operation(async () => { await api("/api/hub/tasks", { method: "POST", body: JSON.stringify({ ...task, boardId: id, columnId: columns[0].id, timezone: options?.timezone, idempotencyKey: taskEventId }) }); setTask({ title: "", description: "", priority: "NORMAL", dueLocal: "", assigneeIds: [] }); setTaskEventId(crypto.randomUUID()); }, "Tarefa criada."); }}><h2 className="font-semibold sm:col-span-2">Nova tarefa</h2><label className="text-sm font-medium">Titulo<input required className={`${field} mt-1`} value={task.title} onChange={(event) => setTask({ ...task, title: event.target.value })} /></label><label className="text-sm font-medium">Prioridade<select className={`${field} mt-1`} value={task.priority} onChange={(event) => setTask({ ...task, priority: event.target.value })}>{["LOW", "NORMAL", "HIGH", "URGENT"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm font-medium">Descricao<textarea className={`${field} mt-1`} value={task.description} onChange={(event) => setTask({ ...task, description: event.target.value })} /></label><label className="text-sm font-medium">Prazo em {options?.timezone}<input type="datetime-local" className={`${field} mt-1`} value={task.dueLocal} onChange={(event) => setTask({ ...task, dueLocal: event.target.value })} /></label><fieldset className="sm:col-span-2"><legend className="text-sm font-medium">Responsaveis</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{options?.members.map((member) => <label key={member.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={task.assigneeIds.includes(member.id)} onChange={(event) => setTask({ ...task, assigneeIds: event.target.checked ? [...task.assigneeIds, member.id] : task.assigneeIds.filter((id) => id !== member.id) })} />{member.name}</label>)}</div></fieldset><button className={hubUi.primaryButton}><Plus className="h-4 w-4" />Criar tarefa</button></form> : null}
    <div className="hidden min-w-0 gap-4 overflow-x-auto pb-3 md:flex">{columns.map((column, columnIndex) => <section key={column.id} className="w-80 shrink-0 rounded-2xl bg-zinc-200/70 p-3"><h2 className="flex justify-between text-sm font-semibold"><span>{column.name}{column.isDoneColumn ? " · Concluidas" : ""}</span><span>{column.tasks.length}</span></h2><div className="mt-3 space-y-3">{column.tasks.map((taskRow) => <BoardTaskCard key={taskRow.id} task={taskRow} onLeft={columnIndex && taskRow.capabilities.canMove ? () => move(taskRow, columns[columnIndex - 1].id) : undefined} onRight={columnIndex < columns.length - 1 && taskRow.capabilities.canMove ? () => move(taskRow, columns[columnIndex + 1].id) : undefined} timezone={options?.timezone || "UTC"} />)}</div></section>)}</div>
    <div className="space-y-4 md:hidden">{columns.map((column, columnIndex) => <section key={column.id} className={`${hubUi.panel} p-4`}><h2 className="font-semibold">{column.name} ({column.tasks.length})</h2><div className="mt-3 space-y-3">{column.tasks.map((taskRow) => <BoardTaskCard key={taskRow.id} task={taskRow} onLeft={columnIndex && taskRow.capabilities.canMove ? () => move(taskRow, columns[columnIndex - 1].id) : undefined} onRight={columnIndex < columns.length - 1 && taskRow.capabilities.canMove ? () => move(taskRow, columns[columnIndex + 1].id) : undefined} timezone={options?.timezone || "UTC"} />)}</div></section>)}</div>
  </div>;
}

function BoardTaskCard({ task, onLeft, onRight, timezone }: { task: TaskCard; onLeft?: () => void; onRight?: () => void; timezone: string }) {
  return <article className="rounded-xl border border-zinc-200 bg-white p-3"><Link href={`/hub/tarefas/${task.id}`} className="font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black">{task.title}</Link><p className="mt-2 text-xs text-zinc-500">{task.priority}{task.dueAt ? ` · ${new Date(task.dueAt).toLocaleString("pt-BR", { timeZone: timezone })}` : ""}</p>{task.capabilities.canMove ? <div className="mt-3 flex gap-2"><button aria-label={`Mover ${task.title} para coluna anterior`} disabled={!onLeft} className={hubUi.secondaryButton} onClick={onLeft}><ArrowLeft className="h-4 w-4" /></button><button aria-label={`Mover ${task.title} para proxima coluna`} disabled={!onRight} className={hubUi.secondaryButton} onClick={onRight}><ArrowRight className="h-4 w-4" /></button></div> : null}</article>;
}

type TaskDetail = {
  id: string; title: string; description: string | null; priority: string;
  dueAt: string | null; version: number; completedAt: string | null; archivedAt: string | null;
  createdAt: string; updatedAt: string;
  board: { id: string; name: string; columns: Array<{ id: string; name: string; isDoneColumn: boolean }> };
  column: { id: string; name: string };
  sourceMeeting: { id: string; title: string } | null;
  assignees: Array<{ member: { id: string; name: string } }>;
  comments: Array<{ id: string; body: string; createdAt: string; author: { name: string } }>;
  checklistItems: Array<{ id: string; title: string; isCompleted: boolean }>;
};

export function HubTaskDetailPage({ id }: { id: string }) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [capabilities, setCapabilities] = useState<TaskCapabilities | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [form, setForm] = useState({ title: "", description: "", priority: "NORMAL", dueLocal: "", assigneeIds: [] as string[] });
  const [checklist, setChecklist] = useState<Array<{ title: string; isCompleted: boolean }>>([]);
  const [comment, setComment] = useState(""); const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  async function load() { try { setError(""); const [data, opts] = await Promise.all([api(`/api/hub/tasks/${id}`), api("/api/hub/collaboration/options")]); setTask(data.task); setCapabilities(data.capabilities); setOptions(opts); setForm({ title: data.task.title, description: data.task.description || "", priority: data.task.priority, dueLocal: localInput(data.task.dueAt, opts.timezone), assigneeIds: data.task.assignees.map((item: { member: { id: string } }) => item.member.id) }); setChecklist(data.task.checklistItems.map((item: { title: string; isCompleted: boolean }) => ({ title: item.title, isCompleted: item.isCompleted }))); } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao carregar."); } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [id]);
  async function operation(work: () => Promise<void>, message: string) { try { setError(""); setSuccess(""); await work(); setSuccess(message); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha na operacao."); } }
  if (!task || !capabilities) return <div className={hubUi.page}><Alert error={error} /></div>;
  const done = task.board.columns.find((column) => column.isDoneColumn); const reopen = task.board.columns.find((column) => !column.isDoneColumn);
  return <div className={hubUi.page}><Header title={task.title} description={`${task.board.name} · ${task.column.name}`} action={<Link href={`/hub/quadros/${task.board.id}`} className={hubUi.secondaryButton}><ArrowLeft className="h-4 w-4" />Voltar ao quadro</Link>} /><Alert error={error} success={success} />
    {capabilities.canEdit ? <form className={`${hubUi.panel} grid gap-3 p-5 sm:grid-cols-2`} onSubmit={(event) => { event.preventDefault(); void operation(async () => { await api(`/api/hub/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ version: task.version, title: form.title, description: form.description, ...(capabilities.canAssign ? { priority: form.priority, dueLocal: form.dueLocal || null, timezone: options?.timezone, assigneeIds: form.assigneeIds } : {}) }) }); }, "Tarefa atualizada."); }}><h2 className="font-semibold sm:col-span-2">Editar tarefa</h2><label className="text-sm font-medium">Titulo<input required className={`${field} mt-1`} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className="text-sm font-medium">Descricao<textarea className={`${field} mt-1`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>{capabilities.canAssign ? <><label className="text-sm font-medium">Prioridade<select className={`${field} mt-1`} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{["LOW", "NORMAL", "HIGH", "URGENT"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm font-medium">Prazo em {options?.timezone}<input type="datetime-local" className={`${field} mt-1`} value={form.dueLocal} onChange={(event) => setForm({ ...form, dueLocal: event.target.value })} /></label><fieldset className="sm:col-span-2"><legend className="text-sm font-medium">Responsaveis</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{options?.members.map((member) => <label key={member.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.assigneeIds.includes(member.id)} onChange={(event) => setForm({ ...form, assigneeIds: event.target.checked ? [...form.assigneeIds, member.id] : form.assigneeIds.filter((item) => item !== member.id) })} />{member.name}</label>)}</div></fieldset></> : null}<button className={hubUi.primaryButton}><Save className="h-4 w-4" />Salvar</button></form> : null}
    <section className={`${hubUi.panel} p-5`}><h2 className="font-semibold">Estado</h2><p className="mt-2 text-sm">Prioridade {task.priority} · {task.dueAt ? new Date(task.dueAt).toLocaleString("pt-BR", { timeZone: options?.timezone }) : "Sem prazo"}</p>{task.sourceMeeting ? <Link href={`/hub/reunioes/${task.sourceMeeting.id}`} className="mt-3 block text-sm underline">Reuniao de origem: {task.sourceMeeting.title}</Link> : null}<div className="mt-3 flex flex-wrap gap-2">{capabilities.canMove && done && !task.completedAt ? <button className={hubUi.primaryButton} onClick={() => operation(async () => { await api(`/api/hub/tasks/${id}/move`, { method: "POST", body: JSON.stringify({ columnId: done.id, version: task.version }) }); }, "Tarefa concluida.")}>Concluir</button> : null}{capabilities.canMove && reopen && task.completedAt ? <button className={hubUi.secondaryButton} onClick={() => operation(async () => { await api(`/api/hub/tasks/${id}/move`, { method: "POST", body: JSON.stringify({ columnId: reopen.id, version: task.version }) }); }, "Tarefa reaberta.")}>Reabrir</button> : null}{capabilities.canArchive ? <button className={hubUi.secondaryButton} onClick={() => operation(async () => { await api(`/api/hub/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ version: task.version, archive: true }) }); }, "Tarefa arquivada.")}>Arquivar</button> : null}</div></section>
    {capabilities.canEdit ? <section className={`${hubUi.panel} p-5`}><h2 className="font-semibold">Checklist</h2><div className="mt-3 space-y-2">{checklist.map((item, index) => <div key={index} className="grid gap-2 sm:grid-cols-[auto_1fr_auto]"><input aria-label={`Concluir item ${index + 1}`} type="checkbox" checked={item.isCompleted} onChange={(event) => setChecklist(checklist.map((row, rowIndex) => rowIndex === index ? { ...row, isCompleted: event.target.checked } : row))} /><input aria-label={`Texto do item ${index + 1}`} className={field} value={item.title} onChange={(event) => setChecklist(checklist.map((row, rowIndex) => rowIndex === index ? { ...row, title: event.target.value } : row))} /><div className="flex gap-1"><button aria-label="Mover item para cima" disabled={!index} className={hubUi.secondaryButton} onClick={() => { const next = [...checklist]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setChecklist(next); }}><ArrowUp className="h-4 w-4" /></button><button aria-label="Mover item para baixo" disabled={index === checklist.length - 1} className={hubUi.secondaryButton} onClick={() => { const next = [...checklist]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setChecklist(next); }}><ArrowDown className="h-4 w-4" /></button></div></div>)}</div><div className="mt-3 flex gap-2"><button className={hubUi.secondaryButton} onClick={() => setChecklist([...checklist, { title: "", isCompleted: false }])}><Plus className="h-4 w-4" />Adicionar item</button><button className={hubUi.primaryButton} onClick={() => operation(async () => { await api(`/api/hub/tasks/${id}/checklist`, { method: "PUT", body: JSON.stringify({ version: task.version, items: checklist }) }); }, "Checklist salvo.")}>Salvar checklist</button></div></section> : null}
    <section className={`${hubUi.panel} p-5`}><h2 className="font-semibold">Comentarios</h2><div className="mt-3 divide-y divide-zinc-100">{task.comments.map((item) => <article key={item.id} className="py-3 text-sm"><strong>{item.author.name}</strong><p className="mt-1 whitespace-pre-wrap">{item.body}</p><time className="mt-1 block text-xs text-zinc-500">{new Date(item.createdAt).toLocaleString("pt-BR", { timeZone: options?.timezone })}</time></article>)}</div>{capabilities.canComment ? <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void operation(async () => { await api(`/api/hub/tasks/${id}/comments`, { method: "POST", body: JSON.stringify({ body: comment }) }); setComment(""); }, "Comentario publicado."); }}><textarea required aria-label="Novo comentario" className={`${field} min-h-20`} value={comment} onChange={(event) => setComment(event.target.value)} /><button className={hubUi.primaryButton}>Comentar</button></form> : null}</section>
  </div>;
}
