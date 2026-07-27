"use client";

import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarRange,
  CheckCircle2,
  Handshake,
  Plus,
  RefreshCw,
  Target,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { hubUi } from "./styles";
import { requestHubText } from "./HubDialog";
import { useHubDisplay } from "./HubOrganizationContext";

type Json = Record<string, unknown>;
type StrategyData = {
  cycles: Json[];
  objectives: Json[];
  initiatives: Json[];
  indicators: Json[];
  risks: Json[];
  reviews: Json[];
  dashboard: Json;
  capabilities: Json;
};
type GrowthData = {
  organizations: Json[];
  leads: Json[];
  stages: Json[];
  opportunities: Json[];
  proposals: Json[];
  partnerships: Json[];
  dashboard: Json;
  capabilities: Json;
};

const strategyLinks = [
  ["/hub/estrategia", "Visão geral"],
  ["/hub/estrategia/objetivos", "Objetivos"],
  ["/hub/estrategia/indicadores", "Indicadores"],
  ["/hub/estrategia/riscos", "Riscos"],
  ["/hub/estrategia/revisoes", "Revisões"],
];
const growthLinks = [
  ["/hub/crescimento", "Visão geral"],
  ["/hub/crescimento/organizacoes", "Organizações"],
  ["/hub/crescimento/oportunidades", "Oportunidades"],
  ["/hub/crescimento/propostas", "Propostas"],
  ["/hub/crescimento/parcerias", "Parcerias"],
  ["/hub/crescimento/configuracoes", "Configurações"],
];
const input = hubUi.input;

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
function numberField(form: FormData, name: string, fallback = 0) {
  const value = Number(field(form, name));
  return Number.isFinite(value) ? value : fallback;
}
function status(value: unknown) {
  return String(value || "—").replace(/_/g, " ");
}
const partnershipNext: Record<string, string[]> = {
  PROPOSED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["PAUSED", "ENDED", "CANCELLED"],
  PAUSED: ["ACTIVE", "ENDED", "CANCELLED"],
};

