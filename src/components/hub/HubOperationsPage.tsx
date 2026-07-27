"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Download, Plus } from "lucide-react";
import { hubUi } from "./styles";
import { useHubDisplay } from "./HubOrganizationContext";
import { requestHubConfirmation, requestHubText } from "./HubDialog";

type Mode =
  | "finance"
  | "entries"
  | "new"
  | "budgets"
  | "reimbursements"
  | "reports"
  | "settings"
  | "people"
  | "development"
  | "evaluations"
  | "recruitment";
// Payloads are narrowed at each form and endpoint boundary; this loose UI view-model never reaches Prisma directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;
const labels: Record<Mode, [string, string]> = {
  finance: [
    "Financeiro",
    "Caixa da organização, separado das carteiras internas dos membros.",
  ],
  entries: [
    "Lançamentos",
    "Contas a pagar e receber, parcelas, aprovações e liquidações.",
  ],
  new: [
    "Novo lançamento",
    "Registre um compromisso financeiro e suas parcelas.",
  ],
  budgets: [
    "Orçamentos",
    "Planejado, realizado e variação por categoria e centro de custo.",
  ],
  reimbursements: [
    "Reembolsos",
    "Solicitações pessoais, revisão independente e pagamento pelo financeiro.",
  ],
  reports: [
    "Relatórios financeiros",
    "Fluxo mensal, vencimentos, categorias e centros de custo.",
  ],
  settings: [
    "Configurações financeiras",
    "Categorias, centros de custo, contrapartes e períodos.",
  ],
  people: [
    "Pessoas",
    "Perfil, onboarding, reconhecimento e participação sem expor dados sensíveis.",
  ],
  development: [
    "Desenvolvimento",
    "Competências, planos e metas com controle de versão.",
  ],
  evaluations: [
    "Avaliações",
    "Ciclos, feedback confidencial e avaliações atribuídas.",
  ],
  recruitment: [
    "Processos seletivos",
    "Funil interno com movimentação acessível por teclado.",
  ],
};
const field =
  "min-h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-black";

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.error || "Não foi possível concluir a operação.");
  return payload;
}
function cents(value: FormDataEntryValue | null) {
  const amount = Number(String(value || "").replace(",", "."));
  return Math.round(amount * 100);
}

export function HubOperationsPage({
  mode,
  entryId,
}: {
  mode: Mode;
  entryId?: string;
}) {
  const [title, description] = labels[mode];
  return (
    <div className={hubUi.page}>
      <header>
        <p className="text-sm text-zinc-500">Atlas Hub · Operações internas</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">{description}</p>
      </header>
      {(mode === "finance" || mode === "entries") && !entryId ? (
        <FinanceList />
      ) : null}
      {entryId ? <EntryDetail id={entryId} /> : null}
      {mode === "new" ? <NewEntry /> : null}
      {mode === "budgets" ? <Budgets /> : null}
      {mode === "reimbursements" ? <Reimbursements /> : null}
      {mode === "reports" ? <Reports /> : null}
      {mode === "settings" ? <Settings /> : null}
      {mode === "people" ? <People /> : null}
      {mode === "development" ? <Development /> : null}
      {mode === "evaluations" ? <Evaluations /> : null}
      {mode === "recruitment" ? <Recruitment /> : null}
    </div>
  );
}

