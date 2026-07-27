"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { hubUi } from "@/components/hub/styles";

export async function coreApi<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
  return data as T;
}

export type CoreOptions = { members: Array<{ id: string; name: string; directorateId: string | null }>; directorates: Array<{ id: string; name: string }>; projects: Array<{ id: string; title: string; primaryDirectorateId: string | null }>; permissions: string[]; memberId: string; directorateId: string | null; timezone: string };
export function useCoreOptions() {
  const [options, setOptions] = useState<CoreOptions | null>(null);
  useEffect(() => { void coreApi<CoreOptions>("/api/hub/collaboration/options").then(setOptions).catch(() => undefined); }, []);
  return options;
}

export function useCoreLoad<T>(load: () => Promise<T>, dependencies: React.DependencyList = []) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refresh = useCallback(async () => { try { setLoading(true); setError(""); setData(await load()); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar."); } finally { setLoading(false); } }, dependencies);
  useEffect(() => { void refresh(); }, [refresh]);
  return { data, setData, error, setError, loading, refresh };
}

export function CoreModal({ title, description, open, onClose, children }: { title: string; description?: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => { if (!open) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close); }, [open, onClose]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-6" onMouseDown={onClose}><section role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-[0_24px_80px_-32px_rgba(0,0,0,.35)] sm:rounded-2xl"><header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-zinc-100 bg-white/95 px-5 py-4 backdrop-blur"><div><h2 className="font-display text-xl font-semibold tracking-[-0.025em]">{title}</h2>{description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}</div><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-xl p-2 hover:bg-zinc-100"><X className="h-5 w-5" /></button></header><div className="p-5">{children}</div></section></div>;
}

export function ErrorNotice({ message }: { message: string }) { return message ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</p> : null; }
export function Empty({ children }: { children: React.ReactNode }) { return <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">{children}</div>; }
export const input = hubUi.input;
