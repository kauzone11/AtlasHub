"use client";

import { Building2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HUB_BRAND } from "@/lib/hub/brand";

type OrganizationOption = { organizationKey: string; name: string; hubName: string };

export default function HubSelectOrganizationPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState("");

  useEffect(() => {
    fetch(`${HUB_BRAND.apiRoot}/auth/organizations`, { cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error || "Sessao expirada.");
        setOrganizations(data.organizations || []);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Nao foi possivel carregar seus Hubs."))
      .finally(() => setLoading(false));
  }, []);

  async function select(option: OrganizationOption) {
    setSelecting(option.organizationKey);
    setError("");
    try {
      const response = await fetch(`${HUB_BRAND.apiRoot}/auth/organizations`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationKey: option.organizationKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Nao foi possivel abrir o Hub.");
      router.replace(data.mustChangePassword ? `${HUB_BRAND.webRoot}/alterar-senha` : HUB_BRAND.webRoot);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nao foi possivel abrir o Hub.");
      setSelecting("");
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-10">
    <section className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-2xl font-semibold text-zinc-950">Selecione o Hub</h1>
      <p className="mt-2 text-sm text-zinc-600">Sua conta possui acesso a mais de uma organizacao.</p>
      {error ? <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {loading ? <div className="flex items-center gap-2 py-8 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div> : null}
      <div className="mt-6 space-y-3">
        {organizations.map((option) => <button key={option.organizationKey} type="button" onClick={() => select(option)} disabled={Boolean(selecting)} className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 p-4 text-left transition hover:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 disabled:opacity-60">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-950 text-white"><Building2 className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block font-medium text-zinc-950">{option.name}</span><span className="block truncate text-sm text-zinc-500">{option.hubName}</span></span>
          {selecting === option.organizationKey ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        </button>)}
      </div>
    </section>
  </main>;
}
