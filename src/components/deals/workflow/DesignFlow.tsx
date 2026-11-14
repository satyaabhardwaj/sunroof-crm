import { useState, type FormEvent } from "react";
import type { Order, KeyDates } from "./model";
import { when } from "./common";

type Props = {
  order: Order;
  dept: string;
  save: (path: string, body: unknown) => Promise<boolean>;
  upload: (
    o: Order,
    file: File,
    kind: string,
    visitId: string,
  ) => Promise<void>;
  Documents: (p: { order: Order; ids?: string[] }) => React.ReactNode;
};

const dateFields: [keyof KeyDates, string][] = [
  ["requiredDispatch", "Client needs dispatch by"],
  ["rafterInstallation", "Rafter installation"],
  ["consoleInstallation", "Console installation"],
  ["inauguration", "Inauguration"],
];
const statusText: Record<string, string> = {
  awaiting_head: "Waiting for Design Head (V4 and later)",
  ready: "Share with the client, then record the answer",
  approved: "Approved by client",
  rejected: "Rejected by client",
  returned: "Returned by Design Head",
};

/** Everything a designer does between measurement approval and factory handover. */
export function DesignFlow({ order: o, dept, save, upload, Documents }: Props) {
  const path = "orders/" + o.id;
  const drawings = o.drawings || [];
  const last = drawings.at(-1);
  const head = dept === "design-head";
  const fresh = (o.documents || []).filter(
    (d) =>
      !d.visitId && !drawings.some((v) => v.cad === d.id || v.pdf === d.id),
  );
  const cad = fresh.filter((d) => d.kind === "cad").at(-1);
  const pdf = fresh.filter((d) => d.kind === "client_pdf").at(-1);
  const canSubmit =
    !o.clientApproved &&
    (!last || ["rejected", "returned"].includes(last.status));
  const [reason, setReason] = useState("");
  const [pdiRequired, setPdiRequired] = useState(false);
  const pdi = (o.visits || []).find(
    (v) => v.kind === "pdi" && v.status !== "rejected",
  );

  function dates(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, string | null> = {};
    for (const [key] of dateFields)
      body[key] = String(f.get(key) || "") || null;
    void save(path + "/dates", body);
  }

  return (
    <>
      {!!o.gaps?.length && (
        <div className="a-error" role="note">
          <strong>Missing from Sales</strong>
          <p>{o.gaps.join(" · ")}</p>
        </div>
      )}

      {!o.designStartedAt && !o.clientApproved && (
        <section className="dept-action-card">
          <h3>Measurement done</h3>
          <p>
            Start design when you begin work with the client, so waiting time
            and design time are counted separately.
          </p>
          <button
            type="button"
            className="btn dark"
            onClick={() => void save(path + "/design-start", {})}
          >
            Start design
          </button>
        </section>
      )}

      <section className="dept-action-card">
        <h3>Drawings</h3>
        {drawings
          .slice()
          .reverse()
          .map((v) => (
            <div key={v.version} className="dept-slots">
              <strong>
                V{v.version} · {statusText[v.status] || v.status}
              </strong>
              <small className="sub">{when(v.submittedAt)}</small>
              {v.note && <p>{v.note}</p>}
              {(v.clientReason || v.headNote) && (
                <p>{v.clientReason || v.headNote}</p>
              )}
              <Documents order={o} ids={[v.cad, v.pdf]} />
            </div>
          ))}

        {last?.status === "awaiting_head" && head && (
          <div className="dept-review">
            <label>
              What the designer must change
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={2000}
              />
            </label>
            <div>
              <button
                type="button"
                className="btn dark"
                onClick={() =>
                  void save(`${path}/drawings/${last.version}/head`, {
                    approve: true,
                    reason,
                  })
                }
              >
                Approve V{last.version} for the client
              </button>
              <button
                type="button"
                className="btn"
                disabled={!reason.trim()}
                onClick={() =>
                  void save(`${path}/drawings/${last.version}/head`, {
                    approve: false,
                    reason,
                  }).then((ok) => ok && setReason(""))
                }
              >
                Return to designer
              </button>
            </div>
          </div>
        )}

        {last?.status === "ready" && (
          <div className="dept-review">
            <p>
              Send the client PDF by mail or copy it to WhatsApp, then record
              the client&apos;s answer here.
            </p>
            <label>
              Client&apos;s reason, if rejected
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={2000}
              />
            </label>
            <div>
              <button
                type="button"
                className="btn dark"
                onClick={() =>
                  void save(`${path}/drawings/${last.version}/client`, {
                    approve: true,
                    reason,
                  })
                }
              >
                Approved by client
              </button>
              <button
                type="button"
                className="btn"
                disabled={!reason.trim()}
                onClick={() =>
                  void save(`${path}/drawings/${last.version}/client`, {
                    approve: false,
                    reason,
                  }).then((ok) => ok && setReason(""))
                }
              >
                Rejected by client
              </button>
            </div>
          </div>
        )}

        {canSubmit && (
          <form
            className="dept-form"
            onSubmit={(e) => {
              e.preventDefault();
              const note = String(new FormData(e.currentTarget).get("note"));
              void save(path + "/drawings", {
                cad: cad?.id,
                pdf: pdf?.id,
                note,
              });
            }}
          >
            <strong>New version V{drawings.length + 1}</strong>
            {drawings.length + 1 >= 4 && (
              <p className="sub">
                V4 and later go to the Design Head before the client.
              </p>
            )}
            <div className="g2">
              <label>
                CAD file (DWG or PDF) {cad && "· " + cad.filename}
                <input
                  type="file"
                  accept=".dwg,application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(o, file, "cad", "");
                  }}
                />
              </label>
              <label>
                Client PDF {pdf && "· " + pdf.filename}
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(o, file, "client_pdf", "");
                  }}
                />
              </label>
            </div>
            <label>
              What changed (optional)
              <textarea name="note" maxLength={2000} />
            </label>
            <button className="btn dark" disabled={!cad || !pdf}>
              Submit V{drawings.length + 1}
            </button>
          </form>
        )}
      </section>

      <section className="dept-action-card">
        <h3>Key dates</h3>
        <form className="dept-form" onSubmit={dates}>
          <div className="g2">
            {dateFields.map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="date"
                  name={key}
                  defaultValue={o.dates?.[key] || ""}
                />
              </label>
            ))}
          </div>
          <button className="btn">Save dates</button>
        </form>
      </section>

      {o.clientApproved && (
        <section className="dept-action-card">
          <h3>Send to factory</h3>
          <p>
            Needs: client-approved drawing, production payment confirmed by
            Accounts, dispatch date and shipping address.
          </p>
          <label className="dept-check">
            <input
              type="checkbox"
              checked={pdiRequired}
              onChange={(e) => setPdiRequired(e.target.checked)}
            />{" "}
            PDI required
          </label>
          {pdi && pdi.status !== "approved" && (
            <p className="sub">PDI is {pdi.status}. Approve it first.</p>
          )}
          <button
            type="button"
            className="btn dark"
            onClick={() => void save(path + "/handover", { pdiRequired })}
          >
            Send to factory
          </button>
        </section>
      )}
    </>
  );
}
