import { useState } from "react";
import type { Order, Workspace } from "./model";
import { flags } from "./model";
import {
  Card,
  Pill,
  money,
  when,
  day,
  stageName,
  activeVisits,
  statusName,
  tone,
  type OpenOrder,
  type Focus,
} from "./common";
import { CashFlowPage } from "./CashFlow";
import { People } from "./People";
export const menus: Record<string, [string, string][]> = {
  design: [
    ["today", "My work"],
    ["all", "Clients"],
    ["measurement", "Measurement"],
    ["drawings", "Drawings"],
    ["payments", "Payments"],
    ["pdi", "PDI"],
    ["factory", "With factory"],
    ["cashflow", "Cash flow"],
    ["people", "People"],
  ],
  "design-head": [
    ["today", "Team overview"],
    ["all", "Clients"],
    ["assignment", "Assignments"],
    ["approvals", "V4+ approvals"],
    ["team", "Team & workload"],
    ["cashflow", "Cash flow"],
    ["people", "People"],
    ["review", "Workflow decisions"],
  ],
  measurement: [
    ["today", "Visits"],
    ["assigned", "Assigned"],
    ["submitted", "With designer"],
    ["team", "Team"],
    ["people", "People"],
  ],
  accounts: [
    ["today", "Summary"],
    ["all", "Clients"],
    ["ledger", "Daily payments"],
    ["approvals", "Approvals"],
    ["production", "Production"],
    ["dispatch", "Dispatch"],
    ["cashflow", "Cash flow"],
    ["people", "People"],
  ],
  factory: [
    ["today", "My work"],
    ["all", "Clients"],
    ["handover", "Handovers"],
    ["production", "Production"],
    ["qc", "Quality checks"],
    ["packing", "Packing"],
    ["issues", "Issues"],
    ["cashflow", "Cash flow"],
    ["people", "People"],
  ],
};
export function needs(o: Order, dept: string) {
  if (dept === "design-head")
    return !o.designerId ? "Assign designer" : stageName[o.stage] || o.stage;
  if (dept === "factory")
    return o.stage === "handover"
      ? o.factoryAccepted
        ? "Start production"
        : "Accept handover"
      : o.stage === "qc"
        ? "Record QC result"
        : o.stage === "packing"
          ? o.packedAt
            ? "Awaiting clearance"
            : "Confirm packing"
          : stageName[o.stage] || o.stage;
  if (o.issues?.length) return "Review factory issue";
  if (activeVisits(o).some((v) => v.status === "submitted"))
    return "Review visit";
  if (o.stage === "measurement")
    return activeVisits(o).length ? "Visit booked" : "Book measurement";
  if (o.stage === "drawings") return "Prepare drawing";
  return stageName[o.stage] || o.stage;
}
function balance(o: Order) {
  const c = o.cashFlow;
  return !c || c.production.balance == null || c.dispatch.balance == null
    ? "Plan pending"
    : money(c.production.balance + c.dispatch.balance);
}
function Choice({
  id,
  active,
  label,
  count,
  onPick,
}: {
  id: string;
  active: string;
  label: string;
  count: number;
  onPick: (id: string) => void;
}) {
  return (
    <button
      className={active === id ? "on" : ""}
      aria-pressed={active === id}
      onClick={() => onPick(id)}
    >
      {label}
      <span>{count}</span>
    </button>
  );
}
function WorkList({
  data,
  orders,
  dept,
  tab,
  open,
}: {
  data: Workspace;
  orders: Order[];
  dept: string;
  tab: string;
  open: OpenOrder;
}) {
  const [filter, setFilter] = useState("all");
  const options =
    dept === "factory"
      ? [
          ["all", "All work"],
          ["handover", "Handovers"],
          ["production", "Production"],
          ["qc", "QC"],
          ["packing", "Packing"],
        ]
      : dept === "design-head"
        ? [
            ["all", "All work"],
            ["assignment", "To assign"],
            ["measurement", "Measurement"],
            ["drawings", "Drawings"],
          ]
        : [
            ["all", "All work"],
            ["measurement", "Measurement"],
            ["review", "To review"],
            ["drawings", "Drawings"],
            ["pdi", "PDI"],
          ];
  const matches = (o: Order, id: string) =>
    id === "all" ||
    (id === "review"
      ? activeVisits(o).some((v) => v.status === "submitted")
      : id === "assignment"
        ? !o.designerId
        : id === "payments"
          ? o.balances?.production !== 0 ||
            o.balances?.dispatch !== 0 ||
            o.receipts?.some((r) => r.status === "requested")
          : id === "issues"
            ? !!o.issues?.length
            : id === "pdi"
              ? (o.visits || []).some((v) => v.kind === "pdi")
              : id === "factory"
                ? [
                    "handover",
                    "production",
                    "qc",
                    "repair",
                    "reproduce",
                    "packing",
                    "cleared",
                  ].includes(o.stage)
                : id === "qc"
                  ? ["qc", "repair", "reproduce"].includes(o.stage)
                  : id === "packing"
                    ? ["packing", "cleared"].includes(o.stage)
                    : o.stage === id);
  const scope = tab === "today" ? "all" : tab,
    shown = orders.filter(
      (o) => matches(o, scope) && matches(o, tab === "today" ? filter : "all"),
    );
  const focus: Focus =
    tab === "all"
      ? "details"
      : tab === "payments"
        ? "payments"
        : tab === "issues"
          ? "issues"
          : "work";
  const heading =
    tab === "today"
      ? dept === "design-head"
        ? "Team overview"
        : "My work"
      : menus[dept].find(([id]) => id === tab)?.[1] || "Clients";
  return (
    <section className="sun-work">
      <div className="sun-work-heading">
        <div>
          <h1>{heading}</h1>
          <p>
            {dept === "factory"
              ? "Handover to ready for dispatch"
              : dept === "design-head"
                ? "Assignments and progress across the design team"
                : "Post-design orders and the next step for each client"}
          </p>
        </div>
        <span className="sun-count">{shown.length} clients</span>
      </div>
      {tab === "today" && (
        <div className="sun-filters" aria-label="Work stages">
          {options.map(([id, label]) => (
            <Choice
              key={id}
              id={id}
              active={filter}
              label={label}
              count={orders.filter((o) => matches(o, id)).length}
              onPick={setFilter}
            />
          ))}
        </div>
      )}
      <div className="a-table-scroll">
        <table className="a-table sun-work-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>{tab === "all" ? "Stage" : "Next step"}</th>
              <th>Designer</th>
              <th>Received</th>
              <th>Outstanding</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((o) => (
              <tr key={o.id}>
                <td>
                  <button
                    className="sun-client-link"
                    onClick={() => open(o, focus)}
                  >
                    {o.client}
                  </button>
                  <small>
                    {o.location} · {o.reference}
                  </small>
                </td>
                <td>
                  {tab === "all"
                    ? stageName[o.stage] || o.stage
                    : needs(o, dept)}
                </td>
                <td>
                  {data.designers.find((d) => d.id === o.designerId)?.name ||
                    "To assign"}
                </td>
                <td>{money(o.cashFlow?.received)}</td>
                <td>{balance(o)}</td>
                <td>
                  <button
                    className="sun-row-open"
                    aria-label={"Open " + o.client}
                    onClick={() => open(o, focus)}
                  >
                    ↗
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="sun-empty">No work in this stage.</p>}
      </div>
    </section>
  );
}
function Accounts({
  orders,
  tab,
  open,
}: {
  orders: Order[];
  tab: string;
  open: OpenOrder;
}) {
  const receipts = orders
      .flatMap((o) => (o.receipts || []).map((r) => ({ o, r })))
      .sort((a, b) =>
        (b.r.date || b.r.submittedAt || "").localeCompare(
          a.r.date || a.r.submittedAt || "",
        ),
      ),
    pending = receipts.filter(({ r }) => r.status === "requested");
  const [date, setDate] = useState(""),
    [filter, setFilter] = useState(pending.length ? "approvals" : "production");
  const active = tab === "today" ? filter : tab;
  const stageOrders = orders.filter(
    (o) =>
      active === "all" ||
      o.balances?.[active] == null ||
      o.balances[active]! > 0,
  );
  const count = (s: string) =>
    s === "approvals"
      ? pending.length
      : orders.filter((o) => o.balances?.[s] == null || o.balances[s]! > 0)
          .length;
  const paymentRows =
    active === "approvals"
      ? pending
      : receipts.filter(({ r }) => !date || r.date === date);
  return (
    <section className="sun-work">
      <div className="sun-work-heading">
        <div>
          <h1>
            {tab === "today"
              ? "Accounts"
              : menus.accounts.find(([id]) => id === tab)?.[1]}
          </h1>
          <p>Confirm receipts and track the next payment due.</p>
        </div>
        {active === "ledger" && (
          <input
            type="date"
            aria-label="Payment date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        )}
      </div>
      {tab === "today" && (
        <div className="sun-filters" aria-label="Payment stages">
          {[
            ["approvals", "To confirm"],
            ["production", "Production due"],
            ["dispatch", "Dispatch due"],
          ].map(([id, label]) => (
            <Choice
              key={id}
              id={id}
              active={filter}
              label={label}
              count={count(id)}
              onPick={setFilter}
            />
          ))}
        </div>
      )}
      <div className="a-table-scroll">
        {active === "ledger" || active === "approvals" ? (
          <table className="a-table sun-work-table">
            <thead>
              <tr>
                {[
                  "Client",
                  "Date",
                  "Amount",
                  "Goes to",
                  "Reference",
                  "Status",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paymentRows.map(({ o, r }) => (
                <tr key={r.id}>
                  <td>
                    <button
                      className="sun-client-link"
                      onClick={() =>
                        open(
                          o,
                          "payments",
                          r.status === "requested" ? r.id : undefined,
                        )
                      }
                    >
                      {o.client}
                    </button>
                    <small>{r.milestone}</small>
                  </td>
                  <td>{day(r.date)}</td>
                  <td>{money(r.amount)}</td>
                  <td>
                    {r.destination === "bank"
                      ? "In bank"
                      : r.destination === "management"
                        ? "Management"
                        : "Not recorded"}
                    <small>{r.mode}</small>
                  </td>
                  <td>{r.reference}</td>
                  <td>
                    {r.status === "requested" ? (
                      <button
                        className="btn small"
                        onClick={() => open(o, "payments", r.id)}
                      >
                        Review payment
                      </button>
                    ) : (
                      <Pill tone={tone(r.status)}>
                        {statusName[r.status] || r.status}
                      </Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="a-table sun-work-table">
            <thead>
              <tr>
                {[
                  "Client",
                  "Received",
                  "To confirm",
                  "Production balance",
                  "Dispatch balance",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stageOrders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <button
                      className="sun-client-link"
                      onClick={() => open(o, "payments")}
                    >
                      {o.client}
                    </button>
                    <small>
                      {o.reference} · {o.location}
                    </small>
                  </td>
                  <td>{money(o.cashFlow?.received)}</td>
                  <td>{money(o.cashFlow?.pending)}</td>
                  <td>{money(o.balances?.production)}</td>
                  <td>{money(o.balances?.dispatch)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(active === "ledger" || active === "approvals"
          ? paymentRows.length === 0
          : stageOrders.length === 0) && (
          <p className="sun-empty">
            {active === "approvals"
              ? "No receipts awaiting confirmation."
              : "No payments in this view."}
          </p>
        )}
      </div>
    </section>
  );
}
function Team({
  data,
  orders,
  measurement,
  add,
}: {
  data: Workspace;
  orders: Order[];
  measurement: boolean;
  add?: () => void;
}) {
  return (
    <section className="sun-work">
      <div className="sun-work-heading">
        <h1>{measurement ? "Visit team" : "Team & workload"}</h1>
        {add && (
          <button className="btn" onClick={add}>
            Add team member
          </button>
        )}
      </div>
      <div className="a-table-scroll">
        <table className="a-table sun-work-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Location</th>
              <th>{measurement ? "Next visit" : "Orders"}</th>
              <th>{measurement ? "Open visits" : "Area assigned"}</th>
            </tr>
          </thead>
          <tbody>
            {(measurement ? data.workers : data.designers).map((p) => {
              const mine = orders.filter((o) => o.designerId === p.id),
                visits = orders
                  .flatMap((o) =>
                    (o.visits || []).filter(
                      (v) =>
                        v.workerId === p.id &&
                        !["rejected", "approved"].includes(v.status),
                    ),
                  )
                  .sort((a, b) => a.start.localeCompare(b.start));
              return (
                <tr key={p.id}>
                  <td>
                    <b>{p.name}</b>
                  </td>
                  <td>{p.location || "To confirm"}</td>
                  <td>
                    {measurement
                      ? visits[0]
                        ? when(visits[0].start)
                        : "No visit booked"
                      : mine.length}
                  </td>
                  <td>
                    {measurement
                      ? visits.length
                      : mine.reduce((n, o) => n + o.squareFeet, 0) + " sq ft"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Measurement({
  data,
  orders,
  tab,
  open,
  person,
}: {
  data: Workspace;
  orders: Order[];
  tab: string;
  open: OpenOrder;
  person: string;
}) {
  const [kind, setKind] = useState("all"),
    [place, setPlace] = useState("");
  const rows = orders
    .flatMap((o) =>
      (o.visits || [])
        .filter((v) => !person || v.workerId === person)
        .map((v) => ({ o, v })),
    )
    .sort((a, b) => a.v.start.localeCompare(b.v.start));
  const base = rows.filter(
    ({ v, o }) =>
      (!place || o.location === place) &&
      (tab === "submitted"
        ? ["submitted", "approved"].includes(v.status)
        : tab === "today"
          ? !["rejected", "approved"].includes(v.status)
          : true),
  );
  const shown = base.filter(({ v }) => kind === "all" || v.kind === kind);
  if (tab === "team") return <Team data={data} orders={orders} measurement />;
  return (
    <section className="sun-work">
      <div className="sun-work-heading">
        <div>
          <h1>
            {tab === "submitted"
              ? "With designer"
              : tab === "assigned"
                ? "Assigned visits"
                : "Visits"}
          </h1>
          <p>{day(new Date().toISOString())} · Schedule and site submissions</p>
        </div>
        <select
          aria-label="Location"
          value={place}
          onChange={(e) => setPlace(e.target.value)}
        >
          <option value="">All locations</option>
          {[...new Set(rows.map(({ o }) => o.location))].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>
      <div className="sun-filters" aria-label="Visit type">
        {[
          ["all", "All visits"],
          ["measurement", "Measurement"],
          ["pdi", "PDI"],
        ].map(([id, label]) => (
          <Choice
            key={id}
            id={id}
            active={kind}
            label={label}
            count={base.filter(({ v }) => id === "all" || v.kind === id).length}
            onPick={setKind}
          />
        ))}
      </div>
      <div className="a-table-scroll">
        <table className="a-table sun-work-table">
          <thead>
            <tr>
              {["Client", "When", "Assigned to", "Status", "Outstanding"].map(
                (h) => (
                  <th key={h}>{h}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {shown.map(({ o, v }) => (
              <tr key={v.id}>
                <td>
                  <button
                    className="sun-client-link"
                    onClick={() => open(o, "work", v.id)}
                  >
                    {o.client}
                  </button>
                  <small>
                    {o.location} · {v.kind === "pdi" ? "PDI" : "Measurement"}
                  </small>
                </td>
                <td>{when(v.start)}</td>
                <td>{data.workers.find((w) => w.id === v.workerId)?.name}</td>
                <td>
                  <Pill tone={tone(v.status)}>
                    {statusName[v.status] || v.status}
                  </Pill>
                </td>
                <td>{balance(o)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="sun-empty">No visits in this view.</p>}
      </div>
    </section>
  );
}
export function Dashboard({
  data,
  orders,
  dept,
  tab,
  open,
  person,
  addTeam,
}: {
  data: Workspace;
  orders: Order[];
  dept: string;
  tab: string;
  open: OpenOrder;
  person: string;
  addTeam: () => void;
}) {
  if (tab === "people") return <People directory={data.directory} />;
  if (tab === "cashflow") return <CashFlowPage orders={orders} open={open} />;
  if (dept === "accounts")
    return <Accounts orders={orders} tab={tab} open={open} />;
  if (dept === "measurement")
    return (
      <Measurement
        data={data}
        orders={orders}
        tab={tab}
        open={open}
        person={person}
      />
    );
  if (dept === "design-head" && tab === "team")
    return (
      <Team
        data={data}
        orders={orders}
        measurement={false}
        add={data.writable ? addTeam : undefined}
      />
    );
  if (dept === "design-head" && tab === "review")
    return (
      <Card title="Workflow decisions" tone="violet">
        <div className="sun-flags">
          {flags.map(([id, title, desc]) => (
            <details key={id}>
              <summary>
                {id} · {title}
              </summary>
              <p>{desc}</p>
            </details>
          ))}
        </div>
      </Card>
    );
  if (dept === "design-head" && tab === "approvals")
    return (
      <Card title="V4 and later · Shivang’s approval" tone="violet">
        <p className="sun-empty">
          Drawing version approvals are not connected yet.
        </p>
      </Card>
    );
  return (
    <WorkList
      key={dept + tab}
      data={data}
      orders={orders}
      dept={dept}
      tab={tab}
      open={open}
    />
  );
}
