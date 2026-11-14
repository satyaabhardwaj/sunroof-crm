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
  reschedules?: number;
  flagged?: boolean;
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
  milestone: "production" | "rafter" | "dispatch";
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
  designStartedAt?: string;
  drawings?: DrawingVersion[];
  dates?: KeyDates;
  journey?: string;
  stageInfo?: {
    key: string;
    label: string;
    owner: string;
    detail: string;
    step: number;
    of: number;
  };
  task?: {
    id: string;
    key: string;
    title: string;
    to: string;
    due?: string | null;
    by?: string;
    since?: string;
  } | null;
  parentId?: string;
  area?: string;
  email?: string;
  gaps?: string[];
  shippingAddress?: string;
  city?: string;
  state?: string;
  phone?: string;
  history: { at: string; by: string; text: string }[];
};
export type DrawingVersion = {
  version: number;
  cad: string;
  pdf: string;
  note: string;
  status: "awaiting_head" | "ready" | "approved" | "rejected" | "returned";
  headNote?: string;
  clientReason?: string;
  submittedAt: string;
};
export type KeyDates = {
  rafterInstallation?: string | null;
  consoleInstallation?: string | null;
  inauguration?: string | null;
  requiredDispatch?: string | null;
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
export type Notice = {
  id: string;
  orderId: string;
  reference: string;
  text: string;
  at: string;
  column: "work" | "payments";
  unread: boolean;
};
export type TaskRow = {
  id: string;
  orderId: string;
  reference: string;
  client: string;
  title: string;
  to: string;
  by: string;
  since: string;
  due?: string | null;
  overdue: boolean;
  report?: {
    status: "done" | "not_done";
    note: string;
    at: string;
    by: string;
  } | null;
  closedAt?: string | null;
  closedBy?: string | null;
};
export type Workspace = {
  stages?: { key: string; label: string; owner: string }[];
  notifications?: Notice[];
  tasks?: { toMe: TaskRow[]; byMe: TaskRow[]; done: TaskRow[] };
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