export function HubStrategyGrowthPage({
  area,
  section = "overview",
}: {
  area: "strategy" | "growth";
  section?: string;
}) {
  const [data, setData] = useState<StrategyData | GrowthData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/hub/${area}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Não foi possível carregar os dados.");
      setData(payload);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível carregar os dados.",
      );
    }
  }, [area]);
  useEffect(() => {
    void load();
  }, [load]);
  async function send(path: string, body: Json) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload.error || "Não foi possível concluir a operação.",
        );
      setNotice("Operação concluída.");
      await load();
      return payload;
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível concluir a operação.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!data && !error)
    return (
      <div className={hubUi.page}>
        <div className="h-56 animate-pulse rounded-2xl bg-white" />
      </div>
    );
  const links = area === "strategy" ? strategyLinks : growthLinks;
  const title = area === "strategy" ? "Estratégia" : "Crescimento";
  const subtitle =
    area === "strategy"
      ? "Planejamento, execução, indicadores, riscos e revisões."
      : "Relacionamentos, pipeline, propostas e parcerias comerciais.";
  return (
    <div className={hubUi.page}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-zinc-500">Atlas Hub</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-sm text-zinc-600">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className={hubUi.secondaryButton}
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      </header>
      <nav
        aria-label={`Seções de ${title}`}
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {links.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className={`whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-medium ${href.endsWith(section === "overview" ? (area === "strategy" ? "estrategia" : "crescimento") : section) ? "border-black bg-black text-white" : "border-zinc-300 bg-white text-zinc-700"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {notice}
        </div>
      ) : null}
      {area === "strategy" ? (
        <StrategyContent
          data={data as StrategyData}
          section={section}
          busy={busy}
          send={send}
        />
      ) : (
        <GrowthContent
          data={data as GrowthData}
          section={section}
          busy={busy}
          send={send}
        />
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Target;
}) {
  return (
    <div className={`${hubUi.panel} p-4`}>
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-zinc-500">{children}</p>;
}

function StrategyContent({
  data,
  section,
  busy,
  send,
}: {
  data: StrategyData;
  section: string;
  busy: boolean;
  send: (path: string, body: Json) => Promise<unknown>;
}) {
  const dashboard = data.dashboard;
  const canManage = Boolean(data.capabilities.canManage);
  const activeCycle = dashboard.activeCycle as Json | null;
  if (section === "overview")
    return (
      <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Ciclo ativo"
            value={activeCycle ? String(activeCycle.name) : "Nenhum"}
            icon={CalendarRange}
          />
          <Metric
            label="Progresso médio"
            value={`${dashboard.objectiveProgress || 0}%`}
            icon={Target}
          />
          <Metric
            label="KRs em risco"
            value={String(dashboard.keyResultsAtRisk || 0)}
            icon={AlertTriangle}
          />
          <Metric
            label="Iniciativas atrasadas"
            value={String(dashboard.overdueInitiatives || 0)}
            icon={CheckCircle2}
          />
          <Metric
            label="Riscos altos"
            value={String(dashboard.highScoreRisks || 0)}
            icon={AlertTriangle}
          />
        </div>
        <CyclePanel data={data} busy={busy} canManage={canManage} send={send} />
        <InitiativesPanel
          data={data}
          busy={busy}
          canManage={canManage}
          send={send}
        />
      </>
    );
  if (section === "objetivos")
    return (
      <ObjectivesPanel
        data={data}
        busy={busy}
        canManage={canManage}
        send={send}
      />
    );
  if (section === "indicadores")
    return (
      <IndicatorsPanel
        data={data}
        busy={busy}
        canManage={canManage}
        send={send}
      />
    );
  if (section === "riscos")
    return (
      <RisksPanel data={data} busy={busy} canManage={canManage} send={send} />
    );
  return (
    <ReviewsPanel
      data={data}
      busy={busy}
      canReview={Boolean(data.capabilities.canReview)}
      send={send}
    />
  );
}

function CyclePanel({
  data,
  busy,
  canManage,
  send,
}: {
  data: StrategyData;
  busy: boolean;
  canManage: boolean;
  send: (path: string, body: Json) => Promise<unknown>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await send("/api/hub/strategy", {
      action: "cycle",
      input: {
        name: field(form, "name"),
        startsAt: field(form, "startsAt"),
        endsAt: field(form, "endsAt"),
        description: field(form, "description"),
      },
    });
    event.currentTarget.reset();
  }
  return (
    <section className={`${hubUi.panel} p-5`}>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Ciclos estratégicos</h2>
        <span className="text-xs text-zinc-500">
          {data.cycles.length} ciclo(s)
        </span>
      </div>
      {canManage ? (
        <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="text-sm">
            Nome
            <input name="name" required className={`${input} mt-1`} />
          </label>
          <label className="text-sm">
            Início
            <input
              name="startsAt"
              type="date"
              required
              className={`${input} mt-1`}
            />
          </label>
          <label className="text-sm">
            Fim
            <input
              name="endsAt"
              type="date"
              required
              className={`${input} mt-1`}
            />
          </label>
          <button disabled={busy} className={`${hubUi.primaryButton} self-end`}>
            <Plus className="h-4 w-4" />
            Criar ciclo
          </button>
        </form>
      ) : null}
      <div className="mt-4 divide-y divide-zinc-100">
        {data.cycles.length ? (
          data.cycles.map((cycle) => (
            <div
              key={String(cycle.id)}
              className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{String(cycle.name)}</p>
                <p className="text-xs text-zinc-500">
                  Status: {status(cycle.status)} · versão{" "}
                  {String(cycle.version)}
                </p>
              </div>
              {canManage && cycle.status !== "ARCHIVED" ? (
                <div className="flex gap-2">
                  {cycle.status === "DRAFT" ? (
                    <button
                      onClick={() =>
                        void send("/api/hub/strategy/mutations", {
                          action: "cycle-transition",
                          id: cycle.id,
                          input: { status: "ACTIVE", version: cycle.version },
                        })
                      }
                      className={hubUi.secondaryButton}
                    >
                      Ativar
                    </button>
                  ) : null}
                  {cycle.status === "ACTIVE" ? (
                    <button
                      onClick={() =>
                        void send("/api/hub/strategy/mutations", {
                          action: "cycle-transition",
                          id: cycle.id,
                          input: { status: "CLOSED", version: cycle.version },
                        })
                      }
                      className={hubUi.secondaryButton}
                    >
                      Encerrar
                    </button>
                  ) : null}
                  {["DRAFT", "CLOSED"].includes(String(cycle.status)) ? (
                    <button
                      onClick={() =>
                        void send("/api/hub/strategy/mutations", {
                          action: "cycle-transition",
                          id: cycle.id,
                          input: { status: "ARCHIVED", version: cycle.version },
                        })
                      }
                      className={hubUi.secondaryButton}
                    >
                      Arquivar
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <Empty>Nenhum ciclo cadastrado.</Empty>
        )}
      </div>
    </section>
  );
}

function ObjectivesPanel({
  data,
  busy,
  canManage,
  send,
}: {
  data: StrategyData;
  busy: boolean;
  canManage: boolean;
  send: (path: string, body: Json) => Promise<unknown>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await send("/api/hub/strategy", {
      action: "objective",
      input: {
        cycleId: field(f, "cycleId"),
        title: field(f, "title"),
        priority: field(f, "priority"),
        dueAt: field(f, "dueAt"),
      },
    });
    event.currentTarget.reset();
  }
  return (
    <section className={`${hubUi.panel} p-5`}>
      <h2 className="font-semibold">Objetivos e resultados-chave</h2>
      {canManage ? (
        <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="text-sm">
            Ciclo
            <select name="cycleId" required className={`${input} mt-1`}>
              <option value="">Selecione</option>
              {data.cycles
                .filter((c) => ["DRAFT", "ACTIVE"].includes(String(c.status)))
                .map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {String(c.name)}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            Título
            <input name="title" required className={`${input} mt-1`} />
          </label>
          <label className="text-sm">
            Prioridade
            <select name="priority" className={`${input} mt-1`}>
              <option>MEDIUM</option>
              <option>HIGH</option>
              <option>CRITICAL</option>
              <option>LOW</option>
            </select>
          </label>
          <label className="text-sm">
            Prazo
            <input name="dueAt" type="date" className={`${input} mt-1`} />
          </label>
          <button disabled={busy} className={hubUi.primaryButton}>
            Criar objetivo
          </button>
        </form>
      ) : null}
      <div className="mt-5 space-y-3">
        {data.objectives.length ? (
          data.objectives.map((objective) => (
            <ObjectiveCard
              key={String(objective.id)}
              objective={objective}
              busy={busy}
              send={send}
            />
          ))
        ) : (
          <Empty>Nenhum objetivo disponível para o seu escopo.</Empty>
        )}
      </div>
    </section>
  );
}

function ObjectiveCard({
  objective,
  busy,
  send,
}: {
  objective: Json;
  busy: boolean;
  send: (path: string, body: Json) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const keyResults = (objective.keyResults || []) as Json[];
  async function addKr(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await send("/api/hub/strategy", {
      action: "key-result",
      input: {
        objectiveId: objective.id,
        title: field(f, "title"),
        unit: field(f, "unit"),
        startValue: numberField(f, "startValue"),
        targetValue: numberField(f, "targetValue"),
        weight: numberField(f, "weight"),
        direction: field(f, "direction"),
      },
    });
    setOpen(false);
  }
  return (
    <article className="rounded-xl border border-zinc-200 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{String(objective.title)}</h3>
            <span className="rounded-full border px-2 py-0.5 text-xs">
              {status(objective.status)}
            </span>
            <span className="text-xs text-zinc-500">
              Prioridade {status(objective.priority)}
            </span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100"
            aria-label={`Progresso ${objective.progress}%`}
          >
            <div
              className="h-full bg-black"
              style={{ width: `${objective.progress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {String(objective.progress)}% concluído · versão{" "}
            {String(objective.version)}
          </p>
        </div>
        {(objective.capabilities as Json)?.canEdit ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={hubUi.secondaryButton}
          >
            Adicionar KR
          </button>
        ) : null}
      </div>
      {open ? (
        <form
          onSubmit={addKr}
          className="mt-3 grid gap-2 rounded-xl bg-zinc-50 p-3 sm:grid-cols-6"
        >
          <input
            name="title"
            placeholder="Resultado-chave"
            required
            className={`${input} sm:col-span-2`}
          />
          <input name="unit" placeholder="Unidade" required className={input} />
          <input
            name="startValue"
            type="number"
            step="any"
            placeholder="Inicial"
            required
            className={input}
          />
          <input
            name="targetValue"
            type="number"
            step="any"
            placeholder="Meta"
            required
            className={input}
          />
          <input
            name="weight"
            type="number"
            step="any"
            min="0.01"
            max="100"
            placeholder="Peso"
            required
            className={input}
          />
          <select name="direction" className={input}>
            <option value="INCREASE">Aumentar</option>
            <option value="DECREASE">Reduzir</option>
            <option value="MAINTAIN">Manter</option>
          </select>
          <button disabled={busy} className={hubUi.primaryButton}>
            Salvar KR
          </button>
        </form>
      ) : null}
      <div className="mt-3 divide-y divide-zinc-100">
        {keyResults.map((kr) => (
          <KeyResultRow
            key={String(kr.id)}
            kr={kr}
            canUpdate={Boolean(
              (objective.capabilities as Json)?.canUpdateProgress,
            )}
            busy={busy}
            send={send}
          />
        ))}
      </div>
    </article>
  );
}

function KeyResultRow({
  kr,
  canUpdate,
  busy,
  send,
}: {
  kr: Json;
  canUpdate: boolean;
  busy: boolean;
  send: (path: string, body: Json) => Promise<unknown>;
}) {
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await send("/api/hub/strategy/mutations", {
      action: "key-result-value",
      id: kr.id,
      input: {
        value: numberField(f, "value"),
        notes: field(f, "notes"),
        version: kr.version,
      },
    });
  }
  return (
    <div className="py-3">
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span className="font-medium">{String(kr.title)}</span>
        <span>
          Status: {status(kr.status)} · atual {String(kr.currentValue)} / meta{" "}
          {String(kr.targetValue)} {String(kr.unit)}
        </span>
      </div>
      {canUpdate ? (
        <form
          onSubmit={update}
          className="mt-2 flex flex-col gap-2 sm:flex-row"
        >
          <input
            name="value"
            type="number"
            step="any"
            defaultValue={String(kr.currentValue)}
            aria-label="Novo valor"
            className={`${input} sm:w-40`}
          />
          <input
            name="notes"
            placeholder="Observação da atualização"
            aria-label="Observação"
            className={input}
          />
          <button disabled={busy} className={hubUi.secondaryButton}>
            Atualizar
          </button>
        </form>
      ) : null}
    </div>
  );
}

