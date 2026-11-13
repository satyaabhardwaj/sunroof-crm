export type Designer = {
  id: string;
  name: string;
  location: string;
  payGrade: string;
};
export type Visit = {
  id: string;
  kind: "measurement" | "pdi";
  workerId: string;
  start: string;
  end: string;
  status: string;
  reason?: string;
  reviewNote?: string;
  checklist: string[];
  documents: string[];
};
export type Worker = {
  id: string;
  name: string;
  location: string;
  kind: "executive" | "installation_manager";
};
export type Receipt = {
  date?: string | null;
  submittedAt?: string;
  destination?: "bank" | "management" | null;
  mode?: string | null;
  notes?: string;
  id: string;
  amount: number;
  reference: string;
  milestone: "production" | "dispatch";
  status: string;
  reason?: string;
};
export type CashFlow = {
  received: number;
  pending: number;
  bank: number;
  management: number;
  unclassified: number;
  production: {
    due: number | null;
    received: number;
    pending: number;
    balance: number | null;
  };
  dispatch: {
    due: number | null;
    received: number;
    pending: number;
    balance: number | null;
  };
};
export type Order = {
  cashFlow?: CashFlow;
  id: string;
  reference: string;
  client: string;
  location: string;
  squareFeet: number;
  designerId: string;
  models: { code: string; quantity: number }[];
  stage: string;
  createdAt: string;
  source?: string;
  visits?: Visit[];
  receipts?: Receipt[];
  dues?: Record<string, number>;
  balances?: Record<string, number | null>;
  documents?: { id: string; kind: string; filename: string; visitId: string }[];
  issues?: { id: string; text: string; status: string }[];
  factoryAccepted?: string;
  packedAt?: string;
  clientApproved?: boolean;
  history: { at: string; by: string; text: string }[];
};
export type StaffDirectory = {
  fetchedAt: string;
  people: {
    id: string;
    name: string;
    group: string;
    sourceRole: string;
    status: string;
    note?: string;
  }[];
  visitNames: string[];
};
export type Workspace = {
  directory?: StaffDirectory;
  revision: number;
  writable: boolean;
  orders: Order[];
  designers: Designer[];
  workers: Worker[];
  availability: { workerId: string; start: string; end: string }[];
  department: string;
  access: string;
  staffId: string;
  departments: string[];
  demo: boolean;
};
export const department = () => location.pathname.split("/")[1] || "design";
export const stages = [
  ["assignment", "Assign designer"],
  ["measurement", "Measurement"],
  ["drawings", "Drawings & approval"],
  ["handover", "Factory handover"],
  ["production", "Production"],
  ["qc", "Quality & packing"],
  ["cleared", "Cleared for dispatch"],
] as const;
export const flags = [
  [
    "F01",
    "Designer capacity",
    "Agree how square footage, pay grade and workload determine capacity. Automatic assignment awaits this rule.",
  ],
  [
    "F02",
    "Payment entry",
    "The assigned designer submits payments to Accounts for now. Confirm this responsibility.",
  ],
  [
    "F03",
    "PDI scheduling",
    "Use measurement booking and acceptance rules for PDI provisionally.",
  ],
  [
    "F04",
    "Design changes after PDI",
    "Decide whether a changed drawing needs fresh client approval.",
  ],
  [
    "F05",
    "Factory handover issues",
    "Chitranjan can state an issue, but cannot reject. Routing and production blocking are undecided.",
  ],
  [
    "F06",
    "Production responsibility",
    "Chitranjan marks production started and completed provisionally.",
  ],
  ["F07", "QC responsibility", "Chitranjan records QC provisionally."],
  [
    "F08",
    "Repair and reproduction",
    "Reason and repeat QC are required. Scope within the order remains unresolved.",
  ],
  [
    "F09",
    "Access permissions",
    "Confirm the two-password arrangement and business-role permissions before live use.",
  ],
] as const;
export async function request(path = "", body?: unknown): Promise<Workspace> {
  const response = await fetch(
    "/api/sunroof/" +
      (path || "workspace") +
      "?department=" +
      encodeURIComponent(department()),
    {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    },
  );
  if (response.status === 401) {
    location.assign("/login");
    throw Error("Please sign in to continue.");
  }
  const value = await response.json().catch(() => null);
  if (!response.ok)
    throw Error(
      typeof value?.error === "string"
        ? value.error
        : typeof value?.detail === "string"
          ? value.detail
          : "Could not complete the request. Check your connection and try again.",
    );
  return value;
}
