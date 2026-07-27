"use client";

import { CalendarDays, CheckSquare, FolderKanban, Home, LogOut, Menu, Search, Settings, Users, WalletCards, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { HubNotificationsProvider } from "@/components/hub/HubNotificationsContext";
import { HubNotificationLink } from "@/components/hub/HubNotificationLink";
import { HubOrganizationProvider } from "@/components/hub/HubOrganizationContext";
import { HubTenantLogo } from "@/components/hub/HubTenantLogo";
import { HUB_BRAND } from "@/lib/hub/brand";
import { canAccessHubSettings } from "@/lib/hub/settings-policy";

type Member = { name?: string; email: string; role: string; organizationPosition: string; directorateName?: string | null; mustChangePassword: boolean; permissions?: string[]; organization: { slug: string; hubName: string; logoUrl: string | null; locale: string; currency: string; timezone: string } };
type SearchResult = { type: string; id: string; title: string; subtitle: string; href: string };
const navItems = [
  { href: "/hub", label: "Início", icon: Home },
  { href: "/hub/diretorias", label: "Diretorias", icon: Users },
  { href: "/hub/projetos", label: "Projetos", icon: FolderKanban },
  { href: "/hub/tarefas", label: "Tarefas", icon: CheckSquare },
  { href: "/hub/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/hub/financas", label: "Finanças", icon: WalletCards },
];

function initials(value: string) { return value.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "AH"; }

export default function AtlasHubShell({ children, publicPaths = [] }: { children: React.ReactNode; publicPaths?: string[] }) {
  const pathname = usePathname(); const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false); const [searchOpen, setSearchOpen] = useState(false); const [profileOpen, setProfileOpen] = useState(false); const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]); const [searching, setSearching] = useState(false);
  const [member, setMember] = useState<Member | null>(null); const [checking, setChecking] = useState(true);
  const menuButtonRef = useRef<HTMLButtonElement>(null); const searchRef = useRef<HTMLInputElement>(null);
  const isPublic = publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  useEffect(() => { if (isPublic) { setChecking(false); return; } let active = true; fetch(`${HUB_BRAND.apiRoot}/me`, { cache: "no-store" }).then(async (response) => ({ response, data: await response.json() })).then(({ response, data }) => { if (!active) return; if (!response.ok) { router.replace(HUB_BRAND.loginPath); return; } if (data.mustChangePassword && pathname !== "/hub/alterar-senha") { router.replace("/hub/alterar-senha"); return; } setMember(data); }).catch(() => { if (active) router.replace(HUB_BRAND.loginPath); }).finally(() => { if (active) setChecking(false); }); return () => { active = false; }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublic, router]);
  useEffect(() => { setSidebarOpen(false); setProfileOpen(false); }, [pathname]);
  useEffect(() => { if (!searchOpen) return; searchRef.current?.focus(); const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSearchOpen(false); }; document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close); }, [searchOpen]);
  useEffect(() => { if (!searchOpen || query.trim().length < 2) { setSearchResults([]); return; } const controller = new AbortController(); const timer = window.setTimeout(async () => { try { setSearching(true); const response = await fetch(`/api/hub/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal }); const data = await response.json(); if (response.ok) setSearchResults(data.results || []); } finally { setSearching(false); } }, 220); return () => { window.clearTimeout(timer); controller.abort(); }; }, [query, searchOpen]);
  async function logout() { await fetch(`${HUB_BRAND.apiRoot}/auth/logout`, { method: "POST" }).catch(() => undefined); router.replace(`${HUB_BRAND.loginPath}?organization=${encodeURIComponent(member?.organization.slug || "")}`); }
  if (isPublic) return <>{children}</>;
  if (checking || !member) return <div className="min-h-screen bg-[#fafafa] p-6" aria-label="Carregando Atlas Hub"><div className="mx-auto mt-24 h-40 max-w-3xl animate-pulse rounded-2xl border border-zinc-200 bg-white" /></div>;
  const canSettings = canAccessHubSettings(member.role, member.organizationPosition);
  return <HubNotificationsProvider><div className="min-h-screen bg-[#fafafa] font-sans text-zinc-950">
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-zinc-200 bg-white/80 px-5 backdrop-blur md:ml-[17.5rem]">
      <button ref={menuButtonRef} type="button" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu" className="rounded-xl p-2 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black md:hidden"><Menu className="h-5 w-5" /></button>
      <button type="button" onClick={() => setSearchOpen(true)} className="hidden min-h-10 w-full max-w-sm items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-left text-sm text-zinc-500 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black sm:flex"><Search className="h-4 w-4" />Buscar na EJ <kbd className="ml-auto rounded border bg-white px-1.5 font-mono text-[10px]">⌘K</kbd></button>
      <button type="button" onClick={() => setSearchOpen(true)} aria-label="Buscar" className="rounded-lg p-2 hover:bg-zinc-100 sm:hidden"><Search className="h-5 w-5" /></button>
      <div className="ml-auto flex items-center gap-1"><HubNotificationLink /><Link href="/hub/minha-conta" aria-label="Configurações do perfil" className="rounded-lg p-2 text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"><Settings className="h-5 w-5" /></Link></div>
    </header>
    <aside id="hub-sidebar" aria-label="Navegação principal" className={`fixed inset-y-0 left-0 z-40 flex w-[17.5rem] flex-col border-r border-zinc-200 bg-white transition-transform duration-200 motion-reduce:transition-none ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}>
      <div className="flex items-center justify-between px-6 pb-7 pt-7"><Link href="/hub" title={member.organization.hubName} aria-label={`Atlas Hub · ${member.organization.hubName}`} className="flex min-w-0 items-center gap-2.5"><HubTenantLogo src={member.organization.logoUrl} className="h-9 w-9" /><span className="truncate font-display text-[1.3rem] font-semibold tracking-[-0.03em]">Atlas Hub</span></Link><button type="button" onClick={() => { setSidebarOpen(false); menuButtonRef.current?.focus(); }} aria-label="Fechar menu" className="rounded-xl p-2 hover:bg-zinc-100 md:hidden"><X className="h-5 w-5" /></button></div>
      <nav className="flex-1 px-3" aria-label="Gestão da EJ"><p className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Gestão da EJ</p>{navItems.map((item) => { const active = item.href === "/hub" ? pathname === item.href : pathname.startsWith(item.href); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${active ? "bg-zinc-950 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"}`}><item.icon className="h-[18px] w-[18px]" />{item.label}</Link>; })}</nav>
      {canSettings ? <div className="border-t border-zinc-200 px-3 py-3"><Link href={HUB_BRAND.administrationPath} aria-current={pathname === HUB_BRAND.administrationPath ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${pathname === HUB_BRAND.administrationPath ? "bg-zinc-950 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"}`}><Settings className="h-[18px] w-[18px]" />Ajustes</Link></div> : null}
      <div className="relative border-t border-zinc-200 p-3">{profileOpen ? <div className="absolute bottom-[4.75rem] left-3 right-3 rounded-xl border border-zinc-200 bg-white p-1 shadow-[0_16px_40px_-24px_rgba(0,0,0,.35)]"><button type="button" onClick={logout} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-black"><LogOut className="h-4 w-4" />Sair</button></div> : null}<button type="button" aria-expanded={profileOpen} onClick={() => setProfileOpen((value) => !value)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-zinc-50"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-200 font-mono text-xs font-semibold">{initials(member.name || member.email)}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{member.name || member.email}</span><span className="block truncate text-xs text-zinc-500">{member.directorateName || member.role}</span></span></button></div>
    </aside>{sidebarOpen ? <button type="button" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-black/20 md:hidden" /> : null}
    {searchOpen ? <div className="fixed inset-0 z-50 grid place-items-start bg-black/30 p-4 pt-[12vh]" role="presentation" onMouseDown={() => setSearchOpen(false)}><section role="dialog" aria-modal="true" aria-label="Buscar na organização" className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_24px_80px_-32px_rgba(0,0,0,.35)]" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center gap-2 border-b border-zinc-200 px-4"><Search className="h-5 w-5 text-zinc-400" /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar diretorias, pessoas, projetos, tarefas e agenda" className="h-14 w-full bg-transparent text-sm outline-none" /></div><div className="max-h-[60vh] overflow-y-auto p-2">{searchResults.length ? searchResults.map((item) => <Link key={`${item.type}:${item.id}`} href={item.href} onClick={() => setSearchOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-zinc-100"><span className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-100"><Search className="h-4 w-4" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{item.title}</span><span className="block truncate text-xs text-zinc-500">{item.type} · {item.subtitle}</span></span></Link>) : <p className="p-4 text-sm text-zinc-500">{searching ? "Buscando…" : query.trim().length < 2 ? "Digite pelo menos dois caracteres." : "Nenhum resultado nesta organização."}</p>}</div></section></div> : null}
    <main className="min-w-0 md:ml-[17.5rem]"><div className="p-5 md:p-8"><HubOrganizationProvider organization={member.organization} onUpdate={(organization) => setMember((current) => current ? { ...current, organization: { ...current.organization, ...organization } } : current)}>{children}</HubOrganizationProvider></div></main>
  </div></HubNotificationsProvider>;
}
