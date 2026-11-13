// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { IDLE_MS, installIdleSession } from "../src/idle";
let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});
function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T00:00:00Z"));
  const nav = vi.fn();
  const fetcher = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url === "/api/auth/me"
            ? { sessionExpiresAt: Date.now() + IDLE_MS }
            : {},
        ),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  stop = installIdleSession(window, nav);
  return { nav, fetcher };
}
it("expires after twenty idle minutes and never renews on a timer alone", async () => {
  const { nav, fetcher } = setup();
  await vi.advanceTimersByTimeAsync(IDLE_MS - 1000);
  expect(nav).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(nav).toHaveBeenCalledWith("/login?expired=1");
  expect(fetcher.mock.calls.some((c) => c[0] === "/api/auth/activity")).toBe(
    false,
  );
});
it("real UI activity resets the deadline but focus does not", async () => {
  const { nav, fetcher } = setup();
  await vi.advanceTimersByTimeAsync(10 * 60000);
  window.dispatchEvent(new Event("keydown"));
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetcher.mock.calls.some((c) => c[0] === "/api/auth/activity")).toBe(
    true,
  );
  await vi.advanceTimersByTimeAsync(10 * 60000);
  window.dispatchEvent(new Event("focus"));
  expect(nav).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(10 * 60000);
  expect(nav).toHaveBeenCalledOnce();
});