function useLoad(urls: string[]) {
  const [data, setData] = useState<Json[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const urlsRef = useRef(urls);
  urlsRef.current = urls;
  const key = urls.join("|");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await Promise.all(urlsRef.current.map((url) => api(url))));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [key, load]);
  return { data, error, loading, load };
}
function Status({ children }: { children: string }) {
  return (
    <span className="inline-flex rounded-full border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700">
      {children.replaceAll("_", " ")}
    </span>
  );
}
function Feedback({ error, message }: { error?: string; message?: string }) {
  return (
    <>
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {message}
        </p>
      ) : null}
    </>
  );
}
function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className={`${hubUi.panel} min-w-0 overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-4">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
function Submit({ children = "Salvar" }: { children?: string }) {
  return (
    <button type="submit" className={hubUi.primaryButton}>
      {children}
    </button>
  );
}

function FinanceList() {
  const { money, date } = useHubDisplay();
  const [filters, setFilters] = useState("");
  const { data, error, loading } = useLoad([
    `/api/hub/finance/entries${filters}`,
  ]);
  const entries = data[0]?.entries || [];
  const payable = entries
    .filter((item: Json) => item.direction === "PAYABLE")
    .reduce((sum: number, item: Json) => sum + item.totalCents, 0);
  const receivable = entries
    .filter((item: Json) => item.direction === "RECEIVABLE")
    .reduce((sum: number, item: Json) => sum + item.totalCents, 0);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="A pagar" value={money(payable)} />
        <Metric label="A receber" value={money(receivable)} />
        <Metric
          label="Pendentes"
          value={String(
            entries.filter((item: Json) => item.status === "PENDING_APPROVAL")
              .length,
          )}
        />
        <Metric label="Lançamentos" value={String(entries.length)} />
      </div>
      <Feedback error={error} />
      <Panel
        title="Movimentação organizacional"
        action={
          <Link
            href="/hub/financeiro/lancamentos/novo"
            className={hubUi.primaryButton}
          >
            <Plus className="h-4 w-4" /> Novo
          </Link>
        }
      >
        <form
          className="mb-4 grid gap-3 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const params = new URLSearchParams();
            for (const key of ["direction", "status"])
              if (form.get(key)) params.set(key, String(form.get(key)));
            setFilters(params.size ? `?${params}` : "");
          }}
        >
          <select name="direction" className={field} aria-label="Direção">
            <option value="">Pagar e receber</option>
            <option value="PAYABLE">A pagar</option>
            <option value="RECEIVABLE">A receber</option>
          </select>
          <select name="status" className={field} aria-label="Status">
            <option value="">Todos os status</option>
            {[
              "DRAFT",
              "PENDING_APPROVAL",
              "APPROVED",
              "PARTIALLY_SETTLED",
              "SETTLED",
              "REJECTED",
              "CANCELLED",
            ].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <Submit>Filtrar</Submit>
        </form>
        {loading ? (
          <p>Carregando…</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {entries.length ? (
              entries.map((item: Json) => (
                <Link
                  key={item.id}
                  href={`/hub/financeiro/lancamentos/${item.id}`}
                  className="grid gap-2 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-6"
                >
                  <span className="min-w-0 break-words text-sm font-medium">
                    {item.description}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <Status>{item.status}</Status>
                    {date(item.competenceDate)}
                  </span>
                  <strong className="text-sm">{money(item.totalCents)}</strong>
                </Link>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-zinc-500">
                Nenhum lançamento registrado.
              </p>
            )}
          </div>
        )}
      </Panel>
    </>
  );
}

function NewEntry() {
  const { data, error } = useLoad(["/api/hub/finance/configuration"]);
  const config = data[0] || {};
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure("");
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        direction: form.get("direction"),
        description: form.get("description"),
        categoryId: form.get("categoryId"),
        costCenterId: form.get("costCenterId") || null,
        counterpartyId: form.get("counterpartyId") || null,
        issueDate: form.get("issueDate"),
        competenceDate: form.get("competenceDate"),
        totalCents: cents(form.get("total")),
        installments: [
          {
            amountCents: cents(form.get("total")),
            dueDate: form.get("dueDate"),
          },
        ],
        idempotencyKey: crypto.randomUUID(),
      };
      const created = await api("/api/hub/finance/entries", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setMessage("Rascunho criado com uma parcela.");
      location.href = `/hub/financeiro/lancamentos/${created.id}`;
    } catch (reason) {
      setFailure((reason as Error).message);
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Panel title="Dados do lançamento">
      <Feedback error={error || failure} message={message} />
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Direção
          <select name="direction" className={`mt-1 ${field}`}>
            <option value="PAYABLE">Conta a pagar</option>
            <option value="RECEIVABLE">Conta a receber</option>
          </select>
        </label>
        <label className="text-sm">
          Descrição
          <input
            name="description"
            required
            maxLength={180}
            className={`mt-1 ${field}`}
          />
        </label>
        <label className="text-sm">
          Categoria
          <select name="categoryId" required className={`mt-1 ${field}`}>
            <option value="">Selecione</option>
            {(config.categories || [])
              .filter((item: Json) => item.isActive)
              .map((item: Json) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          Centro de custo
          <select name="costCenterId" className={`mt-1 ${field}`}>
            <option value="">Organização</option>
            {(config.costCenters || []).map((item: Json) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Contraparte
          <select name="counterpartyId" className={`mt-1 ${field}`}>
            <option value="">Sem contraparte</option>
            {(config.counterparties || []).map((item: Json) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Valor
          <input
            name="total"
            required
            inputMode="decimal"
            placeholder="0,00"
            className={`mt-1 ${field}`}
          />
        </label>
        <label className="text-sm">
          Emissão
          <input
            name="issueDate"
            type="date"
            defaultValue={today}
            required
            className={`mt-1 ${field}`}
          />
        </label>
        <label className="text-sm">
          Competência
          <input
            name="competenceDate"
            type="date"
            defaultValue={today}
            required
            className={`mt-1 ${field}`}
          />
        </label>
        <label className="text-sm">
          Vencimento da parcela
          <input
            name="dueDate"
            type="date"
            defaultValue={today}
            required
            className={`mt-1 ${field}`}
          />
        </label>
        <div className="sm:col-span-2">
          <Submit>Criar rascunho</Submit>
        </div>
      </form>
      <p className="mt-5 text-xs text-zinc-500">
        O caixa organizacional não altera saldos das carteiras internas nem
        distribuições de projetos.
      </p>
    </Panel>
  );
}

function EntryDetail({ id }: { id: string }) {
  const { money, date } = useHubDisplay();
  const { data, error, load } = useLoad([`/api/hub/finance/entries/${id}`]);
  const detail = data[0] || {};
  const entry = detail.entry;
  const [failure, setFailure] = useState("");
  const [message, setMessage] = useState("");
  async function action(path: string, body?: Json) {
    setFailure("");
    try {
      await api(path, { method: "POST", body: JSON.stringify(body || {}) });
      setMessage("Operação concluída.");
      await load();
    } catch (reason) {
      setFailure((reason as Error).message);
    }
  }
  if (!entry) return <Feedback error={error || "Carregando lançamento…"} />;
  return (
    <>
      <Feedback error={error || failure} message={message} />
      <Panel title={entry.description} action={<Status>{entry.status}</Status>}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Valor" value={money(entry.totalCents)} />
          <Metric label="Emissão" value={date(entry.issueDate)} />
          <Metric label="Competência" value={date(entry.competenceDate)} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {entry.status === "DRAFT" ? (
            <button
              className={hubUi.primaryButton}
              onClick={() => action(`/api/hub/finance/entries/${id}/submit`)}
            >
              Enviar para aprovação
            </button>
          ) : null}
          {entry.status === "PENDING_APPROVAL" ? (
            <>
              <button
                className={hubUi.primaryButton}
                onClick={() => action(`/api/hub/finance/entries/${id}/approve`)}
              >
                Aprovar
              </button>
              <button
                className={hubUi.secondaryButton}
                onClick={() => void (async () => { const reason = await requestHubText({ title: "Rejeitar lançamento", description: entry.description, required: true }); if (reason) await action(`/api/hub/finance/entries/${id}/reject`, { reason }); })()}
              >
                Rejeitar
              </button>
            </>
          ) : null}
          {["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(entry.status) ? (
            <button
              className={hubUi.secondaryButton}
                onClick={() => void (async () => { const reason = await requestHubText({ title: "Cancelar lançamento", description: entry.description, required: true }); if (reason) await action(`/api/hub/finance/entries/${id}/cancel`, { reason }); })()}
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </Panel>
      <Panel title="Parcelas e liquidações">
        <div className="space-y-4">
          {(detail.installments || []).map((item: Json) => (
            <div
              key={item.id}
              className="rounded-xl border border-zinc-200 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Parcela {item.number} · {date(item.dueDate)}
                </span>
                <span className="flex items-center gap-2">
                  <Status>{item.status}</Status>
                  <strong>{money(item.amountCents)}</strong>
                </span>
              </div>
              {["APPROVED", "PARTIALLY_SETTLED"].includes(entry.status) ? (
                <form
                  className="mt-3 grid gap-2 sm:grid-cols-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void action(`/api/hub/finance/entries/${id}/settlements`, {
                      installmentId: item.id,
                      amountCents: cents(form.get("amount")),
                      settledAt: form.get("settledAt"),
                      method: form.get("method"),
                      idempotencyKey: crypto.randomUUID(),
                    });
                  }}
                >
                  <input
                    name="amount"
                    required
                    inputMode="decimal"
                    placeholder="Valor"
                    className={field}
                  />
                  <input
                    name="settledAt"
                    required
                    type="datetime-local"
                    className={field}
                  />
                  <select name="method" className={field}>
                    <option>PIX</option>
                    <option>BANK_TRANSFER</option>
                    <option>CASH</option>
                    <option>CARD</option>
                    <option>BOLETO</option>
                    <option>OTHER</option>
                  </select>
                  <Submit>Liquidar</Submit>
                </form>
              ) : null}
            </div>
          ))}
          {(detail.settlements || []).map((item: Json) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3 text-sm"
            >
              <span>
                {date(item.settledAt)} · {item.method} ·{" "}
                {money(item.amountCents)}
              </span>
              {item.reversedAt ? (
                <Status>REVERTIDA</Status>
              ) : (
                <button
                  className={hubUi.secondaryButton}
                  onClick={() => void (async () => { const reason = await requestHubText({ title: "Reverter liquidação", required: true }); if (reason) await action(`/api/hub/finance/settlements/${item.id}/reverse`, { reason }); })()}
                >
                  Reverter
                </button>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

function Budgets() {
  const { money } = useHubDisplay();
  const { data, error, load } = useLoad([
    "/api/hub/finance/budgets",
    "/api/hub/finance/configuration",
  ]);
  const budgets = data[0]?.budgets || [];
  const config = data[1] || {};
  const [failure, setFailure] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/hub/finance/budgets", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          year: Number(form.get("year")),
          lines: [
            {
              categoryId: form.get("categoryId"),
              costCenterId: form.get("costCenterId") || null,
              month: Number(form.get("month")),
              plannedCents: cents(form.get("planned")),
            },
          ],
        }),
      });
      await load();
      event.currentTarget.reset();
    } catch (reason) {
      setFailure((reason as Error).message);
    }
  }
  return (
    <>
      <Feedback error={error || failure} />
      <Panel title="Criar orçamento">
        <form
          onSubmit={create}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          <input name="name" required placeholder="Nome" className={field} />
          <input
            name="year"
            type="number"
            min="2000"
            max="2200"
            defaultValue={new Date().getFullYear()}
            required
            className={field}
          />
          <select name="categoryId" required className={field}>
            <option value="">Categoria</option>
            {(config.categories || []).map((item: Json) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select name="costCenterId" className={field}>
            <option value="">Organização</option>
            {(config.costCenters || []).map((item: Json) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              name="month"
              type="number"
              min="1"
              max="12"
              placeholder="Mês"
              required
              className={field}
            />
            <input
              name="planned"
              inputMode="decimal"
              placeholder="Planejado"
              required
              className={field}
            />
          </div>
          <Submit>Criar revisão</Submit>
        </form>
      </Panel>
      <Panel title="Orçamentos">
        <div className="space-y-3">
          {budgets.map((budget: Json) => (
            <BudgetRow
              key={budget.id}
              budget={budget}
              money={money}
              reload={load}
            />
          ))}
          {!budgets.length ? (
            <p className="text-sm text-zinc-500">Nenhum orçamento criado.</p>
          ) : null}
        </div>
      </Panel>
    </>
  );
}
function BudgetRow({
  budget,
  money,
  reload,
}: {
  budget: Json;
  money: (value: number) => string;
  reload: () => Promise<void>;
}) {
  const [report, setReport] = useState<Json | null>(null);
  async function status(value: string) {
    await api(`/api/hub/finance/budgets/${budget.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: value }),
    });
    await reload();
  }
  return (
    <div className="rounded-xl border border-zinc-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <strong>{budget.name}</strong>
          <p className="text-xs text-zinc-500">
            {budget.year} · revisão {budget.revision}
          </p>
        </div>
        <Status>{budget.status}</Status>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={hubUi.secondaryButton}
          onClick={async () =>
            setReport(await api(`/api/hub/finance/budgets/${budget.id}`))
          }
        >
          Planejado x realizado
        </button>
        {budget.status === "DRAFT" ? (
          <button
            className={hubUi.primaryButton}
            onClick={() => status("APPROVED")}
          >
            Aprovar
          </button>
        ) : null}
        {budget.status !== "ARCHIVED" ? (
          <button
            className={hubUi.secondaryButton}
            onClick={() => status("ARCHIVED")}
          >
            Arquivar
          </button>
        ) : null}
      </div>
      {report ? (
        <div className="mt-3 space-y-1 text-sm">
          {report.lines.map((line: Json) => (
            <p key={line.id}>
              Mês {line.month}: {money(line.plannedCents)} planejado ·{" "}
              {money(line.actualCents)} realizado · {money(line.varianceCents)}{" "}
              variação
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Reimbursements() {
  const { money, date } = useHubDisplay();
  const { data, error, load } = useLoad([
    "/api/hub/finance/reimbursements",
    "/api/hub/finance/configuration",
  ]);
  const requests = data[0]?.requests || [];
  const config = data[1] || {};
  const [failure, setFailure] = useState("");
  async function post(path: string, body?: Json) {
    try {
      await api(path, { method: "POST", body: JSON.stringify(body || {}) });
      await load();
    } catch (reason) {
      setFailure((reason as Error).message);
    }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await post("/api/hub/finance/reimbursements", {
      description: form.get("description"),
      costCenterId: form.get("costCenterId") || null,
      items: [
        {
          description: form.get("item"),
          expenseDate: form.get("expenseDate"),
          amountCents: cents(form.get("amount")),
          categoryId: form.get("categoryId"),
          receiptReference: form.get("receiptReference") || null,
        },
      ],
      idempotencyKey: crypto.randomUUID(),
    });
  }
  return (
    <>
      <Feedback error={error || failure} />
      <Panel title="Solicitar reembolso">
        <form
          onSubmit={create}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <input
            name="description"
            required
            placeholder="Motivo"
            className={field}
          />
          <input
            name="item"
            required
            placeholder="Item da despesa"
            className={field}
          />
          <input
            name="amount"
            required
            inputMode="decimal"
            placeholder="Valor"
            className={field}
          />
          <input name="expenseDate" required type="date" className={field} />
          <select name="categoryId" required className={field}>
            <option value="">Categoria</option>
            {(config.categories || []).map((item: Json) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select name="costCenterId" className={field}>
            <option value="">Sem centro de custo</option>
            {(config.costCenters || []).map((item: Json) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <input
            name="receiptReference"
            placeholder="Referência ou URL HTTPS pública"
            className={`sm:col-span-2 ${field}`}
          />
          <Submit>Criar rascunho</Submit>
        </form>
      </Panel>
      <Panel title="Solicitações">
        <div className="space-y-3">
          {requests.map((request: Json) => (
            <div
              key={request.id}
              className="rounded-xl border border-zinc-200 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong>{request.description}</strong>
                  <p className="text-xs text-zinc-500">
                    {date(request.submittedAt || request.createdAt)}
                  </p>
                </div>
                <span className="flex items-center gap-2">
                  <Status>{request.status}</Status>
                  <strong>{money(request.totalCents)}</strong>
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {request.status === "DRAFT" ? (
                  <button
                    className={hubUi.primaryButton}
                    onClick={() =>
                      post(
                        `/api/hub/finance/reimbursements/${request.id}/submit`,
                      )
                    }
                  >
                    Enviar
                  </button>
                ) : null}
                {data[0]?.canReview && request.status === "SUBMITTED" ? (
                  <>
                    <button
                      className={hubUi.primaryButton}
                      onClick={() =>
                        post(
                          `/api/hub/finance/reimbursements/${request.id}/review`,
                          { decision: "APPROVE" },
                        )
                      }
                    >
                      Aprovar
                    </button>
                    <button
                      className={hubUi.secondaryButton}
                      onClick={() => void (async () => { const rejectionReason = await requestHubText({ title: "Rejeitar reembolso", required: true }); if (rejectionReason) await post(`/api/hub/finance/reimbursements/${request.id}/review`, { decision: "REJECT", rejectionReason }); })()}
                    >
                      Rejeitar
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
          {!requests.length ? (
            <p className="text-sm text-zinc-500">Nenhuma solicitação.</p>
          ) : null}
        </div>
      </Panel>
    </>
  );
}

function Reports() {
  const { money, date } = useHubDisplay();
  const [query, setQuery] = useState("");
  const { data, error } = useLoad([`/api/hub/finance/reports${query}`]);
  const report = data[0] || {};
  const summary = report.summary || {};
  return (
    <>
      <Feedback error={error} />
      <Panel
        title="Filtros e exportação"
        action={
          <a
            href={`/api/hub/finance/reports${query ? `${query}&` : "?"}format=csv`}
            className={hubUi.secondaryButton}
          >
            <Download className="h-4 w-4" /> CSV
          </a>
        }
      >
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const params = new URLSearchParams();
            for (const key of ["from", "to", "status"])
              if (form.get(key)) params.set(key, String(form.get(key)));
            setQuery(params.size ? `?${params}` : "");
          }}
        >
          <input
            type="date"
            name="from"
            className={field}
            aria-label="Data inicial"
          />
          <input
            type="date"
            name="to"
            className={field}
            aria-label="Data final"
          />
          <select name="status" className={field} aria-label="Status">
            <option value="">Todos os status</option>
            {[
              "PENDING_APPROVAL",
              "APPROVED",
              "PARTIALLY_SETTLED",
              "SETTLED",
            ].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <Submit>Atualizar</Submit>
        </form>
      </Panel>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Movimento de caixa"
          value={money(summary.cashMovementCents || 0)}
        />
        <Metric
          label="Receitas liquidadas"
          value={money(summary.settledIncomeCents || 0)}
        />
        <Metric
          label="Despesas liquidadas"
          value={money(summary.settledExpenseCents || 0)}
        />
        <Metric label="Vencido" value={money(summary.overdueCents || 0)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Fluxo mensal">
          {(report.monthlyCashFlow || []).map((item: Json) => (
            <p
              key={item.month}
              className="flex justify-between gap-4 border-b border-zinc-100 py-2 text-sm"
            >
              <span>{item.month}</span>
              <strong>{money(item.netCents)}</strong>
            </p>
          ))}
        </Panel>
        <Panel title="Parcelas vencidas">
          {(report.overdueInstallments || []).map((item: Json) => (
            <p
              key={`${item.entryId}-${item.dueDate}`}
              className="flex flex-wrap justify-between gap-2 border-b border-zinc-100 py-2 text-sm"
            >
              <span>
                {item.description} · {date(item.dueDate)}
              </span>
              <strong>{money(item.outstandingCents)}</strong>
            </p>
          ))}
        </Panel>
        <Panel title="Por categoria">
          <List
            names={(report.categoryBreakdown || []).map(
              (item: Json) => `${item.label} · ${money(item.amountCents)}`,
            )}
          />
        </Panel>
        <Panel title="Por centro de custo">
          <List
            names={(report.costCenterBreakdown || []).map(
              (item: Json) => `${item.label} · ${money(item.amountCents)}`,
            )}
          />
        </Panel>
        <Panel title="Orçamento versus realizado">
          <List
            names={(report.budgetVsActual || []).map(
              (item: Json) =>
                `${item.name} (${item.year}) · ${money(item.plannedCents)} planejado · ${money(item.actualCents)} realizado · ${money(item.varianceCents)} variação`,
            )}
          />
        </Panel>
      </div>
    </>
  );
}

function Settings() {
  const { data, error, load } = useLoad(["/api/hub/finance/configuration"]);
  const config = data[0] || {};
  const [failure, setFailure] = useState("");
  async function create(event: FormEvent<HTMLFormElement>, kind: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form.entries());
    try {
      await api("/api/hub/finance/configuration", {
        method: "POST",
        body: JSON.stringify({ kind, ...values }),
      });
      event.currentTarget.reset();
      await load();
    } catch (reason) {
      setFailure((reason as Error).message);
    }
  }
  async function period(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/hub/finance/periods", {
        method: "POST",
        body: JSON.stringify({
          year: Number(form.get("year")),
          month: Number(form.get("month")),
          status: form.get("status"),
          reason: form.get("reason"),
        }),
      });
      await load();
    } catch (reason) {
      setFailure((reason as Error).message);
    }
  }
  return (
    <>
      <Feedback error={error || failure} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Categorias">
          <form
            onSubmit={(event) => create(event, "category")}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <input name="name" required placeholder="Nome" className={field} />
            <select name="type" className={field}>
              <option>EXPENSE</option>
              <option>INCOME</option>
              <option>BOTH</option>
            </select>
            <Submit>Adicionar</Submit>
          </form>
          <List
            names={(config.categories || []).map(
              (item: Json) => `${item.name} · ${item.type}`,
            )}
          />
        </Panel>
        <Panel title="Centros de custo">
          <form
            onSubmit={(event) => create(event, "costCenter")}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <input name="name" required placeholder="Nome" className={field} />
            <input
              name="code"
              required
              placeholder="Código"
              className={field}
            />
            <Submit>Adicionar</Submit>
          </form>
          <List
            names={(config.costCenters || []).map(
              (item: Json) => `${item.code} · ${item.name}`,
            )}
          />
        </Panel>
        <Panel title="Contrapartes">
          <form
            onSubmit={(event) => create(event, "counterparty")}
            className="grid gap-2 sm:grid-cols-2"
          >
            <input name="name" required placeholder="Nome" className={field} />
            <select name="type" className={field}>
              <option>CUSTOMER</option>
              <option>SUPPLIER</option>
              <option>BOTH</option>
              <option>OTHER</option>
            </select>
            <input name="document" placeholder="Documento" className={field} />
            <input
              name="email"
              type="email"
              placeholder="E-mail"
              className={field}
            />
            <Submit>Adicionar</Submit>
          </form>
          <List
            names={(config.counterparties || []).map(
              (item: Json) => `${item.name} · ${item.type}`,
            )}
          />
        </Panel>
        <Panel title="Períodos financeiros">
          <form onSubmit={period} className="grid gap-2 sm:grid-cols-2">
            <input
              name="year"
              type="number"
              defaultValue={new Date().getFullYear()}
              className={field}
            />
            <input
              name="month"
              type="number"
              min="1"
              max="12"
              defaultValue={new Date().getMonth() + 1}
              className={field}
            />
            <select name="status" className={field}>
              <option value="CLOSED">Fechar</option>
              <option value="OPEN">Reabrir</option>
            </select>
            <input
              name="reason"
              placeholder="Motivo da reabertura"
              className={field}
            />
            <Submit>Aplicar</Submit>
          </form>
          <List
            names={(config.periods || []).map(
              (item: Json) =>
                `${String(item.month).padStart(2, "0")}/${item.year} · ${item.status}`,
            )}
          />
        </Panel>
      </div>
    </>
  );
}

function People() {
  const { date } = useHubDisplay();
  const { data, error, load } = useLoad(["/api/hub/people/overview"]);
  const overview = data[0] || {};
  const [failure, setFailure] = useState("");
  async function mutate(path: string, body: Json) {
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) });
      await load();
    } catch (reason) {
      setFailure((reason as Error).message);
    }
  }
  async function profile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    try {
      await api("/api/hub/people/me/profile", {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      await load();
    } catch (reason) {
      setFailure((reason as Error).message);
    }
  }
  return (
    <>
      <Feedback error={error || failure} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Meu perfil">
          <p className="mb-3 text-xs text-zinc-500">
            Campos de emergência e datas administrativas são sensíveis e
            visíveis apenas para pessoas autorizadas.
          </p>
          <form onSubmit={profile} className="grid gap-3 sm:grid-cols-2">
            <input
              name="phone"
              defaultValue={overview.profile?.phone || ""}
              placeholder="Telefone"
              className={field}
            />
            <input
              name="university"
              defaultValue={overview.profile?.university || ""}
              placeholder="Universidade"
              className={field}
            />
            <input
              name="course"
              defaultValue={overview.profile?.course || ""}
              placeholder="Curso"
              className={field}
            />
            <input
              name="semester"
              defaultValue={overview.profile?.semester || ""}
              placeholder="Semestre"
              className={field}
            />
            <input
              name="linkedinUrl"
              defaultValue={overview.profile?.linkedinUrl || ""}
              placeholder="LinkedIn HTTPS"
              className={field}
            />
            <textarea
              name="bio"
              defaultValue={overview.profile?.bio || ""}
              placeholder="Bio"
              className={field}
            />
            <Submit>Salvar meu perfil</Submit>
          </form>
        </Panel>
        <Panel title="Meu onboarding">
          <div className="space-y-3">
            {(overview.onboardingItems || []).map((item: Json) => (
              <div
                key={item.id}
                className="rounded-xl border border-zinc-200 p-3"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span>
                    {item.title}
                    {item.dueDate ? ` · ${date(item.dueDate)}` : ""}
                  </span>
                  {item.completedAt ? (
                    <Status>CONCLUÍDO</Status>
                  ) : (
                    <button
                      className={hubUi.primaryButton}
                      onClick={() =>
                        mutate(
                          `/api/hub/people/onboarding/items/${item.id}/complete`,
                          { version: item.version },
                        )
                      }
                    >
                      <Check className="h-4 w-4" /> Concluir
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Reconhecimentos">
          <RecognitionForm members={overview.members || []} onDone={load} />
          <List
            names={(overview.recognitions || []).map(
              (item: Json) => `${item.title} · ${date(item.recognizedAt)}`,
            )}
          />
        </Panel>
        <Panel title="Participação">
          <Metric
            label="Presenças registradas em reuniões"
            value={String(overview.participation?.meetingAttendanceCount || 0)}
          />
          <p className="mt-3 text-xs text-zinc-500">
            Indicador informativo; não produz decisão disciplinar automática.
          </p>
          <List
            names={(overview.participation?.external || []).map(
              (item: Json) =>
                `${item.type} · ${item.source} · ${date(item.date)}`,
            )}
          />
        </Panel>
      </div>
    </>
  );
}
function RecognitionForm({
  members,
  onDone,
}: {
  members: Json[];
  onDone: () => Promise<void>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/hub/people/recognitions", {
      method: "POST",
      body: JSON.stringify({
        recipientMemberId: form.get("memberId"),
        title: form.get("title"),
        description: form.get("description"),
        visibility: "ORGANIZATION",
      }),
    });
    event.currentTarget.reset();
    await onDone();
  }
  return (
    <form onSubmit={submit} className="mb-3 grid gap-2 sm:grid-cols-2">
      <select name="memberId" required className={field}>
        <option value="">Pessoa</option>
        {members.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <input name="title" required placeholder="Título" className={field} />
      <input
        name="description"
        required
        placeholder="Descrição"
        className={field}
      />
      <Submit>Reconhecer</Submit>
    </form>
  );
}

function Development() {
  const { date } = useHubDisplay();
  const { data, error, load } = useLoad([
    "/api/hub/people/goals",
    "/api/hub/people/competencies",
    "/api/hub/people/overview",
  ]);
  const goals = data[0]?.goals || [];
  const competencies = data[1]?.competencies || [];
  const members = data[2]?.members || [];
  const [failure, setFailure] = useState("");
  async function createGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/hub/people/goals", {
        method: "POST",
        body: JSON.stringify({
          ownerMemberId: form.get("ownerMemberId"),
          title: form.get("title"),
          dueDate: form.get("dueDate") || null,
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (reason) {
      setFailure((reason as Error).message);
    }
  }
  async function progress(goal: Json, value: number) {
    try {
      await api(`/api/hub/people/goals/${goal.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          version: goal.version,
          progress: value,
          status: value === 100 ? "COMPLETED" : "ACTIVE",
        }),
      });
      await load();
    } catch (reason) {
      setFailure((reason as Error).message);
    }
  }
  return (
    <>
      <Feedback error={error || failure} />
      <Panel title="Nova meta">
        <form onSubmit={createGoal} className="grid gap-2 sm:grid-cols-4">
          <select name="ownerMemberId" required className={field}>
            <option value="">Responsável</option>
            {members.map((item: Json) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <input name="title" required placeholder="Meta" className={field} />
          <input name="dueDate" type="date" className={field} />
          <Submit>Criar meta</Submit>
        </form>
      </Panel>
      <Panel title="Metas de desenvolvimento">
        <div className="space-y-3">
          {goals.map((goal: Json) => (
            <div
              key={goal.id}
              className="rounded-xl border border-zinc-200 p-4"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <strong>{goal.title}</strong>
                  <p className="text-xs text-zinc-500">
                    {goal.dueDate ? date(goal.dueDate) : "Sem prazo"} · versão{" "}
                    {goal.version}
                  </p>
                </div>
                <Status>{goal.status}</Status>
              </div>
              <label className="mt-3 block text-sm">
                Progresso: {goal.progress}%
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="10"
                  value={goal.progress}
                  onChange={(event) =>
                    progress(goal, Number(event.target.value))
                  }
                  className="mt-1 w-full accent-black"
                />
              </label>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Competências · escala 1–5">
        <List
          names={competencies.map(
            (item: Json) =>
              `${item.name}${item.category ? ` · ${item.category}` : ""}`,
          )}
        />
      </Panel>
    </>
  );
}

function Evaluations() {
  const { data, error, load } = useLoad([
    "/api/hub/people/cycles",
    "/api/hub/people/evaluations",
    "/api/hub/people/overview",
  ]);
  const cycles = data[0]?.cycles || [];
  const evaluations = data[1]?.evaluations || [];
  const members = data[2]?.members || [];
  const [failure, setFailure] = useState("");
  async function submitEvaluation(item: Json) {
    try {
      const detail = await api(`/api/hub/people/evaluations/${item.id}/submit`);
      const responses = await Promise.all(detail.criteria.map(async (criterion: Json) => {
        const score = Number(await requestHubText({ title: `Nota: ${criterion.title}`, description: `Informe uma nota entre ${criterion.scaleMin} e ${criterion.scaleMax}.`, label: "Nota", required: true, multiline: false }));
        if (
          !Number.isInteger(score) ||
          score < criterion.scaleMin ||
          score > criterion.scaleMax
        )
          throw new Error("Escolha uma nota valida para todos os criterios.");
        return {
          criterionId: criterion.id,
          score,
          comment: (await requestHubText({ title: `Comentário: ${criterion.title}`, label: "Comentário (opcional)" })) || "",
        };
      }));
      await api(`/api/hub/people/evaluations/${item.id}/submit`, {
        method: "POST",
        body: JSON.stringify({ version: item.version, responses }),
      });
      await load();
    } catch (reason) {
      setFailure((reason as Error).message);
    }
  }
  async function feedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/hub/people/feedback", {
        method: "POST",
        body: JSON.stringify({
          recipientMemberId: form.get("recipientMemberId"),
          body: form.get("body"),
          visibility: form.get("visibility"),
        }),
      });
      event.currentTarget.reset();
    } catch (reason) {
      setFailure((reason as Error).message);
    }
  }
  return (
    <>
      <Feedback error={error || failure} />
      <Panel title="Enviar feedback confidencial">
        <p className="mb-3 text-xs text-zinc-500">
          A autoria é preservada. Confidencialidade não significa anonimato.
        </p>
        <form onSubmit={feedback} className="grid gap-2 sm:grid-cols-3">
          <select name="recipientMemberId" required className={field}>
            <option value="">Destinatário</option>
            {members.map((item: Json) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <textarea
            name="body"
            required
            placeholder="Feedback"
            className={field}
          />
          <select name="visibility" className={field}>
            <option>PRIVATE_TO_RECIPIENT</option>
            <option>MANAGER_AND_RECIPIENT</option>
            <option>PEOPLE_ADMIN</option>
          </select>
          <Submit>Enviar feedback</Submit>
        </form>
      </Panel>
      <Panel title="Minhas avaliações">
        <div className="space-y-3">
          {evaluations.map((item: Json) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 p-4"
            >
              <span>
                {item.type} · ciclo{" "}
                {cycles.find((cycle: Json) => cycle.id === item.cycleId)
                  ?.name || item.cycleId}
              </span>
              {item.status === "PENDING" ? (
                <button
                  className={hubUi.primaryButton}
                  onClick={() => submitEvaluation(item)}
                >
                  Preencher avaliação
                </button>
              ) : (
                <Status>{item.status}</Status>
              )}
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Ciclos">
        <List
          names={cycles.map((item: Json) => `${item.name} · ${item.status}`)}
        />
      </Panel>
    </>
  );
}

function Recruitment() {
  const { data, error, load } = useLoad([
    "/api/hub/people/recruitment/processes",
    "/api/hub/people/candidates",
  ]);
  const processes = data[0]?.processes || [];
  const stages = data[0]?.stages || [];
  const candidates = data[1]?.candidates || [];
  const [failure, setFailure] = useState("");
  async function mutate(path: string, body: Json) {
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) });
      await load();
    } catch (reason) {
      setFailure((reason as Error).message);
    }
  }
  async function process(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("/api/hub/people/recruitment/processes", {
      title: form.get("title"),
      stages: String(form.get("stages"))
        .split(",")
        .map((item) => item.trim()),
    });
  }
  async function candidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("/api/hub/people/candidates", {
      processId: form.get("processId"),
      name: form.get("name"),
      email: form.get("email"),
    });
  }
  return (
    <>
      <Feedback error={error || failure} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Novo processo">
          <form onSubmit={process} className="space-y-2">
            <input
              name="title"
              required
              placeholder="Título"
              className={field}
            />
            <input
              name="stages"
              required
              defaultValue="Inscrição, Entrevista, Decisão"
              aria-describedby="stages-help"
              className={field}
            />
            <p id="stages-help" className="text-xs text-zinc-500">
              Etapas separadas por vírgula.
            </p>
            <Submit>Abrir processo</Submit>
          </form>
        </Panel>
        <Panel title="Novo candidato">
          <form onSubmit={candidate} className="space-y-2">
            <select name="processId" required className={field}>
              <option value="">Processo</option>
              {processes
                .filter((item: Json) => item.status === "OPEN")
                .map((item: Json) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
            <input name="name" required placeholder="Nome" className={field} />
            <input
              name="email"
              type="email"
              required
              placeholder="E-mail"
              className={field}
            />
            <Submit>Adicionar candidato</Submit>
          </form>
        </Panel>
      </div>
      <Panel title="Candidatos e etapas">
        <p className="mb-3 text-xs text-zinc-500">
          Selecione a etapa e confirme pelo botão; não é necessário arrastar.
        </p>
        <div className="space-y-3">
          {candidates.map((item: Json) => (
            <CandidateRow
              key={item.id}
              item={item}
              stages={stages.filter(
                (stage: Json) => stage.processId === item.processId,
              )}
              mutate={mutate}
            />
          ))}
        </div>
      </Panel>
    </>
  );
}
function CandidateRow({
  item,
  stages,
  mutate,
}: {
  item: Json;
  stages: Json[];
  mutate: (path: string, body: Json) => Promise<void>;
}) {
  const [stage, setStage] = useState(
    item.currentStageId || stages[0]?.id || "",
  );
  return (
    <div className="rounded-xl border border-zinc-200 p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <strong>{item.name}</strong>
        <Status>{item.status}</Status>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <select
          value={stage}
          onChange={(event) => setStage(event.target.value)}
          className={field}
          aria-label={`Etapa de ${item.name}`}
        >
          {stages.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <button
          className={hubUi.secondaryButton}
          onClick={() =>
            mutate(`/api/hub/people/candidates/${item.id}/move`, {
              toStageId: stage,
              expectedVersion: item.version,
              idempotencyKey: crypto.randomUUID(),
            })
          }
        >
          Mover
        </button>
        <button
          className={hubUi.secondaryButton}
          onClick={() => void (async () => { const reason = await requestHubText({ title: `Rejeitar ${item.name}`, required: true }); if (reason) await mutate(`/api/hub/people/candidates/${item.id}/reject`, { expectedVersion: item.version, reason }); })()}
        >
          Rejeitar
        </button>
        <button
          className={hubUi.primaryButton}
          onClick={() => void (async () => { if (await requestHubConfirmation({ title: `Contratar ${item.name}`, description: "Criará um membro convidado sem envio de senha." })) await mutate(`/api/hub/people/candidates/${item.id}/hire`, { expectedVersion: item.version, confirm: true }); })()}
        >
          Contratar
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${hubUi.panel} min-w-0 p-4`}>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-xl font-semibold">{value}</p>
    </div>
  );
}
function List({ names }: { names: string[] }) {
  return (
    <div className="mt-4 divide-y divide-zinc-100">
      {names.map((name, index) => (
        <p key={`${name}-${index}`} className="break-words py-2 text-sm">
          {name}
        </p>
      ))}
      {!names.length ? (
        <p className="py-4 text-sm text-zinc-500">Nenhum registro.</p>
      ) : null}
    </div>
  );
}
