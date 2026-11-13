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
