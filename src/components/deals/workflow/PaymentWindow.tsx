import { useState } from "react";
import type { Order, Receipt } from "./model";
import { Card, Facts, Pill, money, day, tone, type Save } from "./common";
export function Milestones({ order: o }: { order: Order }) {
  return (
    <Card title="Payment milestones" tone="violet">
      {(["production", "dispatch"] as const).map((s) => {
        const rows = (o.receipts || []).filter((r) => r.milestone === s),
          confirmed = rows
            .filter((r) => r.status === "confirmed")
            .reduce((n, r) => n + r.amount, 0),
          pending = rows
            .filter((r) => r.status === "requested")
            .reduce((n, r) => n + r.amount, 0);
        return (
          <div className="sun-milestone" key={s}>
            <div className="line">
              <b>{s === "production" ? "Production" : "Dispatch"}</b>
              <Pill tone={o.balances?.[s] === 0 ? "green" : "yellow"}>
                {o.balances?.[s] == null
                  ? "Plan pending"
                  : o.balances[s] === 0
                    ? "Payment received"
                    : "Payment due"}
              </Pill>
            </div>
            <Facts
              items={[
                ["Agreed amount", money(o.dues?.[s])],
                ["Confirmed by Accounts", money(confirmed)],
                ["To confirm", money(pending)],
                ["Balance", money(o.balances?.[s])],
              ]}
            />
          </div>
        );
      })}
    </Card>
  );
}
export function ReceiptTable({
  order: o,
  onReview,
}: {
  order: Order;
  onReview?: (r: Receipt) => void;
}) {
  return (
    <Card title="Payments received" tone="green">
      {o.receipts?.length ? (
        <div className="a-table-scroll">
          <table className="a-table">
            <thead>
              <tr>
                {[
                  "Date",
                  "Amount",
                  "Goes to / mode",
                  "Reference",
                  "Status",
                ].map((t) => (
                  <th key={t}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {o.receipts.map((r) => (
                <tr key={r.id}>
                  <td>
                    {day(r.date)}
                    <small>
                      {r.milestone === "production" ? "Production" : "Dispatch"}
                    </small>
                  </td>
                  <td>{money(r.amount)}</td>
                  <td>
                    {r.destination === "bank"
                      ? "In bank"
                      : r.destination === "management"
                        ? "Management"
                        : "Not given"}
                    <small>{r.mode || "Not given"}</small>
                  </td>
                  <td>
                    {r.reference}
                    {r.reason && <small>{r.reason}</small>}
                  </td>
                  <td>
                    {r.status === "requested" && onReview ? (
                      <button className="btn small" onClick={() => onReview(r)}>
                        Review payment
                      </button>
                    ) : (
                      <Pill tone={tone(r.status)}>
                        {r.status === "requested"
                          ? "To confirm"
                          : r.status === "confirmed"
                            ? "Confirmed"
                            : "Rejected"}
                      </Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No payments recorded.</p>
      )}
    </Card>
  );
}
function Decision({
  order,
  receipt: r,
  save,
  done,
}: {
  order: Order;
  receipt: Receipt;
  save: Save;
  done: () => void;
}) {
  const [reason, setReason] = useState(""),
    [notes, setNotes] = useState("");
  async function decide(approve: boolean) {
    if (
      await save(`orders/${order.id}/receipts/${r.id}/review`, {
        approve,
        reason: approve ? "" : reason,
        notes,
      })
    )
      done();
  }
  return (
    <div className="cols2 a-details">
      <Card title="Payment sent by Design" tone="green">
        <Facts
          items={[
            ["Amount", money(r.amount)],
            ["Date received", day(r.date)],
            [
              "Goes to",
              r.destination === "bank"
                ? "In bank"
                : r.destination === "management"
                  ? "Management"
                  : "Not given",
            ],
            ["How paid", r.mode || "Not given"],
            ["Reference number", r.reference],
            [
              "Milestone",
              r.milestone === "production" ? "Production" : "Dispatch",
            ],
          ]}
        />
      </Card>
      <Card title="Your decision" tone="teal">
        <button className="btn dark" onClick={() => void decide(true)}>
          Confirm receipt
        </button>
        <label>
          Reason if rejecting
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose a reason</option>
            <option>Not received</option>
            <option>Information incomplete</option>
            <option>Reference does not match</option>
          </select>
        </label>
        <label>
          Accounts notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
          />
        </label>
        <button
          className="btn warn"
          disabled={!reason}
          onClick={() => void decide(false)}
        >
          Reject payment
        </button>
      </Card>
    </div>
  );
}
export function PaymentWindow({
  order: o,
  dept,
  save,
  initialReceipt,
}: {
  order: Order;
  dept: string;
  save: Save;
  initialReceipt?: string;
}) {
  const [receiptId, setReceiptId] = useState(initialReceipt || ""),
    [notice, setNotice] = useState("");
  const receipt = o.receipts?.find(
    (r) => r.id === receiptId && r.status === "requested",
  );
  if (dept === "accounts" && receipt)
    return (
      <>
        <button className="btn small sun-back" onClick={() => setReceiptId("")}>
          ← All payments
        </button>
        <Decision
          key={receipt.id}
          order={o}
          receipt={receipt}
          save={save}
          done={() => {
            setReceiptId("");
            setNotice("Accounts decision saved.");
          }}
        />
      </>
    );
  return (
    <>
      {notice && (
        <p role="status" className="sun-saved">
          {notice}
        </p>
      )}
      <div className="cols2 a-details">
        <div className="col">
          <Milestones order={o} />
          <ReceiptTable
            order={o}
            onReview={
              dept === "accounts" ? (r) => setReceiptId(r.id) : undefined
            }
          />
        </div>
        <div className="col">
          {dept === "accounts" ? (
            <Card title="Accounts approvals" tone="teal">
              {(o.receipts || [])
                .filter((r) => r.status === "requested")
                .map((r) => (
                  <div className="line rule" key={r.id}>
                    <span>
                      <b>{money(r.amount)}</b> · {r.milestone}
                      <small className="sub"> · {r.reference}</small>
                    </span>
                    <button
                      className="btn small dark"
                      onClick={() => setReceiptId(r.id)}
                    >
                      Review payment
                    </button>
                  </div>
                ))}
              {!o.receipts?.some((r) => r.status === "requested") && (
                <p className="empty">No receipts awaiting your decision.</p>
              )}
              <p className="sub">
                Only confirmed receipts reduce the milestone balance.
              </p>
            </Card>
          ) : (
            <Card title="Record a payment" tone="teal">
              <form
                className="sun-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const target = e.currentTarget,
                    f = new FormData(target);
                  if (
                    await save(`orders/${o.id}/receipts`, {
                      amount: Math.round(Number(f.get("amount")) * 100),
                      reference: f.get("reference"),
                      milestone: f.get("milestone"),
                      date: f.get("date"),
                      destination: f.get("destination"),
                      mode: f.get("mode"),
                    })
                  ) {
                    target.reset();
                    setNotice("Payment sent to Accounts for confirmation.");
                  }
                }}
              >
                <div className="g2">
                  <label>
                    Amount received (₹)
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                    />
                  </label>
                  <label>
                    Date received
                    <input
                      name="date"
                      type="date"
                      required
                      defaultValue={new Date().toLocaleDateString("en-CA")}
                    />
                  </label>
                  <label>
                    Goes to
                    <select name="destination" aria-label="Goes to">
                      <option value="bank">In bank</option>
                      <option value="management">Management</option>
                    </select>
                  </label>
                  <label>
                    How paid
                    <select name="mode" aria-label="How paid">
                      <option>Bank transfer</option>
                      <option>UPI</option>
                      <option>Cheque</option>
                      <option>Cash</option>
                      <option>Card</option>
                      <option>Other</option>
                    </select>
                  </label>
                </div>
                <label>
                  Reference number
                  <input name="reference" required maxLength={160} />
                </label>
                <label>
                  Payment milestone
                  <select name="milestone" aria-label="Payment milestone">
                    <option value="production">Production</option>
                    <option value="dispatch">Dispatch</option>
                  </select>
                </label>
                <button className="btn dark">Send to Accounts</button>
                <p className="sub">
                  Accounts confirms the receipt before it counts as paid.
                </p>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