function InitiativesPanel({
  data,
  busy,
  canManage,
  send,
}: {
  data: StrategyData;
  busy: boolean;
  canManage: boolean;
  send: (path: string, body: Json) => Promise<unknown>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await send("/api/hub/strategy", {
      action: "initiative",
      input: {
        title: field(f, "title"),
        objectiveId: field(f, "objectiveId") || null,
        dueAt: field(f, "dueAt"),
      },
    });
    event.currentTarget.reset();
  }
  return (
    <section className={`${hubUi.panel} p-5`}>
      <h2 className="font-semibold">Iniciativas</h2>
      {canManage ? (
        <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-4">
          <input
            name="title"
            required
            placeholder="Nova iniciativa"
            className={`${input} sm:col-span-2`}
          />
          <select name="objectiveId" className={input}>
            <option value="">Sem objetivo vinculado</option>
            {data.objectives.map((o) => (
              <option key={String(o.id)} value={String(o.id)}>
                {String(o.title)}
              </option>
            ))}
          </select>
          <input name="dueAt" type="date" className={input} />
          <button disabled={busy} className={hubUi.primaryButton}>
            Adicionar
          </button>
        </form>
      ) : null}
      <div className="mt-3 divide-y">
        {data.initiatives.map((initiative) => (
          <div key={String(initiative.id)} className="py-3 text-sm">
            <div className="flex justify-between gap-3">
              <span>{String(initiative.title)}</span>
              <span>
                {status(initiative.status)} · {String(initiative.progress)}%
              </span>
            </div>
            {(initiative.capabilities as Json)?.canEdit ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const f = new FormData(event.currentTarget);
                  void send("/api/hub/strategy/mutations", {
                    action: "initiative-update",
                    id: initiative.id,
                    input: {
                      status: field(f, "status"),
                      progress: numberField(f, "progress"),
                      version: initiative.version,
                    },
                  });
                }}
                className="mt-2 flex flex-wrap gap-2"
              >
                <select
                  name="status"
                  defaultValue={String(initiative.status)}
                  className={input}
                >
                  <option>PLANNED</option>
                  <option>ACTIVE</option>
                  <option>BLOCKED</option>
                  <option>COMPLETED</option>
                  <option>CANCELLED</option>
                </select>
                <input
                  name="progress"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={String(initiative.progress)}
                  className={`${input} w-28`}
                />
                <button disabled={busy} className={hubUi.secondaryButton}>
                  Atualizar iniciativa
                </button>
              </form>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function IndicatorsPanel({
  data,
  busy,
  canManage,
  send,
}: {
  data: StrategyData;
  busy: boolean;
  canManage: boolean;
  send: (path: string, body: Json) => Promise<unknown>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await send("/api/hub/strategy", {
      action: "indicator",
      input: {
        name: field(f, "name"),
        unit: field(f, "unit"),
        targetValue: numberField(f, "targetValue"),
        direction: field(f, "direction"),
        frequency: field(f, "frequency"),
      },
    });
    event.currentTarget.reset();
  }
  return (
    <section className={`${hubUi.panel} p-5`}>
      <h2 className="font-semibold">Indicadores e medições</h2>
      {canManage ? (
        <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-5">
          <input
            name="name"
            required
            placeholder="Indicador"
            className={`${input} md:col-span-2`}
          />
          <input name="unit" required placeholder="Unidade" className={input} />
          <input
            name="targetValue"
            type="number"
            step="any"
            required
            placeholder="Meta"
            className={input}
          />
          <select name="frequency" className={input}>
            <option>MONTHLY</option>
            <option>WEEKLY</option>
            <option>QUARTERLY</option>
            <option>ANNUAL</option>
            <option>MANUAL</option>
          </select>
          <select name="direction" className={input}>
            <option>INCREASE</option>
            <option>DECREASE</option>
            <option>MAINTAIN</option>
          </select>
          <button disabled={busy} className={hubUi.primaryButton}>
            Criar indicador
          </button>
        </form>
      ) : null}
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {data.indicators.length ? (
          data.indicators.map((indicator) => (
            <IndicatorCard
              key={String(indicator.id)}
              indicator={indicator}
              busy={busy}
              send={send}
            />
          ))
        ) : (
          <Empty>Nenhum indicador disponível.</Empty>
        )}
      </div>
    </section>
  );
}

function IndicatorCard({
  indicator,
  busy,
  send,
}: {
  indicator: Json;
  busy: boolean;
  send: (path: string, body: Json) => Promise<unknown>;
}) {
  const measurements = (indicator.measurements || []) as Json[];
  async function measure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await send("/api/hub/strategy/mutations", {
      action: "indicator-measurement",
      id: indicator.id,
      input: {
        value: numberField(f, "value"),
        measuredAt: field(f, "measuredAt"),
        notes: field(f, "notes"),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    event.currentTarget.reset();
  }
  return (
    <article className="rounded-xl border p-4">
      <div className="flex justify-between gap-3">
        <div>
          <h3 className="font-medium">{String(indicator.name)}</h3>
          <p className="text-xs text-zinc-500">
            Meta {String(indicator.targetValue)} {String(indicator.unit)} ·{" "}
            {status(indicator.frequency)}
          </p>
        </div>
        <TrendingUp className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm">
        Última medição:{" "}
        {measurements[0]
          ? `${measurements[0].value} ${indicator.unit}`
          : "ainda não registrada"}
      </p>
      {(indicator.capabilities as Json)?.canEdit ? (
        <form onSubmit={measure} className="mt-3 grid gap-2 sm:grid-cols-3">
          <input
            name="value"
            type="number"
            step="any"
            required
            placeholder="Valor"
            className={input}
          />
          <input
            name="measuredAt"
            type="datetime-local"
            required
            className={input}
          />
          <button disabled={busy} className={hubUi.secondaryButton}>
            Registrar
          </button>
        </form>
      ) : null}
    </article>
  );
}

function RisksPanel({
  data,
  busy,
  canManage,
  send,
}: {
  data: StrategyData;
  busy: boolean;
  canManage: boolean;
  send: (path: string, body: Json) => Promise<unknown>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await send("/api/hub/strategy", {
      action: "risk",
      input: {
        cycleId: field(f, "cycleId"),
        title: field(f, "title"),
        category: field(f, "category"),
        probability: numberField(f, "probability"),
        impact: numberField(f, "impact"),
        mitigation: field(f, "mitigation"),
        reviewDate: field(f, "reviewDate"),
      },
    });
    event.currentTarget.reset();
  }
  return (
    <section className={`${hubUi.panel} p-5`}>
      <h2 className="font-semibold">Riscos estratégicos</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Probabilidade e impacto usam escala controlada de 1 a 5; o escore é
        calculado pelo servidor.
      </p>
      {canManage ? (
        <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-6">
          <select name="cycleId" required className={input}>
            <option value="">Ciclo</option>
            {data.cycles
              .filter((c) => c.status !== "ARCHIVED")
              .map((c) => (
                <option key={String(c.id)} value={String(c.id)}>
                  {String(c.name)}
                </option>
              ))}
          </select>
          <input
            name="title"
            required
            placeholder="Risco"
            className={`${input} md:col-span-2`}
          />
          <input
            name="category"
            required
            placeholder="Categoria"
            className={input}
          />
          <input
            name="probability"
            type="number"
            min="1"
            max="5"
            required
            placeholder="Prob."
            className={input}
          />
          <input
            name="impact"
            type="number"
            min="1"
            max="5"
            required
            placeholder="Impacto"
            className={input}
          />
          <input
            name="mitigation"
            placeholder="Mitigação"
            className={`${input} md:col-span-3`}
          />
          <input name="reviewDate" type="date" className={input} />
          <button disabled={busy} className={hubUi.primaryButton}>
            Registrar risco
          </button>
        </form>
      ) : null}
      <div className="mt-5 space-y-3">
        {data.risks.map((risk) => (
          <article key={String(risk.id)} className="rounded-xl border p-3">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span className="font-medium">{String(risk.title)}</span>
              <span>
                {status(risk.status)} · escore {String(risk.score)}/25
              </span>
            </div>
            {(risk.capabilities as Json)?.canEdit ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const f = new FormData(event.currentTarget);
                  void send("/api/hub/strategy/mutations", {
                    action: "risk-update",
                    id: risk.id,
                    input: {
                      status: field(f, "status"),
                      mitigation: field(f, "mitigation"),
                      reviewDate: field(f, "reviewDate"),
                      version: risk.version,
                    },
                  });
                }}
                className="mt-2 grid gap-2 md:grid-cols-4"
              >
                <select
                  name="status"
                  defaultValue={String(risk.status)}
                  className={input}
                >
                  <option>OPEN</option>
                  <option>MONITORING</option>
                  <option>MITIGATED</option>
                  <option>ACCEPTED</option>
                  <option>CLOSED</option>
                </select>
                <input
                  name="mitigation"
                  defaultValue={String(risk.mitigation || "")}
                  placeholder="Mitigação"
                  className={`${input} md:col-span-2`}
                />
                <input
                  name="reviewDate"
                  type="date"
                  defaultValue={
                    risk.reviewDate ? String(risk.reviewDate).slice(0, 10) : ""
                  }
                  className={input}
                />
                <button disabled={busy} className={hubUi.secondaryButton}>
                  Atualizar risco
                </button>
              </form>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function ReviewsPanel({
  data,
  busy,
  canReview,
  send,
}: {
  data: StrategyData;
  busy: boolean;
  canReview: boolean;
  send: (path: string, body: Json) => Promise<unknown>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await send("/api/hub/strategy", {
      action: "review",
      input: {
        cycleId: field(f, "cycleId"),
        reviewDate: field(f, "reviewDate"),
        summary: field(f, "summary"),
      },
    });
    event.currentTarget.reset();
  }
  return (
    <section className={`${hubUi.panel} p-5`}>
      <h2 className="font-semibold">Revisões estratégicas</h2>
      {canReview ? (
        <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-4">
          <select name="cycleId" required className={input}>
            <option value="">Ciclo</option>
            {data.cycles.map((c) => (
              <option key={String(c.id)} value={String(c.id)}>
                {String(c.name)}
              </option>
            ))}
          </select>
          <input name="reviewDate" type="date" required className={input} />
          <input
            name="summary"
            placeholder="Pauta ou resumo inicial"
            className={input}
          />
          <button disabled={busy} className={hubUi.primaryButton}>
            Agendar revisão
          </button>
        </form>
      ) : null}
      <div className="mt-4 divide-y">
        {data.reviews.length ? (
          data.reviews.map((review) => (
            <div
              key={String(review.id)}
              className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center"
            >
              <div className="flex-1">
                <p className="font-medium">
                  Revisão de {String(review.reviewDate).slice(0, 10)}
                </p>
                <p className="text-xs text-zinc-500">
                  Status: {status(review.status)}
                  {review.meetingId ? " · vinculada a reunião" : ""}
                </p>
              </div>
              {(review.capabilities as Json)?.canClose &&
              review.status === "DRAFT" ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    void send("/api/hub/strategy/mutations", {
                      action: "review-close",
                      id: review.id,
                      input: { version: review.version },
                    })
                  }
                  className={hubUi.secondaryButton}
                >
                  Fechar e capturar snapshots
                </button>
              ) : null}
            </div>
          ))
        ) : (
          <Empty>Nenhuma revisão agendada.</Empty>
        )}
      </div>
    </section>
  );
}

function GrowthContent({
  data,
  section,
  busy,
  send,
}: {
  data: GrowthData;
  section: string;
  busy: boolean;
  send: (path: string, body: Json) => Promise<unknown>;
}) {
  const { money } = useHubDisplay();
  const dashboard = data.dashboard;
  if (section === "overview")
    return (
      <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Pipeline estimado"
            value={money(Number(dashboard.estimatedPipelineValueCents || 0))}
            icon={BarChart3}
          />
          <Metric
            label="Pipeline ponderado"
            value={money(Number(dashboard.weightedPipelineValueCents || 0))}
            icon={TrendingUp}
          />
          <Metric
            label="Valor ganho"
            value={money(Number(dashboard.wonValueCents || 0))}
            icon={CheckCircle2}
          />
          <Metric
            label="Conversão"
            value={`${dashboard.conversionRate || 0}%`}
            icon={Target}
          />
          <Metric
            label="Sem próxima ação"
            value={String(dashboard.withoutNextAction || 0)}
            icon={AlertTriangle}
          />
        </div>
        <LeadsPanel data={data} busy={busy} send={send} />
      </>
    );
  if (section === "organizacoes")
    return <OrganizationsPanel data={data} busy={busy} send={send} />;
  if (section === "oportunidades")
    return <OpportunitiesPanel data={data} busy={busy} send={send} />;
  if (section === "propostas")
    return <ProposalsPanel data={data} busy={busy} send={send} />;
  if (section === "parcerias")
    return <PartnershipsPanel data={data} busy={busy} send={send} />;
  return <PipelinePanel data={data} busy={busy} send={send} />;
}

function LeadsPanel({
  data,
  busy,
  send,
}: {
  data: GrowthData;
  busy: boolean;
  send: (path: string, body: Json) => Promise<unknown>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await send("/api/hub/growth", {
      action: "lead",
      input: {
        title: field(f, "title"),
        source: field(f, "source"),
        growthOrganizationId: field(f, "growthOrganizationId") || null,
        idempotencyKey: crypto.randomUUID(),
      },
    });
    event.currentTarget.reset();
  }
  return (
    <section className={`${hubUi.panel} p-5`}>
      <h2 className="font-semibold">Leads</h2>
      {data.capabilities.canCreate ? (
        <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-4">
          <input
            name="title"
            required
            placeholder="Novo lead"
            className={`${input} md:col-span-2`}
          />
          <select name="source" className={input}>
            <option>REFERRAL</option>
            <option>SOCIAL</option>
            <option>EVENT</option>
            <option>OUTBOUND</option>
            <option>INBOUND</option>
            <option>PARTNERSHIP</option>
            <option>OTHER</option>
          </select>
          <select name="growthOrganizationId" className={input}>
            <option value="">Sem organização vinculada</option>
            {data.organizations.map((o) => (
              <option key={String(o.id)} value={String(o.id)}>
                {String(o.name)}
              </option>
            ))}
          </select>
          <button disabled={busy} className={hubUi.primaryButton}>
            Criar lead
          </button>
        </form>
      ) : null}
      <div className="mt-4 divide-y">
        {data.leads.length ? (
          data.leads.map((lead) => (
            <div
              key={String(lead.id)}
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{String(lead.title)}</p>
                <p className="text-xs text-zinc-500">
                  Fonte {status(lead.source)} · status {status(lead.status)}
                </p>
              </div>
              {(lead.capabilities as Json)?.canEdit ? (
                <div className="flex flex-wrap gap-2">
                  {lead.status === "NEW" ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void send("/api/hub/growth/mutations", {
                          action: "lead-status",
                          id: lead.id,
                          input: {
                            status: "QUALIFYING",
                            version: lead.version,
                          },
                        })
                      }
                      className={hubUi.secondaryButton}
                    >
                      Iniciar qualificação
                    </button>
                  ) : null}
                  {lead.status === "QUALIFYING" ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void send("/api/hub/growth/mutations", {
                          action: "lead-status",
                          id: lead.id,
                          input: { status: "QUALIFIED", version: lead.version },
                        })
                      }
                      className={hubUi.secondaryButton}
                    >
                      Marcar qualificado
                    </button>
                  ) : null}
                  {!["CONVERTED", "DISQUALIFIED"].includes(
                    String(lead.status),
                  ) ? (
                    <button
                      disabled={busy}
                      onClick={async () => {
                        const reason = await requestHubText({
                          title: "Desqualificar lead",
                          description: "Informe o motivo interno.",
                          required: true,
                        });
                        if (reason)
                          void send("/api/hub/growth/mutations", {
                            action: "lead-status",
                            id: lead.id,
                            input: {
                              status: "DISQUALIFIED",
                              disqualificationReason: reason,
                              version: lead.version,
                            },
                          });
                      }}
                      className={hubUi.secondaryButton}
                    >
                      Desqualificar
                    </button>
                  ) : null}
                  {lead.status === "QUALIFIED" &&
                  data.stages.find(
                    (s) => s.isActive && !s.isWon && !s.isLost,
                  ) ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void send("/api/hub/growth/mutations", {
                          action: "lead-convert",
                          id: lead.id,
                          input: {
                            stageId: data.stages.find(
                              (s) => s.isActive && !s.isWon && !s.isLost,
                            )?.id,
                            growthOrganizationId:
                              lead.growthOrganizationId ||
                              data.organizations[0]?.id,
                            estimatedValueCents: 0,
                            idempotencyKey: crypto.randomUUID(),
                          },
                        })
                      }
                      className={hubUi.secondaryButton}
                    >
                      Converter em oportunidade
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <Empty>Nenhum lead no seu escopo.</Empty>
        )}
      </div>
    </section>
  );
}

function OrganizationsPanel({
  data,
  busy,
  send,
}: {
  data: GrowthData;
  busy: boolean;
  send: (path: string, body: Json) => Promise<unknown>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await send("/api/hub/growth", {
      action: "organization",
      input: {
        name: field(f, "name"),
        website: field(f, "website"),
        industry: field(f, "industry"),
        city: field(f, "city"),
        state: field(f, "state"),
      },
    });
    event.currentTarget.reset();
  }
  return (
    <section className={`${hubUi.panel} p-5`}>
      <h2 className="font-semibold">Organizações externas e contatos</h2>
      {data.capabilities.canCreate ? (
        <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-5">
          <input
            name="name"
            required
            placeholder="Nome"
            className={`${input} md:col-span-2`}
          />
          <input
            name="website"
            type="url"
            placeholder="https://empresa.com"
            className={input}
          />
          <input name="industry" placeholder="Setor" className={input} />
          <input name="city" placeholder="Cidade" className={input} />
          <input name="state" placeholder="UF" className={input} />
          <button disabled={busy} className={hubUi.primaryButton}>
            Adicionar organização
          </button>
        </form>
      ) : null}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {data.organizations.map((organization) => (
          <article
            key={String(organization.id)}
            className="rounded-xl border p-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium">{String(organization.name)}</h3>
                <p className="text-xs text-zinc-500">
                  {status(organization.status)} ·{" "}
                  {[organization.city, organization.state]
                    .filter(Boolean)
                    .join("/") || "Local não informado"}
                </p>
              </div>
              <Building2 className="h-5 w-5" />
            </div>
            {Array.isArray(organization.contacts) ? (
              <p className="mt-3 text-sm">
                {organization.contacts.length} contato(s) protegido(s)
              </p>
            ) : (
              <p className="mt-3 text-xs text-zinc-500">
                Contatos ocultos por permissão.
              </p>
            )}
            {data.capabilities.canCreate ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const f = new FormData(event.currentTarget);
                  void send("/api/hub/growth", {
                    action: "contact",
                    input: {
                      growthOrganizationId: organization.id,
                      name: field(f, "name"),
                      email: field(f, "email"),
                      phone: field(f, "phone"),
                    },
                  });
                  event.currentTarget.reset();
                }}
                className="mt-3 grid gap-2 sm:grid-cols-3"
              >
                <input
                  name="name"
                  required
                  placeholder="Contato"
                  className={input}
                />
                <input
                  name="email"
                  type="email"
                  placeholder="E-mail"
                  className={input}
                />
                <input name="phone" placeholder="Telefone" className={input} />
                <button disabled={busy} className={hubUi.secondaryButton}>
                  Adicionar contato
                </button>
              </form>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function OpportunitiesPanel({
  data,
  busy,
  send,
}: {
  data: GrowthData;
  busy: boolean;
  send: (path: string, body: Json) => Promise<unknown>;
}) {
  const { money } = useHubDisplay();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await send("/api/hub/growth", {
      action: "opportunity",
      input: {
        title: field(f, "title"),
        growthOrganizationId: field(f, "growthOrganizationId"),
        stageId: field(f, "stageId"),
        estimatedValueCents: Math.round(numberField(f, "estimatedValue") * 100),
        source: field(f, "source"),
        nextAction: field(f, "nextAction"),
        nextActionAt: field(f, "nextActionAt"),
      },
    });
    event.currentTarget.reset();
  }
  return (
    <section className={`${hubUi.panel} p-5`}>
      <h2 className="font-semibold">Oportunidades</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Valores do pipeline são estimativas, não receita garantida.
      </p>
      {data.capabilities.canCreate ? (
        <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-6">
          <input
            name="title"
            required
            placeholder="Oportunidade"
            className={`${input} md:col-span-2`}
          />
          <select name="growthOrganizationId" required className={input}>
            <option value="">Organização</option>
            {data.organizations.map((o) => (
              <option key={String(o.id)} value={String(o.id)}>
                {String(o.name)}
              </option>
            ))}
          </select>
          <select name="stageId" required className={input}>
            <option value="">Etapa inicial</option>
            {data.stages
              .filter((s) => s.isActive && !s.isWon && !s.isLost)
              .map((s) => (
                <option key={String(s.id)} value={String(s.id)}>
                  {String(s.name)}
                </option>
              ))}
          </select>
          <input
            name="estimatedValue"
            type="number"
            min="0"
            step="0.01"
            placeholder="Valor estimado"
            className={input}
          />
          <select name="source" className={input}>
            <option>OTHER</option>
            <option>REFERRAL</option>
            <option>OUTBOUND</option>
            <option>INBOUND</option>
            <option>PARTNERSHIP</option>
          </select>
          <input
            name="nextAction"
            placeholder="Próxima ação"
            className={`${input} md:col-span-2`}
          />
          <input name="nextActionAt" type="datetime-local" className={input} />
          <button disabled={busy} className={hubUi.primaryButton}>
            Criar oportunidade
          </button>
        </form>
      ) : null}
      <div className="mt-5 space-y-3">
        {data.opportunities.length ? (
          data.opportunities.map((opportunity) => (
            <article
              key={String(opportunity.id)}
              className="rounded-xl border p-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">{String(opportunity.title)}</h3>
                  <p className="text-xs text-zinc-500">
                    {String((opportunity.growthOrganization as Json)?.name)} ·
                    status {status(opportunity.status)} ·{" "}
                    {money(Number(opportunity.estimatedValueCents || 0))} ·
                    probabilidade {String(opportunity.probability)}%
                  </p>
                </div>
                {(opportunity.capabilities as Json)?.canMove ? (
                  <form
                    onSubmit={(event) => {
                      void (async () => {
                        event.preventDefault();
                        const f = new FormData(event.currentTarget);
                        const stageId = field(f, "stageId");
                        const stage = data.stages.find((s) => s.id === stageId);
                        const terminal = stage?.isWon || stage?.isLost;
                        const lossReason = stage?.isLost
                          ? (await requestHubText({
                              title: "Mover oportunidade perdida",
                              label: "Motivo interno",
                              required: true,
                            })) || ""
                          : null;
                        void send("/api/hub/growth/mutations", {
                          action: "opportunity-move",
                          id: opportunity.id,
                          input: {
                            stageId,
                            version: opportunity.version,
                            confirm: terminal,
                            lossReason,
                          },
                        });
                      })();
                    }}
                    className="flex gap-2"
                  >
                    <label
                      className="sr-only"
                      htmlFor={`stage-${opportunity.id}`}
                    >
                      Mover etapa
                    </label>
                    <select
                      id={`stage-${opportunity.id}`}
                      name="stageId"
                      defaultValue={String(opportunity.stageId)}
                      className={input}
                    >
                      {data.stages
                        .filter((s) => s.isActive)
                        .map((s) => (
                          <option key={String(s.id)} value={String(s.id)}>
                            {String(s.name)}
                            {s.isWon
                              ? " (ganha)"
                              : s.isLost
                                ? " (perdida)"
                                : ""}
                          </option>
                        ))}
                    </select>
                    <button disabled={busy} className={hubUi.secondaryButton}>
                      Mover
                    </button>
                  </form>
                ) : null}
              </div>
              {(opportunity.capabilities as Json)?.canEdit ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    disabled={busy}
                    onClick={async () => {
                      const title = await requestHubText({
                        title: "Editar oportunidade",
                        label: "Título",
                        initialValue: String(opportunity.title),
                        required: true,
                      });
                      const nextAction = await requestHubText({
                        title: "Editar oportunidade",
                        label: "Próxima ação",
                        initialValue: String(opportunity.nextAction || ""),
                      });
                      if (title)
                        void send("/api/hub/growth/mutations", {
                          action: "opportunity-update",
                          id: opportunity.id,
                          input: {
                            title,
                            nextAction,
                            version: opportunity.version,
                          },
                        });
                    }}
                    className={hubUi.secondaryButton}
                  >
                    Editar e próxima ação
                  </button>
                  {opportunity.status === "OPEN" ? (
                    <button
                      disabled={busy}
                      onClick={async () => {
                        const reason = await requestHubText({
                          title: "Cancelar",
                          required: true,
                        });
                        if (reason)
                          void send("/api/hub/growth/mutations", {
                            action: "opportunity-cancel",
                            id: opportunity.id,
                            input: {
                              reason,
                              confirm: true,
                              version: opportunity.version,
                            },
                          });
                      }}
                      className={hubUi.secondaryButton}
                    >
                      Cancelar oportunidade
                    </button>
                  ) : null}
                  {(opportunity.capabilities as Json)?.canReopen &&
                  opportunity.status !== "OPEN" ? (
                    <button
                      disabled={busy}
                      onClick={async () => {
                        const reason = await requestHubText({
                          title: "Reabrir",
                          required: true,
                        });
                        if (reason)
                          void send("/api/hub/growth/mutations", {
                            action: "opportunity-reopen",
                            id: opportunity.id,
                            input: {
                              reason,
                              confirm: true,
                              version: opportunity.version,
                            },
                          });
                      }}
                      className={hubUi.secondaryButton}
                    >
                      Reabrir
                    </button>
                  ) : null}
                  <button
                    disabled={busy}
                    onClick={async () => {
                      const title = await requestHubText({
                        title: "Registrar atividade",
                        label: "Título",
                        required: true,
                      });
                      if (title)
                        void send("/api/hub/growth/mutations", {
                          action: "opportunity-activity",
                          id: opportunity.id,
                          input: { type: "NOTE", title },
                        });
                    }}
                    className={hubUi.secondaryButton}
                  >
                    Registrar atividade
                  </button>
                </div>
              ) : null}
              {Array.isArray(opportunity.activities) &&
              opportunity.activities.length ? (
                <div className="mt-3 divide-y rounded-xl bg-zinc-50 px-3">
                  {(opportunity.activities as Json[]).map((activity) => (
                    <div
                      key={String(activity.id)}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
                    >
                      <span>
                        {String(activity.title)}
                        {activity.cancelledAt ? " · cancelada" : ""}
                      </span>
                      {(opportunity.capabilities as Json)?.canEdit &&
                      !activity.cancelledAt ? (
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              const title = await requestHubText({
                                title: "Corrigir atividade",
                                label: "Título",
                                initialValue: String(activity.title),
                                required: true,
                              });
                              const reason = await requestHubText({
                                title: "Corrigir atividade",
                                label: "Motivo",
                                required: true,
                              });
                              if (title && reason)
                                void send("/api/hub/growth/mutations", {
                                  action: "opportunity-activity",
                                  id: opportunity.id,
                                  input: {
                                    type: activity.type,
                                    title,
                                    replacesActivityId: activity.id,
                                    correctionReason: reason,
                                  },
                                });
                            }}
                            className={hubUi.secondaryButton}
                          >
                            Corrigir
                          </button>
                          <button
                            onClick={async () => {
                              const reason = await requestHubText({
                                title: "Cancelar atividade",
                                label: "Motivo",
                                required: true,
                              });
                              if (reason)
                                void send("/api/hub/growth/mutations", {
                                  action: "activity-cancel",
                                  id: activity.id,
                                  input: { reason, confirm: true },
                                });
                            }}
                            className={hubUi.secondaryButton}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <Empty>Nenhuma oportunidade no seu escopo.</Empty>
        )}
      </div>
    </section>
  );
}

function ProposalsPanel({
  data,
  busy,
  send,
}: {
  data: GrowthData;
  busy: boolean;
  send: (path: string, body: Json) => Promise<unknown>;
}) {
  const { money } = useHubDisplay();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await send("/api/hub/growth", {
      action: "proposal",
      input: {
        opportunityId: field(f, "opportunityId"),
        title: field(f, "title"),
        validUntil: field(f, "validUntil"),
      },
    });
    event.currentTarget.reset();
  }
  if (!data.capabilities.canManageProposals)
    return (
      <section className={`${hubUi.panel} p-8 text-center`}>
        <p className="text-sm text-zinc-600">
          Os valores e termos das propostas são confidenciais e não estão
          disponíveis para o seu perfil.
        </p>
      </section>
    );
  return (
    <section className={`${hubUi.panel} p-5`}>
      <h2 className="font-semibold">Propostas e revisões</h2>
      <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-4">
        <select name="opportunityId" required className={input}>
          <option value="">Oportunidade</option>
          {data.opportunities.map((o) => (
            <option key={String(o.id)} value={String(o.id)}>
              {String(o.title)}
            </option>
          ))}
        </select>
        <input
          name="title"
          required
          placeholder="Título da proposta"
          className={`${input} md:col-span-2`}
        />
        <input name="validUntil" type="date" className={input} />
        <button disabled={busy} className={hubUi.primaryButton}>
          Criar proposta
        </button>
      </form>
      <div className="mt-5 space-y-3">
        {data.proposals.length ? (
          data.proposals.map((proposal) => (
            <article
              key={String(proposal.id)}
              className="rounded-xl border p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-medium">{String(proposal.title)}</h3>
                  <p className="text-xs text-zinc-500">
                    Status {status(proposal.status)} · total calculado{" "}
                    {money(Number(proposal.totalCents || 0))} · versão{" "}
                    {String(proposal.version)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {proposal.status === "DRAFT" && proposal.activeRevisionId ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void send("/api/hub/growth/mutations", {
                          action: "proposal-review",
                          id: proposal.id,
                          input: { version: proposal.version },
                        })
                      }
                      className={hubUi.secondaryButton}
                    >
                      Solicitar revisão
                    </button>
                  ) : null}
                  {proposal.status === "INTERNAL_REVIEW" ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void send("/api/hub/growth/mutations", {
                          action: "proposal-approve",
                          id: proposal.id,
                          input: { version: proposal.version },
                        })
                      }
                      className={hubUi.secondaryButton}
                    >
                      Aprovar
                    </button>
                  ) : null}
                  {["APPROVED", "SENT"].includes(String(proposal.status)) ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void send("/api/hub/growth/mutations", {
                          action: "proposal-accept",
                          id: proposal.id,
                          input: {
                            version: proposal.version,
                            confirm: true,
                            markOpportunityWon: true,
                          },
                        })
                      }
                      className={hubUi.primaryButton}
                    >
                      Confirmar aceite
                    </button>
                  ) : null}
                  {(proposal.capabilities as Json)?.canManage &&
                  proposal.status === "APPROVED" ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void send("/api/hub/growth/mutations", {
                          action: "proposal-send",
                          id: proposal.id,
                          input: { version: proposal.version },
                        })
                      }
                      className={hubUi.secondaryButton}
                    >
                      Marcar enviada
                    </button>
                  ) : null}
                  {(proposal.capabilities as Json)?.canManage &&
                  ["APPROVED", "SENT"].includes(String(proposal.status)) ? (
                    <button
                      disabled={busy}
                      onClick={async () => {
                        const reason = await requestHubText({
                          title: "Rejeitar proposta",
                          label: "Motivo",
                          required: true,
                        });
                        if (reason)
                          void send("/api/hub/growth/mutations", {
                            action: "proposal-reject",
                            id: proposal.id,
                            input: { version: proposal.version, reason },
                          });
                      }}
                      className={hubUi.secondaryButton}
                    >
                      Rejeitar
                    </button>
                  ) : null}
                  {(proposal.capabilities as Json)?.canManage &&
                  ["APPROVED", "SENT"].includes(String(proposal.status)) ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void send("/api/hub/growth/mutations", {
                          action: "proposal-expire",
                          id: proposal.id,
                          input: { version: proposal.version },
                        })
                      }
                      className={hubUi.secondaryButton}
                    >
                      Marcar expirada
                    </button>
                  ) : null}
                  {(proposal.capabilities as Json)?.canManage &&
                  ["DRAFT", "INTERNAL_REVIEW", "APPROVED", "SENT"].includes(
                    String(proposal.status),
                  ) ? (
                    <button
                      disabled={busy}
                      onClick={async () => {
                        const reason = await requestHubText({
                          title: "Cancelar proposta",
                          label: "Motivo",
                          required: true,
                        });
                        if (reason)
                          void send("/api/hub/growth/mutations", {
                            action: "proposal-cancel",
                            id: proposal.id,
                            input: {
                              version: proposal.version,
                              reason,
                              confirm: true,
                            },
                          });
                      }}
                      className={hubUi.secondaryButton}
                    >
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </div>
              {proposal.status === "DRAFT" ? (
                <ProposalRevisionForm
                  proposal={proposal}
                  busy={busy}
                  send={send}
                />
              ) : null}
            </article>
          ))
        ) : (
          <Empty>Nenhuma proposta no seu escopo.</Empty>
        )}
      </div>
    </section>
  );
}

function ProposalRevisionForm({
  proposal,
  busy,
  send,
}: {
  proposal: Json;
  busy: boolean;
  send: (path: string, body: Json) => Promise<unknown>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await send("/api/hub/growth/mutations", {
      action: "proposal-revision",
      id: proposal.id,
      input: {
        scope: field(f, "scope"),
        deliverables: field(f, "deliverables"),
        timeline: field(f, "timeline"),
        commercialTerms: field(f, "commercialTerms"),
        discountCents: Math.round(numberField(f, "discount") * 100),
        items: [
          {
            description: field(f, "itemDescription"),
            quantity: numberField(f, "quantity", 1),
            unitAmountCents: Math.round(numberField(f, "unitAmount") * 100),
          },
        ],
      },
    });
  }
  return (
    <form
      onSubmit={submit}
      className="mt-4 grid gap-2 rounded-xl bg-zinc-50 p-3 md:grid-cols-4"
    >
      <textarea
        name="scope"
        required
        placeholder="Escopo"
        className={`${input} md:col-span-2`}
      />
      <textarea
        name="deliverables"
        required
        placeholder="Entregáveis"
        className={`${input} md:col-span-2`}
      />
      <input
        name="timeline"
        required
        placeholder="Cronograma"
        className={input}
      />
      <input
        name="commercialTerms"
        required
        placeholder="Termos comerciais"
        className={input}
      />
      <input
        name="itemDescription"
        required
        placeholder="Item"
        className={input}
      />
      <input
        name="quantity"
        type="number"
        min="0.0001"
        step="any"
        defaultValue="1"
        required
        className={input}
      />
      <input
        name="unitAmount"
        type="number"
        min="0"
        step="0.01"
        placeholder="Valor unitário"
        required
        className={input}
      />
      <input
        name="discount"
        type="number"
        min="0"
        step="0.01"
        placeholder="Desconto"
        className={input}
      />
      <button disabled={busy} className={hubUi.secondaryButton}>
        Salvar nova revisão
      </button>
    </form>
  );
}

function PartnershipsPanel({
  data,
  busy,
  send,
}: {
  data: GrowthData;
  busy: boolean;
  send: (path: string, body: Json) => Promise<unknown>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await send("/api/hub/growth", {
      action: "partnership",
      input: {
        growthOrganizationId: field(f, "growthOrganizationId"),
        title: field(f, "title"),
        type: field(f, "type"),
        goals: field(f, "goals"),
        startsAt: field(f, "startsAt"),
        endsAt: field(f, "endsAt"),
      },
    });
    event.currentTarget.reset();
  }
  return (
    <section className={`${hubUi.panel} p-5`}>
      <h2 className="font-semibold">Parcerias</h2>
      {data.capabilities.canCreate ? (
        <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-5">
          <select name="growthOrganizationId" required className={input}>
            <option value="">Organização</option>
            {data.organizations.map((o) => (
              <option key={String(o.id)} value={String(o.id)}>
                {String(o.name)}
              </option>
            ))}
          </select>
          <input
            name="title"
            required
            placeholder="Parceria"
            className={input}
          />
          <input name="type" required placeholder="Tipo" className={input} />
          <input name="goals" placeholder="Objetivos" className={input} />
          <input name="startsAt" type="date" className={input} />
          <input name="endsAt" type="date" className={input} />
          <button disabled={busy} className={hubUi.primaryButton}>
            <Handshake className="h-4 w-4" />
            Criar parceria
          </button>
        </form>
      ) : null}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {data.partnerships.map((partnership) => (
          <article
            key={String(partnership.id)}
            className="rounded-xl border p-4"
          >
            <h3 className="font-medium">{String(partnership.title)}</h3>
            <p className="text-xs text-zinc-500">
              {String((partnership.growthOrganization as Json)?.name)} ·{" "}
              {status(partnership.status)}
            </p>
            {(partnership.capabilities as Json)?.canEdit &&
            partnershipNext[String(partnership.status)]?.length ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const f = new FormData(event.currentTarget);
                  void send("/api/hub/growth/mutations", {
                    action: "partnership-update",
                    id: partnership.id,
                    input: {
                      status: field(f, "status"),
                      version: partnership.version,
                    },
                  });
                }}
                className="mt-3 flex gap-2"
              >
                <select name="status" className={input}>
                  {partnershipNext[String(partnership.status)].map((next) => (
                    <option key={next}>{next}</option>
                  ))}
                </select>
                <button disabled={busy} className={hubUi.secondaryButton}>
                  Alterar status
                </button>
              </form>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function PipelinePanel({
  data,
  busy,
  send,
}: {
  data: GrowthData;
  busy: boolean;
  send: (path: string, body: Json) => Promise<unknown>;
}) {
  const defaults = useMemo(
    () =>
      data.stages.length
        ? data.stages
        : [
            { name: "Qualificação", probability: 20 },
            { name: "Proposta", probability: 60 },
            { name: "Ganha", probability: 100, isWon: true },
            { name: "Perdida", probability: 0, isLost: true },
          ],
    [data.stages],
  );
  return (
    <section className={`${hubUi.panel} p-5`}>
      <h2 className="font-semibold">Configuração do pipeline</h2>
      <p className="mt-1 text-sm text-zinc-600">
        A ordem é contínua. Deve existir exatamente uma etapa ganha e uma
        perdida ativas.
      </p>
      <div className="mt-4 divide-y">
        {defaults.map((stage, index) => (
          <div
            key={String(stage.id || stage.name)}
            className="flex items-center gap-3 py-3 text-sm"
          >
            <span className="w-8 font-semibold">{index + 1}</span>
            <span className="flex-1">{String(stage.name)}</span>
            <span>{String(stage.probability)}%</span>
            <span>
              {stage.isWon
                ? "Etapa ganha"
                : stage.isLost
                  ? "Etapa perdida"
                  : "Etapa aberta"}
            </span>
          </div>
        ))}
      </div>
      {data.capabilities.canManagePipeline ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            const won = field(f, "won");
            const lost = field(f, "lost");
            void send("/api/hub/growth/mutations", {
              action: "pipeline-configure",
              input: {
                stages: defaults.map((stage) => {
                  const key = String(stage.id || stage.name);
                  return {
                    id: stage.id || undefined,
                    version: stage.version || undefined,
                    name: stage.name,
                    probability:
                      key === won ? 100 : key === lost ? 0 : stage.probability,
                    isWon: key === won,
                    isLost: key === lost,
                    isActive: true,
                  };
                }),
              },
            });
          }}
          className="mt-4 grid gap-3 sm:grid-cols-3"
        >
          <label className="text-sm">
            Etapa ganha
            <select
              name="won"
              defaultValue={String(
                defaults.find((stage) => stage.isWon)?.id ||
                  defaults.find((stage) => stage.isWon)?.name ||
                  "",
              )}
              className={`${input} mt-1`}
            >
              {defaults.map((stage) => (
                <option
                  key={String(stage.id || stage.name)}
                  value={String(stage.id || stage.name)}
                >
                  {String(stage.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Etapa perdida
            <select
              name="lost"
              defaultValue={String(
                defaults.find((stage) => stage.isLost)?.id ||
                  defaults.find((stage) => stage.isLost)?.name ||
                  "",
              )}
              className={`${input} mt-1`}
            >
              {defaults.map((stage) => (
                <option
                  key={String(stage.id || stage.name)}
                  value={String(stage.id || stage.name)}
                >
                  {String(stage.name)}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy} className={`${hubUi.primaryButton} self-end`}>
            Salvar e reconciliar
          </button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-zinc-500">
          Seu perfil não pode alterar o pipeline.
        </p>
      )}
    </section>
  );
}
