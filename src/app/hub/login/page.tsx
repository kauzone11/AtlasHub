"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HUB_BRAND } from "@/lib/hub/brand";

export default function AtlasHubLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`${HUB_BRAND.apiRoot}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Nao foi possivel entrar.");
        return;
      }
      router.replace(data.requiresOrganizationSelection
        ? `${HUB_BRAND.webRoot}/select-organization`
        : data.mustChangePassword ? `${HUB_BRAND.webRoot}/alterar-senha` : HUB_BRAND.webRoot);
    } catch {
      setError("Erro de conexao. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f4f5] px-4 py-10">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8" aria-describedby={error ? "login-error" : undefined}>
        <div className="mb-8">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-black text-sm font-bold text-white" aria-hidden="true">{HUB_BRAND.initials}</div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Acesse o {HUB_BRAND.productName}</h1>
          <p className="mt-2 text-sm text-zinc-600">Entre com suas credenciais. O Hub correto sera selecionado com seguranca.</p>
        </div>
        {error ? <div id="login-error" role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}</div> : null}
        <label htmlFor="hub-email" className="mb-1.5 block text-sm font-medium text-zinc-800">E-mail</label>
        <input id="hub-email" autoFocus autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="mb-4 w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm outline-none transition focus:border-black focus:ring-2 focus:ring-black/10" />
        <label htmlFor="hub-password" className="mb-1.5 block text-sm font-medium text-zinc-800">Senha</label>
        <div className="relative mb-6">
          <input id="hub-password" autoComplete="current-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 pr-11 text-sm outline-none transition focus:border-black focus:ring-2 focus:ring-black/10" />
          <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-zinc-500 hover:text-black focus:outline-none focus:ring-2 focus:ring-inset focus:ring-black" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
        </div>
        <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}{loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
