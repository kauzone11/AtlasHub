"use client";

import { useHubDisplay } from "@/components/hub/HubOrganizationContext";
import { ArrowDownLeft, ArrowUpRight, Eye, EyeOff, FileText, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hubUi } from "@/components/hub/styles";
import { walletRequestStatusLabel, walletTransactionTypeLabel } from "@/lib/hub/wallet-labels";

type MemberData = { name: string | null; email: string; avatarUrl: string | null };
type TxItem = { id: string; type: string; description: string | null; amountCents: number; createdAt: string };
type ReqItem = { id: string; reason: string | null; status: string; amountCents: number; createdAt: string };
type WalletData = {
  canCreateRequest: boolean;
  currentBalanceCents: number;
  availableBalanceCents: number;
  pendingCents: number;
  totalCreditsCents: number;
  totalDebitsCents: number;
  transactions: TxItem[];
  requests: ReqItem[];
  performanceTotalCents: number;
  monthlyPerformance: Array<{ label: string; totalCents: number; timestamp: number }>;
};

export default function AtlasHubWalletPage() {
  const { money, maskedMoney, date, dateTime } = useHubDisplay();
  const displayMoney = (cents: number, hidden: boolean) => hidden ? maskedMoney() : money(cents);
  const [member, setMember] = useState<MemberData | null>(null);
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cancellingId, setCancellingId] = useState("");
  const [cancelTarget, setCancelTarget] = useState<ReqItem | null>(null);
  const [hideBalances, setHideBalances] = useState(() => typeof window !== "undefined" && localStorage.getItem("hub.wallet.hideBalances") === "1");
  const cancelDialogRef = useRef<HTMLDivElement>(null);
  const cancelConfirmRef = useRef<HTMLButtonElement>(null);
  const cancelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelInFlightRef = useRef(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const [memberResponse, walletResponse] = await Promise.all([fetch("/api/hub/me"), fetch("/api/hub/wallet/me")]);
      const [memberPayload, walletPayload] = await Promise.all([memberResponse.json(), walletResponse.json()]);
      if (!memberResponse.ok) throw new Error(memberPayload.error || "Erro ao carregar perfil.");
      if (!walletResponse.ok) throw new Error(walletPayload.error || "Erro ao carregar carteira.");
      setMember(memberPayload);
      setData(walletPayload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro ao carregar carteira.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const closeCancelModal = useCallback(() => {
    if (cancellingId) return;
    setCancelTarget(null);
    window.setTimeout(() => cancelTriggerRef.current?.focus(), 0);
  }, [cancellingId]);

  useEffect(() => {
    if (!cancelTarget) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelConfirmRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCancelModal();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = cancelDialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [cancelTarget, closeCancelModal]);

  const pendingRequests = useMemo(() => data?.requests.filter((item) => item.status === "PENDING") || [], [data]);
  const recentTransactions = useMemo(() => data?.transactions.slice(0, 5) || [], [data]);

  function toggleHideBalances() {
    setHideBalances((current) => {
      localStorage.setItem("hub.wallet.hideBalances", current ? "0" : "1");
      return !current;
    });
  }

  function openCancelModal(item: ReqItem, trigger: HTMLButtonElement) {
    cancelTriggerRef.current = trigger;
    setError("");
    setMessage("");
    setCancelTarget(item);
  }

  async function cancelRequest() {
    if (!cancelTarget || cancelInFlightRef.current) return;
    cancelInFlightRef.current = true;
    setCancellingId(cancelTarget.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/hub/wallet/me/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cancelTarget.id, action: "cancel" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível cancelar a solicitação.");
      setCancelTarget(null);
      setMessage("Solicitação cancelada com sucesso.");
      await load();
      window.setTimeout(() => cancelTriggerRef.current?.focus(), 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível cancelar a solicitação.");
    } finally {
      cancelInFlightRef.current = false;
      setCancellingId("");
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" aria-label="Carregando carteira" /></div>;
  if (!data) return <div className={`${hubUi.panel} p-5 text-sm text-red-800`} role="alert">{error || "Erro ao carregar carteira."}</div>;

  const displayName = (member?.name || member?.email || "membro").trim().split(/\s+/)[0];
  const summary = [
    { label: "Saldo da conta", value: data.currentBalanceCents },
    { label: "Reservado", value: data.pendingCents },
    { label: "Créditos", value: data.totalCreditsCents },
    { label: "Despesas", value: data.totalDebitsCents },
  ];

  return <div className={hubUi.page}>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm text-zinc-500">Minha carteira</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Olá, {displayName}</h1><p className="mt-2 text-sm text-zinc-600">Saldo, solicitações e movimentações em um só lugar.</p></div>
      <button type="button" onClick={toggleHideBalances} className={hubUi.secondaryButton} aria-label={hideBalances ? "Mostrar saldos" : "Ocultar saldos"}>{hideBalances ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{hideBalances ? "Mostrar saldos" : "Ocultar saldos"}</button>
    </header>
    {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</div> : null}
    {message ? <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800" role="status">{message}</div> : null}
    <section className="overflow-hidden rounded-3xl bg-black p-6 text-white sm:p-8">
      <p className="text-sm text-zinc-400">Saldo disponível</p><p className="mt-2 break-words text-4xl font-semibold tracking-tight sm:text-5xl">{displayMoney(data.availableBalanceCents, hideBalances)}</p>
      <div className="mt-7 flex flex-wrap gap-3"><Link href="/hub/carteira/extrato" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black"><FileText className="h-4 w-4" />Ver extrato</Link>{data.canCreateRequest ? <Link href="/hub/carteira/solicitar" className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-4 py-2.5 text-sm font-semibold"><ArrowDownLeft className="h-4 w-4" />Solicitar gasto</Link> : null}</div>
    </section>
    <section className={`${hubUi.panel} grid divide-y divide-zinc-200 sm:grid-cols-4 sm:divide-x sm:divide-y-0`}>{summary.map((item) => <div key={item.label} className="p-4"><p className="text-xs text-zinc-500">{item.label}</p><p className="mt-1 break-words text-lg font-semibold">{displayMoney(item.value, hideBalances)}</p></div>)}</section>
    <div className="grid gap-6 lg:grid-cols-2">
      <section className={`${hubUi.panel} p-5`}>
        <div className="flex items-center justify-between gap-4"><h2 className="font-semibold">Solicitações pendentes</h2><span className="text-sm font-semibold">{displayMoney(data.pendingCents, hideBalances)}</span></div>
        <div className="mt-4 divide-y divide-zinc-100">{pendingRequests.length ? pendingRequests.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.reason || "Solicitação"}</p><p className="text-xs text-zinc-500">{walletRequestStatusLabel(item.status)} · {date(item.createdAt)}</p></div><div className="flex items-center gap-3"><span className="text-sm font-semibold">{displayMoney(item.amountCents, hideBalances)}</span><button type="button" onClick={(event) => openCancelModal(item, event.currentTarget)} disabled={Boolean(cancellingId)} className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium hover:border-black disabled:opacity-50"><X className="h-3.5 w-3.5" />Cancelar</button></div></div>) : <div className="py-8 text-center"><p className="text-sm text-zinc-500">Nenhuma solicitação pendente.</p>{data.canCreateRequest ? <Link href="/hub/carteira/solicitar" className="mt-3 inline-block text-sm font-medium underline">Criar solicitação</Link> : null}</div>}</div>
      </section>
      <section className={`${hubUi.panel} p-5`}>
        <div className="flex items-center justify-between"><h2 className="font-semibold">Movimentações recentes</h2><Link href="/hub/carteira/extrato" className="text-sm text-zinc-600 hover:text-black">Ver tudo</Link></div>
        <div className="mt-4 divide-y divide-zinc-100">{recentTransactions.length ? recentTransactions.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.description || walletTransactionTypeLabel(item.type)}</p><p className="text-xs text-zinc-500">{walletTransactionTypeLabel(item.type)} · {date(item.createdAt)}</p></div><p className="shrink-0 text-sm font-semibold">{item.type === "DEBIT" ? "−" : "+"}{displayMoney(Math.abs(item.amountCents), hideBalances)}</p></div>) : <p className="py-8 text-center text-sm text-zinc-500">Nenhuma movimentação ainda.</p>}</div>
      </section>
    </div>
    <section className={`${hubUi.panel} p-5`}><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs text-zinc-500">Desempenho total</p><p className="mt-1 text-xl font-semibold">{displayMoney(data.performanceTotalCents, hideBalances)}</p></div><Link href="/hub/metricas" className={hubUi.secondaryButton}>Ver métricas<ArrowUpRight className="h-4 w-4" /></Link></div></section>

    {cancelTarget ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCancelModal(); }}>
      <div ref={cancelDialogRef} role="dialog" aria-modal="true" aria-labelledby="cancel-request-title" aria-describedby="cancel-request-description" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><h2 id="cancel-request-title" className="text-lg font-semibold">Cancelar solicitação</h2><p id="cancel-request-description" className="mt-1 text-sm text-zinc-600">Confira os dados antes de confirmar.</p></div><button type="button" onClick={closeCancelModal} disabled={Boolean(cancellingId)} aria-label="Fechar confirmação" className="rounded-lg p-2 hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"><X className="h-5 w-5" /></button></div>
        <dl className="mt-5 space-y-3 rounded-xl bg-zinc-50 p-4 text-sm"><div className="flex justify-between gap-4"><dt className="text-zinc-500">Valor</dt><dd className="font-semibold">{money(cancelTarget.amountCents)}</dd></div><div><dt className="text-zinc-500">Motivo</dt><dd className="mt-1 break-words font-medium">{cancelTarget.reason || "Sem motivo informado"}</dd></div><div className="flex justify-between gap-4"><dt className="text-zinc-500">Criada em</dt><dd>{dateTime(cancelTarget.createdAt)}</dd></div></dl>
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Ao cancelar, esta solicitação sairá da fila de pendências e não poderá mais ser aprovada.</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={closeCancelModal} disabled={Boolean(cancellingId)} className={hubUi.secondaryButton}>Voltar</button><button ref={cancelConfirmRef} type="button" onClick={() => void cancelRequest()} disabled={Boolean(cancellingId)} className={hubUi.primaryButton}>{cancellingId ? <><Loader2 className="h-4 w-4 animate-spin" />Cancelando...</> : "Confirmar cancelamento"}</button></div>
      </div>
    </div> : null}
  </div>;
}
