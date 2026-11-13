export const IDLE_MS = 20 * 60 * 1000;
// Background requests do not call activity. Hidden tabs and sleep are checked on return.
export function installIdleSession(
  target: Window,
  navigate: (url: string) => void,
) {
  let deadline = Date.now() + IDLE_MS,
    ended = false,
    dirty = false,
    lastSent = 0,
    sending = false,
    trailing: number | undefined;
  const fetcher = target.fetch.bind(target),
    key = "sunrooof.activity";
  const expire = () => {
    if (ended) return;
    ended = true;
    void fetcher("/api/auth/logout", { method: "POST", keepalive: true }).catch(
      () => {},
    );
    navigate("/login?expired=1");
  };
  const check = () => {
    if (!ended && Date.now() >= deadline) expire();
  };
  async function heartbeat() {
    if (!dirty || sending || ended) return;
    check();
    if (ended) return;
    sending = true;
    dirty = false;
    lastSent = Date.now();
    try {
      const r = await fetcher("/api/auth/activity", {
        method: "POST",
        keepalive: true,
      });
      if (r.status === 401) expire();
      else if (!r.ok) dirty = true;
    } catch {
      dirty = true;
    } finally {
      sending = false;
    }
  }
  function activity() {
    check();
    if (ended) return;
    deadline = Date.now() + IDLE_MS;
    dirty = true;
    try {
      target.localStorage.setItem(key, String(Date.now()));
    } catch {
      /* optional cross-tab coordination */
    }
    if (Date.now() - lastSent > 30000) void heartbeat();
    target.clearTimeout(trailing);
    trailing = target.setTimeout(() => void heartbeat(), 1000);
  }
  function storage(e: StorageEvent) {
    if (e.key !== key || !e.newValue) return;
    const at = Number(e.newValue);
    if (Number.isFinite(at) && at <= Date.now() && at > Date.now() - IDLE_MS)
      deadline = at + IDLE_MS;
  }
  function visibility() {
    if (!target.document.hidden) check();
  }
  function leaving() {
    void heartbeat();
  }
  void fetcher("/api/auth/me")
    .then(async (r) => {
      if (r.status === 401) {
        expire();
        return;
      }
      if (!r.ok) return;
      const d = await r.json();
      if (typeof d.sessionExpiresAt === "number" && !dirty && lastSent === 0)
        deadline = d.sessionExpiresAt;
      check();
    })
    .catch(() => {});
  const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
  events.forEach((name) =>
    target.addEventListener(name, activity, { passive: true }),
  );
  target.addEventListener("storage", storage);
  target.addEventListener("focus", check);
  target.addEventListener("pagehide", leaving);
  target.document.addEventListener("visibilitychange", visibility);
  const timer = target.setInterval(() => {
    check();
    if (dirty && Date.now() - lastSent > 30000) void heartbeat();
  }, 1000);
  return () => {
    ended = true;
    target.clearInterval(timer);
    target.clearTimeout(trailing);
    events.forEach((name) => target.removeEventListener(name, activity));
    target.removeEventListener("storage", storage);
    target.removeEventListener("focus", check);
    target.removeEventListener("pagehide", leaving);
    target.document.removeEventListener("visibilitychange", visibility);
  };
}
