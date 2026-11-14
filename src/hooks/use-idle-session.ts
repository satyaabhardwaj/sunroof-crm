"use client";
import { useEffect } from "react";

const IDLE_MS = 20 * 60 * 1000;
const KEY = "sunrooof.activity";

/**
 * Same rule as the CRM's own pages: 20 minutes without input signs you out.
 * Only real input renews the session (posted at most every 30 s); background polling never does.
 */
export function useIdleSession() {
  useEffect(() => {
    let deadline = Date.now() + IDLE_MS;
    let ended = false,
      pending = false,
      sending = false,
      lastSent = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const end = () => {
      if (ended) return;
      ended = true;
      void fetch("/api/auth/logout", { method: "POST", keepalive: true }).catch(
        () => undefined,
      );
      location.assign("/login?expired=1");
    };
    const check = () => {
      if (!ended && Date.now() >= deadline) end();
    };
    async function send() {
      if (!pending || sending || ended) return;
      check();
      if (ended) return;
      sending = true;
      pending = false;
      lastSent = Date.now();
      try {
        const response = await fetch("/api/auth/activity", {
          method: "POST",
          keepalive: true,
        });
        if (response.status === 401) end();
        else if (!response.ok) pending = true;
      } catch {
        pending = true;
      } finally {
        sending = false;
      }
    }
    function input() {
      check();
      if (ended) return;
      deadline = Date.now() + IDLE_MS;
      pending = true;
      try {
        localStorage.setItem(KEY, String(Date.now()));
      } catch {
        /* other tabs simply won't hear about it */
      }
      if (Date.now() - lastSent > 30000) void send();
      clearTimeout(timer);
      timer = setTimeout(() => void send(), 1000);
    }
    function otherTab(e: StorageEvent) {
      const at = Number(e.key === KEY && e.newValue);
      if (at && at <= Date.now() && at > Date.now() - IDLE_MS)
        deadline = at + IDLE_MS;
    }
    const visible = () => !document.hidden && check();
    const leave = () => void send();
    void fetch("/api/auth/me")
      .then(async (r) => {
        if (r.status === 401) return end();
        if (!r.ok) return;
        const me = await r.json();
        if (typeof me.sessionExpiresAt === "number" && !pending && !lastSent)
          deadline = me.sessionExpiresAt;
        check();
      })
      .catch(() => undefined);
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => addEventListener(e, input, { passive: true }));
    addEventListener("storage", otherTab);
    addEventListener("focus", check);
    addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", visible);
    const tick = setInterval(() => {
      check();
      if (pending && Date.now() - lastSent > 30000) void send();
    }, 1000);
    return () => {
      ended = true;
      clearInterval(tick);
      clearTimeout(timer);
      events.forEach((e) => removeEventListener(e, input));
      removeEventListener("storage", otherTab);
      removeEventListener("focus", check);
      removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
}
