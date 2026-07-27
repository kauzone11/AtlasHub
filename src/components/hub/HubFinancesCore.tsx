"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Pencil,
  Plus,
  Search,
  XCircle,
} from "lucide-react";
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
import { useHubDisplay } from "@/components/hub/HubOrganizationContext";
import { hubUi } from "@/components/hub/styles";
import { requestHubText } from "@/components/hub/HubDialog";
type Entry = {
  id: string;
  direction: "RECEIVABLE" | "PAYABLE";
  status: string;
  description: string;
  competenceDate: string;
  totalCents: number;
  settledCents: number;
  directorateId: string | null;
  projectId: string | null;
  capabilities: { canEdit: boolean; canCancel: boolean };
};
const money = (value: number, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(
    value / 100,
  );
export function HubFinancesCore() {
  const { money: organizationMoney } = useHubDisplay();
  const options = useCoreOptions();
  const [filters, setFilters] = useState({
    direction: "",
    directorateId: "",
    projectId: "",
    q: "",
    from: "",
    to: "",
  });
  const [open, setOpen] = useState<"RECEIVABLE" | "PAYABLE" | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value),
  ).toString();
  const state = useCoreLoad(
    async () =>
      await coreApi<{
        balanceCents: number;
        currency: string;
        entries: Entry[];
      }>(`/api/hub/finances?${query}`),
    [query],
  );
  const canCreate = options?.permissions.includes("finance:create");
  const receivedCents = state.data?.entries.filter((entry) => entry.direction === "RECEIVABLE").reduce((total, entry) => total + entry.settledCents, 0) || 0;
  const paidCents = state.data?.entries.filter((entry) => entry.direction === "PAYABLE").reduce((total, entry) => total + entry.settledCents, 0) || 0;
  const balanceCents = state.data?.balanceCents || 0;
  return (
    <div className={hubUi.page}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[.16em] text-zinc-500">
            Financeiro da organização
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.03em]">
            Finanças
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Controle de receitas e despesas.
          </p>
        </div>
        {canCreate ? (
          <button onClick={() => setOpen("RECEIVABLE")} className={hubUi.primaryButton}><Plus className="h-4 w-4" />Nova transação</button>
        ) : null}
      </header>
      <ErrorNotice message={state.error} />
      <section className="grid gap-4 md:grid-cols-3"><FinanceSummary direction="income" label="Receitas" value={organizationMoney(receivedCents)} note="Valores liquidados" /><FinanceSummary direction="expense" label="Despesas" value={organizationMoney(paidCents)} note="Valores liquidados" /><FinanceSummary direction={balanceCents >= 0 ? "balance" : "negative"} label="Saldo" value={organizationMoney(balanceCents)} note="Receitas − despesas" /></section>
      <section className={`${hubUi.panel} p-5`}>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-[240px] flex-1">
            <span className="sr-only">Buscar</span>
            <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
            <input
              className={`${input} pl-9`}
              placeholder="Buscar transações..."
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            />
          </label>
          <div className="flex gap-1 rounded-xl bg-zinc-100 p-1">{[{ value: "", label: "Todos" }, { value: "RECEIVABLE", label: "Receitas" }, { value: "PAYABLE", label: "Despesas" }].map((item) => <button key={item.label} type="button" onClick={() => setFilters({ ...filters, direction: item.value })} className={`rounded-lg px-3 py-2 text-sm font-semibold ${filters.direction === item.value ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-white"}`}>{item.label}</button>)}</div>
          <details className="w-full"><summary className="cursor-pointer list-none text-sm font-semibold text-zinc-600">Mais filtros</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><select
            aria-label="Diretoria"
            className={input}
            value={filters.directorateId}
            onChange={(e) =>
              setFilters({ ...filters, directorateId: e.target.value })
            }
          >
            <option value="">Todas as diretorias</option>
            {options?.directorates.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Projeto"
            className={input}
            value={filters.projectId}
            onChange={(e) =>
              setFilters({ ...filters, projectId: e.target.value })
            }
          >
            <option value="">Todos os projetos</option>
            {options?.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <input
            aria-label="De"
            type="date"
            className={input}
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
          <input
            aria-label="Até"
            type="date"
            className={input}
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          />
          </div></details>
        </div>
      </section>
      <section className={`${hubUi.panel} overflow-hidden`}>
        <div className="hidden grid-cols-[3rem_1fr_9rem_9rem_9rem_4rem] gap-3 border-b bg-zinc-50 px-4 py-3 text-xs text-zinc-500 md:grid">
          <span />
          <span>Descrição</span>
          <span>Data</span>
                <span>Status</span>
          <span>Valor</span>
          <span />
        </div>
        {state.data?.entries.map((entry) => (
          <article
            key={entry.id}
            className="grid gap-2 border-b border-zinc-100 p-4 last:border-0 md:grid-cols-[3rem_1fr_9rem_9rem_9rem_4rem] md:items-center md:gap-3"
          >
            <span
              className={`grid h-10 w-10 place-items-center rounded-lg ${entry.direction === "RECEIVABLE" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
            >
              {entry.direction === "RECEIVABLE" ? (
                <ArrowDownLeft className="h-4 w-4" />
              ) : (
                <ArrowUpRight className="h-4 w-4" />
              )}
            </span>
            <div>
              <p className="font-medium">{entry.description}</p>
              <p className="text-xs text-zinc-500">
                Liquidado: {money(entry.settledCents)}
              </p>
            </div>
            <time className="text-sm text-zinc-600">
              {new Date(entry.competenceDate).toLocaleDateString("pt-BR")}
            </time>
            <span className="text-xs text-zinc-500">{entry.status}</span>
            <strong
              className={
                entry.direction === "RECEIVABLE" ? "text-emerald-700" : "text-rose-700"
              }
            >
              {entry.direction === "RECEIVABLE" ? "+" : "−"}
              {money(entry.totalCents)}
            </strong>
            <div className="flex items-center gap-1">
              {entry.capabilities.canEdit ? (
                <button
                  type="button"
                  onClick={() => setEditing(entry)}
                  aria-label="Editar lançamento"
                  className="rounded-lg p-2 hover:bg-zinc-100"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              ) : null}
              {entry.capabilities.canCancel ? (
                <button
                  onClick={async () => {
                    const reason = await requestHubText({ title: "Cancelar lançamento", label: "Motivo do cancelamento", required: true, multiline: true, confirmLabel: "Confirmar cancelamento", description: `“${entry.description}” permanecerá no histórico após o cancelamento.` });
                    if (!reason) return;
                    try {
                      await coreApi(`/api/hub/finances/${entry.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ cancelReason: reason }),
                      });
                      await state.refresh();
                    } catch (reasonValue) {
                      state.setError(
                        reasonValue instanceof Error
                          ? reasonValue.message
                          : "Não foi possível cancelar.",
                      );
                    }
                  }}
                  aria-label="Cancelar lançamento"
                  className="rounded-lg p-2 hover:bg-zinc-100"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </article>
        ))}
        {!state.data?.entries.length ? (
          <Empty>Nenhum lançamento neste filtro.</Empty>
        ) : null}
      </section>
      <CoreModal
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        title="Nova transação"
      >
        <EntryForm
          direction={open || "RECEIVABLE"}
          options={options}
          onSaved={async () => {
            setOpen(null);
            await state.refresh();
          }}
          onError={state.setError}
        />
      </CoreModal>
      <CoreModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Editar lançamento pendente"
      >
        <EntryForm
          key={editing?.id}
          entry={editing || undefined}
          direction={editing?.direction || "RECEIVABLE"}
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
function FinanceSummary({ direction, label, value, note }: { direction: "income" | "expense" | "balance" | "negative"; label: string; value: string; note: string }) { const gradient = direction === "income" ? "from-emerald-500 to-emerald-600" : direction === "expense" ? "from-rose-500 to-rose-600" : direction === "balance" ? "from-blue-500 to-blue-600" : "from-orange-500 to-orange-600"; return <div className={`rounded-xl bg-gradient-to-br ${gradient} p-6 text-white`}><div className="flex items-center gap-2 text-sm text-white/90">{direction === "income" ? <ArrowUpRight className="h-5 w-5" /> : direction === "expense" ? <ArrowDownLeft className="h-5 w-5" /> : null}<span>{label}</span></div><p className="mt-2 truncate text-3xl font-semibold tracking-tight" title={value}>{value}</p><p className="mt-2 text-sm text-white/80">{note}</p></div>; }
function EntryForm({
  entry,
  direction,
  options,
  onSaved,
  onError,
}: {
  entry?: Entry;
  direction: "RECEIVABLE" | "PAYABLE";
  options: ReturnType<typeof useCoreOptions>;
  onSaved: () => Promise<void>;
  onError: (value: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    description: entry?.description || "",
    amount: entry ? String(entry.totalCents / 100).replace(".", ",") : "",
    competenceDate: entry?.competenceDate.slice(0, 10) || today,
    dueDate: today,
    directorateId: entry?.directorateId || "",
    projectId: entry?.projectId || "",
  });
  const [entryDirection, setEntryDirection] = useState(direction);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const cents = Math.round(Number(form.amount.replace(",", ".")) * 100);
    try {
      await coreApi(
        entry ? `/api/hub/finances/${entry.id}` : "/api/hub/finances",
        {
          method: entry ? "PATCH" : "POST",
          headers: entry
            ? undefined
            : { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            ...(entry ? {} : { direction: entryDirection }),
            description: form.description,
            totalCents: cents,
            competenceDate: form.competenceDate,
            ...(entry ? {} : { dueDate: form.dueDate }),
            directorateId: form.directorateId || null,
            projectId: form.projectId || null,
          }),
        },
      );
      await onSaved();
    } catch (reason) {
      onError(
        reason instanceof Error ? reason.message : "Não foi possível salvar.",
      );
    }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      {!entry ? <label className="block text-sm font-medium">Tipo<select className={`${input} mt-1`} value={entryDirection} onChange={(event) => setEntryDirection(event.target.value as "RECEIVABLE" | "PAYABLE")}><option value="RECEIVABLE">Receita</option><option value="PAYABLE">Despesa</option></select></label> : null}
      <label className="block text-sm font-medium">
        Descrição
        <input
          required
          className={`${input} mt-1`}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Valor (R$)
          <input
            required
            inputMode="decimal"
            className={`${input} mt-1`}
            placeholder="0,00"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </label>
        <label className="block text-sm font-medium">
          Competência
          <input
            type="date"
            className={`${input} mt-1`}
            value={form.competenceDate}
            onChange={(e) =>
              setForm({ ...form, competenceDate: e.target.value })
            }
          />
        </label>
        <label className="block text-sm font-medium">
          Vencimento
          <input
            type="date"
            className={`${input} mt-1`}
            value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
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
            <option value="">Sem vínculo</option>
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
            <option value="">Sem vínculo</option>
            {options?.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-zinc-500">
        O lançamento será enviado como pendente de aprovação.
      </p>
      <div className="flex justify-end">
        <button className={hubUi.primaryButton}>
          {entry
            ? "Salvar alterações"
            : `Salvar ${entryDirection === "RECEIVABLE" ? "receita" : "despesa"}`}
        </button>
      </div>
    </form>
  );
}
