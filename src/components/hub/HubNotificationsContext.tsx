"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type NotificationState = { unreadCount: number; refresh: () => Promise<void>; applyUnreadCount: (count: number) => void };
const Context = createContext<NotificationState>({ unreadCount: 0, refresh: async () => undefined, applyUnreadCount: () => undefined });

export function HubNotificationsProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/hub/notifications/summary", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      if (mounted.current) setUnreadCount(Number(payload.unreadCount) || 0);
    } catch { /* a transient notification failure must not interrupt the app */ }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60_000);
    return () => { mounted.current = false; window.removeEventListener("focus", onFocus); window.clearInterval(timer); };
  }, [refresh]);
  return <Context.Provider value={{ unreadCount, refresh, applyUnreadCount: setUnreadCount }}>{children}</Context.Provider>;
}

export function useHubNotifications() { return useContext(Context); }
