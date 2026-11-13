// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeAll, afterEach, expect, it, vi } from "vitest";
import { install, client } from "./setup";
import { ApplianceRequest } from "../src/ApplianceRequest";
import {
  defaultApplianceRequest,
  applianceMessage,
  checkedAppliances,
  applianceWhatsAppLink,
} from "../src/appliance-request";
import { SIEMENS_MODELS } from "../src/appliance-catalog";
import { rules } from "../src/model";
import type { Context } from "../src/types";
let root: Root | undefined, host: HTMLDivElement | undefined;
beforeAll(async () => {
  await install();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
});
it("starts with the seven requested appliances, grouped by kitchen and pantry, without selecting client models", () => {
  const items = defaultApplianceRequest();
  expect(items).toHaveLength(7);
  expect(items.every((row) => !row.brand && !row.model)).toBe(true);
  const message = applianceMessage(items);
  expect(message).toContain("1. Built-in Hob - 900 mm");
  expect(message).toContain("Sink & Faucet - 900 mm x 500 mm (with faucet)");
  expect(message).toContain("Small Pantry:\n\n1. Built-in Fridge - 600 mm");
  expect(message).toContain("existing appliances");
});
it("includes reused appliance details and client-specific models in the exported message", () => {
  const items = defaultApplianceRequest();
  items[0] = {
    ...items[0],
    reused: true,
    brand: "Existing brand",
    model: "MODEL-123",
    size: "850 x 500 mm",
    note: "Keep the current hob",
  };
  const message = applianceMessage(items.slice(0, 1));
  expect(message).toContain("850 x 500 mm (existing appliance to be reused)");
  expect(message).toContain("Brand / model: Existing brand - MODEL-123");
  expect(message).toContain("Keep the current hob");
  expect(message).not.toContain("Small Pantry:");
});
it("separates island hoods from wall hoods and preserves brochure page references", () => {
  expect(SIEMENS_MODELS.find((row) => row.code === "LF91BUV50I")).toMatchObject(
    { category: "islandHood", page: 35 },
  );
  expect(SIEMENS_MODELS.find((row) => row.code === "KI81FHD30I")).toMatchObject(
    { category: "builtInFridge", page: 67 },
  );
  expect(new Set(SIEMENS_MODELS.map((row) => row.code)).size).toBe(
    SIEMENS_MODELS.length,
  );
});
it("saves the request to the client without changing the signed appliance list", async () => {
  const c = client("request");
  const ap = rules().flow(c).appliances;
  ap.signedAt = "2026-10-20";
  ap.items.push({
    name: "Already agreed",
    make: "Existing model",
    note: "",
    at: "2026-10-20",
  });
  const context: Context = {
    readOnly: false,
    all: [c],
    tab: "pre",
    page: "make",
    update: (fn) => fn?.(),
    show: vi.fn(),
    go: vi.fn(),
    close: vi.fn(),
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<ApplianceRequest c={c} ctx={context} />));
  expect(ap.request).toBeUndefined();
  await act(async () =>
    [...host!.querySelectorAll("button")]
      .find((button) => button.textContent === "Save checklist")!
      .click(),
  );
  expect(ap.request?.items).toHaveLength(7);
  expect(ap.items).toHaveLength(1);
  expect(ap.signedAt).toBe("2026-10-20");
  await act(async () => root!.render(<ApplianceRequest c={c} ctx={context} />));
  const reference = host.querySelector(
    '[aria-label="Siemens brochure reference - item 4"]',
  ) as HTMLSelectElement;
  await act(async () => {
    reference.value = "LF91BUV50I";
    reference.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(ap.request?.items[3]).toMatchObject({
    brand: "Siemens",
    model: "LF91BUV50I",
    size: "900 mm",
  });
});

it("opens WhatsApp without a recipient and preserves the message draft", () => {
  const message = "Kitchen:\nSink & Faucet - 900 x 500 mm";
  const url = new URL(applianceWhatsAppLink(message));
  expect(url.origin).toBe("https://wa.me");
  expect(url.pathname).toBe("/");
  expect(url.searchParams.get("text")).toBe(message);
  expect(url.searchParams.has("phone")).toBe(false);
});

it("includes only appliances the designer checks, with no automatic selection", () => {
  const items = defaultApplianceRequest();
  expect(checkedAppliances(items)).toHaveLength(0);
  items[0].checked = true;
  items[6].checked = true;
  const message = applianceMessage(checkedAppliances(items));
  expect(message).toContain("Built-in Hob");
  expect(message).toContain("Small Pantry");
  expect(message).not.toContain("Built-in Oven");
  expect(message).not.toContain("Island Chimney");
});
