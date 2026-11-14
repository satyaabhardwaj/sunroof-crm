// Types live in one place; this file keeps the workflow's constants.
export type {
  Designer,
  Visit,
  Worker,
  Receipt,
  CashFlow,
  Order,
  DrawingVersion,
  KeyDates,
  StaffDirectory,
  Workspace,
  Notice,
  TaskRow,
} from "@/types/deal";
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
