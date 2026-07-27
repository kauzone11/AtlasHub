"use client";

import { useEffect, useState } from "react";

export function HubTenantLogo({ src, className = "h-9 w-9" }: { src: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <span className={`flex shrink-0 items-center justify-center rounded-xl bg-black text-sm font-bold text-white ${className}`}>AH</span>;
  // Tenant logos intentionally bypass the Next.js server-side optimizer to avoid SSRF proxy behavior.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`shrink-0 rounded-xl object-contain ${className}`} />;
}
