"use client";

import {
  Archive,
  ArrowLeft,
  CalendarDays,
  FolderKanban,
  Plus,
  RotateCcw,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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
import { requestHubConfirmation } from "@/components/hub/HubDialog";

type Directorate = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  director: { id: string; name: string } | null;
  memberCount: number;
  activeProjects: number;
  pendingTasks: number;
  nextMeeting: { id: string; title: string; startAt: string } | null;
  status: "ACTIVE" | "ARCHIVED";
  version: number;
  capabilities: { canEdit: boolean };
};
type Detail = Directorate & {
  members: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
  }>;
  primaryProjects: Array<{
    id: string;
    title: string;
    status: string;
    progress: number;
    deadline: string | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    dueAt: string | null;
    completedAt: string | null;
  }>;
  meetings: Array<{
    id: string;
    title: string;
    startAt: string;
    status: string;
  }>;
  capabilities: { canEdit: boolean; canDelete: boolean };
};

export function HubDirectoratesPage() {
  const options = useCoreOptions();
  const state = useCoreLoad(
    async () =>
      (
        await coreApi<{ directorates: Directorate[] }>(
          "/api/hub/directorates?archived=true",
        )
      ).directorates,
    [],
  );
  const [open, setOpen] = useState(false);
  const [archived, setArchived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    icon: "",
    directorId: "",
    memberIds: [] as string[],
  });
  async function create(event: React.FormEvent) {
    event.preventDefault();
    try {
      setSaving(true);
      state.setError("");
      await coreApi("/api/hub/directorates", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setOpen(false);
      setForm({
        name: "",
        description: "",
        icon: "",
        directorId: "",
        memberIds: [],
      });
      await state.refresh();
    } catch (reason) {
      state.setError(
        reason instanceof Error ? reason.message : "Não foi possível criar.",
      );
    } finally {
      setSaving(false);
    }
  }
  const items = (state.data || []).filter((item) =>
    archived ? item.status === "ARCHIVED" : item.status === "ACTIVE",
  );
  return (
    <div className={hubUi.page}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[.16em] text-zinc-500">
            Estrutura da EJ
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.03em]">
            Diretorias
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Pessoas, projetos e compromissos organizados por área.
          </p>
        </div>
        <button onClick={() => setOpen(true)} className={hubUi.primaryButton}>
          <Plus className="h-4 w-4" />
          Nova diretoria
        </button>
      </header>
      <ErrorNotice message={state.error} />
      <div className="flex gap-1 rounded-xl border border-zinc-200 bg-white p-1 sm:w-fit">
        <button
          onClick={() => setArchived(false)}
          className={
            !archived
              ? hubUi.primaryButton
              : `${hubUi.secondaryButton} border-transparent`
          }
        >
          Ativas
        </button>
        <button
          onClick={() => setArchived(true)}
          className={
            archived
              ? hubUi.primaryButton
              : `${hubUi.secondaryButton} border-transparent`
          }
        >
          Arquivadas
        </button>
      </div>
      {items.length ? (
        <section className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/hub/diretorias/${item.id}`}
              className={`${hubUi.panel} group p-5 text-left transition hover:border-zinc-400 hover:shadow-sm`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><h2 className="truncate font-display text-xl font-semibold" title={item.name}>{item.name}</h2><p className="mt-1 truncate text-sm text-zinc-500">Diretor(a): {item.director?.name || "Não definido"}</p></div>
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-mono text-[10px] uppercase text-zinc-700">{item.status === "ACTIVE" ? "Ativa" : "Arquivada"}</span>
              </div>
              <dl className="mt-6 grid grid-cols-3 gap-3 border-y border-zinc-200 py-4">
                <div>
                  <dd className="text-lg font-semibold">{item.memberCount}</dd>
                  <dt className="text-xs text-zinc-500">Membros</dt>
                </div>
                <div>
                  <dd className="text-lg font-semibold">{item.activeProjects}</dd>
                  <dt className="text-xs text-zinc-500">Projetos ativos</dt>
                </div>
                <div>
                  <dd className="text-lg font-semibold">{item.pendingTasks}</dd>
                  <dt className="text-xs text-zinc-500">Pendências</dt>
                </div>
              </dl>
              {item.nextMeeting ? (
                <p className="mt-4 flex items-center gap-2 text-xs text-zinc-600">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {item.nextMeeting.title} ·{" "}
                  {new Date(item.nextMeeting.startAt).toLocaleDateString(
                    "pt-BR",
                  )}
                </p>
              ) : <p className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><CalendarDays className="h-4 w-4" />Próxima reunião não agendada</p>}
            </Link>
          ))}
        </section>
      ) : state.loading ? (
        <div className="h-52 animate-pulse rounded-2xl bg-white" />
      ) : (
        <Empty>
          {archived
            ? "Nenhuma diretoria arquivada."
            : "Crie a primeira diretoria da organização."}
        </Empty>
      )}
      <CoreModal
        open={open}
        onClose={() => setOpen(false)}
        title="Nova diretoria"
        description="Defina a liderança e os membros iniciais."
      >
        <form onSubmit={create} className="space-y-4">
          <label className="block text-sm font-medium">
            Nome
            <input
              required
              minLength={2}
              className={`${input} mt-1`}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="block text-sm font-medium">
            Descrição
            <textarea
              className={`${input} mt-1 min-h-24`}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Ícone opcional
              <input
                className={`${input} mt-1`}
                maxLength={12}
                placeholder="Ex.: ⚙️"
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
              />
            </label>
            <label className="block text-sm font-medium">
              Diretor(a)
              <select
                className={`${input} mt-1`}
                value={form.directorId}
                onChange={(e) =>
                  setForm({ ...form, directorId: e.target.value })
                }
              >
                <option value="">Definir depois</option>
                {options?.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset>
            <legend className="text-sm font-medium">Membros iniciais</legend>
            <div className="mt-2 grid max-h-52 gap-2 overflow-y-auto rounded-xl border border-zinc-200 p-3 sm:grid-cols-2">
              {options?.members.map((member) => (
                <label
                  key={member.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={form.memberIds.includes(member.id)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        memberIds: e.target.checked
                          ? [...form.memberIds, member.id]
                          : form.memberIds.filter((id) => id !== member.id),
                      })
                    }
                  />
                  {member.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={hubUi.secondaryButton}
            >
              Cancelar
            </button>
            <button disabled={saving} className={hubUi.primaryButton}>
              {saving ? "Criando…" : "Criar diretoria"}
            </button>
          </div>
        </form>
      </CoreModal>
    </div>
  );
}

export function HubDirectorateDetail({ id }: { id: string }) {
  const options = useCoreOptions();
  const state = useCoreLoad(
    async () =>
      (await coreApi<{ directorate: Detail }>(`/api/hub/directorates/${id}`))
        .directorate,
    [id],
  );
  const [tab, setTab] = useState<"overview" | "members" | "projects" | "work">(
    "overview",
  );
  const [editing, setEditing] = useState(false);
  const [memberToAdd, setMemberToAdd] = useState("");
  if (!state.data)
    return (
      <div className={hubUi.page}>
        {state.error ? (
          <ErrorNotice message={state.error} />
        ) : (
          <div className="h-72 animate-pulse rounded-2xl bg-white" />
        )}
      </div>
    );
  const item = state.data;
  async function action(name: "archive" | "restore") {
    try {
      await coreApi(`/api/hub/directorates/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ version: item.version, action: name }),
      });
      await state.refresh();
    } catch (reason) {
      state.setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível atualizar.",
      );
    }
  }
  async function transfer(memberId: string, targetDirectorateId: string) {
    try {
      await coreApi(`/api/hub/directorates/${id}/members`, {
        method: "PATCH",
        body: JSON.stringify({
          memberId,
          targetDirectorateId: targetDirectorateId || null,
        }),
      });
      await state.refresh();
    } catch (reason) {
      state.setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível transferir.",
      );
    }
  }
  async function remove() {
    const approved = await requestHubConfirmation({ title: "Excluir diretoria", description: `A diretoria ${item.name} só pode ser excluída sem histórico protegido. Prefira arquivá-la quando precisar preservar o histórico.`, confirmLabel: "Confirmar exclusão" });
    if (!approved) return;
    try {
      await coreApi(`/api/hub/directorates/${id}?version=${item.version}`, {
        method: "DELETE",
      });
      window.location.assign("/hub/diretorias");
    } catch (reason) {
      state.setError(
        reason instanceof Error ? reason.message : "Não foi possível excluir.",
      );
    }
  }
  const tabs = [
    { id: "overview", label: "Visão geral" },
    { id: "members", label: "Membros" },
    { id: "projects", label: "Projetos" },
    { id: "work", label: "Tarefas e agenda" },
  ] as const;
  return (
    <div className={hubUi.page}>
      <Link
        href="/hub/diretorias"
        className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 hover:text-black"
      >
        <ArrowLeft className="h-4 w-4" />Todas as diretorias
      </Link>
      <header className="rounded-2xl border border-zinc-200 bg-white p-6">
        <p className="font-mono text-[11px] uppercase tracking-[.16em] text-zinc-500">Diretoria</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-3xl font-semibold tracking-[-0.03em]">
                {item.name}
              </h1>
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs">
                {item.status === "ACTIVE" ? "Ativa" : "Arquivada"}
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-zinc-500">Diretor(a): {item.director?.name || "Não definido"} · {item.members.length} membros</p>
          </div>
        </div>
        {item.capabilities.canEdit ? (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setTab("members")} className={hubUi.secondaryButton}>Gerenciar membros</button>
            <details className="relative"><summary className={`${hubUi.secondaryButton} cursor-pointer list-none`}>Mais ações</summary><div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg"><button onClick={() => setEditing(true)} className="flex w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100">Editar</button><button onClick={() => void action(item.status === "ACTIVE" ? "archive" : "restore")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100">{item.status === "ACTIVE" ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}{item.status === "ACTIVE" ? "Arquivar" : "Restaurar"}</button>{item.capabilities.canDelete ? <button onClick={() => void remove()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" />Excluir</button> : null}</div></details>
          </div>
        ) : null}
        </div>
      </header>
      <ErrorNotice message={state.error} />
      <div className="flex gap-1 overflow-x-auto border-b border-zinc-200">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setTab(entry.id)}
            className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold ${tab === entry.id ? "border-zinc-950 text-zinc-950" : "border-transparent text-zinc-500 hover:text-zinc-950"}`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className={`${hubUi.panel} p-5 lg:col-span-2`}>
            <h2 className="font-semibold">Resumo</h2>
            <dl className="mt-5 grid grid-cols-3 gap-4">
              <Metric
                label="Membros"
                value={item.members.length}
                icon={<Users />}
              />
              <Metric
                label="Projetos"
                value={item.primaryProjects.length}
                icon={<FolderKanban />}
              />
              <Metric
                label="Tarefas"
                value={item.tasks.filter((task) => !task.completedAt).length}
                icon={<CalendarDays />}
              />
            </dl>
          </section>
          <section className={`${hubUi.panel} p-5`}>
            <p className="text-sm text-zinc-500">Diretor(a)</p>
            <p className="mt-2 font-semibold">
              {item.director?.name || "Não definido"}
            </p>
          </section>
        </div>
      ) : null}
      {tab === "members" ? (
        <section className={`${hubUi.panel} divide-y divide-zinc-100`}>
          {item.members.map((member) => (
            <div
              key={member.id}
              className="flex flex-wrap items-center gap-3 p-4"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-xs font-semibold">
                {member.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{member.name}</p>
                <p className="text-xs text-zinc-500">
                  {member.email} · {member.role}
                </p>
              </div>
              {item.capabilities.canEdit ? (
                <select
                  aria-label={`Transferir ${member.name}`}
                  className="rounded-lg border border-zinc-300 px-2 py-2 text-sm"
                  value={id}
                  onChange={(e) => void transfer(member.id, e.target.value)}
                >
                  <option value="">Sem diretoria</option>
                  {options?.directorates.map((directorate) => (
                    <option key={directorate.id} value={directorate.id}>
                      {directorate.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          ))}
          {!item.members.length ? (
            <Empty>Nenhum membro nesta diretoria.</Empty>
          ) : null}
        </section>
      ) : null}
      {tab === "projects" ? (
        <section className="grid gap-3 md:grid-cols-2">
          {item.primaryProjects.map((project) => (
            <Link
              key={project.id}
              href={`/hub/projetos/${project.id}`}
              className={`${hubUi.panel} p-5`}
            >
              <div className="flex justify-between gap-3">
                <h2 className="font-semibold">{project.title}</h2>
                <span className="text-xs text-zinc-500">{project.status}</span>
              </div>
              <div className="mt-4 h-2 rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-black"
                  style={{ width: `${project.progress}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                {project.progress}% concluído
              </p>
            </Link>
          ))}
          {!item.primaryProjects.length ? (
            <Empty>Nenhum projeto ativo.</Empty>
          ) : null}
        </section>
      ) : null}
      {tab === "work" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={`${hubUi.panel} p-5`}>
            <h2 className="font-semibold">Tarefas</h2>
            <div className="mt-3 divide-y divide-zinc-100">
              {item.tasks.slice(0, 12).map((task) => (
                <Link
                  key={task.id}
                  href={`/hub/tarefas/${task.id}`}
                  className="flex justify-between gap-3 py-3 text-sm"
                >
                  <span>{task.title}</span>
                  <span className="text-zinc-500">{task.status}</span>
                </Link>
              ))}
            </div>
          </section>
          <section className={`${hubUi.panel} p-5`}>
            <h2 className="font-semibold">Agenda</h2>
            <div className="mt-3 divide-y divide-zinc-100">
              {item.meetings.slice(0, 12).map((meeting) => (
                <Link
                  key={meeting.id}
                  href={`/hub/reunioes/${meeting.id}`}
                  className="block py-3"
                >
                  <p className="text-sm font-medium">{meeting.title}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(meeting.startAt).toLocaleString("pt-BR")}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      ) : null}
      {tab === "members" && item.capabilities.canEdit ? (
        <AddMember
          directorateId={id}
          memberIds={item.members.map((member) => member.id)}
          value={memberToAdd}
          onChange={setMemberToAdd}
          options={options}
          onAdd={async () => {
            if (!memberToAdd) return;
            await transfer(memberToAdd, id);
            setMemberToAdd("");
          }}
        />
      ) : null}
      <EditDirectorate
        open={editing}
        onClose={() => setEditing(false)}
        item={item}
        options={options}
        onSaved={state.refresh}
        onError={state.setError}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div>
      <span className="block h-5 w-5 text-zinc-400 [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </span>
      <dt className="mt-4 text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
    </div>
  );
}
function AddMember({
  memberIds,
  value,
  onChange,
  options,
  onAdd,
}: {
  directorateId: string;
  memberIds: string[];
  value: string;
  onChange: (value: string) => void;
  options: ReturnType<typeof useCoreOptions>;
  onAdd: () => Promise<void>;
}) {
  return (
    <section className={`${hubUi.panel} flex flex-wrap gap-2 p-4`}>
      <select
        aria-label="Membro para adicionar"
        className={`${input} min-w-64 flex-1`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Selecione um membro</option>
        {options?.members
          .filter((member) => !memberIds.includes(member.id))
          .map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
              {member.directorateId
                ? " · em outra diretoria"
                : " · sem diretoria"}
            </option>
          ))}
      </select>
      <button
        type="button"
        onClick={() => void onAdd()}
        disabled={!value}
        className={hubUi.primaryButton}
      >
        <Plus className="h-4 w-4" />
        Adicionar membro
      </button>
    </section>
  );
}
function EditDirectorate({
  open,
  onClose,
  item,
  options,
  onSaved,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  item: Detail;
  options: ReturnType<typeof useCoreOptions>;
  onSaved: () => Promise<void>;
  onError: (value: string) => void;
}) {
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description || "");
  const [icon, setIcon] = useState(item.icon || "");
  const [directorId, setDirectorId] = useState(item.director?.id || "");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      await coreApi(`/api/hub/directorates/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          version: item.version,
          name,
          description,
          icon,
          directorId: directorId || null,
        }),
      });
      onClose();
      await onSaved();
    } catch (reason) {
      onError(
        reason instanceof Error ? reason.message : "Não foi possível salvar.",
      );
    }
  }
  return (
    <CoreModal open={open} onClose={onClose} title="Editar diretoria">
      <form onSubmit={save} className="space-y-4">
        <label className="block text-sm font-medium">
          Nome
          <input
            className={`${input} mt-1`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Descrição
          <textarea
            className={`${input} mt-1 min-h-24`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Ícone
            <input
              className={`${input} mt-1`}
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Diretor(a)
            <select
              className={`${input} mt-1`}
              value={directorId}
              onChange={(e) => setDirectorId(e.target.value)}
            >
              <option value="">Não definido</option>
              {options?.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className={hubUi.secondaryButton}
          >
            Cancelar
          </button>
          <button className={hubUi.primaryButton}>Salvar</button>
        </div>
      </form>
    </CoreModal>
  );
}
