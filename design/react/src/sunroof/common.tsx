import type { Order } from "./model";
import { useEffect, useRef, type ReactNode } from "react";
// Original CRM presentation components, independent of its kitchen-specific data model.
export function Card({
  title,
  tag,
  tone = "blue",
  children,
}: {
  title: string;
  tag?: ReactNode;
  tone?: string;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <div className={"card-h t-" + tone}>
        <h2>{title}</h2>
        <span>{tag}</span>
      </div>
      <div className="card-b">{children}</div>
    </section>
  );
}
export function Pill({
  children,
  tone = "grey",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"pill " + tone}>{children}</span>;
}
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="facts a-facts">
      {items.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value || "Not given"}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Dialog({
  title,
  sub,
  tag,
  onClose,
  busy,
  children,
}: {
  title: string;
  sub?: string;
  tag?: ReactNode;
  onClose: () => void;
  busy: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      prior?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="a-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="sheet-h">
        <div>
          <h2>{title}</h2>
          <p>{sub}</p>
          {tag}
        </div>
        <button
          className="btn"
          disabled={busy}
          aria-label="Close details"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      <div className="sheet-b">{children}</div>
    </dialog>
  );
}

export const titles: Record<string, string> = {
  design: "Design",
  measurement: "Measurement",
  accounts: "Accounts",
  factory: "Factory",
  "design-head": "Design head",
};
export const stageName: Record<string, string> = {
  assignment: "Designer needed",
  measurement: "Measurement",
  drawings: "Drawing preparation",
  handover: "Factory handover",
  production: "In production",
  qc: "Awaiting QC",
  repair: "Repair needed",
  reproduce: "Reproduction needed",
  packing: "Packing",
  cleared: "Cleared for dispatch",
};
export const money = (v: number | null | undefined) =>
  v == null
    ? "Plan pending"
    : "₹" +
      new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(
        v / 100,
      );
export const when = (v: string) =>
  new Date(v).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
export const day = (v?: string | null) =>
  v
    ? new Date(v).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Not given";
export const activeVisits = (o: Order) =>
  (o.visits || []).filter((v) => !["approved", "rejected"].includes(v.status));
export const statusName: Record<string, string> = {
  pending: "Waiting to accept",
  confirmed: "Confirmed",
  submitted: "With designer",
  corrections: "Corrections needed",
  approved: "Approved",
  rejected: "Returned",
  requested: "To confirm",
};
export const tone = (s: string) =>
  ["approved", "confirmed", "cleared"].includes(s)
    ? "green"
    : ["rejected", "corrections", "repair", "reproduce"].includes(s)
      ? "red"
      : ["pending", "requested", "submitted"].includes(s)
        ? "yellow"
        : "grey";
export type Focus =
  | "work"
  | "payments"
  | "cashflow"
  | "details"
  | "history"
  | "issues";
export type OpenOrder = (o: Order, focus?: Focus, item?: string) => void;
export type Save = (path: string, body: unknown) => Promise<boolean>;

export function labelTables() {
  for (const table of document.querySelectorAll<HTMLTableElement>(
    ".sun-work-table,.a-dialog .a-table",
  )) {
    const labels = Array.from(table.querySelectorAll("thead th")).map(
      (th) => th.textContent || "",
    );
    for (const row of table.querySelectorAll("tbody tr"))
      Array.from(row.children).forEach((td, i) =>
        td.setAttribute("data-label", labels[i] || ""),
      );
  }
}
