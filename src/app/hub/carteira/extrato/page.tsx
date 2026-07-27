"use client";

import { useHubDisplay } from "@/components/hub/HubOrganizationContext";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { hubUi } from "@/components/hub/styles";

import { walletSourceTypeLabel, walletTransactionStatusLabel, walletTransactionTypeLabel } from "@/lib/hub/wallet-labels";

type Transaction = { id: string; type: string; amountCents: number; description: string | null; status: string; sourceType: string | null; createdAt: string };

export default function AtlasHubStatementPage() {
  const { money, date, dateTime } = useHubDisplay();
  const [items, setItems] = useState<Transaction[]>([]);
  const [type, setType] = useState(""); const [status, setStatus] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [search, setSearch] = useState(""); const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");

  async function load(append = false, nextCursor?: string | null) {
    setLoading(true); setError("");
    const params = new URLSearchParams({ limit: "25" });
    if (type) params.set("type", type); if (status) params.set("status", status);
    if (from) params.set("from", from); if (to) params.set("to", to);
    if (search) params.set("search", search); if (nextCursor) params.set("cursor", nextCursor);
    try {
      const response = await fetch(`/api/hub/wallet/me/transactions?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar o extrato.");
      setItems((current) => append ? [...current, ...data.transactions] : data.transactions);
      setCursor(data.nextCursor);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Erro ao carregar."); }
    finally { setLoading(false); }
  }

  // Filtros são aplicados apenas no envio do formulário.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  return <div className={hubUi.page}>
    <header><h1 className="text-2xl font-semibold">Extrato</h1><p className="mt-1 text-sm text-zinc-600">Histórico completo das movimentações da sua carteira.</p></header>
    <form onSubmit={(event) => { event.preventDefault(); void load(); }} className={`${hubUi.panel} grid gap-3 p-4 md:grid-cols-6`}><label className="relative md:col-span-2"><span className="sr-only">Buscar</span><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar descrição" className={`${hubUi.input} pl-9`} /></label><select value={type} onChange={(event) => setType(event.target.value)} className={hubUi.input} aria-label="Tipo"><option value="">Todos os tipos</option><option value="CREDIT">Entrada</option><option value="DEBIT">Gasto</option><option value="ADJUSTMENT">Ajuste</option></select><select value={status} onChange={(event) => setStatus(event.target.value)} className={hubUi.input} aria-label="Status"><option value="">Todos os status</option><option value="COMPLETED">Concluída</option><option value="PENDING">Pendente</option><option value="CANCELLED">Cancelada</option></select><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={hubUi.input} aria-label="Data inicial" /><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={hubUi.input} aria-label="Data final" /><button className={`${hubUi.primaryButton} md:col-start-6`}>Filtrar</button></form>
    {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button type="button" onClick={() => void load()} className="ml-3 underline">Tentar novamente</button></div> : null}
    <section className={`${hubUi.panel} overflow-hidden`}>
      <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="bg-zinc-50 text-xs text-zinc-500"><tr><th className="px-4 py-3 font-medium">Data</th><th className="px-4 py-3 font-medium">Descrição</th><th className="px-4 py-3 font-medium">Tipo</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Valor</th></tr></thead><tbody className="divide-y divide-zinc-100">{items.map((item) => <tr key={item.id}><td className="whitespace-nowrap px-4 py-3 text-zinc-600">{date(item.createdAt)}</td><td className="max-w-sm px-4 py-3"><p className="truncate font-medium">{item.description || walletTransactionTypeLabel(item.type)}</p>{item.sourceType ? <p className="text-xs text-zinc-500">{walletSourceTypeLabel(item.sourceType)}</p> : null}</td><td className="px-4 py-3">{walletTransactionTypeLabel(item.type)}</td><td className="px-4 py-3">{walletTransactionStatusLabel(item.status)}</td><td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{item.type === "DEBIT" || item.amountCents < 0 ? "−" : "+"}{money(Math.abs(item.amountCents))}</td></tr>)}</tbody></table></div>
      <div className="divide-y divide-zinc-100 md:hidden">{items.map((item) => <article key={item.id} className="p-4"><div className="flex justify-between gap-4"><div className="min-w-0"><p className="break-words text-sm font-medium">{item.description || walletTransactionTypeLabel(item.type)}</p><p className="mt-1 text-xs text-zinc-500">{walletTransactionTypeLabel(item.type)} · {walletTransactionStatusLabel(item.status)}</p>{item.sourceType ? <p className="mt-1 text-xs text-zinc-500">{walletSourceTypeLabel(item.sourceType)}</p> : null}</div><p className="shrink-0 text-sm font-semibold">{item.type === "DEBIT" || item.amountCents < 0 ? "−" : "+"}{money(Math.abs(item.amountCents))}</p></div><p className="mt-2 text-xs text-zinc-500">{dateTime(item.createdAt)}</p></article>)}</div>
      {!items.length && !loading ? <div className="p-12 text-center"><p className="text-sm text-zinc-500">Nenhuma movimentação encontrada.</p></div> : null}{loading ? <div className="h-20 animate-pulse bg-zinc-50" /> : null}{cursor && !loading ? <div className="border-t border-zinc-200 p-4 text-center"><button type="button" onClick={() => void load(true, cursor)} className={hubUi.secondaryButton}>Carregar mais</button></div> : null}
    </section>
  </div>;
}
