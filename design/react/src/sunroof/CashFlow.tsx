import type { Order } from "./model";
import { Card, Facts, money, type OpenOrder } from "./common";
export function CashStrip({
  orders,
  view,
}: {
  orders: Order[];
  view: () => void;
}) {
  const sum = (key: "received" | "pending") =>
    orders.reduce((n, o) => n + (o.cashFlow?.[key] || 0), 0);
  const balance = orders.reduce(
    (n, o) =>
      n +
      (o.cashFlow?.production.balance || 0) +
      (o.cashFlow?.dispatch.balance || 0),
    0,
  );
  const missing = orders.some(
    (o) =>
      o.cashFlow?.production.balance == null ||
      o.cashFlow?.dispatch.balance == null,
  );
  return (
    <section className="sun-cash-strip" aria-label="Cash flow">
      <button className="sun-cash-title" onClick={view}>
        Cash flow <span aria-hidden="true">↗</span>
      </button>
      <div>
        <span>Received</span>
        <strong>{money(sum("received"))}</strong>
      </div>
      <div>
        <span>To confirm</span>
        <strong>{money(sum("pending"))}</strong>
      </div>
      <div>
        <span>{missing ? "Known outstanding" : "Outstanding"}</span>
        <strong>{money(balance)}</strong>
      </div>
      {missing && <span className="sun-cash-note">Some plans pending</span>}
    </section>
  );
}
export function CashDetails({ order: o }: { order: Order }) {
  const c = o.cashFlow;
  if (!c) return <p className="empty">Payment totals are loading.</p>;
  return (
    <div className="cols2 a-details">
      <Card title="Cash received" tone="green">
        <Facts
          items={[
            ["Confirmed by Accounts", money(c.received)],
            ["Awaiting confirmation", money(c.pending)],
            ["In bank", money(c.bank)],
            ["Management", money(c.management)],
            ...(c.unclassified
              ? [
                  ["Destination not recorded", money(c.unclassified)] as [
                    string,
                    string,
                  ],
                ]
              : []),
          ]}
        />
      </Card>
      <Card title="Payment milestones" tone="violet">
        {(["production", "dispatch"] as const).map((s) => (
          <div className="sun-milestone" key={s}>
            <b>{s === "production" ? "Production" : "Dispatch"}</b>
            <Facts
              items={[
                ["Agreed amount", money(c[s].due)],
                ["Confirmed", money(c[s].received)],
                ["To confirm", money(c[s].pending)],
                ["Outstanding", money(c[s].balance)],
              ]}
            />
          </div>
        ))}
      </Card>
    </div>
  );
}
export function CashFlowPage({
  orders,
  open,
}: {
  orders: Order[];
  open: OpenOrder;
}) {
  return (
    <section className="sun-work">
      <div className="sun-work-heading">
        <div>
          <h1>Cash flow</h1>
          <p>
            Confirmed receipts and remaining milestone dues for these clients.
          </p>
        </div>
        <span className="sub">{orders.length} clients</span>
      </div>
      <div className="a-table-scroll">
        <table className="a-table sun-work-table">
          <thead>
            <tr>
              {[
                "Client",
                "Received",
                "To confirm",
                "Production due",
                "Dispatch due",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <button
                    className="sun-client-link"
                    onClick={() => open(o, "cashflow")}
                  >
                    {o.client}
                  </button>
                  <small>
                    {o.reference} · {o.location}
                  </small>
                </td>
                <td>{money(o.cashFlow?.received)}</td>
                <td>{money(o.cashFlow?.pending)}</td>
                <td>{money(o.cashFlow?.production.balance)}</td>
                <td>{money(o.cashFlow?.dispatch.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!orders.length && <p className="empty">No clients in this view.</p>}
      </div>
      <p className="sun-table-note">
        Outgoing expenses are not recorded in this workflow.
      </p>
    </section>
  );
}
